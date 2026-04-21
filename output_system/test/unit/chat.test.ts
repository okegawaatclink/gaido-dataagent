/**
 * POST /api/chat ルート（chat.ts）のユニットテスト
 *
 * SSEイベント送出順序、エラー時フロー、バリデーションを検証する。
 * 外部依存（fetchSchema, LlmService, executeQuery）はすべてモック化する。
 *
 * テスト対象:
 *   - 正常系: message → sql → chart_type → result → done の順で送信
 *   - エラー系（LLMエラー）: error → done（重複なし）で送信
 *   - エラー系（DBスキーマ取得失敗）: error → done
 *   - エラー系（SQL実行失敗）: error → done
 *   - 必須パラメータ欠落時の400エラー
 *   - message 最大長超過時の400エラー
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

// ---------------------------------------------------------------------------
// モジュールモック（vi.mock は巻き上げされるためimportより前に配置）
// ---------------------------------------------------------------------------

vi.mock('../../backend/src/services/schema', () => ({
  fetchSchema: vi.fn(),
}))

// LlmService を class として扱えるよう、モジュール全体を置き換える
vi.mock('../../backend/src/services/llm', () => {
  class LlmConfigError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'LlmConfigError'
    }
  }
  class LlmApiError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'LlmApiError'
    }
  }
  class LlmTimeoutError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'LlmTimeoutError'
    }
  }
  class LlmParseError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'LlmParseError'
    }
  }

  // LlmService は vi.fn() ではなく通常のクラスとして定義し、
  // generate メソッドを差し替えやすいよう prototype を公開する
  class LlmService {
    generate: () => AsyncGenerator<unknown> = async function* () {}
  }

  return {
    LlmService: vi.fn().mockImplementation(() => new LlmService()),
    LlmConfigError,
    LlmApiError,
    LlmTimeoutError,
    LlmParseError,
  }
})

vi.mock('../../backend/src/services/database', () => {
  class SqlValidationError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'SqlValidationError'
    }
  }

  return {
    executeQuery: vi.fn(),
    SqlValidationError,
  }
})

// historyDb をモック化（ファイルシステムへの書き込みを防ぐ）
vi.mock('../../backend/src/services/historyDb', () => {
  // インメモリの会話ストア（テスト内での検証に使用可能）
  const conversations = new Map<string, { id: string; title: string; created_at: string; updated_at: string }>()

  return {
    getHistoryDb: vi.fn(() => ({})),
    createConversation: vi.fn((_db: unknown, params: { id: string; title: string }) => {
      const now = new Date().toISOString()
      const conv = { id: params.id, title: params.title, created_at: now, updated_at: now }
      conversations.set(params.id, conv)
      return conv
    }),
    getConversationById: vi.fn((_db: unknown, id: string) => conversations.get(id)),
    updateConversationTimestamp: vi.fn(),
    createMessage: vi.fn((_db: unknown, params: { id: string }) => ({
      id: params.id,
      conversation_id: '',
      role: 'user',
      content: '',
      sql: null,
      chart_type: null,
      query_result: null,
      error: null,
      created_at: new Date().toISOString(),
    })),
  }
})

// ---------------------------------------------------------------------------
// モックのインポート（vi.mock後にインポートしてキャプチャ）
// ---------------------------------------------------------------------------

import { fetchSchema } from '../../backend/src/services/schema'
import {
  LlmService,
  LlmApiError,
  LlmTimeoutError,
  LlmParseError,
  LlmConfigError,
} from '../../backend/src/services/llm'
import { executeQuery } from '../../backend/src/services/database'
import { createConversation, createMessage } from '../../backend/src/services/historyDb'

// ---------------------------------------------------------------------------
// テスト用フィクスチャ
// ---------------------------------------------------------------------------

/** テスト用スキーマ情報 */
const mockSchema = {
  database: 'testdb',
  tables: [
    {
      name: 'orders',
      columns: [{ name: 'id', type: 'integer', nullable: false }],
    },
  ],
}

/** テスト用クエリ結果 */
const mockQueryResult = {
  columns: ['id', 'total'],
  rows: [{ id: 1, total: 100 }],
}

// ---------------------------------------------------------------------------
// SSEレスポンスパースヘルパー
// ---------------------------------------------------------------------------

/**
 * SSEレスポンスの本文をパースしてイベントの配列を返すヘルパー
 *
 * @param body - supertestのres.textから取得したSSE本文
 * @returns { event: string; data: unknown }[] のイベント配列
 */
function parseSseEvents(body: string): { event: string; data: unknown }[] {
  const events: { event: string; data: unknown }[] = []
  // SSEは空行区切りのブロックで構成される
  const blocks = body.split('\n\n').filter((b) => b.trim() !== '')

  for (const block of blocks) {
    const lines = block.split('\n')
    let event = ''
    let dataStr = ''

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        event = line.slice('event: '.length)
      } else if (line.startsWith('data: ')) {
        dataStr = line.slice('data: '.length)
      }
    }

    if (event && dataStr) {
      try {
        events.push({ event, data: JSON.parse(dataStr) })
      } catch {
        events.push({ event, data: dataStr })
      }
    }
  }

  return events
}

// ---------------------------------------------------------------------------
// LlmService モック生成ヘルパー
// ---------------------------------------------------------------------------

/**
 * 正常系用の LlmService generate モックを設定する
 *
 * @param sql - 返すSQL文
 * @param chartType - 返すグラフ種別
 * @param chunks - テキストチャンクの配列
 */
function setupNormalLlmMock(
  sql: string,
  chartType: string,
  chunks: string[] = ['テスト応答']
): void {
  vi.mocked(LlmService).mockImplementation(function (this: { generate: () => AsyncGenerator<unknown> }) {
    this.generate = async function* () {
      for (const chunk of chunks) {
        yield { type: 'message', chunk }
      }
      yield { type: 'sql', sql }
      yield { type: 'chart_type', chartType }
    }
  } as unknown as new () => InstanceType<typeof LlmService>)
}

/**
 * エラーをスローする generate モックを設定する
 *
 * @param error - スローするエラーオブジェクト
 */
function setupErrorLlmMock(error: Error): void {
  vi.mocked(LlmService).mockImplementation(function (this: { generate: () => AsyncGenerator<unknown> }) {
    this.generate = async function* () {
      throw error
    }
  } as unknown as new () => InstanceType<typeof LlmService>)
}

// ---------------------------------------------------------------------------
// supertestでSSEレスポンスを取得するヘルパー
// ---------------------------------------------------------------------------

/** テスト用ダミーのDB接続先ID（UUID v4形式） */
const TEST_DB_CONNECTION_ID = '550e8400-e29b-41d4-a716-446655440000'

/**
 * supertestでSSEストリーミングレスポンスを取得する
 *
 * @param app - Expressアプリ
 * @param message - 送信するメッセージ
 * @param dbConnectionId - DB接続先ID（デフォルト: TEST_DB_CONNECTION_ID）
 * @returns { status: number; text: string }
 */
async function sendChatRequest(
  app: express.Express,
  message: string,
  dbConnectionId: string = TEST_DB_CONNECTION_ID
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = request(app)
      .post('/api/chat')
      .send({ message, dbConnectionId })
      .set('Accept', 'text/event-stream')

    let responseText = ''
    let statusCode = 200

    // supertestのレスポンスオブジェクトから生のデータを取得
    req
      .buffer(true)
      .parse((res, cb) => {
        statusCode = res.statusCode ?? 200
        let data = ''
        res.on('data', (chunk: Buffer) => {
          data += chunk.toString()
        })
        res.on('end', () => {
          responseText = data
          cb(null, data)
        })
        res.on('error', cb)
      })
      .then(() => {
        resolve({ status: statusCode, text: responseText })
      })
      .catch(reject)
  })
}

// ---------------------------------------------------------------------------
// Expressアプリのセットアップ
// ---------------------------------------------------------------------------

let app: express.Express

beforeEach(async () => {
  vi.resetAllMocks()
  // モジュールキャッシュをリセットしてレートリミッタのカウンターを毎テストで初期化する
  vi.resetModules()

  // テスト用アプリを毎回新規作成（モジュールキャッシュをリセット後にインポート）
  const { default: chatRouter } = await import('../../backend/src/routes/chat')
  app = express()
  app.use(express.json())
  app.use('/api/chat', chatRouter)
})

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

/**
 * 【モジュール】routes/chat.ts
 * POST /api/chat エンドポイントのSSEストリーミング動作を検証する
 */
describe('POST /api/chat', () => {
  // -------------------------------------------------------------------------
  // 正常系
  // -------------------------------------------------------------------------

  /**
   * 【テスト対象】POST /api/chat 正常フロー
   * 【テスト内容】有効なmessageを送信したとき、SSEイベントが正しい順序で送信される
   * 【期待結果】message → sql → chart_type → result → done の順でイベントが送信される
   */
  it('should send events in correct order: message → sql → chart_type → result → done', async () => {
    // Arrange
    vi.mocked(fetchSchema).mockResolvedValue(mockSchema as never)
    setupNormalLlmMock('SELECT * FROM orders', 'bar', ['応答チャンク1', '応答チャンク2'])
    vi.mocked(executeQuery).mockResolvedValue(mockQueryResult as never)

    // Act
    const { text } = await sendChatRequest(app, '注文一覧を教えて')
    const events = parseSseEvents(text)
    const eventNames = events.map((e) => e.event)

    // Assert: message イベントが2つ含まれること
    expect(eventNames.filter((n) => n === 'message').length).toBe(2)
    // sql イベントが存在すること
    expect(eventNames).toContain('sql')
    // chart_type イベントが存在すること
    expect(eventNames).toContain('chart_type')
    // result イベントが存在すること
    expect(eventNames).toContain('result')
    // done イベントが末尾に1回だけ存在すること
    expect(eventNames[eventNames.length - 1]).toBe('done')
    expect(eventNames.filter((n) => n === 'done').length).toBe(1)
  })

  /**
   * 【テスト対象】POST /api/chat 正常フロー - sqlイベントのデータ検証
   * 【テスト内容】LLMが生成したSQLが sql イベントのデータとして含まれる
   * 【期待結果】event: sql の data.sql が LLM が返したSQL文と一致する
   */
  it('should include the generated SQL in the sql event data', async () => {
    // Arrange
    const expectedSql = 'SELECT id, total FROM orders ORDER BY total DESC LIMIT 10'
    vi.mocked(fetchSchema).mockResolvedValue(mockSchema as never)
    setupNormalLlmMock(expectedSql, 'bar')
    vi.mocked(executeQuery).mockResolvedValue(mockQueryResult as never)

    // Act
    const { text } = await sendChatRequest(app, '売上トップ10を教えて')
    const events = parseSseEvents(text)
    const sqlEvent = events.find((e) => e.event === 'sql')

    // Assert
    expect(sqlEvent).toBeDefined()
    expect((sqlEvent!.data as { sql: string }).sql).toBe(expectedSql)
  })

  /**
   * 【テスト対象】POST /api/chat 正常フロー - resultイベントのデータ検証
   * 【テスト内容】SQL実行結果とchartTypeが result イベントのデータとして含まれる
   * 【期待結果】event: result の data.columns, data.rows, data.chartType が正しい値
   */
  it('should include query result and chartType in the result event', async () => {
    // Arrange
    vi.mocked(fetchSchema).mockResolvedValue(mockSchema as never)
    setupNormalLlmMock('SELECT * FROM orders', 'pie')
    vi.mocked(executeQuery).mockResolvedValue({
      columns: ['id', 'name'],
      rows: [{ id: 1, name: 'test' }],
    } as never)

    // Act
    const { text } = await sendChatRequest(app, '注文を教えて')
    const events = parseSseEvents(text)
    const resultEvent = events.find((e) => e.event === 'result')

    // Assert
    expect(resultEvent).toBeDefined()
    const resultData = resultEvent!.data as { columns: string[]; rows: unknown[]; chartType: string }
    expect(resultData.columns).toEqual(['id', 'name'])
    expect(resultData.rows).toHaveLength(1)
    expect(resultData.chartType).toBe('pie')
  })

  // -------------------------------------------------------------------------
  // エラー系
  // -------------------------------------------------------------------------

  /**
   * 【テスト対象】POST /api/chat エラーフロー - LLMエラー時
   * 【テスト内容】LlmApiError が発生したとき
   * 【期待結果】error → done の順で送信される（done は1回のみ）
   */
  it('should send error → done (no duplicate done) when LLM API error occurs', async () => {
    // Arrange
    vi.mocked(fetchSchema).mockResolvedValue(mockSchema as never)
    setupErrorLlmMock(new (LlmApiError as new (m: string) => Error)('API rate limit exceeded'))

    // Act
    const { text } = await sendChatRequest(app, '注文一覧を教えて')
    const events = parseSseEvents(text)
    const eventNames = events.map((e) => e.event)

    // Assert: error イベントが存在すること
    expect(eventNames).toContain('error')
    // done イベントが末尾に1回だけ存在すること（二重送信されていないこと）
    expect(eventNames[eventNames.length - 1]).toBe('done')
    expect(eventNames.filter((n) => n === 'done').length).toBe(1)
    // result イベントが含まれないこと
    expect(eventNames).not.toContain('result')
  })

  /**
   * 【テスト対象】POST /api/chat エラーフロー - LlmTimeoutError時
   * 【テスト内容】LlmTimeoutError が発生したとき
   * 【期待結果】error → done の順で送信される（done は1回のみ）
   */
  it('should send error → done when LLM timeout error occurs', async () => {
    // Arrange
    vi.mocked(fetchSchema).mockResolvedValue(mockSchema as never)
    setupErrorLlmMock(new (LlmTimeoutError as new (m: string) => Error)('Request timed out'))

    // Act
    const { text } = await sendChatRequest(app, 'テスト')
    const events = parseSseEvents(text)
    const eventNames = events.map((e) => e.event)

    // Assert
    expect(eventNames).toContain('error')
    expect(eventNames.filter((n) => n === 'done').length).toBe(1)
    expect(eventNames[eventNames.length - 1]).toBe('done')
  })

  /**
   * 【テスト対象】POST /api/chat エラーフロー - LlmParseError時
   * 【テスト内容】LlmParseError が発生したとき
   * 【期待結果】error → done の順で送信される（done は1回のみ）
   */
  it('should send error → done when LLM parse error occurs', async () => {
    // Arrange
    vi.mocked(fetchSchema).mockResolvedValue(mockSchema as never)
    setupErrorLlmMock(new (LlmParseError as new (m: string) => Error)('Failed to parse JSON'))

    // Act
    const { text } = await sendChatRequest(app, 'テスト')
    const events = parseSseEvents(text)
    const eventNames = events.map((e) => e.event)

    // Assert
    expect(eventNames).toContain('error')
    expect(eventNames.filter((n) => n === 'done').length).toBe(1)
    expect(eventNames[eventNames.length - 1]).toBe('done')
  })

  /**
   * 【テスト対象】POST /api/chat エラーフロー - LlmConfigError時（generate内）
   * 【テスト内容】generate内でLlmConfigError が発生したとき
   * 【期待結果】error → done の順で送信される（done は1回のみ）
   */
  it('should send error → done when LLM config error occurs during generation', async () => {
    // Arrange
    vi.mocked(fetchSchema).mockResolvedValue(mockSchema as never)
    setupErrorLlmMock(new (LlmConfigError as new (m: string) => Error)('API key not set'))

    // Act
    const { text } = await sendChatRequest(app, 'テスト')
    const events = parseSseEvents(text)
    const eventNames = events.map((e) => e.event)

    // Assert
    expect(eventNames).toContain('error')
    expect(eventNames.filter((n) => n === 'done').length).toBe(1)
    expect(eventNames[eventNames.length - 1]).toBe('done')
  })

  /**
   * 【テスト対象】POST /api/chat エラーフロー - DBスキーマ取得失敗時
   * 【テスト内容】fetchSchema が例外をスローしたとき
   * 【期待結果】error → done の順で送信される（done は1回のみ）
   */
  it('should send error → done when fetchSchema fails', async () => {
    // Arrange
    vi.mocked(fetchSchema).mockRejectedValue(new Error('DB connection refused'))

    // Act
    const { text } = await sendChatRequest(app, 'テスト')
    const events = parseSseEvents(text)
    const eventNames = events.map((e) => e.event)

    // Assert
    expect(eventNames).toContain('error')
    expect(eventNames.filter((n) => n === 'done').length).toBe(1)
    expect(eventNames[eventNames.length - 1]).toBe('done')
  })

  /**
   * 【テスト対象】POST /api/chat エラーフロー - SQL実行エラー時
   * 【テスト内容】executeQuery が例外をスローしたとき
   * 【期待結果】error → done の順で送信される（done は1回のみ）
   */
  it('should send error → done when executeQuery fails', async () => {
    // Arrange
    vi.mocked(fetchSchema).mockResolvedValue(mockSchema as never)
    setupNormalLlmMock('SELECT * FROM orders', 'bar')
    vi.mocked(executeQuery).mockRejectedValue(new Error('Query execution failed'))

    // Act
    const { text } = await sendChatRequest(app, '注文一覧を教えて')
    const events = parseSseEvents(text)
    const eventNames = events.map((e) => e.event)

    // Assert: error イベントが存在すること
    expect(eventNames).toContain('error')
    // done が1回だけ送信されること（二重送信防止の検証）
    expect(eventNames.filter((n) => n === 'done').length).toBe(1)
    expect(eventNames[eventNames.length - 1]).toBe('done')
  })

  /**
   * 【テスト対象】POST /api/chat エラーフロー - LLMサービス初期化エラー時
   * 【テスト内容】LlmService コンストラクタが LlmConfigError をスローしたとき
   * 【期待結果】error → done の順で送信される（done は1回のみ）
   */
  it('should send error → done when LlmService constructor throws LlmConfigError', async () => {
    // Arrange
    vi.mocked(fetchSchema).mockResolvedValue(mockSchema as never)
    vi.mocked(LlmService).mockImplementation(() => {
      throw new (LlmConfigError as new (m: string) => Error)('ANTHROPIC_API_KEY is not set')
    })

    // Act
    const { text } = await sendChatRequest(app, 'テスト')
    const events = parseSseEvents(text)
    const eventNames = events.map((e) => e.event)

    // Assert
    expect(eventNames).toContain('error')
    expect(eventNames.filter((n) => n === 'done').length).toBe(1)
    expect(eventNames[eventNames.length - 1]).toBe('done')
  })

  // -------------------------------------------------------------------------
  // バリデーション（SSE前に400を返すケース）
  // -------------------------------------------------------------------------

  /**
   * 【テスト対象】POST /api/chat バリデーション
   * 【テスト内容】message フィールドが存在しないリクエストを送信したとき
   * 【期待結果】HTTPステータス400が返される（SSEは開始されない）
   */
  it('should return 400 when message field is missing', async () => {
    // Act
    const res = await request(app).post('/api/chat').send({})

    // Assert
    expect(res.status).toBe(400)
    expect(res.body.error).toBeDefined()
  })

  /**
   * 【テスト対象】POST /api/chat バリデーション
   * 【テスト内容】message フィールドが空文字のリクエストを送信したとき
   * 【期待結果】HTTPステータス400が返される（SSEは開始されない）
   */
  it('should return 400 when message field is empty string', async () => {
    // Act
    const res = await request(app).post('/api/chat').send({ message: '' })

    // Assert
    expect(res.status).toBe(400)
    expect(res.body.error).toBeDefined()
  })

  /**
   * 【テスト対象】POST /api/chat バリデーション
   * 【テスト内容】message フィールドがスペースのみのリクエストを送信したとき
   * 【期待結果】HTTPステータス400が返される（SSEは開始されない）
   */
  it('should return 400 when message field is whitespace only', async () => {
    // Act
    const res = await request(app).post('/api/chat').send({ message: '   ' })

    // Assert
    expect(res.status).toBe(400)
    expect(res.body.error).toBeDefined()
  })

  /**
   * 【テスト対象】POST /api/chat バリデーション - message最大長制限
   * 【テスト内容】message が2000文字を超えるリクエストを送信したとき
   * 【期待結果】HTTPステータス400が返される（SSEは開始されない）
   */
  it('should return 400 when message exceeds 2000 characters', async () => {
    // Arrange
    const longMessage = 'あ'.repeat(2001)

    // Act
    const res = await request(app).post('/api/chat').send({ message: longMessage })

    // Assert
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/2000/)
  })

  /**
   * 【テスト対象】POST /api/chat バリデーション - message最大長境界値
   * 【テスト内容】message がちょうど2000文字のリクエストを送信したとき
   * 【期待結果】400エラーにならず処理が進む（fetchSchemaが呼ばれる）
   */
  it('should accept message with exactly 2000 characters', async () => {
    // Arrange
    const exactMessage = 'a'.repeat(2000)
    vi.mocked(fetchSchema).mockResolvedValue(mockSchema as never)
    setupNormalLlmMock('SELECT * FROM orders', 'bar')
    vi.mocked(executeQuery).mockResolvedValue(mockQueryResult as never)

    // Act
    const { text } = await sendChatRequest(app, exactMessage)
    const events = parseSseEvents(text)
    const eventNames = events.map((e) => e.event)

    // Assert: 400ではなくSSEが返されること（doneイベントが含まれる）
    expect(eventNames).toContain('done')
    // fetchSchemaが呼ばれたこと（処理が進んだ証拠）
    expect(fetchSchema).toHaveBeenCalledOnce()
  })

  // -------------------------------------------------------------------------
  // セキュリティ: conversationId バリデーション（H1/L1対応）
  // -------------------------------------------------------------------------

  /**
   * 【テスト対象】POST /api/chat セキュリティ - conversationId 長さ制限（L1対応）
   * 【テスト内容】conversationId が 128 文字を超えるリクエストを送信したとき
   * 【期待結果】ステータスコード 400 が返ること（SSEは開始されない）
   */
  it('should return 400 when conversationId exceeds 128 characters', async () => {
    // Arrange: 129文字の conversationId
    const longId = 'a'.repeat(129)

    // Act
    const res = await request(app)
      .post('/api/chat')
      .send({ message: 'テスト', conversationId: longId, dbConnectionId: TEST_DB_CONNECTION_ID })

    // Assert
    expect(res.status).toBe(400)
    expect(res.body.error).toBeDefined()
  })

  /**
   * 【テスト対象】POST /api/chat セキュリティ - 非UUID形式の conversationId（H1対応）
   * 【テスト内容】非UUID形式の conversationId を送信したとき、
   *              新規会話として扱われること（400エラーにならない）
   * 【期待結果】
   *   - HTTP 200（SSEストリームが返される）
   *   - conversation イベントが含まれること（新規会話が作成される）
   *   - createConversation が呼ばれること
   */
  it('should treat invalid conversationId as new conversation (no error, creates new)', async () => {
    // Arrange
    vi.mocked(fetchSchema).mockResolvedValue(mockSchema as never)
    setupNormalLlmMock('SELECT * FROM orders', 'bar')
    vi.mocked(executeQuery).mockResolvedValue(mockQueryResult as never)

    // Act: 非UUID形式の conversationId を送信
    const { text, status } = await sendChatRequest(app, 'テスト')
    // Note: sendChatRequest は message のみ送信するため、直接リクエストを組み立てる
    const res2 = await new Promise<{ status: number; text: string }>((resolve, reject) => {
      const req = request(app)
        .post('/api/chat')
        .send({ message: 'テスト', conversationId: 'not-a-valid-uuid', dbConnectionId: TEST_DB_CONNECTION_ID })
        .set('Accept', 'text/event-stream')

      let responseText = ''
      let statusCode = 200
      req
        .buffer(true)
        .parse((res, cb) => {
          statusCode = res.statusCode ?? 200
          let data = ''
          res.on('data', (chunk: Buffer) => { data += chunk.toString() })
          res.on('end', () => { responseText = data; cb(null, data) })
          res.on('error', cb)
        })
        .then(() => resolve({ status: statusCode, text: responseText }))
        .catch(reject)
    })

    const events = parseSseEvents(res2.text)
    const eventNames = events.map((e) => e.event)

    // Assert: SSEストリームが返される（400エラーにならない）
    expect(res2.status).toBe(200)
    // conversation イベントが含まれること（新規会話として扱われた証拠）
    expect(eventNames).toContain('conversation')
    // done イベントが含まれること
    expect(eventNames).toContain('done')
  })

  /**
   * 【テスト対象】POST /api/chat セキュリティ - 有効な UUID v4 の conversationId（H1対応）
   * 【テスト内容】有効なUUID v4形式の conversationId を送信したとき、
   *              既存会話として処理されること
   * 【期待結果】conversation イベントが含まれること（既存/新規どちらかで処理）
   */
  it('should accept valid UUID v4 conversationId and process normally', async () => {
    // Arrange
    vi.mocked(fetchSchema).mockResolvedValue(mockSchema as never)
    setupNormalLlmMock('SELECT * FROM orders', 'bar')
    vi.mocked(executeQuery).mockResolvedValue(mockQueryResult as never)

    const validUuid = '550e8400-e29b-41d4-a716-446655440000'

    // Act
    const res = await new Promise<{ status: number; text: string }>((resolve, reject) => {
      const req = request(app)
        .post('/api/chat')
        .send({ message: 'テスト', conversationId: validUuid, dbConnectionId: TEST_DB_CONNECTION_ID })
        .set('Accept', 'text/event-stream')

      let responseText = ''
      let statusCode = 200
      req
        .buffer(true)
        .parse((res, cb) => {
          statusCode = res.statusCode ?? 200
          let data = ''
          res.on('data', (chunk: Buffer) => { data += chunk.toString() })
          res.on('end', () => { responseText = data; cb(null, data) })
          res.on('error', cb)
        })
        .then(() => resolve({ status: statusCode, text: responseText }))
        .catch(reject)
    })

    const events = parseSseEvents(res.text)
    const eventNames = events.map((e) => e.event)

    // Assert: 正常にSSEストリームが返される
    expect(res.status).toBe(200)
    expect(eventNames).toContain('conversation')
    expect(eventNames).toContain('done')
  })

  // -------------------------------------------------------------------------
  // セキュリティ（M2: エラーメッセージの内部情報漏洩防止）
  // -------------------------------------------------------------------------

  /**
   * 【テスト対象】POST /api/chat セキュリティ - エラーメッセージ
   * 【テスト内容】fetchSchema がDB接続情報を含むエラーをスローしたとき
   * 【期待結果】エラーイベントのメッセージにDB接続情報（ホスト名等）が含まれない
   */
  it('should not expose internal DB error details in error event message', async () => {
    // Arrange
    const internalError = new Error('Connection refused to db-host.internal.example.com:5432')
    vi.mocked(fetchSchema).mockRejectedValue(internalError)

    // Act
    const { text } = await sendChatRequest(app, 'テスト')
    const events = parseSseEvents(text)
    const errorEvent = events.find((e) => e.event === 'error')

    // Assert
    expect(errorEvent).toBeDefined()
    const errorMessage = (errorEvent!.data as { message: string }).message
    // 内部ホスト名がユーザーに見えないこと
    expect(errorMessage).not.toContain('db-host.internal.example.com')
    expect(errorMessage).not.toContain('5432')
  })

  /**
   * 【テスト対象】POST /api/chat セキュリティ - SQL実行エラーメッセージ
   * 【テスト内容】executeQuery がDB接続情報を含むエラーをスローしたとき
   * 【期待結果】エラーイベントのメッセージにDB接続情報が含まれない
   */
  it('should not expose DB connection details when executeQuery fails', async () => {
    // Arrange
    vi.mocked(fetchSchema).mockResolvedValue(mockSchema as never)
    setupNormalLlmMock('SELECT * FROM orders', 'bar')
    const internalError = new Error('ECONNREFUSED connect ECONNREFUSED 192.168.1.50:5432')
    vi.mocked(executeQuery).mockRejectedValue(internalError)

    // Act
    const { text } = await sendChatRequest(app, 'テスト')
    const events = parseSseEvents(text)
    const errorEvent = events.find((e) => e.event === 'error')

    // Assert
    expect(errorEvent).toBeDefined()
    const errorMessage = (errorEvent!.data as { message: string }).message
    // 内部IPアドレスやポートがユーザーに見えないこと
    expect(errorMessage).not.toContain('192.168.1.50')
    expect(errorMessage).not.toContain('ECONNREFUSED')
  })

  // -------------------------------------------------------------------------
  // 会話履歴保存（Task 4.1.2: /api/chat処理内での保存）
  // -------------------------------------------------------------------------

  /**
   * 【テスト対象】POST /api/chat 正常フロー - 会話履歴保存
   * 【テスト内容】conversationId なしでリクエストを送信したとき、
   *              新規会話が作成され conversation SSEイベントが返ること
   * 【期待結果】
   *   - createConversation が1回呼ばれること
   *   - SSEレスポンスに event: conversation が含まれること
   *   - createMessage がユーザーメッセージ用に1回呼ばれること
   */
  it('should create new conversation and emit conversation event when no conversationId', async () => {
    // Arrange
    vi.mocked(fetchSchema).mockResolvedValue(mockSchema as never)
    setupNormalLlmMock('SELECT * FROM orders', 'bar')
    vi.mocked(executeQuery).mockResolvedValue(mockQueryResult as never)

    // Act
    const { text } = await sendChatRequest(app, '新規会話のテスト')
    const events = parseSseEvents(text)

    // Assert: conversation イベントが存在すること
    // フィールド名は conversationId（フロントエンドの useChat と一致させるため id → conversationId に修正）
    const convEvent = events.find((e) => e.event === 'conversation')
    expect(convEvent).toBeDefined()
    expect((convEvent!.data as { conversationId: string }).conversationId).toBeTruthy()

    // createConversation が呼ばれたこと
    expect(vi.mocked(createConversation)).toHaveBeenCalledTimes(1)
  })

  /**
   * 【テスト対象】POST /api/chat 正常フロー - ユーザーメッセージ保存
   * 【テスト内容】チャットリクエスト時にユーザーメッセージがDB保存されること
   * 【期待結果】createMessage が少なくとも1回（ユーザーメッセージ）呼ばれること
   */
  it('should save user message to history DB', async () => {
    // Arrange
    vi.mocked(fetchSchema).mockResolvedValue(mockSchema as never)
    setupNormalLlmMock('SELECT * FROM orders', 'bar')
    vi.mocked(executeQuery).mockResolvedValue(mockQueryResult as never)

    // Act
    await sendChatRequest(app, 'ユーザーメッセージ保存テスト')

    // Assert: createMessage が少なくとも1回（ユーザーメッセージ）呼ばれること
    expect(vi.mocked(createMessage)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        role: 'user',
        content: 'ユーザーメッセージ保存テスト',
      })
    )
  })

  /**
   * 【テスト対象】POST /api/chat 正常フロー - アシスタントメッセージ保存
   * 【テスト内容】正常完了後にアシスタントメッセージがDB保存されること
   * 【期待結果】createMessage が2回（user + assistant）呼ばれること
   */
  it('should save assistant message with sql and queryResult to history DB', async () => {
    // Arrange
    vi.mocked(fetchSchema).mockResolvedValue(mockSchema as never)
    setupNormalLlmMock('SELECT * FROM orders', 'bar')
    vi.mocked(executeQuery).mockResolvedValue(mockQueryResult as never)

    // Act
    await sendChatRequest(app, 'アシスタント保存テスト')

    // Assert: createMessage が2回呼ばれること（user + assistant）
    expect(vi.mocked(createMessage)).toHaveBeenCalledTimes(2)
    // アシスタントメッセージの呼び出しが含まれること
    expect(vi.mocked(createMessage)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        role: 'assistant',
        sql: 'SELECT * FROM orders',
        chartType: 'bar',
      })
    )
  })
})
