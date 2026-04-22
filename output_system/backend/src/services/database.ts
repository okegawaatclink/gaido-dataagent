/**
 * DB接続ファクトリ & クエリ実行サービス
 *
 * knex.js を使用して PostgreSQL / MySQL の両方に対応した
 * DB接続インスタンスを管理し、SELECT クエリを実行する。
 *
 * PBI #149 改修:
 *   - executeQuery() が dbConnectionId を受け取り、connectionManager.getById() 経由で
 *     動的にDB接続（以前は .env の固定DB接続のみだった）
 *   - 接続プール: Map<dbConnectionId, Knex> で管理。切替時に前のプールは維持し、
 *     同じ接続先への再リクエストは既存プールを再利用する（性能向上）
 *   - destroyConnection() を公開し、接続先削除時にプールを破棄できるようにする
 *
 * セキュリティ注意事項:
 *   - DBユーザーはリードオンリー権限を推奨（SELECT のみ付与）
 *   - 接続情報はログに出力しない
 *   - SQLバリデーション（sqlValidator）を二重防御として適用
 */

import Knex, { Knex as KnexType } from 'knex'
import { validate } from './sqlValidator'
import { getById, ConnectionNotFoundError } from './connectionManager'

// =============================================================================
// 接続プール管理
// =============================================================================

/**
 * 接続プールのマップ
 *
 * キー: dbConnectionId（UUID）
 * 値: knex インスタンス（接続プール込み）
 *
 * 各 dbConnectionId に対応する knex インスタンスをキャッシュし、
 * 同じ接続先への繰り返しクエリで接続プールを再利用する。
 *
 * 接続先削除時は destroyConnection() でプールを破棄すること。
 */
const connectionPool = new Map<string, KnexType>()

/**
 * 指定 dbConnectionId の knex インスタンスを取得する（プール再利用）
 *
 * プールに存在する場合はそのまま返す。存在しない場合は新規作成してプールに追加する。
 * connectionManager.getById() で復号済みパスワードを取得して動的接続する。
 *
 * @param dbConnectionId - 接続先ID（UUID）
 * @returns 初期化済みの knex インスタンス
 * @throws ConnectionNotFoundError 接続先が見つからない場合
 * @throws Error サポートされていない DB タイプの場合
 */
function getOrCreateConnection(dbConnectionId: string): KnexType {
  // プールにインスタンスが存在する場合は再利用（接続コスト削減）
  const existing = connectionPool.get(dbConnectionId)
  if (existing) {
    return existing
  }

  // connectionManager.getById() で接続先情報（復号済みパスワード含む）を取得
  const conn = getById(dbConnectionId)

  // knex クライアント識別子のマッピング
  const clientMap: Record<string, string> = {
    mysql: 'mysql2',
    postgresql: 'pg',
  }

  const client = clientMap[conn.dbType]
  if (!client) {
    throw new Error(`Unsupported DB type: ${conn.dbType}`)
  }

  // デフォルトポート: PostgreSQL=5432, MySQL=3306
  const knexInstance = Knex({
    client,
    connection: {
      host: conn.host ?? undefined,
      port: conn.port ?? undefined,
      user: conn.username ?? undefined,
      password: conn.password,
      database: conn.databaseName ?? undefined,
    },
    pool: {
      // 最小コネクション数: 0（アイドル時にコネクションを解放）
      min: 0,
      // 最大コネクション数: 読み取り専用なので適度な値に設定
      max: 10,
    },
    // クエリのデバッグログを無効化（接続情報漏洩防止）
    debug: false,
  })

  // プールに追加（次回リクエストで再利用）
  connectionPool.set(dbConnectionId, knexInstance)
  console.info(`[database] Connection pool created for dbConnectionId: ${dbConnectionId}`)

  return knexInstance
}

/**
 * 指定 dbConnectionId の接続プールを破棄する
 *
 * 接続先削除時（DELETE /api/connections/:id）に呼び出して
 * リソースリークを防止すること。
 *
 * @param dbConnectionId - 接続プールを破棄する接続先ID
 */
export async function destroyConnection(dbConnectionId: string): Promise<void> {
  const knexInstance = connectionPool.get(dbConnectionId)
  if (knexInstance) {
    await knexInstance.destroy()
    connectionPool.delete(dbConnectionId)
    console.info(`[database] Connection pool destroyed for dbConnectionId: ${dbConnectionId}`)
  }
}

/**
 * 全接続プールを破棄する（アプリケーション終了時用）
 */
export async function destroyAllConnections(): Promise<void> {
  const destroyPromises: Promise<void>[] = []
  for (const [id, knexInstance] of connectionPool.entries()) {
    destroyPromises.push(
      knexInstance.destroy().then(() => {
        console.info(`[database] Connection pool destroyed for dbConnectionId: ${id}`)
      })
    )
  }
  await Promise.all(destroyPromises)
  connectionPool.clear()
}

// =============================================================================
// クエリ実行
// =============================================================================

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
 *   - ConnectionNotFoundError は上位に伝播
 *
 * @param dbConnectionId - 実行先DB接続先ID（UUID）
 * @param sql - 実行する SQL 文字列
 * @returns QueryResult - { columns: string[], rows: Record<string, unknown>[] }
 * @throws SqlValidationError - SQL がバリデーションを通過しなかった場合
 * @throws ConnectionNotFoundError - 接続先が見つからない場合
 * @throws Error - DB 接続やクエリ実行に失敗した場合
 *
 * @example
 * ```typescript
 * // 正常系: SELECT文の実行
 * const result = await executeQuery('uuid-xxx', 'SELECT id, name FROM users LIMIT 10')
 * console.log(result.columns) // ['id', 'name']
 * console.log(result.rows)    // [{ id: 1, name: 'Alice' }, ...]
 *
 * // 異常系: INSERT文は拒否される
 * await executeQuery('uuid-xxx', "INSERT INTO users VALUES (1, 'Alice')")
 * // => throws SqlValidationError: 'INSERT' キーワードを含むSQLは実行できません
 * ```
 */
export async function executeQuery(
  dbConnectionId: string,
  sql: string,
): Promise<QueryResult> {
  // 二重防御: 実行直前にも validate() を呼ぶ
  // （呼び出し元が validate() を省略したケースでも確実にブロックする）
  const validation = validate(sql)
  if (!validation.ok) {
    // バリデーション失敗: 詳細なエラーメッセージ付きの例外をスロー
    throw new SqlValidationError(validation.reason ?? '不正なSQLです。')
  }

  // 接続先IDからknexインスタンスを取得（プール再利用）
  const knex = getOrCreateConnection(dbConnectionId)

  // 接続先情報から DB タイプを取得（クエリ結果の形式判定に使用）
  const conn = getById(dbConnectionId)
  const dbType = conn.dbType

  // sanitizedSql（コメント除去・正規化済み SQL）を DB に渡す
  //
  // セキュリティ上の根拠 (H1対策):
  //   removeComments() は /*!50000 ... */ をブロックコメントとして除去するが、
  //   元の SQL（コメント付き）を knex.raw() に渡すと MySQL エンジンが
  //   条件付きコメント内のコードを実行してしまう設計上の乖離が生じる。
  //   validate() が返す sanitizedSql（コメント除去後の SQL）を使用することで
  //   この乖離を根本的に解消する。
  const sqlToExecute = validation.sanitizedSql ?? sql

  // knex.raw() でバリデーション・サニタイズ済み SQL を実行
  // クエリ結果の形式は DB_TYPE によって異なる:
  //   - PostgreSQL: { rows: [...], fields: [...] }
  //   - MySQL:      [rows, fields] タプル
  const rawResult = await knex.raw(sqlToExecute)

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

// =============================================================================
// 正規化ユーティリティ
// =============================================================================

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

// =============================================================================
// エラークラス
// =============================================================================

/**
 * SQLバリデーションエラー
 *
 * executeQuery() が不正なSQL（SELECT以外）を受け取ったときにスローされる。
 * 上位のエラーハンドラーでこの型を判別し、適切なHTTPレスポンス（400等）を返す。
 *
 * @example
 * ```typescript
 * try {
 *   await executeQuery('uuid-xxx', 'DROP TABLE users')
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

// Re-export ConnectionNotFoundError for convenience in route handlers
export { ConnectionNotFoundError }
