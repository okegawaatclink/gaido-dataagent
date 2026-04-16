/**
 * DB接続ファクトリ
 *
 * knex.js を使用して PostgreSQL / MySQL の両方に対応した
 * DB接続インスタンスをシングルトンで管理する。
 *
 * 接続情報は環境変数 (.env) から読み込む:
 *   DB_TYPE    : 'postgresql' または 'mysql'
 *   DB_HOST    : DBホスト
 *   DB_PORT    : DBポート (PostgreSQL: 5432, MySQL: 3306)
 *   DB_USER    : DBユーザー名（リードオンリーユーザーを推奨）
 *   DB_PASSWORD: DBパスワード
 *   DB_NAME    : 接続するデータベース名
 *
 * セキュリティ注意事項:
 *   - DBユーザーはリードオンリー権限を推奨（SELECT のみ付与）
 *   - 接続情報はログに出力しない
 */

import Knex, { Knex as KnexType } from 'knex'
import { validate } from './sqlValidator'

/** サポートするDBタイプ */
export type DbType = 'postgresql' | 'mysql'

/** シングルトンのknexインスタンス */
let dbInstance: KnexType | null = null

/**
 * DB_TYPE 文字列を knex クライアント名に変換する
 *
 * @param dbType - 環境変数 DB_TYPE の値
 * @returns knex クライアント名
 * @throws DB_TYPE が不正な値の場合
 */
export function resolveKnexClient(dbType: string): string {
  switch (dbType) {
    case 'postgresql':
      return 'pg'
    case 'mysql':
      return 'mysql2'
    default:
      throw new Error(
        `DB_TYPE="${dbType}" はサポートされていません。'postgresql' または 'mysql' を指定してください。`
      )
  }
}

/**
 * 環境変数からknex設定オブジェクトを構築する
 *
 * @returns knex 初期化設定
 * @throws 必須の環境変数が未設定の場合
 */
export function buildKnexConfig(): KnexType.Config {
  const dbType = process.env.DB_TYPE
  const host = process.env.DB_HOST
  const port = process.env.DB_PORT
  const user = process.env.DB_USER
  const password = process.env.DB_PASSWORD
  const database = process.env.DB_NAME

  // 必須環境変数のバリデーション
  const missing: string[] = []
  if (!dbType) missing.push('DB_TYPE')
  if (!host) missing.push('DB_HOST')
  if (!user) missing.push('DB_USER')
  if (!database) missing.push('DB_NAME')

  if (missing.length > 0) {
    throw new Error(
      `必須の環境変数が設定されていません: ${missing.join(', ')}\n` +
        '.env ファイルに DB_TYPE, DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME を設定してください。'
    )
  }

  const client = resolveKnexClient(dbType!)

  // デフォルトポート: PostgreSQL=5432, MySQL=3306
  const defaultPort = dbType === 'postgresql' ? 5432 : 3306
  const portNumber = port ? parseInt(port, 10) : defaultPort

  return {
    client,
    connection: {
      host: host!,
      port: portNumber,
      user: user!,
      password: password || '',
      database: database!,
    },
    pool: {
      // 最小コネクション数: 0（アイドル時にコネクションを解放）
      min: 0,
      // 最大コネクション数: 読み取り専用なので適度な値に設定
      max: 10,
    },
    // クエリのデバッグログを無効化（接続情報漏洩防止）
    debug: false,
  }
}

/**
 * knex インスタンスを取得する（シングルトン）
 *
 * 初回呼び出し時に環境変数から設定を読み込み、knex インスタンスを生成する。
 * 2回目以降は既存のインスタンスを返す。
 *
 * @returns 初期化済みの knex インスタンス
 * @throws 環境変数が未設定または不正な場合
 *
 * @example
 * ```typescript
 * const db = getDb()
 * const rows = await db.raw('SELECT 1')
 * ```
 */
export function getDb(): KnexType {
  if (dbInstance) {
    return dbInstance
  }

  const config = buildKnexConfig()
  dbInstance = Knex(config)
  return dbInstance
}

/**
 * DB接続をクローズする
 *
 * アプリケーション終了時やテスト後に呼び出すこと。
 * コネクションプールを解放し、プロセスが正常終了できるようにする。
 *
 * @returns Promise<void>
 */
export async function closeDb(): Promise<void> {
  if (dbInstance) {
    await dbInstance.destroy()
    dbInstance = null
  }
}

/**
 * テスト用: シングルトンインスタンスをリセットする
 *
 * ユニットテストでモックインスタンスを注入できるようにする。
 *
 * @param instance - 注入するknexインスタンス（省略時はnullにリセット）
 */
export function resetDbInstance(instance: KnexType | null = null): void {
  dbInstance = instance
}

// -------------------------------------------------------------------
// クエリ実行
// -------------------------------------------------------------------

/**
 * クエリ実行結果の型
 *
 * SELECT 結果を JSON シリアライズ可能な形式に正規化して返す。
 * グラフ・テーブル描画コンポーネントがそのまま利用できる形式とする。
 */
export interface QueryResult {
  /**
   * カラム名の配列（SELECTした列の順番を保持）
   * 例: ['id', 'name', 'amount']
   */
  columns: string[]
  /**
   * データ行の配列。各行はカラム名をキーとした Record。
   * BigInt や Date などの JSON 非対応型は文字列に変換済み。
   * 例: [{ id: 1, name: 'Alice', amount: '1000.00' }]
   */
  rows: Record<string, unknown>[]
}

/**
 * SELECT SQL文を実行し、結果を正規化した QueryResult で返す
 *
 * セキュリティ二重防御:
 *   1. sqlValidator.validate() でSQL文の安全性を確認（第1層）
 *   2. 実行直前にも validate() を呼び、バリデーションを確実に通過させる（第2層）
 *
 * 型変換:
 *   - BigInt → String（例: 10000000000n → "10000000000"）
 *   - Date → ISO 8601 文字列（例: 2024-01-01T00:00:00.000Z）
 *   - null/undefined → null
 *   - その他はそのまま返す
 *
 * エラーハンドリング:
 *   - バリデーション失敗時は SqlValidationError をスロー
 *   - DB接続エラーや実行エラーはそのまま上位に伝播
 *
 * @param sql - 実行する SQL 文字列
 * @param db - 省略可能なknexインスタンス（省略時はシングルトンを使用、テスト用モック注入に利用）
 * @returns QueryResult - { columns: string[], rows: Record<string, unknown>[] }
 * @throws SqlValidationError - SQL がバリデーションを通過しなかった場合
 * @throws Error - DB 接続やクエリ実行に失敗した場合
 *
 * @example
 * ```typescript
 * // 正常系: SELECT文の実行
 * const result = await executeQuery('SELECT id, name FROM users LIMIT 10')
 * console.log(result.columns) // ['id', 'name']
 * console.log(result.rows)    // [{ id: 1, name: 'Alice' }, ...]
 *
 * // 異常系: INSERT文は拒否される
 * await executeQuery("INSERT INTO users VALUES (1, 'Alice')")
 * // => throws SqlValidationError: 'INSERT' キーワードを含むSQLは実行できません
 * ```
 */
export async function executeQuery(
  sql: string,
  db?: KnexType
): Promise<QueryResult> {
  // 二重防御: 実行直前にも validate() を呼ぶ
  // （呼び出し元が validate() を省略したケースでも確実にブロックする）
  const validation = validate(sql)
  if (!validation.ok) {
    // バリデーション失敗: 詳細なエラーメッセージ付きの例外をスロー
    throw new SqlValidationError(validation.reason ?? '不正なSQLです。')
  }

  // DBインスタンスを取得（テスト用モックか、シングルトン）
  const knex = db ?? getDb()

  // DB_TYPE を取得してクエリ実行方式を分岐
  const dbType = process.env.DB_TYPE ?? 'postgresql'

  // knex.raw() でバリデーション通過済み SQL を実行
  // クエリ結果の形式は DB_TYPE によって異なる:
  //   - PostgreSQL: { rows: [...], fields: [...] }
  //   - MySQL:      [rows, fields] タプル
  const rawResult = await knex.raw(sql)

  let rawRows: Record<string, unknown>[]

  if (dbType === 'mysql') {
    // MySQL: knex.raw は [rows, fields] タプルを返す
    rawRows = rawResult[0] as Record<string, unknown>[]
  } else {
    // PostgreSQL: knex.raw は { rows, fields } を返す
    rawRows = rawResult.rows as Record<string, unknown>[]
  }

  // カラム名を最初の行から取得（結果が空でも空配列を返す）
  const columns = rawRows.length > 0 ? Object.keys(rawRows[0]) : []

  // 各行の値を JSON シリアライズ可能な形式に正規化する
  const rows = rawRows.map((row) => normalizeRow(row))

  return { columns, rows }
}

/**
 * クエリ結果の1行を JSON シリアライズ可能な値に正規化する
 *
 * BigInt や Date は JSON.stringify() で正しく変換されないため、
 * 文字列に変換してフロントエンドへ安全に渡せるようにする。
 *
 * @param row - knex.raw から返された1行のデータ
 * @returns 各値を文字列・数値・真偽値・null に正規化した行データ
 */
function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    normalized[key] = normalizeValue(value)
  }
  return normalized
}

/**
 * 単一の値を JSON シリアライズ可能な形式に変換する
 *
 * @param value - 変換する値
 * @returns JSON シリアライズ可能な値
 */
function normalizeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    // null/undefined はそのまま null として返す
    return null
  }
  if (typeof value === 'bigint') {
    // BigInt は JSON 非対応のため文字列に変換
    // 例: 10000000000n → "10000000000"
    return value.toString()
  }
  if (value instanceof Date) {
    // Date オブジェクトは ISO 8601 文字列に変換
    // 例: 2024-01-01T00:00:00.000Z
    return value.toISOString()
  }
  // その他の型（string, number, boolean 等）はそのまま返す
  return value
}

/**
 * SQLバリデーションエラー
 *
 * executeQuery() が不正なSQL（SELECT以外）を受け取ったときにスローされる。
 * 上位のエラーハンドラーでこの型を判別し、適切なHTTPレスポンス（400等）を返す。
 *
 * @example
 * ```typescript
 * try {
 *   await executeQuery('DROP TABLE users')
 * } catch (err) {
 *   if (err instanceof SqlValidationError) {
 *     // 400 Bad Request
 *     res.status(400).json({ error: err.message })
 *   } else {
 *     // 500 Internal Server Error
 *     res.status(500).json({ error: 'DB error' })
 *   }
 * }
 * ```
 */
export class SqlValidationError extends Error {
  /** エラー種別を識別するためのタグ */
  readonly type = 'SqlValidationError' as const

  constructor(message: string) {
    super(message)
    this.name = 'SqlValidationError'
    // instanceof チェックが正しく動作するよう prototype を明示設定
    Object.setPrototypeOf(this, SqlValidationError.prototype)
  }
}
