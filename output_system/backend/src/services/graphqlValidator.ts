/**
 * GraphQLクエリバリデーターサービス
 *
 * LLMが生成したGraphQLクエリを実行前にバリデーションし、
 * Query オペレーションのみを許可する。
 * Mutation / Subscription / 空クエリは拒否する。
 *
 * セキュリティ設計方針（二重防御）:
 *   1. このバリデーター（第1層）: 実行前にキーワードレベルでチェック
 *   2. graphqlExecutor（第2層）: 実行時にもレスポンスを検証
 *
 * 許可するオペレーション:
 *   - query { ... }   (明示的な query キーワード)
 *   - { ... }         (shorthand query、キーワードなし)
 *
 * 拒否するオペレーション:
 *   - mutation { ... }
 *   - subscription { ... }
 *   - 空文字・空白のみ
 *
 * 参考:
 *   - GraphQL仕様 (Operations): https://spec.graphql.org/October2021/#sec-Language.Operations
 *   - OWASP API Security: https://owasp.org/www-project-api-security/
 */

/** バリデーション結果 */
export interface GraphQLValidationResult {
  /** true: 実行許可, false: 実行拒否 */
  ok: boolean
  /**
   * ok が false のときに拒否理由を説明するメッセージ（ユーザー向け）。
   * ok が true のときは undefined。
   */
  reason?: string
  /**
   * ok が true のとき、正規化済みのクエリ文字列。
   * ok が false のときは undefined。
   */
  sanitizedQuery?: string
}

/**
 * GraphQL クエリ文字列を前処理する（コメント除去・正規化）
 *
 * GraphQL のコメント形式:
 *   - 行コメント: # から行末まで（SQL の -- に相当）
 *
 * @param query - 元の GraphQL クエリ文字列
 * @returns コメント除去・正規化済みの文字列
 */
function preprocessQuery(query: string): string {
  // 行コメント（#...）を除去
  const withoutComments = query.replace(/#[^\r\n]*/g, ' ')
  // 連続する空白・改行を正規化
  return withoutComments.replace(/\s+/g, ' ').trim()
}

/**
 * GraphQL クエリをバリデーションし、実行可否を返す
 *
 * 以下の順序でチェックを行う:
 *   1. 空文字チェック
 *   2. コメント除去・正規化
 *   3. Mutation キーワード検出による拒否
 *   4. Subscription キーワード検出による拒否
 *   5. Query または shorthand query ({ で始まる) であることを確認
 *
 * @param query - バリデーション対象の GraphQL クエリ文字列
 * @returns GraphQLValidationResult - ok: true なら実行可、false なら reason に拒否理由
 *
 * @example
 * ```typescript
 * // 許可されるケース
 * validateGraphQL('{ users { id name } }')
 * // => { ok: true, sanitizedQuery: '{ users { id name } }' }
 *
 * validateGraphQL('query GetUsers { users { id } }')
 * // => { ok: true, sanitizedQuery: 'query GetUsers { users { id } }' }
 *
 * // 拒否されるケース
 * validateGraphQL('mutation CreateUser { createUser(name: "Alice") { id } }')
 * // => { ok: false, reason: '...' }
 * ```
 */
export function validateGraphQL(query: string): GraphQLValidationResult {
  // チェック 1: 空文字・空白のみ
  if (!query || !query.trim()) {
    return {
      ok: false,
      reason: 'GraphQLクエリが空です。',
    }
  }

  // チェック 2: コメント除去・正規化
  const normalized = preprocessQuery(query)
  const upperQuery = normalized.toUpperCase()

  // チェック 3: Mutation キーワードの検出
  // 単語境界（\b）で囲んで識別子名への誤検知を防ぐ
  // 例: "mutation" が含まれていても、"mutationResult" のようなフィールド名は許可しない
  if (/\bmutation\b/i.test(normalized)) {
    return {
      ok: false,
      reason: 'データの変更操作（mutation）はサポートされていません。データの取得に関する質問を入力してください。',
    }
  }

  // チェック 4: Subscription キーワードの検出
  if (/\bsubscription\b/i.test(normalized)) {
    return {
      ok: false,
      reason: 'サブスクリプション操作（subscription）はサポートされていません。データの取得に関する質問を入力してください。',
    }
  }

  // チェック 5: 有効な Query 形式で始まるか確認
  // 許可形式:
  //   - shorthand query: { ... }
  //   - 名前付き query: query { ... } または query QueryName { ... }
  //   - fragment 定義のみは拒否
  const startsWithQuery = /^\s*(\{|query\b)/i.test(normalized)
  if (!startsWithQuery) {
    return {
      ok: false,
      reason: 'GraphQLクエリは { または query で始まる必要があります。データの取得クエリのみ許可されています。',
    }
  }

  // すべてのチェックを通過: 実行許可
  // upperQuery は使用しないが、将来のチェック拡張のため保持
  void upperQuery
  return {
    ok: true,
    sanitizedQuery: normalized,
  }
}
