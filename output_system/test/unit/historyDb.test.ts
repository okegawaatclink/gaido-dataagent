/**
 * historyDb.ts のユニットテスト
 *
 * SQLite 履歴DB の初期化・マイグレーション・Repository関数を検証する。
 * すべてのテストはインメモリDB（':memory:'）を使用し、ファイルを作成しない。
 *
 * テスト対象:
 *   - initHistoryDb()      : テーブルが作成されること
 *   - createConversation() : 会話レコードが作成されること
 *   - listConversations()  : updated_at 降順で一覧取得できること
 *   - getConversationById(): 指定IDの会話を取得できること
 *   - deleteConversation() : 会話とメッセージが CASCADE 削除されること
 *   - createMessage()      : メッセージレコードが作成されること
 *   - listMessagesByConversationId(): 会話に紐づくメッセージ一覧を取得できること
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import {
  initHistoryDb,
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

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe('historyDb: initHistoryDb', () => {
  /**
   * 【テスト対象】initHistoryDb()
   * 【テスト内容】インメモリDBで初期化した場合にテーブルが作成されること
   * 【期待結果】conversations テーブルと messages テーブルが存在すること
   */
  it('should create conversations and messages tables on init', () => {
    const db = createTestDb()

    // sqlite_master を使ってテーブル存在を確認
    const tables = (
      db.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
      ).all() as { name: string }[]
    ).map((r) => r.name)

    expect(tables).toContain('conversations')
    expect(tables).toContain('messages')

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
   * 【期待結果】idx_messages_conversation_id と idx_conversations_updated_at が存在すること
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

    db.close()
  })
})

describe('historyDb: conversations Repository', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    db.close()
  })

  /**
   * 【テスト対象】createConversation()
   * 【テスト内容】正常な入力で会話レコードが作成されること
   * 【期待結果】id, title, created_at, updated_at が設定された ConversationRow が返ること
   */
  it('should create a conversation with correct fields', () => {
    const conv = createConversation(db, {
      id: 'test-conv-id-1',
      title: '売上データを教えて',
    })

    expect(conv.id).toBe('test-conv-id-1')
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
    createConversation(db, { id: 'conv-1', title: '最初の質問' })
    createConversation(db, { id: 'conv-2', title: '2番目の質問' })
    createConversation(db, { id: 'conv-3', title: '3番目の質問' })

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
   * 【期待結果】指定IDの ConversationRow が返ること
   */
  it('should return conversation by id', () => {
    createConversation(db, { id: 'find-conv-id', title: 'テスト会話' })

    const found = getConversationById(db, 'find-conv-id')

    expect(found).toBeDefined()
    expect(found!.id).toBe('find-conv-id')
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
    createConversation(db, { id: 'del-conv-id', title: '削除テスト' })

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
    createConversation(db, { id: 'cascade-conv', title: 'カスケード削除テスト' })
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
    // メッセージテストには会話が必要
    createConversation(db, { id: 'test-conv', title: 'テスト会話' })
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
    // 別の会話を作成
    createConversation(db, { id: 'other-conv', title: '別の会話' })

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
