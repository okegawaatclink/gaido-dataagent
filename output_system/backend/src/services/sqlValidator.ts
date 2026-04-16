/**
 * SQLバリデーターサービス
 *
 * LLMが生成したSQL文をDataAgentが実行する前にバリデーションし、
 * SELECT 文（および CTE を使った WITH 句）のみを許可する。
 *
 * セキュリティ設計方針（二重防御）:
 *   1. このバリデーター（第1層）: 実行前に構文レベルでチェック
 *   2. database.executeQuery（第2層）: 実行直前にも再チェック
 *
 * 許可する構文:
 *   - SELECT ...
 *   - WITH ... AS (...) SELECT ...   （CTE）
 *
 * 拒否する構文（代表例）:
 *   - DML: INSERT / UPDATE / DELETE / MERGE
 *   - DDL: CREATE / DROP / ALTER / TRUNCATE
 *   - DCL: GRANT / REVOKE
 *   - 複数ステートメント: SELECT 1; SELECT 2  （セミコロン区切り）
 *   - コメント内に隠された危険キーワード
 *
 * 参考:
 *   - OWASP SQL Injection Prevention: https://owasp.org/www-community/attacks/SQL_Injection
 *   - ai_generated/requirements/README.md Security分析
 */

/** バリデーション結果 */
export interface ValidationResult {
  /** true: 実行許可, false: 実行拒否 */
  ok: boolean
  /**
   * ok が false のときに拒否理由を説明するメッセージ。
   * ok が true のときは undefined。
   */
  reason?: string
  /**
   * ok が true のとき、コメント除去・正規化済みの SQL 文字列。
   * executeQuery() はこの値を DB に渡すことで、MySQL 条件付きコメント
   * （MySQL条件付きコメント形式など）バイパスを根本的に防止する。
   *
   * セキュリティ背景:
   *   removeComments() はブロックコメントとして条件付きコメントを除去するが、
   *   MySQL エンジンは条件付きコメント内のコードを実行する。
   *   コメント除去後の SQL をそのまま DB へ渡すことで設計上の乖離を解消する。
   *
   * ok が false のときは undefined。
   */
  sanitizedSql?: string
}

/**
 * 禁止キーワードのリスト（大文字で統一。比較時は入力を大文字化）
 *
 * 正規表現ではなく文字列リストにすることで、将来の追加・削除を容易にする。
 * キーワードは「単語境界」で検索するため、カラム名への誤検知を防ぐ。
 */
const FORBIDDEN_KEYWORDS: ReadonlyArray<string> = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'DROP',
  'ALTER',
  'TRUNCATE',
  'CREATE',
  'GRANT',
  'REVOKE',
  'MERGE',
  'REPLACE',
  'CALL',
  'EXECUTE',
  'EXEC',
  'LOAD',
  'IMPORT',
  'COPY',
  /**
   * INTO を禁止キーワードに追加（H2対策）
   *
   * 以下の危険な構文をブロックするために必要:
   *   - PostgreSQL: SELECT ... INTO table_name  （テーブル作成）
   *   - MySQL:      SELECT ... INTO OUTFILE '/path'  （ファイル書き込み）
   *
   * 単語境界（\b）により以下への誤検知は発生しない:
   *   - INFORMATION_SCHEMA（INFORMATIONの部分一致）
   *   - INNER JOIN（単語 INNER の中にはINTOは含まれない）
   */
  'INTO',
]

/**
 * SQL 文字列からコメントを除去する
 *
 * コメント内に `DROP TABLE users` のような危険なキーワードを隠す
 * コメントインジェクション攻撃を防ぐため、検査前にコメントを除去する。
 *
 * 対応するコメント形式:
 *   - 行コメント: `-- ...` から行末まで
 *   - ブロックコメント: `/* ... *‌/`（ネスト非対応）
 *
 * ネストしたブロックコメントのバイパス対策:
 *   "/* /* DROP *" + "/ *" + "/" のように内側コメントを除去した後に外側の閉じタグが残る場合、
 *   その残留閉じタグもバイパス手段となるため追加で除去する。
 *   例: ネストコメント → 最短一致で内側除去 → 外側が残る → ループ除去 → 残留閉じタグ除去
 *
 * @param sql - 元の SQL 文字列
 * @returns コメントを除去した SQL 文字列
 */
export function removeComments(sql: string): string {
  // ブロックコメントを除去: /* ... */（改行を含む）
  // ネストしたコメントに対応するため、コメントがなくなるまで繰り返し除去する
  let result = sql
  let previous: string
  do {
    previous = result
    result = result.replace(/\/\*[\s\S]*?\*\//g, ' ')
  } while (result !== previous)
  // ネストしたコメント除去後に残留する可能性のある */ を除去（バイパス防止）
  result = result.replace(/\*\//g, ' ')
  // 行コメントを除去: -- から行末まで
  result = result.replace(/--[^\r\n]*/g, ' ')
  return result
}

/**
 * 空白・改行を正規化する
 *
 * 連続する空白・タブ・改行を単一スペースに変換し、
 * 前後の空白をトリムする。
 *
 * @param sql - SQL 文字列
 * @returns 正規化した SQL 文字列
 */
function normalizeWhitespace(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim()
}

/**
 * SQL 文字列に禁止キーワードが含まれているかチェックする
 *
 * 単語境界（\b）を使い、識別子名の一部として含まれるケース
 * （例: `created_at` に `CREATE` が含まれる）は除外する。
 *
 * @param upperSql - 大文字化・コメント除去済みの SQL 文字列
 * @returns 見つかった禁止キーワード、なければ null
 */
function findForbiddenKeyword(upperSql: string): string | null {
  for (const keyword of FORBIDDEN_KEYWORDS) {
    // \b（単語境界）で囲むことで、カラム名・テーブル名への誤マッチを防ぐ
    const pattern = new RegExp(`\\b${keyword}\\b`)
    if (pattern.test(upperSql)) {
      return keyword
    }
  }
  return null
}

/**
 * 複数ステートメントが含まれていないかチェックする
 *
 * セミコロン（;）で区切られた複数のステートメントは、
 * SQLインジェクションの典型的な手法（Stacked Queries）であるため拒否する。
 *
 * 許容するケース:
 *   - SQL末尾の1個のセミコロン（例: `SELECT 1;`）
 *   - 文字列リテラル内のセミコロン（例: `WHERE message = 'error; warning'`）
 *
 * 文字列リテラル除外の設計:
 *   シングルクォート（'...'）またはダブルクォート（"..."）で囲まれた文字列内の
 *   セミコロンはリテラル値の一部であり、ステートメント区切りとして解釈しない。
 *   これにより `WHERE message = 'error; warning'` のような正常クエリを誤拒否しない。
 *
 * @param sql - 正規化済みの SQL 文字列
 * @returns 複数ステートメントが含まれていれば true
 */
function hasMultipleStatements(sql: string): boolean {
  // 文字列リテラル（シングルクォート・ダブルクォート）内のセミコロンは
  // ステートメント区切りではないため、リテラル部分を空文字で置換してからチェックする
  // ※ エスケープされたクォート（'' または \"）も考慮した最短一致マッチ
  const withoutStringLiterals = sql
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
  // 末尾のセミコロンを除去してから、残りにセミコロンが含まれるか確認
  const withoutTrailingSemicolon = withoutStringLiterals.replace(/;\s*$/, '')
  return withoutTrailingSemicolon.includes(';')
}

/**
 * SQL 文が SELECT または WITH で始まるかチェックする
 *
 * 許可する開始キーワード:
 *   - SELECT: 通常のクエリ
 *   - WITH: CTE（Common Table Expressions）を使ったクエリ
 *
 * @param upperSql - 大文字化・正規化済みの SQL 文字列
 * @returns 許可されている開始キーワードなら true
 */
function startsWithAllowedKeyword(upperSql: string): boolean {
  return /^\s*(SELECT|WITH)\b/.test(upperSql)
}

/**
 * SQL 文をバリデーションし、実行可否を返す
 *
 * 以下の順序でチェックを行う:
 *   1. 空文字チェック
 *   2. コメント除去
 *   3. 複数ステートメントチェック
 *   4. 禁止キーワードチェック
 *   5. 許可キーワードで始まるかチェック
 *
 * @param sql - バリデーション対象の SQL 文字列
 * @returns ValidationResult - ok: true なら実行可、false なら reason に拒否理由
 *
 * @example
 * ```typescript
 * // 許可されるケース
 * validate('SELECT * FROM users')
 * // => { ok: true }
 *
 * validate('WITH cte AS (SELECT id FROM users) SELECT * FROM cte')
 * // => { ok: true }
 *
 * // 拒否されるケース
 * validate('INSERT INTO users VALUES (1)')
 * // => { ok: false, reason: '...' }
 *
 * validate('SELECT 1; DROP TABLE users')
 * // => { ok: false, reason: '...' }
 * ```
 */
export function validate(sql: string): ValidationResult {
  // チェック 1: 空文字・空白のみ
  if (!sql || !sql.trim()) {
    return {
      ok: false,
      reason: 'SQLが空です。SELECT文を入力してください。',
    }
  }

  // チェック 2: コメントを除去してから以降の検査を行う
  // コメント内に危険キーワードを隠す攻撃（例: /* DROP TABLE users */ SELECT 1）を防ぐ
  const withoutComments = removeComments(sql)
  const normalized = normalizeWhitespace(withoutComments)

  // チェック 3: 複数ステートメント（Stacked Queries）の検出
  // 例: SELECT 1; DELETE FROM users
  if (hasMultipleStatements(normalized)) {
    return {
      ok: false,
      reason:
        '複数のSQL文（セミコロン区切り）は許可されていません。1つのSELECT文のみ入力してください。',
    }
  }

  // 大文字化して以降のキーワード検索を統一する
  const upperSql = normalized.toUpperCase()

  // チェック 4: 禁止キーワードの検出
  // INSERT / UPDATE / DELETE / DROP / ALTER / TRUNCATE 等が含まれていないか確認
  const foundKeyword = findForbiddenKeyword(upperSql)
  if (foundKeyword !== null) {
    return {
      ok: false,
      reason: `'${foundKeyword}' キーワードを含むSQLは実行できません。SELECTクエリのみ許可されています。`,
    }
  }

  // チェック 5: 許可キーワード（SELECT / WITH）で始まるか確認
  if (!startsWithAllowedKeyword(upperSql)) {
    return {
      ok: false,
      reason:
        'SELECTまたはWITHで始まるSQL文のみ許可されています。',
    }
  }

  // すべてのチェックを通過: 実行許可
  // sanitizedSql にコメント除去・正規化済み SQL を格納する
  // executeQuery() がこの値を DB へ渡すことで、MySQL 条件付きコメントバイパスを防止する
  return { ok: true, sanitizedSql: normalized }
}
