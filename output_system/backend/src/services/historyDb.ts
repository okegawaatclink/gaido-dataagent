/**
 * 会話履歴用 SQLite データベース初期化・マイグレーションモジュール
 *
 * DataAgent の内部DB（クエリ履歴管理）を better-sqlite3 で管理する。
 * 外部ユーザーDBとは分離された専用DBで、会話・メッセージの永続化を担う。
 *
 * テーブル構成 (db.md ER図準拠):
 *   conversations - 会話セッション（id, title, created_at, updated_at）
 *   messages      - 個別メッセージ（id, conversation_id, role, content, sql, chart_type, query_result, error, created_at）
 *
 * 環境変数:
 *   HISTORY_DB_PATH : SQLite ファイルパス（デフォルト: /app/data/history.sqlite）
 *
 * セキュリティ:
 *   - DBファイルは .gitignore 対象（data/ ディレクトリ除外）
 *   - Docker named volume でデータを永続化（docker-compose.yml 参照）
 *   - WAL モードで書き込みパフォーマンスを最適化
 *
 * 参考:
 *   - https://github.com/wiselibs/better-sqlite3/blob/master/README.md
 *   - ai_generated/requirements/db.md
 */

import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/**
 * conversations テーブルのレコード型（DBから取得した生データ）
 */
export interface ConversationRow {
  id: string
  title: string
  created_at: string
  updated_at: string
}

/**
 * messages テーブルのレコード型（DBから取得した生データ）
 */
export interface MessageRow {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  sql: string | null
  chart_type: string | null
  query_result: string | null
  error: string | null
  analysis: string | null
  created_at: string
}

/**
 * message 作成時の入力パラメータ型
 */
export interface CreateMessageParams {
  id: string
  conversationId: string
  role: 'user' | 'assistant'
  content: string
  sql?: string | null
  chartType?: string | null
  queryResult?: unknown | null
  error?: string | null
  analysis?: string | null
}

/**
 * conversation 作成時の入力パラメータ型
 */
export interface CreateConversationParams {
  id: string
  title: string
}

// ---------------------------------------------------------------------------
// シングルトン管理
// ---------------------------------------------------------------------------

/**
 * better-sqlite3 のデータベースインスタンス（シングルトン）
 * initHistoryDb() で初期化され、以降はキャッシュされたインスタンスを返す。
 */
let historyDbInstance: Database.Database | null = null

/**
 * DBファイルパスを環境変数から取得する
 *
 * コンテナ環境では /app/data/history.sqlite に配置される。
 * ローカル開発時は HISTORY_DB_PATH で上書き可能。
 *
 * @returns SQLite ファイルの絶対パス
 */
export function getHistoryDbPath(): string {
  return process.env.HISTORY_DB_PATH ?? '/app/data/history.sqlite'
}

/**
 * 履歴DB の初期化（起動時に1度だけ呼び出す）
 *
 * 以下の処理を行う:
 *   1. DBファイル用ディレクトリの作成（存在しない場合）
 *   2. better-sqlite3 インスタンスの生成
 *   3. WAL モードの有効化（並行読み書きのパフォーマンス改善）
 *   4. conversations / messages テーブルの CREATE TABLE IF NOT EXISTS
 *
 * @param dbPath - DBファイルパス（省略時は getHistoryDbPath() を使用、テスト時に注入可能）
 * @returns 初期化済みの Database インスタンス
 *
 * @example
 * ```typescript
 * // アプリケーション起動時
 * const db = initHistoryDb()
 *
 * // テスト時（インメモリDB）
 * const db = initHistoryDb(':memory:')
 * ```
 */
export function initHistoryDb(dbPath?: string): Database.Database {
  const resolvedPath = dbPath ?? getHistoryDbPath()

  // テスト用インメモリDBの場合はディレクトリ作成をスキップ
  if (resolvedPath !== ':memory:') {
    const dir = path.dirname(resolvedPath)
    if (!fs.existsSync(dir)) {
      // DBファイル用ディレクトリが存在しない場合は再帰的に作成
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  // better-sqlite3 インスタンスを生成
  // verbose オプションは本番環境では無効（接続情報漏洩防止）
  const db = new Database(resolvedPath)

  // WAL モードを有効化（Write-Ahead Logging）
  // 参考: https://github.com/wiselibs/better-sqlite3/blob/master/docs/performance.md
  // - 並行読み書きのパフォーマンスを大幅に向上
  // - Web アプリケーションでは強く推奨
  db.pragma('journal_mode = WAL')

  // 外部キー制約を有効化（SQLiteのデフォルトは無効）
  // conversations が存在しない conversation_id を持つ messages の挿入を防ぐ
  db.pragma('foreign_keys = ON')

  // マイグレーション: テーブルが存在しない場合は作成（べき等）
  runMigrations(db)

  return db
}

/**
 * テーブルマイグレーションを実行する
 *
 * CREATE TABLE IF NOT EXISTS でべき等に実行可能。
 * 起動時に毎回呼ばれるが、テーブルが既存の場合はスキップされる。
 *
 * テーブル仕様は ai_generated/requirements/db.md のER図に準拠。
 *
 * @param db - 初期化済みの Database インスタンス
 */
function runMigrations(db: Database.Database): void {
  // conversations テーブル（会話セッション）
  // - id: UUID（クライアント側で生成）
  // - title: 会話タイトル（最初のユーザー質問から自動生成）
  // - created_at / updated_at: ISO 8601 文字列で保存
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id         TEXT     NOT NULL PRIMARY KEY,
      title      TEXT     NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    )
  `)

  // messages テーブル（個別メッセージ）
  // - id: UUID（クライアント側で生成）
  // - conversation_id: FK → conversations.id（CASCADE削除）
  // - role: 'user' または 'assistant'
  // - content: メッセージ本文
  // - sql: アシスタントが生成したSQL（ユーザーメッセージは NULL）
  // - chart_type: 推奨グラフ種別（bar/line/pie/table）
  // - query_result: クエリ結果JSON文字列（nullable）
  // - error: エラー内容（エラー発生時のみ）
  // - created_at: メッセージ作成日時
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id              TEXT     NOT NULL PRIMARY KEY,
      conversation_id TEXT     NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role            TEXT     NOT NULL CHECK(role IN ('user', 'assistant')),
      content         TEXT     NOT NULL,
      sql             TEXT,
      chart_type      TEXT,
      query_result    TEXT,
      error           TEXT,
      created_at      DATETIME NOT NULL
    )
  `)

  // マイグレーション: analysis カラムを追加（既存DBへの後方互換）
  try {
    db.exec(`ALTER TABLE messages ADD COLUMN analysis TEXT`)
  } catch {
    // カラムが既に存在する場合は無視（duplicate column name エラー）
  }

  // インデックス: conversation_id での messages 検索を高速化
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
      ON messages(conversation_id)
  `)

  // インデックス: conversations の updated_at 降順ソートを高速化（一覧取得用）
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_conversations_updated_at
      ON conversations(updated_at DESC)
  `)
}

/**
 * シングルトンの履歴DB インスタンスを取得する
 *
 * initHistoryDb() 未呼び出し時に自動初期化する。
 * アプリケーションコードからはこのメソッドを使用する。
 *
 * @returns 初期化済みの Database インスタンス
 */
export function getHistoryDb(): Database.Database {
  if (!historyDbInstance) {
    historyDbInstance = initHistoryDb()
  }
  return historyDbInstance
}

/**
 * テスト用: シングルトンインスタンスをリセットまたは置換する
 *
 * ユニットテストでインメモリDBを注入するために使用する。
 * テスト終了時には closeHistoryDb() を呼び出すこと。
 *
 * @param instance - 注入する Database インスタンス（省略時は null にリセット）
 *
 * @example
 * ```typescript
 * // テスト前: インメモリDBを注入
 * const testDb = initHistoryDb(':memory:')
 * setHistoryDbInstance(testDb)
 *
 * // テスト後: クリーンアップ
 * closeHistoryDb()
 * setHistoryDbInstance(null)
 * ```
 */
export function setHistoryDbInstance(instance: Database.Database | null): void {
  historyDbInstance = instance
}

/**
 * 履歴DB 接続をクローズする
 *
 * アプリケーション終了時やテスト後に呼び出す。
 * gracefulShutdown ハンドラから呼ばれる。
 */
export function closeHistoryDb(): void {
  if (historyDbInstance) {
    historyDbInstance.close()
    historyDbInstance = null
  }
}

// ---------------------------------------------------------------------------
// Repository: conversations
// ---------------------------------------------------------------------------

/**
 * 会話を新規作成する
 *
 * @param db - Database インスタンス（省略時はシングルトン）
 * @param params - 作成パラメータ（id, title）
 * @returns 作成された ConversationRow
 *
 * @example
 * ```typescript
 * const conv = createConversation(db, {
 *   id: crypto.randomUUID(),
 *   title: '売上データを教えて',
 * })
 * ```
 */
export function createConversation(
  db: Database.Database,
  params: CreateConversationParams
): ConversationRow {
  const now = new Date().toISOString()
  const stmt = db.prepare(`
    INSERT INTO conversations (id, title, created_at, updated_at)
    VALUES (@id, @title, @created_at, @updated_at)
  `)
  stmt.run({
    id: params.id,
    title: params.title,
    created_at: now,
    updated_at: now,
  })
  return getConversationById(db, params.id)!
}

/**
 * 会話の updated_at を現在時刻に更新する
 *
 * メッセージ追加時など、会話に変更があった場合に呼び出す。
 *
 * @param db - Database インスタンス（省略時はシングルトン）
 * @param id - 更新対象の会話ID
 */
export function updateConversationTimestamp(
  db: Database.Database,
  id: string
): void {
  const stmt = db.prepare(`
    UPDATE conversations SET updated_at = @updated_at WHERE id = @id
  `)
  stmt.run({ id, updated_at: new Date().toISOString() })
}

/**
 * 会話一覧を updated_at 降順で取得する（最新順）
 *
 * api.md の GET /api/history エンドポイントで使用する。
 *
 * @param db - Database インスタンス（省略時はシングルトン）
 * @returns ConversationRow の配列（updated_at 降順）
 */
export function listConversations(db: Database.Database): ConversationRow[] {
  const stmt = db.prepare(`
    SELECT id, title, created_at, updated_at
    FROM conversations
    ORDER BY updated_at DESC
  `)
  return stmt.all() as ConversationRow[]
}

/**
 * 指定IDの会話を取得する
 *
 * @param db - Database インスタンス（省略時はシングルトン）
 * @param id - 取得する会話ID
 * @returns ConversationRow（存在しない場合は undefined）
 */
export function getConversationById(
  db: Database.Database,
  id: string
): ConversationRow | undefined {
  const stmt = db.prepare(`
    SELECT id, title, created_at, updated_at
    FROM conversations
    WHERE id = ?
  `)
  return stmt.get(id) as ConversationRow | undefined
}

/**
 * 指定IDの会話とそのメッセージを CASCADE 削除する
 *
 * messages テーブルには ON DELETE CASCADE が設定されているため、
 * conversations のレコードを削除すると関連 messages も自動削除される。
 *
 * @param db - Database インスタンス（省略時はシングルトン）
 * @param id - 削除する会話ID
 * @returns 削除された行数（0 の場合は対象が存在しなかった）
 */
export function deleteConversation(db: Database.Database, id: string): number {
  const stmt = db.prepare(`DELETE FROM conversations WHERE id = ?`)
  const result = stmt.run(id)
  return result.changes
}

// ---------------------------------------------------------------------------
// Repository: messages
// ---------------------------------------------------------------------------

/**
 * メッセージを新規作成する
 *
 * query_result は JSON 文字列として保存する（SQLite は JSON型を持たないため）。
 * 取得時に JSON.parse() で復元する。
 *
 * @param db - Database インスタンス（省略時はシングルトン）
 * @param params - 作成パラメータ
 * @returns 作成された MessageRow
 */
export function createMessage(
  db: Database.Database,
  params: CreateMessageParams
): MessageRow {
  const now = new Date().toISOString()

  // query_result は JSON 文字列にシリアライズして保存
  const queryResultStr =
    params.queryResult != null ? JSON.stringify(params.queryResult) : null

  const stmt = db.prepare(`
    INSERT INTO messages (
      id, conversation_id, role, content, sql, chart_type, query_result, error, analysis, created_at
    ) VALUES (
      @id, @conversation_id, @role, @content, @sql, @chart_type, @query_result, @error, @analysis, @created_at
    )
  `)

  stmt.run({
    id: params.id,
    conversation_id: params.conversationId,
    role: params.role,
    content: params.content,
    sql: params.sql ?? null,
    chart_type: params.chartType ?? null,
    query_result: queryResultStr,
    error: params.error ?? null,
    analysis: params.analysis ?? null,
    created_at: now,
  })

  return getMessageById(db, params.id)!
}

/**
 * 指定IDのメッセージを取得する
 *
 * @param db - Database インスタンス（省略時はシングルトン）
 * @param id - 取得するメッセージID
 * @returns MessageRow（存在しない場合は undefined）
 */
export function getMessageById(
  db: Database.Database,
  id: string
): MessageRow | undefined {
  const stmt = db.prepare(`
    SELECT id, conversation_id, role, content, sql, chart_type, query_result, error, created_at
    FROM messages
    WHERE id = ?
  `)
  return stmt.get(id) as MessageRow | undefined
}

/**
 * 指定会話のメッセージ一覧を created_at 昇順で取得する
 *
 * api.md の GET /api/history/:id エンドポイントで使用する。
 *
 * @param db - Database インスタンス（省略時はシングルトン）
 * @param conversationId - 取得する会話ID
 * @returns MessageRow の配列（created_at 昇順）
 */
export function listMessagesByConversationId(
  db: Database.Database,
  conversationId: string
): MessageRow[] {
  const stmt = db.prepare(`
    SELECT id, conversation_id, role, content, sql, chart_type, query_result, error, created_at
    FROM messages
    WHERE conversation_id = ?
    ORDER BY created_at ASC
  `)
  return stmt.all(conversationId) as MessageRow[]
}
