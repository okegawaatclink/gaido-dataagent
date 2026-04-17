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
 *   - GET /api/history/:id    : 非UUID形式のIDで 400 を返すこと（H1/L1対応）
 *   - DELETE /api/history/:id : 正常削除で 204 を返すこと
 *   - DELETE /api/history/:id : 存在しないIDで 404 を返すこと
 *   - DELETE /api/history/:id : 非UUID形式のIDで 400 を返すこと（H1対応）
 *   - query_result の JSON パース・変換
 *   - レートリミット（M1対応）
 *   - 構造化ログ（M2対応）
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

/** テスト用会話UUID（UUID v4形式） */
const TEST_CONV_UUID = '550e8400-e29b-41d4-a716-446655440000'
const TEST_MSG_UUID_1 = '550e8400-e29b-41d4-a716-446655440001'
const TEST_MSG_UUID_2 = '550e8400-e29b-41d4-a716-446655440002'

/** テスト用会話データ（DB の snake_case 形式） */
const mockConversationRow = {
  id: TEST_CONV_UUID,
  title: '売上データを教えて',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T01:00:00.000Z',
}

/** テスト用ユーザーメッセージ（DB の snake_case 形式） */
const mockUserMessageRow = {
  id: TEST_MSG_UUID_1,
  conversation_id: TEST_CONV_UUID,
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
  id: TEST_MSG_UUID_2,
  conversation_id: TEST_CONV_UUID,
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
    expect(conv.id).toBe(TEST_CONV_UUID)
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
    const conv2 = { ...mockConversationRow, id: '550e8400-e29b-41d4-a716-446655440010', title: '2番目の質問' }
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
    const res = await request(app).get(`/api/history/${TEST_CONV_UUID}`)

    // Assert
    expect(res.status).toBe(200)
    expect(res.body.id).toBe(TEST_CONV_UUID)
    expect(res.body.title).toBe('売上データを教えて')
    expect(res.body.createdAt).toBe('2024-01-01T00:00:00.000Z')
    expect(res.body.messages).toHaveLength(2)

    // ユーザーメッセージの検証
    const userMsg = res.body.messages[0]
    expect(userMsg.id).toBe(TEST_MSG_UUID_1)
    expect(userMsg.role).toBe('user')
    expect(userMsg.content).toBe('今月の売上を教えて')
    expect(userMsg.sql).toBeNull()
    expect(userMsg.chartType).toBeNull()

    // アシスタントメッセージの検証
    const asstMsg = res.body.messages[1]
    expect(asstMsg.id).toBe(TEST_MSG_UUID_2)
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

    // Act: 存在しない（がUUID v4形式の）IDを使用
    const res = await request(app).get('/api/history/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')

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
    const res = await request(app).get(`/api/history/${TEST_CONV_UUID}`)

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
    const res = await request(app).get(`/api/history/${TEST_CONV_UUID}`)

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
    const res = await request(app).get(`/api/history/${TEST_CONV_UUID}`)

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
    const res = await request(app).delete('/api/history/550e8400-e29b-41d4-a716-446655440000')

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
    const res = await request(app).delete('/api/history/550e8400-e29b-41d4-a716-446655440001')

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
    await request(app).delete('/api/history/550e8400-e29b-41d4-a716-446655440002')

    // Assert
    expect(vi.mocked(deleteConversation)).toHaveBeenCalledWith(
      expect.anything(),
      '550e8400-e29b-41d4-a716-446655440002'
    )
  })

  /**
   * 【テスト対象】DELETE /api/history/:id - セキュリティ（H1対応）
   * 【テスト内容】非UUID形式のIDでDELETEリクエストを送信したとき
   * 【期待結果】ステータスコード 400 が返ること（DBに到達しないこと）
   */
  it('should return 400 for non-UUID id', async () => {
    // Act
    const res = await request(app).delete('/api/history/not-a-uuid')

    // Assert
    expect(res.status).toBe(400)
    expect(res.body.error).toBeTruthy()
    // deleteConversation が呼ばれていないこと（DBへのアクセスなし）
    expect(vi.mocked(deleteConversation)).not.toHaveBeenCalled()
  })

  /**
   * 【テスト対象】DELETE /api/history/:id - セキュリティ（H1対応）
   * 【テスト内容】SQLインジェクション試みのようなIDでDELETEリクエストを送信したとき
   * 【期待結果】ステータスコード 400 が返ること
   */
  it('should return 400 for SQL injection attempt as id', async () => {
    // Act
    const res = await request(app).delete('/api/history/1%27%20OR%20%271%27%3D%271')

    // Assert
    expect(res.status).toBe(400)
    expect(vi.mocked(deleteConversation)).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// セキュリティ: UUID バリデーション（H1対応）
// ---------------------------------------------------------------------------

describe('GET /api/history/:id - UUID validation (H1)', () => {
  /**
   * 【テスト対象】GET /api/history/:id - セキュリティ（H1対応）
   * 【テスト内容】非UUID形式のIDでGETリクエストを送信したとき
   * 【期待結果】ステータスコード 400 が返ること（DBに到達しないこと）
   */
  it('should return 400 for non-UUID id', async () => {
    // Act
    const res = await request(app).get('/api/history/not-a-uuid')

    // Assert
    expect(res.status).toBe(400)
    expect(res.body.error).toBeTruthy()
    // getConversationById が呼ばれていないこと（DBへのアクセスなし）
    expect(vi.mocked(getConversationById)).not.toHaveBeenCalled()
  })

  /**
   * 【テスト対象】GET /api/history/:id - セキュリティ（H1対応）
   * 【テスト内容】空文字IDでGETリクエストを送信したとき
   * 【期待結果】ステータスコード 400 が返ること
   */
  it('should return 400 for empty-like invalid id', async () => {
    // Act
    const res = await request(app).get('/api/history/invalid-format-id')

    // Assert
    expect(res.status).toBe(400)
    expect(vi.mocked(getConversationById)).not.toHaveBeenCalled()
  })

  /**
   * 【テスト対象】GET /api/history/:id - セキュリティ（H1対応）
   * 【テスト内容】ログインジェクション文字列を含むIDでGETリクエストを送信したとき
   * 【期待結果】ステータスコード 400 が返ること（DBアクセスなし）
   */
  it('should return 400 for log-injection-like id', async () => {
    // Act: 改行文字を含む文字列（ログインジェクション試み）
    const res = await request(app).get('/api/history/bad%0Aid%0A')

    // Assert
    expect(res.status).toBe(400)
    expect(vi.mocked(getConversationById)).not.toHaveBeenCalled()
  })

  /**
   * 【テスト対象】GET /api/history/:id - 正常系（UUID v4形式）
   * 【テスト内容】有効なUUID v4形式のIDでGETリクエストを送信したとき
   * 【期待結果】バリデーションを通過してDB検索が行われること
   */
  it('should pass validation for valid UUID v4 and proceed to DB lookup', async () => {
    // Arrange
    vi.mocked(getConversationById).mockReturnValue(mockConversationRow)
    vi.mocked(listMessagesByConversationId).mockReturnValue([])

    // Act
    const res = await request(app).get('/api/history/550e8400-e29b-41d4-a716-446655440000')

    // Assert
    expect(res.status).toBe(200)
    expect(vi.mocked(getConversationById)).toHaveBeenCalledWith(
      expect.anything(),
      '550e8400-e29b-41d4-a716-446655440000'
    )
  })
})

// ---------------------------------------------------------------------------
// セキュリティ: レートリミット（M1対応）
// ---------------------------------------------------------------------------

describe('Rate limiting (M1)', () => {
  /**
   * 【テスト対象】GET /api/history - レートリミット
   * 【テスト内容】HISTORY_RATE_LIMIT_MAX を超えるリクエストを送信したとき
   * 【期待結果】429 Too Many Requests が返ること
   *
   * 【前提条件】
   * vitest.config.ts の env で HISTORY_RATE_LIMIT_MAX=100000 が設定されているため、
   * 通常テストではリミットに達しない。このテストでは低い値を設定してテストする。
   */
  it('should return 429 when rate limit is exceeded', async () => {
    vi.resetModules()

    // 最大1リクエスト/分に設定したアプリを作成
    process.env['HISTORY_RATE_LIMIT_MAX'] = '1'
    process.env['HISTORY_RATE_LIMIT_WINDOW'] = '60'

    const { default: historyRouter } = await import('../../backend/src/routes/history')
    const limitedApp = express()
    limitedApp.use(express.json())
    limitedApp.use('/api/history', historyRouter)

    vi.mocked(listConversations).mockReturnValue([])

    // Act: 2回リクエスト（2回目は制限を超える）
    await request(limitedApp).get('/api/history')
    const secondRes = await request(limitedApp).get('/api/history')

    // Assert: 2回目は 429
    expect(secondRes.status).toBe(429)

    // 後片付け
    process.env['HISTORY_RATE_LIMIT_MAX'] = '100000'
    process.env['HISTORY_RATE_LIMIT_WINDOW'] = '1'
  })
})
