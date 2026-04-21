/**
 * DB接続先管理サービス（connectionManager）
 *
 * DB接続先（db_connections テーブル）の CRUD 操作と接続テスト機能を提供する。
 * パスワードの暗号化/復号は encryption.ts に委譲する。
 *
 * 設計方針:
 *   - パスワードは常に暗号化して SQLite に保存（平文は保存しない）
 *   - getAll() では password は返却しない（セキュリティ上の理由）
 *   - getById() は復号済みパスワードを返す（内部利用のみ: チャットAPI等）
 *   - 接続テスト用の knex インスタンスはテスト後に即 destroy する（リソースリーク防止）
 *   - 接続名の重複時は 409 相当のエラー（DuplicateConnectionNameError）をスロー
 *
 * 使用テーブル:
 *   db_connections - SQLite（historyDb.ts で定義・作成済み）
 *
 * 依存関係:
 *   - services/encryption.ts: パスワード暗号化/復号
 *   - services/historyDb.ts: SQLite操作の Repository 関数
 *   - knex: MySQL/PostgreSQL への動的接続（接続テスト用）
 *
 * 参考:
 *   - ai_generated/requirements/db.md: db_connections テーブル定義
 *   - ai_generated/requirements/api.md: /api/connections エンドポイント仕様
 */

import { v4 as uuidv4 } from 'uuid'
import knex from 'knex'
import {
  getHistoryDb,
  createDbConnection,
  getDbConnectionById,
  listDbConnections,
  deleteDbConnection,
  markDbConnectionAsLastUsed,
  DbConnectionRow,
} from './historyDb'
import { encrypt, decrypt } from './encryption'

// =============================================================================
// エラークラス
// =============================================================================

/**
 * 接続名の重複エラー
 *
 * db_connections.name の UNIQUE 制約違反時にスローされる。
 * APIルート側でキャッチして 409 Conflict を返す。
 */
export class DuplicateConnectionNameError extends Error {
  constructor(name: string) {
    super(`Connection name '${name}' already exists.`)
    this.name = 'DuplicateConnectionNameError'
  }
}

/**
 * 接続先が見つからないエラー
 *
 * 指定IDの接続先が存在しない場合にスローされる。
 * APIルート側でキャッチして 404 Not Found を返す。
 */
export class ConnectionNotFoundError extends Error {
  constructor(id: string) {
    super(`DB connection with id '${id}' not found.`)
    this.name = 'ConnectionNotFoundError'
  }
}

// =============================================================================
// 型定義
// =============================================================================

/**
 * DB接続先の作成・更新時の入力パラメータ型
 *
 * パスワードは平文で受け取り、サービス内で暗号化して保存する。
 * APIリクエストボディの型に対応する。
 */
export interface DbConnectionInput {
  /** 接続名（表示用・UNIQUE制約あり） */
  name: string
  /** DBタイプ（mysql / postgresql） */
  dbType: 'mysql' | 'postgresql'
  /** DBホスト名またはIPアドレス */
  host: string
  /** DBポート番号 */
  port: number
  /** DBユーザー名 */
  username: string
  /** DBパスワード（平文）。更新時はオプション（省略時は既存パスワードを維持） */
  password?: string
  /** データベース名 */
  databaseName: string
}

/**
 * DB接続先の公開情報型（API レスポンス用）
 *
 * パスワードを含まない安全なレスポンス型。
 * GET /api/connections の一覧取得で使用する。
 */
export interface DbConnectionPublic {
  /** 接続先の一意識別子（UUID） */
  id: string
  /** 接続名 */
  name: string
  /** DBタイプ */
  dbType: 'mysql' | 'postgresql'
  /** DBホスト名 */
  host: string
  /** DBポート番号 */
  port: number
  /** DBユーザー名 */
  username: string
  /** データベース名 */
  databaseName: string
  /** 最後に使用したDB フラグ */
  isLastUsed: boolean
  /** 作成日時（ISO 8601形式） */
  createdAt: string
  /** 更新日時（ISO 8601形式） */
  updatedAt: string
}

/**
 * 接続テスト結果型
 */
export interface ConnectionTestResult {
  /** テスト成功フラグ */
  success: boolean
  /** テスト結果メッセージ（ユーザー向け） */
  message: string
}

// =============================================================================
// 内部ユーティリティ
// =============================================================================

/**
 * DbConnectionRow をパスワードなしの公開型に変換する
 *
 * SQLite から取得した生データを API レスポンス用の型に変換する。
 * password_encrypted フィールドは除外する。
 *
 * @param row - SQLite から取得した DbConnectionRow
 * @returns パスワードを除いた DbConnectionPublic
 */
function rowToPublic(row: DbConnectionRow): DbConnectionPublic {
  return {
    id: row.id,
    name: row.name,
    dbType: row.db_type as 'mysql' | 'postgresql',
    host: row.host,
    port: row.port,
    username: row.username,
    databaseName: row.database_name,
    // SQLite では BOOLEAN を INTEGER（0/1）で保存しているため変換
    isLastUsed: row.is_last_used === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// =============================================================================
// CRUD操作
// =============================================================================

/**
 * DB接続先を新規登録する
 *
 * パスワードを AES-256-GCM で暗号化してから SQLite に保存する。
 * 接続名が重複する場合は DuplicateConnectionNameError をスローする。
 *
 * @param input - 接続先情報（パスワードは平文で受け取る）
 * @returns 登録された接続先情報（パスワードなし）
 * @throws DuplicateConnectionNameError 接続名が重複する場合
 *
 * @example
 * ```typescript
 * const connection = await create({
 *   name: '本番DB',
 *   dbType: 'postgresql',
 *   host: 'db.example.com',
 *   port: 5432,
 *   username: 'readonly_user',
 *   password: 'mypassword',
 *   databaseName: 'production',
 * })
 * ```
 */
export function create(input: DbConnectionInput): DbConnectionPublic {
  const db = getHistoryDb()
  const id = uuidv4()

  // パスワードを暗号化（平文パスワードは保存しない）
  const passwordEncrypted = encrypt(input.password ?? '')

  try {
    const row = createDbConnection(db, {
      id,
      name: input.name,
      db_type: input.dbType,
      host: input.host,
      port: input.port,
      username: input.username,
      password_encrypted: passwordEncrypted,
      database_name: input.databaseName,
    })
    return rowToPublic(row)
  } catch (err) {
    // SQLite の UNIQUE 制約違反エラーを DuplicateConnectionNameError に変換する
    // better-sqlite3 では UNIQUE 制約違反は "UNIQUE constraint failed" メッセージで通知される
    if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
      throw new DuplicateConnectionNameError(input.name)
    }
    throw err
  }
}

/**
 * DB接続先の一覧を取得する（パスワードなし）
 *
 * パスワードを含まない安全な公開情報のみ返却する。
 * name の昇順でソートして返す。
 *
 * @returns 接続先一覧（パスワードなし）
 *
 * @example
 * ```typescript
 * const connections = getAll()
 * // => [{ id: '...', name: '本番DB', dbType: 'postgresql', ... }]
 * ```
 */
export function getAll(): DbConnectionPublic[] {
  const db = getHistoryDb()
  const rows = listDbConnections(db)
  return rows.map(rowToPublic)
}

/**
 * 指定IDのDB接続先を取得する（復号済みパスワード含む）
 *
 * 内部利用のみ（チャットAPI等で実際にDB接続する場合）。
 * APIレスポンスにはこの関数の戻り値を直接返さないこと。
 *
 * @param id - 取得する接続先ID
 * @returns 接続先情報（復号済みパスワード含む）
 * @throws ConnectionNotFoundError 指定IDの接続先が存在しない場合
 *
 * @example
 * ```typescript
 * // チャットAPI内での使用例
 * const conn = getById(dbConnectionId)
 * const knexInstance = buildKnexInstance(conn.dbType, conn.host, conn.port, conn.username, conn.password, conn.databaseName)
 * ```
 */
export function getById(id: string): DbConnectionPublic & { password: string } {
  const db = getHistoryDb()
  const row = getDbConnectionById(db, id)

  if (!row) {
    throw new ConnectionNotFoundError(id)
  }

  // パスワードを復号して返す（内部利用のみ）
  const password = decrypt(row.password_encrypted)

  return {
    ...rowToPublic(row),
    password,
  }
}

/**
 * DB接続先を更新する
 *
 * 指定されたフィールドのみ更新する（パスワードは指定時のみ再暗号化）。
 * 接続名が重複する場合は DuplicateConnectionNameError をスローする。
 *
 * @param id - 更新する接続先ID
 * @param input - 更新情報（パスワードは省略可。省略時は既存パスワードを維持）
 * @returns 更新後の接続先情報（パスワードなし）
 * @throws ConnectionNotFoundError 指定IDの接続先が存在しない場合
 * @throws DuplicateConnectionNameError 接続名が重複する場合
 *
 * @example
 * ```typescript
 * // パスワード変更なし
 * const updated = update('uuid-xxx', { name: '新名前', host: 'new.host.com', ... })
 *
 * // パスワード変更あり
 * const updated = update('uuid-xxx', { ..., password: 'newpassword' })
 * ```
 */
export function update(id: string, input: DbConnectionInput): DbConnectionPublic {
  const db = getHistoryDb()

  // 既存レコードを取得（存在確認と現在のパスワード取得）
  const existing = getDbConnectionById(db, id)
  if (!existing) {
    throw new ConnectionNotFoundError(id)
  }

  // パスワードの処理:
  // - input.password が指定されている場合は再暗号化
  // - 省略されている場合は既存の暗号化済みパスワードをそのまま使用
  const passwordEncrypted =
    input.password !== undefined
      ? encrypt(input.password)
      : existing.password_encrypted

  const now = new Date().toISOString()

  try {
    const stmt = db.prepare(`
      UPDATE db_connections
      SET name = @name,
          db_type = @db_type,
          host = @host,
          port = @port,
          username = @username,
          password_encrypted = @password_encrypted,
          database_name = @database_name,
          updated_at = @updated_at
      WHERE id = @id
    `)
    stmt.run({
      id,
      name: input.name,
      db_type: input.dbType,
      host: input.host,
      port: input.port,
      username: input.username,
      password_encrypted: passwordEncrypted,
      database_name: input.databaseName,
      updated_at: now,
    })
  } catch (err) {
    // SQLite の UNIQUE 制約違反エラーを DuplicateConnectionNameError に変換する
    if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
      throw new DuplicateConnectionNameError(input.name)
    }
    throw err
  }

  // 更新後のレコードを取得して返す
  const updated = getDbConnectionById(db, id)!
  return rowToPublic(updated)
}

/**
 * DB接続先を削除する（関連会話も CASCADE 削除）
 *
 * db_connections テーブルから削除すると、conversations テーブルに設定された
 * ON DELETE CASCADE により関連する会話・メッセージも自動削除される。
 *
 * @param id - 削除する接続先ID
 * @throws ConnectionNotFoundError 指定IDの接続先が存在しない場合
 *
 * @example
 * ```typescript
 * remove('uuid-xxx')
 * // => 接続先と関連する全会話・メッセージが削除される
 * ```
 */
export function remove(id: string): void {
  const db = getHistoryDb()

  // 存在確認（存在しない場合は ConnectionNotFoundError をスロー）
  const existing = getDbConnectionById(db, id)
  if (!existing) {
    throw new ConnectionNotFoundError(id)
  }

  const deleted = deleteDbConnection(db, id)
  if (deleted === 0) {
    // 削除件数が0の場合（同時リクエスト等で既に削除された場合）
    throw new ConnectionNotFoundError(id)
  }
}

/**
 * 最後に使用したDB接続先フラグを更新する
 *
 * 指定IDの接続先を is_last_used = 1 に設定し、
 * 他の全接続先の is_last_used を 0 にリセットする。
 * トランザクションで排他的に管理する（historyDb.ts の markDbConnectionAsLastUsed 参照）。
 *
 * @param id - is_last_used を 1 に設定する接続先ID
 * @throws ConnectionNotFoundError 指定IDの接続先が存在しない場合
 */
export function setLastUsed(id: string): void {
  const db = getHistoryDb()

  // 存在確認
  const existing = getDbConnectionById(db, id)
  if (!existing) {
    throw new ConnectionNotFoundError(id)
  }

  markDbConnectionAsLastUsed(db, id)
}

// =============================================================================
// 接続テスト
// =============================================================================

/**
 * 指定した接続情報でDB接続テストを行う
 *
 * knex.js を使って MySQL / PostgreSQL に実際に接続し、
 * 簡単なクエリ（SELECT 1）を実行して接続可否を確認する。
 *
 * タイムアウト: 5秒（接続待ちが長引かないよう制限）
 * knex インスタンスはテスト後に即 destroy する（リソースリーク防止）。
 *
 * @param input - 接続先情報（パスワードは平文で受け取る）
 * @returns 接続テスト結果（成功フラグとメッセージ）
 *
 * @example
 * ```typescript
 * const result = await testConnection({
 *   name: 'テスト接続',
 *   dbType: 'postgresql',
 *   host: 'localhost',
 *   port: 5432,
 *   username: 'user',
 *   password: 'pass',
 *   databaseName: 'mydb',
 * })
 * // => { success: true, message: 'Connection successful.' }
 * // => { success: false, message: 'Connection failed: ...' }
 * ```
 */
export async function testConnection(input: DbConnectionInput): Promise<ConnectionTestResult> {
  // knex クライアント識別子のマッピング
  // mysql → mysql2（knex v3では mysql2 を推奨）
  // postgresql → pg
  const clientMap: Record<string, string> = {
    mysql: 'mysql2',
    postgresql: 'pg',
  }

  const client = clientMap[input.dbType]
  if (!client) {
    return {
      success: false,
      message: `Unsupported DB type: ${input.dbType}`,
    }
  }

  // 接続テスト用の knex インスタンスを作成
  // この knex インスタンスはテスト専用で、テスト後に即 destroy する
  const testKnex = knex({
    client,
    connection: {
      host: input.host,
      port: input.port,
      user: input.username,
      password: input.password ?? '',
      database: input.databaseName,
      // 接続タイムアウト: 5秒（接続テスト専用のタイムアウト設定）
      // mysql2 は connectTimeout、pg は connectionTimeoutMillis を使用
      ...(input.dbType === 'mysql'
        ? { connectTimeout: 5000 }
        : { connectionTimeoutMillis: 5000 }),
    },
    // プールサイズを最小限に設定（接続テスト用なので 1 接続で十分）
    pool: { min: 0, max: 1 },
    // acquireConnectionTimeout: knex 側の接続取得タイムアウト（5秒）
    acquireConnectionTimeout: 5000,
  })

  try {
    // 簡単なクエリを実行して接続確認
    // SELECT 1 はどの RDBMS でも動作するシンプルなクエリ
    await testKnex.raw('SELECT 1')
    return {
      success: true,
      message: 'Connection successful.',
    }
  } catch (err) {
    // 接続エラーのメッセージを取得（内部情報が含まれる可能性があるため要注意）
    // ユーザー向けメッセージはシンプルにし、詳細はサーバーログに出力する
    const errorMessage = err instanceof Error ? err.message : String(err)
    console.error('[connectionManager] testConnection error:', err)
    return {
      success: false,
      message: `Connection failed: ${errorMessage}`,
    }
  } finally {
    // テスト後は必ず knex インスタンスを破棄してリソースをリリースする
    // destroy() を呼ばないと DB 接続プールが残り続けてリソースリークが発生する
    await testKnex.destroy()
  }
}
