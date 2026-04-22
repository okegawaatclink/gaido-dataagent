/**
 * GraphQLクエリ実行サービス
 *
 * Node.js 標準の fetch API を使用して GraphQL エンドポイントにクエリを送信し、
 * レスポンスを DB 接続と同じ QueryResult 形式（rows/columns）に変換して返す。
 *
 * 主な責務:
 *   - GraphQL エンドポイントへの POST リクエスト送信
 *   - レスポンスの data 部分を rows/columns 形式に整形
 *   - ネストしたオブジェクトのフラット化（例: { user: { name: "Alice" } } → { "user.name": "Alice" }）
 *   - エラーレスポンス（errors 配列）の検出と変換
 *   - タイムアウト制御（AbortController）
 *
 * 参考:
 *   - GraphQL over HTTP: https://graphql.github.io/graphql-over-http/
 *   - GraphQL Errors: https://spec.graphql.org/October2021/#sec-Errors
 */

import { validateGraphQL } from './graphqlValidator'

// =============================================================================
// 型定義
// =============================================================================

/**
 * クエリ実行結果（DB 接続と同じ形式）
 */
export interface QueryResult {
  /** 列名一覧 */
  columns: string[]
  /** データ行（キー: カラム名、値: 任意の型） */
  rows: Record<string, unknown>[]
}

/**
 * GraphQL レスポンスのエラーオブジェクト
 * @see https://spec.graphql.org/October2021/#sec-Errors
 */
export interface GraphQLError {
  message: string
  locations?: Array<{ line: number; column: number }>
  path?: Array<string | number>
  extensions?: Record<string, unknown>
}

/**
 * GraphQL レスポンスボディの型
 * data と errors の両方が存在する場合（部分成功）がある。
 */
interface GraphQLResponseBody {
  data?: Record<string, unknown> | null
  errors?: GraphQLError[]
}

// =============================================================================
// 定数
// =============================================================================

/**
 * GraphQL リクエストのタイムアウト（ミリ秒）
 * 大きなクエリでも応答できるよう 30 秒に設定する。
 */
const GRAPHQL_REQUEST_TIMEOUT_MS = 30_000

// =============================================================================
// ユーティリティ関数
// =============================================================================

/**
 * ネストしたオブジェクトをフラット化する（再帰的）
 *
 * GraphQL レスポンスにネストしたオブジェクトが含まれる場合、
 * ドット記法のキー名に展開してフラットなオブジェクトにする。
 *
 * DB 接続と同じ rows/columns 形式で可視化するために必要。
 *
 * @param obj - フラット化対象のオブジェクト
 * @param prefix - 再帰呼び出し時のキープレフィックス（外部から指定不要）
 * @returns フラット化されたオブジェクト
 *
 * @example
 * ```typescript
 * flattenObject({ user: { name: 'Alice', age: 30 }, active: true })
 * // => { 'user.name': 'Alice', 'user.age': 30, 'active': true }
 *
 * flattenObject({ items: [{ id: 1 }, { id: 2 }] })
 * // => { 'items': [{ id: 1 }, { id: 2 }] }  // 配列はそのまま保持
 * ```
 */
export function flattenObject(
  obj: Record<string, unknown>,
  prefix = ''
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key

    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      // ネストしたオブジェクト: 再帰的にフラット化
      const nested = flattenObject(value as Record<string, unknown>, fullKey)
      Object.assign(result, nested)
    } else {
      // スカラー値・配列・null: そのまま設定
      result[fullKey] = value
    }
  }

  return result
}

/**
 * GraphQL レスポンスの data 部分を rows/columns 形式に変換する
 *
 * data オブジェクトの最初のキーの値が結果配列と想定する（キー名は動的）。
 * 各行のネストしたオブジェクトはフラット化する。
 * 結果が配列でない場合は1行として扱う。
 *
 * @param data - GraphQL レスポンスの data フィールド
 * @returns { columns, rows } 形式の結果
 *
 * @example
 * ```typescript
 * // 配列の場合
 * formatGraphQLResult({ users: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }] })
 * // => { columns: ['id', 'name'], rows: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }] }
 *
 * // 単一オブジェクトの場合
 * formatGraphQLResult({ user: { id: 1, name: 'Alice' } })
 * // => { columns: ['id', 'name'], rows: [{ id: 1, name: 'Alice' }] }
 * ```
 */
export function formatGraphQLResult(data: Record<string, unknown>): QueryResult {
  // data が空の場合
  const keys = Object.keys(data)
  if (keys.length === 0) {
    return { columns: [], rows: [] }
  }

  // data の最初のキーの値を結果として取得
  // GraphQL レスポンスは通常 { queryName: [...] } の形式
  const firstKey = keys[0]
  const firstValue = data[firstKey]

  let rawRows: Record<string, unknown>[]

  if (Array.isArray(firstValue)) {
    // 通常の配列結果
    rawRows = firstValue.map((item) => {
      if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
        return item as Record<string, unknown>
      }
      // プリミティブ値の配列の場合は値をキーとしてラップ
      return { [firstKey]: item }
    })
  } else if (firstValue !== null && typeof firstValue === 'object' && !Array.isArray(firstValue)) {
    // 単一オブジェクトの場合は1行として扱う
    rawRows = [firstValue as Record<string, unknown>]
  } else {
    // プリミティブ値（数値・文字列等）の場合
    rawRows = [{ [firstKey]: firstValue }]
  }

  if (rawRows.length === 0) {
    return { columns: [], rows: [] }
  }

  // 各行をフラット化する（ネストしたオブジェクトを展開）
  const flatRows = rawRows.map((row) => flattenObject(row))

  // 全行からカラム名を収集（最初の行を基準とし、他の行に存在するカラムも追加）
  const columnSet = new Set<string>()
  for (const row of flatRows) {
    for (const key of Object.keys(row)) {
      columnSet.add(key)
    }
  }
  const columns = Array.from(columnSet)

  return { columns, rows: flatRows }
}

// =============================================================================
// GraphQL バリデーションエラークラス
// =============================================================================

/**
 * GraphQL クエリバリデーションエラー
 *
 * Mutation / Subscription / 空クエリ等のバリデーション失敗時にスローされる。
 * 上位ルーターでは ユーザー向けメッセージを SSE error イベントで送信することを推奨。
 */
export class GraphQLValidationError extends Error {
  readonly type = 'GraphQLValidationError' as const

  constructor(message: string) {
    super(message)
    this.name = 'GraphQLValidationError'
    Object.setPrototypeOf(this, GraphQLValidationError.prototype)
  }
}

/**
 * GraphQL API 実行エラー（エラーレスポンスが返った場合）
 *
 * GraphQL レスポンスの errors 配列が存在する場合にスローされる。
 * errors フィールドに元のエラーオブジェクト配列を保持する。
 */
export class GraphQLApiError extends Error {
  readonly type = 'GraphQLApiError' as const
  readonly errors: GraphQLError[]

  constructor(message: string, errors: GraphQLError[]) {
    super(message)
    this.name = 'GraphQLApiError'
    this.errors = errors
    Object.setPrototypeOf(this, GraphQLApiError.prototype)
  }
}

/**
 * GraphQL タイムアウトエラー
 *
 * fetch のタイムアウト（AbortController）が発動した場合にスローされる。
 */
export class GraphQLTimeoutError extends Error {
  readonly type = 'GraphQLTimeoutError' as const

  constructor(message: string) {
    super(message)
    this.name = 'GraphQLTimeoutError'
    Object.setPrototypeOf(this, GraphQLTimeoutError.prototype)
  }
}

/**
 * GraphQL 接続エラー（HTTP エラー等）
 *
 * エンドポイントへの接続失敗、HTTP ステータスエラー等の場合にスローされる。
 */
export class GraphQLConnectionError extends Error {
  readonly type = 'GraphQLConnectionError' as const

  constructor(message: string) {
    super(message)
    this.name = 'GraphQLConnectionError'
    Object.setPrototypeOf(this, GraphQLConnectionError.prototype)
  }
}

// =============================================================================
// GraphQL クエリ実行
// =============================================================================

/**
 * GraphQL クエリをエンドポイントに送信して実行し、結果を返す
 *
 * 処理フロー:
 *   1. クエリバリデーション（Mutation/Subscription/空クエリを拒否）
 *   2. fetch API で GraphQL エンドポイントに POST
 *   3. HTTP エラーチェック
 *   4. GraphQL エラーレスポンス（errors 配列）の検出
 *   5. data 部分を rows/columns 形式に変換して返す
 *
 * 部分成功（data と errors の両方が存在）の場合は data を結果として返す。
 *
 * @param endpointUrl - GraphQL エンドポイント URL
 * @param query - GraphQL クエリ文字列（Query オペレーションのみ許可）
 * @returns QueryResult - { columns, rows } 形式の実行結果
 * @throws GraphQLValidationError - クエリバリデーション失敗（Mutation 等）
 * @throws GraphQLConnectionError - HTTP エラーまたは接続失敗
 * @throws GraphQLApiError - GraphQL エラーレスポンス（errors 配列あり）
 * @throws GraphQLTimeoutError - タイムアウト
 */
export async function executeGraphQLQuery(
  endpointUrl: string,
  query: string
): Promise<QueryResult> {
  // Step 1: クエリバリデーション
  const validation = validateGraphQL(query)
  if (!validation.ok) {
    throw new GraphQLValidationError(
      validation.reason ?? 'GraphQLクエリのバリデーションに失敗しました。'
    )
  }

  // Step 2: fetch API で GraphQL エンドポイントに POST
  // AbortController でタイムアウトを制御する
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), GRAPHQL_REQUEST_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        // バリデーション済みのクエリを送信
        query: validation.sanitizedQuery ?? query,
        variables: {},
      }),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timeoutId)
    // AbortError はタイムアウトとして扱う
    if (err instanceof Error && err.name === 'AbortError') {
      throw new GraphQLTimeoutError(
        `GraphQL APIへのリクエストがタイムアウトしました（${GRAPHQL_REQUEST_TIMEOUT_MS / 1000}秒）。より単純な質問を試してください。`
      )
    }
    throw new GraphQLConnectionError(
      `GraphQL APIへの接続に失敗しました: ${err instanceof Error ? err.message : String(err)}`
    )
  } finally {
    clearTimeout(timeoutId)
  }

  // Step 3: HTTP エラーチェック
  if (!response.ok) {
    throw new GraphQLConnectionError(
      `GraphQL APIがHTTPエラーを返しました: HTTP ${response.status} ${response.statusText}`
    )
  }

  // Step 4: レスポンスボディを JSON パース
  let body: GraphQLResponseBody
  try {
    body = await response.json() as GraphQLResponseBody
  } catch (err) {
    throw new GraphQLConnectionError(
      `GraphQL APIのレスポンスが不正なJSON形式です: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  // Step 5: GraphQL エラーレスポンスの検出
  // errors と data の両方が存在する場合（部分成功）は data を優先するが、
  // data が null/undefined の場合は errors をエラーとして扱う
  if (body.errors && body.errors.length > 0 && !body.data) {
    throw new GraphQLApiError(
      `GraphQL APIがエラーを返しました: ${body.errors[0].message}`,
      body.errors
    )
  }

  // Step 6: data 部分を rows/columns 形式に変換
  const data = body.data ?? {}
  if (Object.keys(data).length === 0) {
    // data が空の場合（エラーなし・データなし）
    return { columns: [], rows: [] }
  }

  return formatGraphQLResult(data)
}
