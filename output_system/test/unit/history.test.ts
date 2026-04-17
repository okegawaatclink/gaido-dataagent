/**
 * 会話履歴 API ルート（history.ts）のユニットテスト
 *
 * GET /api/history、GET /api/history/:id、DELETE /api/history/:id の動作を検証する。
 * historyDb サービスはモック化して使用する。
 *
 * テスト対象:
 *   - GET /api/history        : 会話一覧の正常取得（camelCase 変換含む）
 *   - GET /api/history/:id    : 会話詳細の正常取得（messages 含む）
 *   - GET /api/history/:id    : 存在しないIDで 404 を返すこと
 *   - DELETE /api/history/:id : 正常削除で 204 を返すこと
 *   - DELETE /api/history/:id : 存在しないIDで 404 を返すこと
 *   - query_result の JSON パース・変換
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

// ---------------------------------------------------------------------------
// モジュールモック（vi.mock は巻き上げされるためimportより前に配置）
// ---------------------------------------------------------------------------

vi.mock('../../backend/src/services/historyDb', () => {
  return {
    getHistoryDb: vi.fn(() => ({})),
    listConversations: vi.fn(),
    getConversationById: vi.fn(),
    deleteConversation: vi.fn(),
    listMessagesByConversationId: vi.fn(),
  }
})

// ---------------------------------------------------------------------------
// モックのインポート
// ---------------------------------------------------------------------------

import {
  listConversations,
  getConversationById,
  deleteConversation,
  listMessagesByConversationId,
} from '../../backend/src/services/historyDb'

// ---------------------------------------------------------------------------
// テスト用フィクスチャ
// ---------------------------------------------------------------------------

/** テスト用会話データ（DB の snake_case 形式） */
const mockConversationRow = {
  id: 'conv-id-1',
  title: '売上データを教えて',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T01:00:00.000Z',
}

/** テスト用ユーザーメッセージ（DB の snake_case 形式） */
const mockUserMessageRow = {
  id: 'msg-id-1',
  conversation_id: 'conv-id-1',
  role: 'user' as const,
  content: '今月の売上を教えて',
  sql: null,
  chart_type: null,
  query_result: null,
  error: null,
  created_at: '2024-01-01T00:00:01.000Z',
}

/** テスト用アシスタントメッセージ（DB の snake_case 形式） */
const mockAssistantMessageRow = {
  id: 'msg-id-2',
  conversation_id: 'conv-id-1',
  role: 'assistant' as const,
  content: '今月の売上データを取得しました。',
  sql: 'SELECT month, SUM(amount) FROM sales GROUP BY month',
  chart_type: 'bar',
  query_result: JSON.stringify({ columns: ['month', 'amount'], rows: [{ month: '2024-01', amount: 100000 }] }),
  error: null,
  created_at: '2024-01-01T00:00:02.000Z',
}

// ---------------------------------------------------------------------------
// Expressアプリのセットアップ
// ---------------------------------------------------------------------------

let app: express.Express

beforeEach(async () => {
  vi.resetAllMocks()
  vi.resetModules()

  // テスト用アプリを毎回新規作成
  const { default: historyRouter } = await import('../../backend/src/routes/history')
  app = express()
  app.use(express.json())
  app.use('/api/history', historyRouter)
})

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

/**
 * 【モジュール】routes/history.ts
 * 会話履歴 API エンドポイントの動作を検証する
 */
describe('GET /api/history', () => {
  /**
   * 【テスト対象】GET /api/history
   * 【テスト内容】会話が存在する場合、camelCase 形式の配列が返ること
   * 【期待結果】
   *   - ステータスコード 200
   *   - レスポンスが配列形式
   *   - id, title, createdAt, updatedAt が含まれること
   */
  it('should return 200 with conversation list in camelCase format', async () => {
    // Arrange
    vi.mocked(listConversations).mockReturnValue([mockConversationRow])

    // Act
    const res = await request(app).get('/api/history')

    // Assert
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body).toHaveLength(1)

    const conv = res.body[0]
    expect(conv.id).toBe('conv-id-1')
    expect(conv.title).toBe('売上データを教えて')
    // createdAt / updatedAt が camelCase になっていること（snake_case ではないこと）
    expect(conv.createdAt).toBe('2024-01-01T00:00:00.000Z')
    expect(conv.updatedAt).toBe('2024-01-01T01:00:00.000Z')
    // created_at / updated_at が含まれていないこと（snake_case の漏洩がないこと）
    expect(conv).not.toHaveProperty('created_at')
    expect(conv).not.toHaveProperty('updated_at')
  })

  /**
   * 【テスト対象】GET /api/history
   * 【テスト内容】会話が存在しない場合、空配列が返ること
   * 【期待結果】ステータスコード 200、空配列
   */
  it('should return 200 with empty array when no conversations exist', async () => {
    // Arrange
    vi.mocked(listConversations).mockReturnValue([])

    // Act
    const res = await request(app).get('/api/history')

    // Assert
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  /**
   * 【テスト対象】GET /api/history
   * 【テスト内容】複数の会話が存在する場合、すべて返ること
   * 【期待結果】ステータスコード 200、件数が一致すること
   */
  it('should return all conversations', async () => {
    // Arrange
    const conv2 = { ...mockConversationRow, id: 'conv-id-2', title: '2番目の質問' }
    vi.mocked(listConversations).mockReturnValue([mockConversationRow, conv2])

    // Act
    const res = await request(app).get('/api/history')

    // Assert
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
  })
})

describe('GET /api/history/:id', () => {
  /**
   * 【テスト対象】GET /api/history/:id
   * 【テスト内容】存在するIDを指定したとき、会話詳細とメッセージが返ること
   * 【期待結果】
   *   - ステータスコード 200
   *   - id, title, createdAt, updatedAt, messages が含まれること
   *   - messages が camelCase 形式であること
   */
  it('should return 200 with conversation detail and messages', async () => {
    // Arrange
    vi.mocked(getConversationById).mockReturnValue(mockConversationRow)
    vi.mocked(listMessagesByConversationId).mockReturnValue([
      mockUserMessageRow,
      mockAssistantMessageRow,
    ])

    // Act
    const res = await request(app).get('/api/history/conv-id-1')

    // Assert
    expect(res.status).toBe(200)
    expect(res.body.id).toBe('conv-id-1')
    expect(res.body.title).toBe('売上データを教えて')
    expect(res.body.createdAt).toBe('2024-01-01T00:00:00.000Z')
    expect(res.body.messages).toHaveLength(2)

    // ユーザーメッセージの検証
    const userMsg = res.body.messages[0]
    expect(userMsg.id).toBe('msg-id-1')
    expect(userMsg.role).toBe('user')
    expect(userMsg.content).toBe('今月の売上を教えて')
    expect(userMsg.sql).toBeNull()
    expect(userMsg.chartType).toBeNull()

    // アシスタントメッセージの検証
    const asstMsg = res.body.messages[1]
    expect(asstMsg.id).toBe('msg-id-2')
    expect(asstMsg.role).toBe('assistant')
    expect(asstMsg.sql).toBe('SELECT month, SUM(amount) FROM sales GROUP BY month')
    expect(asstMsg.chartType).toBe('bar')
    // queryResult が JSON パースされていること
    expect(asstMsg.queryResult).toEqual({ columns: ['month', 'amount'], rows: [{ month: '2024-01', amount: 100000 }] })
  })

  /**
   * 【テスト対象】GET /api/history/:id
   * 【テスト内容】存在しないIDを指定したとき、404が返ること
   * 【期待結果】ステータスコード 404
   */
  it('should return 404 for non-existent conversation id', async () => {
    // Arrange
    vi.mocked(getConversationById).mockReturnValue(undefined)

    // Act
    const res = await request(app).get('/api/history/non-existent-id')

    // Assert
    expect(res.status).toBe(404)
    expect(res.body.error).toBeTruthy()
  })

  /**
   * 【テスト対象】GET /api/history/:id
   * 【テスト内容】メッセージが存在しない会話の場合、空の messages 配列が返ること
   * 【期待結果】ステータスコード 200、messages が空配列
   */
  it('should return empty messages array for conversation with no messages', async () => {
    // Arrange
    vi.mocked(getConversationById).mockReturnValue(mockConversationRow)
    vi.mocked(listMessagesByConversationId).mockReturnValue([])

    // Act
    const res = await request(app).get('/api/history/conv-id-1')

    // Assert
    expect(res.status).toBe(200)
    expect(res.body.messages).toEqual([])
  })

  /**
   * 【テスト対象】GET /api/history/:id - query_result JSON変換
   * 【テスト内容】query_result が壊れた JSON 文字列の場合、null として返ること
   * 【期待結果】queryResult が null（パース失敗時の耐障害性）
   */
  it('should return null queryResult when query_result is invalid JSON', async () => {
    // Arrange
    const brokenMsgRow = {
      ...mockAssistantMessageRow,
      query_result: 'not-valid-json{{{',
    }
    vi.mocked(getConversationById).mockReturnValue(mockConversationRow)
    vi.mocked(listMessagesByConversationId).mockReturnValue([brokenMsgRow])

    // Act
    const res = await request(app).get('/api/history/conv-id-1')

    // Assert
    expect(res.status).toBe(200)
    expect(res.body.messages[0].queryResult).toBeNull()
  })

  /**
   * 【テスト対象】GET /api/history/:id
   * 【テスト内容】messages レスポンスに snake_case フィールドが含まれないこと
   * 【期待結果】chart_type / query_result ではなく chartType / queryResult で返ること
   */
  it('should return messages in camelCase format without snake_case fields', async () => {
    // Arrange
    vi.mocked(getConversationById).mockReturnValue(mockConversationRow)
    vi.mocked(listMessagesByConversationId).mockReturnValue([mockAssistantMessageRow])

    // Act
    const res = await request(app).get('/api/history/conv-id-1')

    // Assert
    expect(res.status).toBe(200)
    const msg = res.body.messages[0]
    // camelCase フィールドが存在すること
    expect(msg).toHaveProperty('chartType')
    expect(msg).toHaveProperty('queryResult')
    expect(msg).toHaveProperty('createdAt')
    // snake_case フィールドが含まれないこと
    expect(msg).not.toHaveProperty('chart_type')
    expect(msg).not.toHaveProperty('query_result')
    expect(msg).not.toHaveProperty('created_at')
    expect(msg).not.toHaveProperty('conversation_id')
  })
})

describe('DELETE /api/history/:id', () => {
  /**
   * 【テスト対象】DELETE /api/history/:id
   * 【テスト内容】存在するIDを削除したとき、204 が返ること
   * 【期待結果】ステータスコード 204、ボディなし
   */
  it('should return 204 when conversation is successfully deleted', async () => {
    // Arrange: 1行削除されたことを示す
    vi.mocked(deleteConversation).mockReturnValue(1)

    // Act
    const res = await request(app).delete('/api/history/conv-id-1')

    // Assert
    expect(res.status).toBe(204)
    expect(res.text).toBe('')
  })

  /**
   * 【テスト対象】DELETE /api/history/:id
   * 【テスト内容】存在しないIDを削除しようとしたとき、404 が返ること
   * 【期待結果】ステータスコード 404
   */
  it('should return 404 when conversation does not exist', async () => {
    // Arrange: 0行削除（対象なし）
    vi.mocked(deleteConversation).mockReturnValue(0)

    // Act
    const res = await request(app).delete('/api/history/non-existent-id')

    // Assert
    expect(res.status).toBe(404)
    expect(res.body.error).toBeTruthy()
  })

  /**
   * 【テスト対象】DELETE /api/history/:id
   * 【テスト内容】削除が正しい ID で呼ばれること
   * 【期待結果】deleteConversation が指定された ID で呼ばれること
   */
  it('should call deleteConversation with the correct id', async () => {
    // Arrange
    vi.mocked(deleteConversation).mockReturnValue(1)

    // Act
    await request(app).delete('/api/history/target-conv-id')

    // Assert
    expect(vi.mocked(deleteConversation)).toHaveBeenCalledWith(
      expect.anything(),
      'target-conv-id'
    )
  })
})
