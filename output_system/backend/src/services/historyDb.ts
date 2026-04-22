/**
 * 会話履歴用 SQLite データベース初期化・マイグレーションモジュール
 *
 * DataAgent の内部DB（DB接続先管理・クエリ履歴管理）を better-sqlite3 で管理する。
 * 外部ユーザーDBとは分離された専用DBで、DB接続先・会話・メッセージの永続化を担う。
 *
 * テーブル構成 (db.md ER図準拠):
 *   db_connections - DB接続先管理（id, name, db_type, host, port, username, password_encrypted,
 *                    database_name, is_last_used, created_at, updated_at）
 *   conversations  - 会話セッション（id, db_connection_id FK, title, created_at, updated_at）
 *   messages       - 個別メッセージ（id, conversation_id FK, role, content, sql, chart_type,
 *                    query_result, error, analysis, created_at）
 *
 * 環境変数:
 *   HISTORY_DB_PATH : SQLite ファイルパス（デフォルト: /app/data/history.sqlite）
 *
 * セキュリティ:
 *   - DBファイルは .gitignore 対象（data/ ディレクトリ除外）
 *   - Docker named volume でデータを永続化（docker-compose.yml 参照）
 *   - WAL モードで書き込みパフォーマンスを最適化
 *   - password_encrypted はAES-256-GCM暗号化済み（平文で保存しない）
 *
 * マイグレーション方針:
 *   - 既存のSQLiteデータベースは再作成する（既存の会話履歴は破棄許可済み）
 *   - db_connectionsテーブルを新規作成
 *   - conversationsテーブルにdb_connection_idカラムを追加（FK → db_connections.id）
 *   - 外部キー制約: conversations.db_connection_id → db_connections.id (ON DELETE CASCADE)
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
 * db_connections テーブルのレコード型（DBから取得した生データ）
 *
 * password_encrypted には AES-256-GCM で暗号化されたパスワードが格納される。
 * 平文パスワードは保存しないこと。
 *
 * PBI #200 追加:
 * - endpoint_url: GraphQL接続先のエンドポイントURL（GraphQL時のみ使用。DB時はNULL）
 * - host/port/username/password_encrypted/database_name: GraphQL時はNULL許容
 */
export interface DbConnectionRow {
  id: string
  name: string
  /** DBタイプ: 'mysql' | 'postgresql' | 'graphql' */
  db_type: string
  /** DBホスト名（GraphQL時はNULL） */
  host: string | null
  /** DBポート番号（GraphQL時はNULL） */
  port: number | null
  /** DBユーザー名（GraphQL時はNULL） */
  username: string | null
  /** 暗号化済みパスワード（GraphQL時はNULL） */
  password_encrypted: string | null
  /** データベース名（GraphQL時はNULL） */
  database_name: string | null
  /** GraphQL接続先エンドポイントURL（DB時はNULL） */
  endpoint_url: string | null
  is_last_used: number  // SQLite では BOOLEAN は INTEGER（0/1）として保存
  schema_cache: string | null  // SchemaInfo の JSON 文字列（キャッシュ済みスキーマ）
  schema_cached_at: string | null  // スキーマキャッシュの取得日時（ISO 8601）
  created_at: string
  updated_at: string
}

/**
 * conversations テーブルのレコード型（DBから取得した生データ）
 *
 * db_connection_id は DB接続先との FK（ON DELETE CASCADE）。
 * db.md の変更に伴い db_connection_id カラムを追加。
 * 後続PBI #147 でDB接続先管理が実装されるまでは NULL が格納される場合がある。
 */
export interface ConversationRow {
  id: string
  db_connection_id: string | null
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
 *
 * db_connection_id: DB接続先ID（FK → db_connections.id）。
 *   後続PBI #147 でDB接続先管理が実装されるまでは省略可能（NULL が格納される）。
 *   後続PBIで必須フィールドに変更予定。
 */
export interface CreateConversationParams {
  id: string
  db_connection_id?: string | null
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
 * マイグレーション方針 (ai_generated/requirements/db.md 参照):
 *   - 既存のSQLiteデータベースは「再作成」する（既存の会話履歴は破棄許可済み）
 *   - db_connectionsテーブルを新規追加
 *   - conversationsテーブルにdb_connection_idカラムを追加（FK → db_connections.id）
 *   - 外部キー制約: conversations.db_connection_id → db_connections.id (ON DELETE CASCADE)
 *
 * 再作成の理由:
 *   既存の conversations テーブルには db_connection_id カラムがなく、
 *   SQLite の ALTER TABLE では FK 付きカラムを追加できないため、
 *   テーブルを DROP して再作成する方式を採用する。
 *
 * テーブル仕様は ai_generated/requirements/db.md のER図に準拠。
 *
 * @param db - 初期化済みの Database インスタンス
 */
function runMigrations(db: Database.Database): void {
  // ===========================================================================
  // 既存テーブルを削除して再作成（db.md マイグレーション方針に従う）
  // ===========================================================================
  // 削除順序: FK 制約の関係で子テーブルから先に削除する
  // messages → conversations → db_connections の順に DROP
  //
  // 注意: ON DELETE CASCADE が有効でも、DROP TABLE 時は CASCADE は適用されない。
  // 子テーブルを先に DROP することで FK 制約違反エラーを回避する。

  db.exec(`DROP TABLE IF EXISTS messages`)
  db.exec(`DROP TABLE IF EXISTS conversations`)
  db.exec(`DROP TABLE IF EXISTS db_connections`)

  // ===========================================================================
  // db_connections テーブル（DB接続先管理）[新規追加]
  // ===========================================================================
  // - id: UUID（クライアント側で生成）
  // - name: 接続名（表示用）。UNIQUE 制約で重複を防ぐ
  // - db_type: 'mysql' | 'postgresql' | 'graphql'（PBI #200でgraphqlを追加）
  // - host: ホスト名（GraphQL時はNULL）
  // - port: ポート番号（GraphQL時はNULL）
  // - username: DBユーザー名（GraphQL時はNULL）
  // - password_encrypted: AES-256-GCM で暗号化されたパスワード（GraphQL時はNULL）
  // - database_name: 接続先DBの名前（GraphQL時はNULL）
  // - endpoint_url: GraphQL接続先エンドポイントURL（DB時はNULL）（PBI #200追加）
  // - is_last_used: 最後に使用したDB フラグ（0/1）。SQLite では BOOLEAN を INTEGER で表現
  // - created_at / updated_at: ISO 8601 文字列で保存
  //
  // GraphQL対応方針（PBI #200）:
  //   - db_type='graphql' の場合: endpoint_url のみ必須、host/port/username/password/database_name はNULL
  //   - db_type='mysql'/'postgresql' の場合: 従来通り host/port/username/password/database_name が必須
  db.exec(`
    CREATE TABLE IF NOT EXISTS db_connections (
      id                 TEXT     NOT NULL PRIMARY KEY,
      name               TEXT     NOT NULL UNIQUE,
      db_type            TEXT     NOT NULL CHECK(db_type IN ('mysql', 'postgresql', 'graphql')),
      host               TEXT,
      port               INTEGER,
      username           TEXT,
      password_encrypted TEXT,
      database_name      TEXT,
      endpoint_url       TEXT,
      is_last_used       INTEGER  NOT NULL DEFAULT 0,
      created_at         DATETIME NOT NULL,
      updated_at         DATETIME NOT NULL
    )
  `)

  // schema_cache カラムの追加（既存DB互換: カラムが未存在の場合のみ追加）
  const columns = db.pragma('table_info(db_connections)') as Array<{ name: string }>
  const columnNames = columns.map((c) => c.name)
  if (!columnNames.includes('schema_cache')) {
    db.exec(`ALTER TABLE db_connections ADD COLUMN schema_cache TEXT DEFAULT NULL`)
  }
  if (!columnNames.includes('schema_cached_at')) {
    db.exec(`ALTER TABLE db_connections ADD COLUMN schema_cached_at DATETIME DEFAULT NULL`)
  }
  // PBI #200: endpoint_url カラムの追加（既存DB互換）
  if (!columnNames.includes('endpoint_url')) {
    db.exec(`ALTER TABLE db_connections ADD COLUMN endpoint_url TEXT DEFAULT NULL`)
  }

  // ===========================================================================
  // conversations テーブル（会話セッション）[db_connection_id を追加]
  // ===========================================================================
  // - id: UUID（クライアント側で生成）
  // - db_connection_id: FK → db_connections.id（ON DELETE CASCADE）
  //   接続先DBが削除されると、その接続に紐づく会話も自動削除される。
  //   NULL 許容（後続PBI #147 でDB接続先管理が実装されるまでの暫定措置）。
  //   後続PBIでDB接続先管理が完成したら NOT NULL 制約を追加すること。
  // - title: 会話タイトル（最初のユーザー質問から自動生成）
  // - created_at / updated_at: ISO 8601 文字列で保存
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id                TEXT     NOT NULL PRIMARY KEY,
      db_connection_id  TEXT     REFERENCES db_connections(id) ON DELETE CASCADE,
      title             TEXT     NOT NULL,
      created_at        DATETIME NOT NULL,
      updated_at        DATETIME NOT NULL
    )
  `)

  // ===========================================================================
  // messages テーブル（個別メッセージ）[変更なし]
  // ===========================================================================
  // - id: UUID（クライアント側で生成）
  // - conversation_id: FK → conversations.id（ON DELETE CASCADE）
  //   会話が削除されると、そのメッセージも自動削除される
  // - role: 'user' または 'assistant'
  // - content: メッセージ本文
  // - sql: アシスタントが生成したSQL（ユーザーメッセージは NULL）
  // - chart_type: 推奨グラフ種別（bar/line/pie/table）
  // - query_result: クエリ結果JSON文字列（nullable）
  // - error: エラー内容（エラー発生時のみ）
  // - analysis: AI分析コメント（クエリ結果の傾向・特徴）
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
      analysis        TEXT,
      created_at      DATETIME NOT NULL
    )
  `)

  // ===========================================================================
  // インデックス
  // ===========================================================================

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

  // インデックス: db_connections の is_last_used での検索を高速化（最後に使用した接続を素早く取得）
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_db_connections_is_last_used
      ON db_connections(is_last_used)
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
 * @param params - 作成パラメータ（id, db_connection_id, title）
 * @returns 作成された ConversationRow
 *
 * @example
 * ```typescript
 * const conv = createConversation(db, {
 *   id: crypto.randomUUID(),
 *   db_connection_id: 'some-db-connection-id',
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
    INSERT INTO conversations (id, db_connection_id, title, created_at, updated_at)
    VALUES (@id, @db_connection_id, @title, @created_at, @updated_at)
  `)
  stmt.run({
    id: params.id,
    // db_connection_id が省略された場合は NULL を格納する（後続PBIで必須化予定）
    db_connection_id: params.db_connection_id ?? null,
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
    SELECT id, db_connection_id, title, created_at, updated_at
    FROM conversations
    ORDER BY updated_at DESC
  `)
  return stmt.all() as ConversationRow[]
}

/**
 * 指定DB接続先の会話一覧を updated_at 降順で取得する（DB別フィルタリング）
 *
 * PBI #151 追加: GET /api/history?dbConnectionId=xxx で使用する。
 * 指定された dbConnectionId に紐づく会話のみを返す。
 *
 * @param db - Database インスタンス
 * @param dbConnectionId - フィルタリングするDB接続先ID（UUID v4）
 * @returns 指定DB接続先の ConversationRow の配列（updated_at 降順）
 */
export function listConversationsByDbConnectionId(
  db: Database.Database,
  dbConnectionId: string
): ConversationRow[] {
  const stmt = db.prepare(`
    SELECT id, db_connection_id, title, created_at, updated_at
    FROM conversations
    WHERE db_connection_id = ?
    ORDER BY updated_at DESC
  `)
  return stmt.all(dbConnectionId) as ConversationRow[]
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
    SELECT id, db_connection_id, title, created_at, updated_at
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
    SELECT id, conversation_id, role, content, sql, chart_type, query_result, error, analysis, created_at
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
    SELECT id, conversation_id, role, content, sql, chart_type, query_result, error, analysis, created_at
    FROM messages
    WHERE conversation_id = ?
    ORDER BY created_at ASC
  `)
  return stmt.all(conversationId) as MessageRow[]
}

// ---------------------------------------------------------------------------
// Repository: db_connections
// ---------------------------------------------------------------------------

/**
 * DB接続先を新規作成する
 *
 * password は必ず暗号化済みのものを渡すこと（平文パスワードは保存しない）。
 * AES-256-GCM 暗号化は呼び出し元（config サービス等）が担当する。
 *
 * PBI #200: GraphQL接続先に対応。
 * - db_type='graphql' の場合: endpoint_url が必須。host/port/username/password_encrypted/database_name はNULL可
 * - db_type='mysql'/'postgresql' の場合: 従来通り（endpoint_url はNULL）
 *
 * @param db - Database インスタンス
 * @param params - 作成パラメータ
 * @returns 作成された DbConnectionRow
 *
 * @example
 * ```typescript
 * // DB接続先の作成
 * const conn = createDbConnection(db, {
 *   id: uuidv4(),
 *   name: '本番DB',
 *   db_type: 'postgresql',
 *   host: 'db.example.com',
 *   port: 5432,
 *   username: 'readonly_user',
 *   password_encrypted: encryptedPassword,
 *   database_name: 'production',
 * })
 *
 * // GraphQL接続先の作成
 * const graphqlConn = createDbConnection(db, {
 *   id: uuidv4(),
 *   name: 'My GraphQL API',
 *   db_type: 'graphql',
 *   endpoint_url: 'https://api.example.com/graphql',
 * })
 * ```
 */
export function createDbConnection(
  db: Database.Database,
  params: {
    id: string
    name: string
    db_type: string
    /** DBホスト名（GraphQL時はundefined/null可） */
    host?: string | null
    /** DBポート番号（GraphQL時はundefined/null可） */
    port?: number | null
    /** DBユーザー名（GraphQL時はundefined/null可） */
    username?: string | null
    /** 暗号化済みパスワード（GraphQL時はundefined/null可） */
    password_encrypted?: string | null
    /** データベース名（GraphQL時はundefined/null可） */
    database_name?: string | null
    /** GraphQLエンドポイントURL（DB時はundefined/null可） */
    endpoint_url?: string | null
  }
): DbConnectionRow {
  const now = new Date().toISOString()
  const stmt = db.prepare(`
    INSERT INTO db_connections (
      id, name, db_type, host, port, username, password_encrypted,
      database_name, endpoint_url, is_last_used, created_at, updated_at
    ) VALUES (
      @id, @name, @db_type, @host, @port, @username, @password_encrypted,
      @database_name, @endpoint_url, 0, @created_at, @updated_at
    )
  `)
  stmt.run({
    id: params.id,
    name: params.name,
    db_type: params.db_type,
    host: params.host ?? null,
    port: params.port ?? null,
    username: params.username ?? null,
    password_encrypted: params.password_encrypted ?? null,
    database_name: params.database_name ?? null,
    endpoint_url: params.endpoint_url ?? null,
    created_at: now,
    updated_at: now,
  })
  return getDbConnectionById(db, params.id)!
}

/**
 * 指定IDのDB接続先を取得する
 *
 * @param db - Database インスタンス
 * @param id - 取得するDB接続先ID
 * @returns DbConnectionRow（存在しない場合は undefined）
 */
export function getDbConnectionById(
  db: Database.Database,
  id: string
): DbConnectionRow | undefined {
  const stmt = db.prepare(`
    SELECT id, name, db_type, host, port, username, password_encrypted,
           database_name, endpoint_url, is_last_used, schema_cache, schema_cached_at, created_at, updated_at
    FROM db_connections
    WHERE id = ?
  `)
  return stmt.get(id) as DbConnectionRow | undefined
}

/**
 * DB接続先一覧を取得する（name 昇順）
 *
 * @param db - Database インスタンス
 * @returns DbConnectionRow の配列（name 昇順）
 */
export function listDbConnections(db: Database.Database): DbConnectionRow[] {
  const stmt = db.prepare(`
    SELECT id, name, db_type, host, port, username, password_encrypted,
           database_name, endpoint_url, is_last_used, schema_cache, schema_cached_at, created_at, updated_at
    FROM db_connections
    ORDER BY name ASC
  `)
  return stmt.all() as DbConnectionRow[]
}

/**
 * 指定IDのDB接続先を削除する
 *
 * conversations テーブルには ON DELETE CASCADE が設定されているため、
 * db_connections のレコードを削除すると関連 conversations および messages も自動削除される。
 *
 * @param db - Database インスタンス
 * @param id - 削除するDB接続先ID
 * @returns 削除された行数（0 の場合は対象が存在しなかった）
 */
export function deleteDbConnection(db: Database.Database, id: string): number {
  const stmt = db.prepare(`DELETE FROM db_connections WHERE id = ?`)
  const result = stmt.run(id)
  return result.changes
}

/**
 * DB接続先のスキーマキャッシュを更新する
 *
 * @param db - Database インスタンス
 * @param id - 対象のDB接続先ID
 * @param schemaJson - SchemaInfo の JSON 文字列
 */
export function updateDbConnectionSchemaCache(
  db: Database.Database,
  id: string,
  schemaJson: string
): void {
  const now = new Date().toISOString()
  const stmt = db.prepare(`
    UPDATE db_connections
    SET schema_cache = @schema_cache,
        schema_cached_at = @schema_cached_at,
        updated_at = @updated_at
    WHERE id = @id
  `)
  stmt.run({
    id,
    schema_cache: schemaJson,
    schema_cached_at: now,
    updated_at: now,
  })
}

/**
 * 最後に使用したDB接続先を取得する
 *
 * is_last_used = 1 のレコードを取得する。
 * 複数ある場合は updated_at が最新のものを返す。
 *
 * @param db - Database インスタンス
 * @returns DbConnectionRow（存在しない場合は undefined）
 */
export function getLastUsedDbConnection(
  db: Database.Database
): DbConnectionRow | undefined {
  const stmt = db.prepare(`
    SELECT id, name, db_type, host, port, username, password_encrypted,
           database_name, endpoint_url, is_last_used, schema_cache, schema_cached_at, created_at, updated_at
    FROM db_connections
    WHERE is_last_used = 1
    ORDER BY updated_at DESC
    LIMIT 1
  `)
  return stmt.get() as DbConnectionRow | undefined
}

/**
 * 指定のDB接続先を「最後に使用した」としてマークする
 *
 * 他の接続先の is_last_used をすべて 0 にリセットした後、
 * 指定IDの接続先を is_last_used = 1 に設定する。
 * トランザクションで atomically に実行する。
 *
 * @param db - Database インスタンス
 * @param id - マークするDB接続先ID
 */
export function markDbConnectionAsLastUsed(
  db: Database.Database,
  id: string
): void {
  // トランザクションで atomically に実行（排他的な is_last_used 管理）
  const tx = db.transaction(() => {
    // すべての接続先の is_last_used を 0 にリセット
    db.prepare(`UPDATE db_connections SET is_last_used = 0`).run()
    // 指定IDの接続先を is_last_used = 1 に設定し updated_at を更新
    db.prepare(`
      UPDATE db_connections
      SET is_last_used = 1, updated_at = @updated_at
      WHERE id = @id
    `).run({ id, updated_at: new Date().toISOString() })
  })
  tx()
}
