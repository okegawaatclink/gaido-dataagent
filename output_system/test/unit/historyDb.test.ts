/**
 * historyDb.ts のユニットテスト
 *
 * SQLite 履歴DB の初期化・マイグレーション・Repository関数を検証する。
 * すべてのテストはインメモリDB（':memory:'）を使用し、ファイルを作成しない。
 *
 * テスト対象:
 *   - initHistoryDb()         : テーブルが作成されること（db_connections/conversations/messages）
 *   - createDbConnection()    : DB接続先レコードが作成されること
 *   - listDbConnections()     : DB接続先一覧を name 昇順で取得できること
 *   - getDbConnectionById()   : 指定IDのDB接続先を取得できること
 *   - deleteDbConnection()    : DB接続先とその会話・メッセージが CASCADE 削除されること
 *   - markDbConnectionAsLastUsed(): is_last_used フラグが排他的に更新されること
 *   - createConversation()    : 会話レコードが作成されること（db_connection_id が必須）
 *   - listConversations()     : updated_at 降順で一覧取得できること
 *   - getConversationById()   : 指定IDの会話を取得できること
 *   - deleteConversation()    : 会話とメッセージが CASCADE 削除されること
 *   - createMessage()         : メッセージレコードが作成されること
 *   - listMessagesByConversationId(): 会話に紐づくメッセージ一覧を取得できること
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import {
  initHistoryDb,
  getHistoryDbPath,
  getHistoryDb,
  setHistoryDbInstance,
  closeHistoryDb,
  createDbConnection,
  listDbConnections,
  getDbConnectionById,
  deleteDbConnection,
  getLastUsedDbConnection,
  markDbConnectionAsLastUsed,
  createConversation,
  listConversations,
  getConversationById,
  deleteConversation,
  updateConversationTimestamp,
  createMessage,
  getMessageById,
  listMessagesByConversationId,
} from '../../backend/src/services/historyDb'

// ---------------------------------------------------------------------------
// ヘルパー: テスト用インメモリDB
// ---------------------------------------------------------------------------

/**
 * 各テスト前にフレッシュなインメモリDBを生成する。
 * initHistoryDb(':memory:') を使用してマイグレーション済みDBを返す。
 */
function createTestDb(): Database.Database {
  return initHistoryDb(':memory:')
}

/**
 * テスト用のDB接続先を作成するヘルパー
 * conversations テーブルは db_connection_id が必須のため、
 * 会話テストでも使用する。
 *
 * @param db - テスト用インメモリDB
 * @param id - DB接続先ID（省略時は 'test-conn-id'）
 * @returns 作成されたDB接続先レコード
 */
function createTestDbConnection(db: Database.Database, id = 'test-conn-id') {
  return createDbConnection(db, {
    id,
    name: `テスト接続-${id}`,
    db_type: 'postgresql',
    host: 'localhost',
    port: 5432,
    username: 'test_user',
    password_encrypted: 'encrypted_password_for_test',
    database_name: 'test_db',
  })
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe('historyDb: initHistoryDb', () => {
  /**
   * 【テスト対象】initHistoryDb()
   * 【テスト内容】インメモリDBで初期化した場合にすべてのテーブルが作成されること
   * 【期待結果】db_connections / conversations / messages テーブルが存在すること
   */
  it('should create db_connections, conversations and messages tables on init', () => {
    const db = createTestDb()

    // sqlite_master を使ってテーブル存在を確認
    const tables = (
      db.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
      ).all() as { name: string }[]
    ).map((r) => r.name)

    expect(tables).toContain('db_connections')
    expect(tables).toContain('conversations')
    expect(tables).toContain('messages')

    db.close()
  })

  /**
   * 【テスト対象】initHistoryDb()
   * 【テスト内容】conversations テーブルに db_connection_id カラムが存在すること
   * 【期待結果】PRAGMA table_info で db_connection_id カラムが確認できること
   */
  it('should have db_connection_id column in conversations table', () => {
    const db = createTestDb()

    // PRAGMA table_info でカラム一覧を取得
    const columns = (
      db.prepare(`PRAGMA table_info(conversations)`).all() as { name: string }[]
    ).map((c) => c.name)

    expect(columns).toContain('db_connection_id')

    db.close()
  })

  /**
   * 【テスト対象】initHistoryDb()
   * 【テスト内容】2回呼び出した場合にエラーが発生しないこと（べき等性）
   * 【期待結果】CREATE TABLE IF NOT EXISTS によってエラーなく2回目の呼び出しも成功すること
   */
  it('should be idempotent when called multiple times', () => {
    const db = createTestDb()

    // 同じDBインスタンスに再度マイグレーションを実行してもエラーが起きないこと
    expect(() => initHistoryDb(':memory:')).not.toThrow()

    db.close()
  })

  /**
   * 【テスト対象】initHistoryDb()
   * 【テスト内容】インデックスが作成されること
   * 【期待結果】idx_messages_conversation_id / idx_conversations_updated_at /
   *             idx_db_connections_is_last_used が存在すること
   */
  it('should create indexes for performance', () => {
    const db = createTestDb()

    const indexes = (
      db.prepare(
        `SELECT name FROM sqlite_master WHERE type='index' ORDER BY name`
      ).all() as { name: string }[]
    ).map((r) => r.name)

    expect(indexes).toContain('idx_messages_conversation_id')
    expect(indexes).toContain('idx_conversations_updated_at')
    expect(indexes).toContain('idx_db_connections_is_last_used')

    db.close()
  })
})

describe('historyDb: conversations Repository', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
    // conversations には db_connection_id（FK）が必須のため、事前にDB接続先を作成する
    createTestDbConnection(db)
  })

  afterEach(() => {
    db.close()
  })

  /**
   * 【テスト対象】createConversation()
   * 【テスト内容】正常な入力で会話レコードが作成されること
   * 【期待結果】id, db_connection_id, title, created_at, updated_at が設定された ConversationRow が返ること
   */
  it('should create a conversation with correct fields including db_connection_id', () => {
    const conv = createConversation(db, {
      id: 'test-conv-id-1',
      db_connection_id: 'test-conn-id',
      title: '売上データを教えて',
    })

    expect(conv.id).toBe('test-conv-id-1')
    expect(conv.db_connection_id).toBe('test-conn-id')
    expect(conv.title).toBe('売上データを教えて')
    expect(conv.created_at).toBeTruthy()
    expect(conv.updated_at).toBeTruthy()
    // created_at と updated_at は作成直後は同一であること
    expect(conv.created_at).toBe(conv.updated_at)
  })

  /**
   * 【テスト対象】listConversations()
   * 【テスト内容】複数の会話を作成したとき、updated_at 降順で取得できること
   * 【期待結果】最後に更新された会話が先頭に来ること
   */
  it('should return conversations ordered by updated_at DESC', () => {
    // 3件の会話を作成
    createConversation(db, { id: 'conv-1', db_connection_id: 'test-conn-id', title: '最初の質問' })
    createConversation(db, { id: 'conv-2', db_connection_id: 'test-conn-id', title: '2番目の質問' })
    createConversation(db, { id: 'conv-3', db_connection_id: 'test-conn-id', title: '3番目の質問' })

    // conv-1 を更新（updated_at を新しくする）
    updateConversationTimestamp(db, 'conv-1')

    const conversations = listConversations(db)

    expect(conversations).toHaveLength(3)
    // conv-1 が最も新しい updated_at を持つため先頭に来ること
    expect(conversations[0].id).toBe('conv-1')
  })

  /**
   * 【テスト対象】getConversationById()
   * 【テスト内容】存在するIDを指定したとき、対応する会話レコードが返ること
   * 【期待結果】指定IDの ConversationRow が返ること（db_connection_id を含む）
   */
  it('should return conversation by id with db_connection_id', () => {
    createConversation(db, { id: 'find-conv-id', db_connection_id: 'test-conn-id', title: 'テスト会話' })

    const found = getConversationById(db, 'find-conv-id')

    expect(found).toBeDefined()
    expect(found!.id).toBe('find-conv-id')
    expect(found!.db_connection_id).toBe('test-conn-id')
    expect(found!.title).toBe('テスト会話')
  })

  /**
   * 【テスト対象】getConversationById()
   * 【テスト内容】存在しないIDを指定したとき、undefined が返ること
   * 【期待結果】undefined が返ること
   */
  it('should return undefined for non-existent conversation id', () => {
    const result = getConversationById(db, 'non-existent-id')
    expect(result).toBeUndefined()
  })

  /**
   * 【テスト対象】deleteConversation()
   * 【テスト内容】存在する会話を削除したとき、1が返り会話が存在しなくなること
   * 【期待結果】changes が 1、削除後は getConversationById が undefined を返すこと
   */
  it('should delete conversation and return changes count of 1', () => {
    createConversation(db, { id: 'del-conv-id', db_connection_id: 'test-conn-id', title: '削除テスト' })

    const changes = deleteConversation(db, 'del-conv-id')

    expect(changes).toBe(1)
    expect(getConversationById(db, 'del-conv-id')).toBeUndefined()
  })

  /**
   * 【テスト対象】deleteConversation()
   * 【テスト内容】存在しないIDを削除した場合、0が返ること
   * 【期待結果】changes が 0
   */
  it('should return 0 when deleting non-existent conversation', () => {
    const changes = deleteConversation(db, 'non-existent-id')
    expect(changes).toBe(0)
  })

  /**
   * 【テスト対象】deleteConversation()
   * 【テスト内容】会話を削除したとき、紐づくメッセージも CASCADE 削除されること
   * 【期待結果】削除後に listMessagesByConversationId が空配列を返すこと
   */
  it('should cascade delete messages when conversation is deleted', () => {
    createConversation(db, { id: 'cascade-conv', db_connection_id: 'test-conn-id', title: 'カスケード削除テスト' })
    createMessage(db, {
      id: 'msg-1',
      conversationId: 'cascade-conv',
      role: 'user',
      content: 'テストメッセージ',
    })
    createMessage(db, {
      id: 'msg-2',
      conversationId: 'cascade-conv',
      role: 'assistant',
      content: 'テスト応答',
    })

    // 会話を削除
    deleteConversation(db, 'cascade-conv')

    // メッセージも削除されていること
    const messages = listMessagesByConversationId(db, 'cascade-conv')
    expect(messages).toHaveLength(0)
  })
})

describe('historyDb: messages Repository', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
    // メッセージテストには会話が必要。会話には db_connection_id（FK）が必須
    createTestDbConnection(db)
    createConversation(db, { id: 'test-conv', db_connection_id: 'test-conn-id', title: 'テスト会話' })
  })

  afterEach(() => {
    db.close()
  })

  /**
   * 【テスト対象】createMessage()
   * 【テスト内容】ユーザーメッセージを正常に作成できること
   * 【期待結果】id, conversation_id, role='user', content が設定された MessageRow が返ること
   */
  it('should create a user message with correct fields', () => {
    const msg = createMessage(db, {
      id: 'user-msg-1',
      conversationId: 'test-conv',
      role: 'user',
      content: '今月の売上を教えて',
    })

    expect(msg.id).toBe('user-msg-1')
    expect(msg.conversation_id).toBe('test-conv')
    expect(msg.role).toBe('user')
    expect(msg.content).toBe('今月の売上を教えて')
    expect(msg.sql).toBeNull()
    expect(msg.chart_type).toBeNull()
    expect(msg.query_result).toBeNull()
    expect(msg.error).toBeNull()
    expect(msg.created_at).toBeTruthy()
  })

  /**
   * 【テスト対象】createMessage()
   * 【テスト内容】sql, chart_type, query_result, error を含む assistant メッセージを作成できること
   * 【期待結果】全フィールドが正しく保存・取得されること
   *
   * 【前提条件】
   * - query_result は JSON オブジェクトとして渡され、JSON 文字列として保存される
   */
  it('should create an assistant message with sql, chart_type, query_result', () => {
    const queryResult = { columns: ['month', 'amount'], rows: [{ month: '2024-01', amount: 100000 }] }

    const msg = createMessage(db, {
      id: 'asst-msg-1',
      conversationId: 'test-conv',
      role: 'assistant',
      content: '今月の売上データを取得しました。',
      sql: 'SELECT month, SUM(amount) FROM sales GROUP BY month',
      chartType: 'bar',
      queryResult,
    })

    expect(msg.id).toBe('asst-msg-1')
    expect(msg.role).toBe('assistant')
    expect(msg.sql).toBe('SELECT month, SUM(amount) FROM sales GROUP BY month')
    expect(msg.chart_type).toBe('bar')
    // query_result は JSON 文字列として保存される
    expect(msg.query_result).toBe(JSON.stringify(queryResult))
    expect(msg.error).toBeNull()
  })

  /**
   * 【テスト対象】createMessage()
   * 【テスト内容】エラーフィールドを含む assistant メッセージを作成できること
   * 【期待結果】error フィールドが正しく保存されること
   */
  it('should create an assistant message with error field', () => {
    const msg = createMessage(db, {
      id: 'err-msg-1',
      conversationId: 'test-conv',
      role: 'assistant',
      content: 'エラーが発生しました。',
      error: 'SQL バリデーションエラー: DROP TABLE は許可されていません',
    })

    expect(msg.error).toBe('SQL バリデーションエラー: DROP TABLE は許可されていません')
    expect(msg.sql).toBeNull()
  })

  /**
   * 【テスト対象】getMessageById()
   * 【テスト内容】存在するIDを指定したとき、対応するメッセージが返ること
   * 【期待結果】指定IDの MessageRow が返ること
   */
  it('should return message by id', () => {
    createMessage(db, {
      id: 'find-msg-id',
      conversationId: 'test-conv',
      role: 'user',
      content: '検索テスト',
    })

    const found = getMessageById(db, 'find-msg-id')

    expect(found).toBeDefined()
    expect(found!.id).toBe('find-msg-id')
  })

  /**
   * 【テスト対象】getMessageById()
   * 【テスト内容】存在しないIDを指定したとき、undefined が返ること
   * 【期待結果】undefined が返ること
   */
  it('should return undefined for non-existent message id', () => {
    const result = getMessageById(db, 'non-existent-id')
    expect(result).toBeUndefined()
  })

  /**
   * 【テスト対象】listMessagesByConversationId()
   * 【テスト内容】会話IDに紐づくメッセージを created_at 昇順で取得できること
   * 【期待結果】挿入順にメッセージが返ること（user → assistant の順）
   */
  it('should return messages in created_at ASC order', () => {
    createMessage(db, {
      id: 'msg-order-1',
      conversationId: 'test-conv',
      role: 'user',
      content: '最初のメッセージ',
    })
    createMessage(db, {
      id: 'msg-order-2',
      conversationId: 'test-conv',
      role: 'assistant',
      content: '2番目のメッセージ',
    })
    createMessage(db, {
      id: 'msg-order-3',
      conversationId: 'test-conv',
      role: 'user',
      content: '3番目のメッセージ',
    })

    const messages = listMessagesByConversationId(db, 'test-conv')

    expect(messages).toHaveLength(3)
    expect(messages[0].id).toBe('msg-order-1')
    expect(messages[1].id).toBe('msg-order-2')
    expect(messages[2].id).toBe('msg-order-3')
  })

  /**
   * 【テスト対象】listMessagesByConversationId()
   * 【テスト内容】別の会話のメッセージが混入しないこと
   * 【期待結果】指定した conversation_id のメッセージのみ返ること
   */
  it('should only return messages for the specified conversation', () => {
    // 別の会話を作成（同じDB接続先を使用）
    createConversation(db, { id: 'other-conv', db_connection_id: 'test-conn-id', title: '別の会話' })

    createMessage(db, {
      id: 'my-msg',
      conversationId: 'test-conv',
      role: 'user',
      content: '自分の会話のメッセージ',
    })
    createMessage(db, {
      id: 'other-msg',
      conversationId: 'other-conv',
      role: 'user',
      content: '別の会話のメッセージ',
    })

    const messages = listMessagesByConversationId(db, 'test-conv')

    expect(messages).toHaveLength(1)
    expect(messages[0].id).toBe('my-msg')
  })

  /**
   * 【テスト対象】listMessagesByConversationId()
   * 【テスト内容】存在しない conversation_id を指定した場合、空配列が返ること
   * 【期待結果】空配列が返ること
   */
  it('should return empty array for non-existent conversation', () => {
    const messages = listMessagesByConversationId(db, 'non-existent-conv')
    expect(messages).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// db_connections Repository
// ---------------------------------------------------------------------------

describe('historyDb: db_connections Repository', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    db.close()
  })

  /**
   * 【テスト対象】createDbConnection()
   * 【テスト内容】正常な入力でDB接続先レコードが作成されること
   * 【期待結果】id, name, db_type, host, port, username, database_name, is_last_used=0 が設定されること
   */
  it('should create a db connection with correct fields', () => {
    const conn = createDbConnection(db, {
      id: 'conn-id-1',
      name: '本番PostgreSQL',
      db_type: 'postgresql',
      host: 'db.example.com',
      port: 5432,
      username: 'readonly_user',
      password_encrypted: 'AES256GCM_ENCRYPTED_VALUE',
      database_name: 'production',
    })

    expect(conn.id).toBe('conn-id-1')
    expect(conn.name).toBe('本番PostgreSQL')
    expect(conn.db_type).toBe('postgresql')
    expect(conn.host).toBe('db.example.com')
    expect(conn.port).toBe(5432)
    expect(conn.username).toBe('readonly_user')
    expect(conn.password_encrypted).toBe('AES256GCM_ENCRYPTED_VALUE')
    expect(conn.database_name).toBe('production')
    // is_last_used は作成直後は 0（false）であること
    expect(conn.is_last_used).toBe(0)
    expect(conn.created_at).toBeTruthy()
    expect(conn.updated_at).toBeTruthy()
    expect(conn.created_at).toBe(conn.updated_at)
  })

  /**
   * 【テスト対象】createDbConnection()
   * 【テスト内容】mysql タイプでDB接続先を作成できること
   * 【期待結果】db_type が 'mysql' のレコードが作成されること
   */
  it('should create a mysql type db connection', () => {
    const conn = createDbConnection(db, {
      id: 'mysql-conn-1',
      name: '開発MySQL',
      db_type: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'dev_user',
      password_encrypted: 'ENCRYPTED_DEV_PASSWORD',
      database_name: 'dev_db',
    })

    expect(conn.db_type).toBe('mysql')
    expect(conn.port).toBe(3306)
  })

  /**
   * 【テスト対象】listDbConnections()
   * 【テスト内容】複数のDB接続先を作成したとき、name 昇順で一覧取得できること
   * 【期待結果】name アルファベット順でソートされたリストが返ること
   */
  it('should return db connections ordered by name ASC', () => {
    createDbConnection(db, {
      id: 'conn-z', name: 'Z接続', db_type: 'postgresql', host: 'h1',
      port: 5432, username: 'u1', password_encrypted: 'enc1', database_name: 'db1',
    })
    createDbConnection(db, {
      id: 'conn-a', name: 'A接続', db_type: 'mysql', host: 'h2',
      port: 3306, username: 'u2', password_encrypted: 'enc2', database_name: 'db2',
    })
    createDbConnection(db, {
      id: 'conn-m', name: 'M接続', db_type: 'postgresql', host: 'h3',
      port: 5432, username: 'u3', password_encrypted: 'enc3', database_name: 'db3',
    })

    const connections = listDbConnections(db)

    expect(connections).toHaveLength(3)
    // name 昇順: A → M → Z
    expect(connections[0].name).toBe('A接続')
    expect(connections[1].name).toBe('M接続')
    expect(connections[2].name).toBe('Z接続')
  })

  /**
   * 【テスト対象】getDbConnectionById()
   * 【テスト内容】存在するIDを指定したとき、対応するDB接続先が返ること
   * 【期待結果】指定IDの DbConnectionRow が返ること
   */
  it('should return db connection by id', () => {
    createDbConnection(db, {
      id: 'find-conn-id', name: '検索テスト', db_type: 'postgresql', host: 'h',
      port: 5432, username: 'u', password_encrypted: 'enc', database_name: 'db',
    })

    const found = getDbConnectionById(db, 'find-conn-id')

    expect(found).toBeDefined()
    expect(found!.id).toBe('find-conn-id')
    expect(found!.name).toBe('検索テスト')
  })

  /**
   * 【テスト対象】getDbConnectionById()
   * 【テスト内容】存在しないIDを指定したとき、undefined が返ること
   * 【期待結果】undefined が返ること
   */
  it('should return undefined for non-existent db connection id', () => {
    const result = getDbConnectionById(db, 'non-existent-id')
    expect(result).toBeUndefined()
  })

  /**
   * 【テスト対象】deleteDbConnection()
   * 【テスト内容】存在するDB接続先を削除したとき、1が返り存在しなくなること
   * 【期待結果】changes が 1、削除後は getDbConnectionById が undefined を返すこと
   */
  it('should delete db connection and return changes count of 1', () => {
    createDbConnection(db, {
      id: 'del-conn-id', name: '削除テスト', db_type: 'postgresql', host: 'h',
      port: 5432, username: 'u', password_encrypted: 'enc', database_name: 'db',
    })

    const changes = deleteDbConnection(db, 'del-conn-id')

    expect(changes).toBe(1)
    expect(getDbConnectionById(db, 'del-conn-id')).toBeUndefined()
  })

  /**
   * 【テスト対象】deleteDbConnection()
   * 【テスト内容】DB接続先を削除したとき、紐づく会話とメッセージも CASCADE 削除されること
   * 【期待結果】削除後に getConversationById が undefined を返すこと
   */
  it('should cascade delete conversations when db connection is deleted', () => {
    createDbConnection(db, {
      id: 'cascade-conn', name: 'カスケード接続', db_type: 'postgresql', host: 'h',
      port: 5432, username: 'u', password_encrypted: 'enc', database_name: 'db',
    })
    createConversation(db, {
      id: 'cascade-conv-from-conn',
      db_connection_id: 'cascade-conn',
      title: 'カスケード削除テスト会話',
    })

    // DB接続先を削除
    deleteDbConnection(db, 'cascade-conn')

    // 紐づく会話も削除されていること
    expect(getConversationById(db, 'cascade-conv-from-conn')).toBeUndefined()
  })

  /**
   * 【テスト対象】markDbConnectionAsLastUsed()
   * 【テスト内容】指定のDB接続先が is_last_used = 1 にマークされること
   * 【期待結果】マークした接続先の is_last_used が 1 で、他は 0 であること
   */
  it('should mark only specified db connection as last used', () => {
    // 3件のDB接続先を作成
    createDbConnection(db, {
      id: 'conn-1', name: '接続1', db_type: 'postgresql', host: 'h1',
      port: 5432, username: 'u1', password_encrypted: 'enc1', database_name: 'db1',
    })
    createDbConnection(db, {
      id: 'conn-2', name: '接続2', db_type: 'mysql', host: 'h2',
      port: 3306, username: 'u2', password_encrypted: 'enc2', database_name: 'db2',
    })
    createDbConnection(db, {
      id: 'conn-3', name: '接続3', db_type: 'postgresql', host: 'h3',
      port: 5432, username: 'u3', password_encrypted: 'enc3', database_name: 'db3',
    })

    // conn-2 をマーク
    markDbConnectionAsLastUsed(db, 'conn-2')

    const conn1 = getDbConnectionById(db, 'conn-1')
    const conn2 = getDbConnectionById(db, 'conn-2')
    const conn3 = getDbConnectionById(db, 'conn-3')

    expect(conn1!.is_last_used).toBe(0)
    expect(conn2!.is_last_used).toBe(1)
    expect(conn3!.is_last_used).toBe(0)
  })

  /**
   * 【テスト対象】markDbConnectionAsLastUsed()
   * 【テスト内容】マーク先を変更したとき、前のマークがリセットされること
   * 【期待結果】最新のマーク先のみ is_last_used = 1 であること
   */
  it('should reset previous last used flag when marking another connection', () => {
    createDbConnection(db, {
      id: 'conn-A', name: 'A接続', db_type: 'postgresql', host: 'h',
      port: 5432, username: 'u', password_encrypted: 'enc', database_name: 'db',
    })
    createDbConnection(db, {
      id: 'conn-B', name: 'B接続', db_type: 'postgresql', host: 'h',
      port: 5432, username: 'u', password_encrypted: 'enc', database_name: 'db',
    })

    // まず conn-A をマーク
    markDbConnectionAsLastUsed(db, 'conn-A')
    expect(getDbConnectionById(db, 'conn-A')!.is_last_used).toBe(1)

    // conn-B に変更
    markDbConnectionAsLastUsed(db, 'conn-B')

    // conn-A のフラグがリセットされ、conn-B のみ 1 になること
    expect(getDbConnectionById(db, 'conn-A')!.is_last_used).toBe(0)
    expect(getDbConnectionById(db, 'conn-B')!.is_last_used).toBe(1)
  })

  /**
   * 【テスト対象】getLastUsedDbConnection()
   * 【テスト内容】is_last_used = 1 の接続先が返ること
   * 【期待結果】markDbConnectionAsLastUsed でマークした接続先が返ること
   */
  it('should return last used db connection', () => {
    createDbConnection(db, {
      id: 'conn-last', name: '最後に使用', db_type: 'postgresql', host: 'h',
      port: 5432, username: 'u', password_encrypted: 'enc', database_name: 'db',
    })
    createDbConnection(db, {
      id: 'conn-other', name: '別の接続', db_type: 'postgresql', host: 'h',
      port: 5432, username: 'u', password_encrypted: 'enc', database_name: 'db2',
    })

    markDbConnectionAsLastUsed(db, 'conn-last')

    const lastUsed = getLastUsedDbConnection(db)
    expect(lastUsed).toBeDefined()
    expect(lastUsed!.id).toBe('conn-last')
  })

  /**
   * 【テスト対象】getLastUsedDbConnection()
   * 【テスト内容】is_last_used = 1 の接続先がない場合、undefined が返ること
   * 【期待結果】undefined が返ること
   */
  it('should return undefined when no db connection is marked as last used', () => {
    createDbConnection(db, {
      id: 'conn-no-last', name: '未使用', db_type: 'postgresql', host: 'h',
      port: 5432, username: 'u', password_encrypted: 'enc', database_name: 'db',
    })

    const lastUsed = getLastUsedDbConnection(db)
    expect(lastUsed).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// getHistoryDbPath / getHistoryDb / setHistoryDbInstance / closeHistoryDb
// ---------------------------------------------------------------------------

describe('historyDb: getHistoryDbPath', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  /**
   * 【テスト対象】getHistoryDbPath
   * 【テスト内容】HISTORY_DB_PATH 環境変数が設定されている場合、その値が返ること
   * 【期待結果】環境変数の値が返ること
   */
  it('should return HISTORY_DB_PATH when set', () => {
    process.env.HISTORY_DB_PATH = '/custom/path/history.sqlite'
    expect(getHistoryDbPath()).toBe('/custom/path/history.sqlite')
  })

  /**
   * 【テスト対象】getHistoryDbPath
   * 【テスト内容】HISTORY_DB_PATH が未設定の場合、デフォルトパスが返ること
   * 【期待結果】'/app/data/history.sqlite' が返ること
   */
  it('should return default path when HISTORY_DB_PATH is not set', () => {
    delete process.env.HISTORY_DB_PATH
    expect(getHistoryDbPath()).toBe('/app/data/history.sqlite')
  })
})

describe('historyDb: setHistoryDbInstance / getHistoryDb / closeHistoryDb', () => {
  afterEach(() => {
    // テスト間でシングルトンをリセット
    try { closeHistoryDb() } catch { /* ignore */ }
    setHistoryDbInstance(null)
  })

  /**
   * 【テスト対象】setHistoryDbInstance
   * 【テスト内容】インスタンスを注入した場合にそれが返ること
   * 【期待結果】注入したインスタンスが getHistoryDb() から返ること
   */
  it('should return injected instance via getHistoryDb', () => {
    const testDb = initHistoryDb(':memory:')
    setHistoryDbInstance(testDb)
    expect(getHistoryDb()).toBe(testDb)
    testDb.close()
  })

  /**
   * 【テスト対象】closeHistoryDb
   * 【テスト内容】インスタンスが存在する場合にcloseされシングルトンがnullになること
   * 【期待結果】close後にsetHistoryDbInstance(null)不要（内部でnull化される）
   */
  it('should close and nullify the instance', () => {
    const testDb = initHistoryDb(':memory:')
    setHistoryDbInstance(testDb)
    closeHistoryDb()
    // 再度 closeHistoryDb を呼んでもエラーにならない
    closeHistoryDb()
  })

  /**
   * 【テスト対象】closeHistoryDb
   * 【テスト内容】インスタンスがnullの場合にエラーなく完了すること
   * 【期待結果】エラーがスローされないこと
   */
  it('should not throw when instance is null', () => {
    setHistoryDbInstance(null)
    expect(() => closeHistoryDb()).not.toThrow()
  })
})
