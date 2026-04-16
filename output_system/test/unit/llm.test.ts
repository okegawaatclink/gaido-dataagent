/**
 * LLMサービス（llm.ts）のユニットテスト
 *
 * Anthropic SDK はモック化し、ストリーミングレスポンスを疑似チャンクで供給する。
 *
 * テスト対象:
 *   - schemaToPromptText(): SchemaInfo → プロンプトテキスト変換
 *   - extractStructuredData(): LLMレスポンスからSQL/chart_type抽出
 *   - LlmService.generate(): ストリーミング生成（モック）
 *   - エラーハンドリング（APIキー未設定、APIエラー、タイムアウト、パースエラー）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  schemaToPromptText,
  extractStructuredData,
  LlmService,
  LlmConfigError,
  LlmApiError,
  LlmTimeoutError,
  LlmParseError,
  type ChartType,
  type LlmEvent,
} from '../../backend/src/services/llm'
import type { SchemaInfo } from '../../backend/src/services/schema'

// ---------------------------------------------------------------------------
// テスト用フィクスチャ
// ---------------------------------------------------------------------------

/** テスト用スキーマ情報 */
const mockSchema: SchemaInfo = {
  database: 'testdb',
  tables: [
    {
      name: 'orders',
      columns: [
        { name: 'id', type: 'integer', nullable: false },
        { name: 'customer_name', type: 'varchar', nullable: false },
        { name: 'amount', type: 'numeric', nullable: true },
        { name: 'created_at', type: 'timestamp', nullable: false },
      ],
    },
    {
      name: 'products',
      columns: [
        { name: 'id', type: 'integer', nullable: false },
        { name: 'name', type: 'varchar', nullable: false },
        { name: 'price', type: 'numeric', nullable: true },
      ],
    },
  ],
}

/** テスト用LLMレスポンス（正常系）*/
const mockLlmResponse = `今月の売上トップ10を取得するクエリを生成します。

orders テーブルの amount を合計してトップ10を取得します。

\`\`\`json
{
  "sql": "SELECT customer_name, SUM(amount) as total FROM orders GROUP BY customer_name ORDER BY total DESC LIMIT 10",
  "chart_type": "bar"
}
\`\`\``

// ---------------------------------------------------------------------------
// モックファクトリ
// ---------------------------------------------------------------------------

/**
 * Anthropic SDK のストリーミングレスポンスをモックする async generator を生成する
 *
 * @param textChunks - ストリームで返すテキストチャンクの配列
 * @returns AsyncIterable<RawMessageStreamEvent> 相当のモックオブジェクト
 */
function createMockStream(textChunks: string[]): AsyncIterable<{
  type: string
  delta?: { type: string; text: string }
  index?: number
}> {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const chunk of textChunks) {
        yield {
          type: 'content_block_delta',
          index: 0,
          delta: {
            type: 'text_delta',
            text: chunk,
          },
        }
      }
    },
  }
}

/**
 * APIエラーをシミュレートするモックストリームを生成する
 *
 * @param error - スローするエラー
 * @returns エラーをスローする AsyncIterable
 */
function createErrorStream(error: Error): AsyncIterable<never> {
  return {
    [Symbol.asyncIterator]: async function* () {
      throw error
      // yield を含まない型エラー回避用の unreachable code
    },
  }
}

// ---------------------------------------------------------------------------
// schemaToPromptText のテスト
// ---------------------------------------------------------------------------

describe('schemaToPromptText', () => {
  /**
   * 【テスト対象】schemaToPromptText
   * 【テスト内容】データベース名がプロンプトテキストの先頭に含まれること
   * 【期待結果】"Database: testdb" で始まること
   */
  it('should include database name in the output', () => {
    const result = schemaToPromptText(mockSchema)
    expect(result).toContain('Database: testdb')
  })

  /**
   * 【テスト対象】schemaToPromptText
   * 【テスト内容】テーブル名がプロンプトテキストに含まれること
   * 【期待結果】"Table: orders" と "Table: products" が含まれること
   */
  it('should include all table names', () => {
    const result = schemaToPromptText(mockSchema)
    expect(result).toContain('Table: orders')
    expect(result).toContain('Table: products')
  })

  /**
   * 【テスト対象】schemaToPromptText
   * 【テスト内容】カラム情報（名前・型・NULL許容）がプロンプトテキストに含まれること
   * 【期待結果】各カラムが "- name (type, NULL/NOT NULL)" 形式で含まれること
   */
  it('should include column information with nullability', () => {
    const result = schemaToPromptText(mockSchema)
    // NOT NULL カラム
    expect(result).toContain('- id (integer, NOT NULL)')
    expect(result).toContain('- customer_name (varchar, NOT NULL)')
    // NULL 許容カラム
    expect(result).toContain('- amount (numeric, NULL)')
    expect(result).toContain('- price (numeric, NULL)')
  })

  /**
   * 【テスト対象】schemaToPromptText
   * 【テスト内容】テーブルが空の場合（テーブルなし）でもクラッシュしないこと
   * 【期待結果】データベース名のみが出力されること
   */
  it('should handle empty tables array gracefully', () => {
    const emptySchema: SchemaInfo = { database: 'emptydb', tables: [] }
    const result = schemaToPromptText(emptySchema)
    expect(result).toContain('Database: emptydb')
    expect(result).not.toContain('Table:')
  })
})

// ---------------------------------------------------------------------------
// extractStructuredData のテスト
// ---------------------------------------------------------------------------

describe('extractStructuredData', () => {
  /**
   * 【テスト対象】extractStructuredData
   * 【テスト内容】正常な JSON フェンスがある場合に SQL と chart_type を抽出できること
   * 【期待結果】{ sql: '...', chartType: 'bar' } が返ること
   */
  it('should extract sql and chart_type from a valid JSON fence', () => {
    const result = extractStructuredData(mockLlmResponse)
    expect(result).not.toBeNull()
    expect(result!.sql).toBe(
      'SELECT customer_name, SUM(amount) as total FROM orders GROUP BY customer_name ORDER BY total DESC LIMIT 10'
    )
    expect(result!.chartType).toBe('bar')
  })

  /**
   * 【テスト対象】extractStructuredData
   * 【テスト内容】全ての chart_type 種別（bar/line/pie/table）が正しく抽出されること
   * 【期待結果】各 chart_type が正しく返ること
   */
  it('should correctly extract all valid chart_type values', () => {
    const chartTypes: ChartType[] = ['bar', 'line', 'pie', 'table']

    for (const chartType of chartTypes) {
      const text = `\`\`\`json\n{"sql": "SELECT 1", "chart_type": "${chartType}"}\n\`\`\``
      const result = extractStructuredData(text)
      expect(result).not.toBeNull()
      expect(result!.chartType).toBe(chartType)
    }
  })

  /**
   * 【テスト対象】extractStructuredData
   * 【テスト内容】不正な chart_type の場合は 'table' にフォールバックすること
   * 【期待結果】{ sql: '...', chartType: 'table' } が返ること
   */
  it('should fallback to "table" for invalid chart_type values', () => {
    const text = '```json\n{"sql": "SELECT 1", "chart_type": "heatmap"}\n```'
    const result = extractStructuredData(text)
    expect(result).not.toBeNull()
    expect(result!.chartType).toBe('table')
  })

  /**
   * 【テスト対象】extractStructuredData
   * 【テスト内容】JSON フェンスがない場合は null を返すこと
   * 【期待結果】null が返ること
   */
  it('should return null when no JSON fence is present', () => {
    const text = 'Here is the SQL: SELECT * FROM users'
    const result = extractStructuredData(text)
    expect(result).toBeNull()
  })

  /**
   * 【テスト対象】extractStructuredData
   * 【テスト内容】JSON フェンスの内容が不正な JSON の場合は null を返すこと
   * 【期待結果】null が返ること
   */
  it('should return null when JSON fence contains invalid JSON', () => {
    const text = '```json\n{invalid json}\n```'
    const result = extractStructuredData(text)
    expect(result).toBeNull()
  })

  /**
   * 【テスト対象】extractStructuredData
   * 【テスト内容】sql フィールドが空文字の場合は null を返すこと
   * 【期待結果】null が返ること
   */
  it('should return null when sql field is empty', () => {
    const text = '```json\n{"sql": "", "chart_type": "bar"}\n```'
    const result = extractStructuredData(text)
    expect(result).toBeNull()
  })

  /**
   * 【テスト対象】extractStructuredData
   * 【テスト内容】複数の JSON フェンスがある場合は最後のフェンスを使用すること
   * 【期待結果】最後のフェンスの SQL が返ること
   */
  it('should use the last JSON fence when multiple fences are present', () => {
    const text = [
      '```json',
      '{"sql": "SELECT 1", "chart_type": "pie"}',
      '```',
      'Final answer:',
      '```json',
      '{"sql": "SELECT 2", "chart_type": "bar"}',
      '```',
    ].join('\n')

    const result = extractStructuredData(text)
    expect(result).not.toBeNull()
    expect(result!.sql).toBe('SELECT 2')
    expect(result!.chartType).toBe('bar')
  })

  /**
   * 【テスト対象】extractStructuredData
   * 【テスト内容】言語指定なしの ``` フェンスでも JSON を抽出できること
   * 【期待結果】{ sql: '...', chartType: 'line' } が返ること
   */
  it('should handle code fences without language specifier', () => {
    const text = '```\n{"sql": "SELECT * FROM orders", "chart_type": "line"}\n```'
    const result = extractStructuredData(text)
    expect(result).not.toBeNull()
    expect(result!.sql).toBe('SELECT * FROM orders')
    expect(result!.chartType).toBe('line')
  })
})

// ---------------------------------------------------------------------------
// LlmService のテスト
// ---------------------------------------------------------------------------

describe('LlmService', () => {
  /** 環境変数のオリジナル値を保持 */
  const originalEnv = process.env

  beforeEach(() => {
    // 各テスト前に環境変数をリセット
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    // 各テスト後にモックとスパイをリセット
    vi.restoreAllMocks()
    process.env = originalEnv
  })

  // -----------------------------------------------------------------------
  // コンストラクタのテスト
  // -----------------------------------------------------------------------

  describe('constructor', () => {
    /**
     * 【テスト対象】LlmService コンストラクタ
     * 【テスト内容】ANTHROPIC_API_KEY が設定されていない場合に LlmConfigError をスローすること
     * 【期待結果】LlmConfigError がスローされ、メッセージに 'ANTHROPIC_API_KEY' が含まれること
     */
    it('should throw LlmConfigError when ANTHROPIC_API_KEY is not set', () => {
      delete process.env.ANTHROPIC_API_KEY

      expect(() => new LlmService()).toThrow(LlmConfigError)
      expect(() => new LlmService()).toThrow('ANTHROPIC_API_KEY')
    })

    /**
     * 【テスト対象】LlmService コンストラクタ
     * 【テスト内容】ANTHROPIC_API_KEY が空文字の場合に LlmConfigError をスローすること
     * 【期待結果】LlmConfigError がスローされること
     */
    it('should throw LlmConfigError when ANTHROPIC_API_KEY is empty string', () => {
      process.env.ANTHROPIC_API_KEY = ''

      expect(() => new LlmService()).toThrow(LlmConfigError)
    })

    /**
     * 【テスト対象】LlmService コンストラクタ
     * 【テスト内容】ANTHROPIC_API_KEY が設定されている場合はインスタンスが生成されること
     * 【期待結果】エラーをスローせずにインスタンスが返ること
     */
    it('should create instance successfully when ANTHROPIC_API_KEY is set', () => {
      process.env.ANTHROPIC_API_KEY = 'test-api-key-sk-xxxx'

      expect(() => new LlmService()).not.toThrow()
    })
  })

  // -----------------------------------------------------------------------
  // generate() のテスト（SDKモック使用）
  // -----------------------------------------------------------------------

  describe('generate()', () => {
    /**
     * 【テスト対象】LlmService.generate()
     * 【テスト内容】正常系: テキストチャンクが message イベントとして yield されること
     * 【前提条件】ANTHROPIC_API_KEY が設定済み、SDK は正常なストリームを返す
     * 【期待結果】
     *   - type: 'message' イベントが各チャンクに対して yield される
     *   - type: 'sql' イベントが yield される
     *   - type: 'chart_type' イベントが yield される
     */
    it('should yield message, sql, and chart_type events in order', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-api-key-sk-xxxx'

      // テキストチャンクを複数に分割してストリームをシミュレート
      const textChunks = [
        '今月の売上トップ10を取得します。\n\n```json\n',
        '{"sql": "SELECT customer_name, SUM(amount) as total FROM orders GROUP BY customer_name ORDER BY total DESC LIMIT 10",',
        ' "chart_type": "bar"}\n```',
      ]

      // Anthropic SDK の messages.stream をモック
      const service = new LlmService()
      vi.spyOn(service['client'].messages, 'stream').mockReturnValue(
        createMockStream(textChunks) as ReturnType<typeof service['client']['messages']['stream']>
      )

      const events: LlmEvent[] = []
      for await (const event of service.generate({ question: '今月の売上トップ10', schema: mockSchema })) {
        events.push(event)
      }

      // message イベントが 3 件 yield されること
      const messageEvents = events.filter((e) => e.type === 'message')
      expect(messageEvents).toHaveLength(3)

      // sql イベントが 1 件 yield されること
      const sqlEvents = events.filter((e) => e.type === 'sql')
      expect(sqlEvents).toHaveLength(1)
      expect((sqlEvents[0] as { type: 'sql'; sql: string }).sql).toContain('SELECT customer_name')

      // chart_type イベントが 1 件 yield されること
      const chartTypeEvents = events.filter((e) => e.type === 'chart_type')
      expect(chartTypeEvents).toHaveLength(1)
      expect((chartTypeEvents[0] as { type: 'chart_type'; chartType: ChartType }).chartType).toBe('bar')
    })

    /**
     * 【テスト対象】LlmService.generate()
     * 【テスト内容】イベントの順序が message → sql → chart_type であること
     * 【期待結果】最後の 2 イベントが sql と chart_type であること
     */
    it('should yield events in correct order: message first, then sql and chart_type', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-api-key-sk-xxxx'

      const textChunks = ['説明文\n\n```json\n{"sql": "SELECT 1", "chart_type": "line"}\n```']

      const service = new LlmService()
      vi.spyOn(service['client'].messages, 'stream').mockReturnValue(
        createMockStream(textChunks) as ReturnType<typeof service['client']['messages']['stream']>
      )

      const events: LlmEvent[] = []
      for await (const event of service.generate({ question: 'test', schema: mockSchema })) {
        events.push(event)
      }

      // イベント順序の確認
      expect(events[0].type).toBe('message')
      const sqlIndex = events.findIndex((e) => e.type === 'sql')
      const chartIndex = events.findIndex((e) => e.type === 'chart_type')
      expect(sqlIndex).toBeGreaterThan(0)
      expect(chartIndex).toBe(sqlIndex + 1) // sql の直後に chart_type
    })

    /**
     * 【テスト対象】LlmService.generate()
     * 【テスト内容】LLMが JSON フェンスを含まないレスポンスを返した場合に LlmParseError をスローすること
     * 【前提条件】SDK は JSON フェンスなしのテキストを返す
     * 【期待結果】LlmParseError がスローされること
     */
    it('should throw LlmParseError when LLM response does not contain JSON fence', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-api-key-sk-xxxx'

      // JSON フェンスなしのレスポンス
      const textChunks = ['申し訳ありませんが、SQLを生成できません。']

      const service = new LlmService()
      vi.spyOn(service['client'].messages, 'stream').mockReturnValue(
        createMockStream(textChunks) as ReturnType<typeof service['client']['messages']['stream']>
      )

      await expect(async () => {
        for await (const _event of service.generate({ question: 'test', schema: mockSchema })) {
          // イベントを消費するだけ
        }
      }).rejects.toThrow(LlmParseError)
    })

    /**
     * 【テスト対象】LlmService.generate()
     * 【テスト内容】SDK がストリーム中にエラーをスローした場合に LlmApiError をスローすること
     * 【前提条件】SDK のストリームがエラーをスローする
     * 【期待結果】LlmApiError がスローされること
     */
    it('should throw LlmApiError when SDK stream throws an error', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-api-key-sk-xxxx'

      const { APIError } = await import('@anthropic-ai/sdk')

      // Anthropic.APIError を使用してエラーをシミュレート
      // コンストラクタシグネチャ: (status, error, message, headers)
      // Headers オブジェクトは get() メソッドを持つ必要があるため new Headers() を使用
      const apiError = new APIError(500, undefined, 'Internal server error', new Headers())

      const service = new LlmService()
      vi.spyOn(service['client'].messages, 'stream').mockReturnValue(
        createErrorStream(apiError) as unknown as ReturnType<typeof service['client']['messages']['stream']>
      )

      await expect(async () => {
        for await (const _event of service.generate({ question: 'test', schema: mockSchema })) {
          // イベントを消費するだけ
        }
      }).rejects.toThrow(LlmApiError)
    })

    /**
     * 【テスト対象】LlmService.generate()
     * 【テスト内容】タイムアウトエラーの場合に LlmTimeoutError をスローすること
     * 【前提条件】SDK のストリームがタイムアウトエラーをスローする
     * 【期待結果】LlmTimeoutError がスローされること
     */
    it('should throw LlmTimeoutError when SDK stream times out', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-api-key-sk-xxxx'

      const { APIError } = await import('@anthropic-ai/sdk')

      // タイムアウトエラーをシミュレート（status: 408）
      // コンストラクタシグネチャ: (status, error, message, headers)
      const timeoutError = new APIError(408, undefined, 'Request timeout', new Headers())

      const service = new LlmService()
      vi.spyOn(service['client'].messages, 'stream').mockReturnValue(
        createErrorStream(timeoutError) as unknown as ReturnType<typeof service['client']['messages']['stream']>
      )

      await expect(async () => {
        for await (const _event of service.generate({ question: 'test', schema: mockSchema })) {
          // イベントを消費するだけ
        }
      }).rejects.toThrow(LlmTimeoutError)
    })

    /**
     * 【テスト対象】LlmService.generate()
     * 【テスト内容】ANTHROPIC_MODEL 環境変数でモデルを上書きできること
     * 【前提条件】ANTHROPIC_MODEL 環境変数が設定されている
     * 【期待結果】stream() に指定されたモデル名が渡されること
     */
    it('should use ANTHROPIC_MODEL env variable when set', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-api-key-sk-xxxx'
      process.env.ANTHROPIC_MODEL = 'claude-3-haiku-20240307'

      const textChunks = ['```json\n{"sql": "SELECT 1", "chart_type": "table"}\n```']

      const service = new LlmService()
      const streamSpy = vi.spyOn(service['client'].messages, 'stream').mockReturnValue(
        createMockStream(textChunks) as ReturnType<typeof service['client']['messages']['stream']>
      )

      for await (const _event of service.generate({ question: 'test', schema: mockSchema })) {
        // イベントを消費するだけ
      }

      // stream() が呼ばれた引数を確認
      expect(streamSpy).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-3-haiku-20240307' })
      )
    })

    /**
     * 【テスト対象】LlmService.generate()
     * 【テスト内容】ストリーム開始前に SDK がエラーをスローした場合（接続失敗）に LlmApiError になること
     * 【前提条件】messages.stream() 自体が例外をスローする
     * 【期待結果】LlmApiError がスローされること
     */
    it('should throw LlmApiError when stream initialization fails', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-api-key-sk-xxxx'

      const service = new LlmService()
      vi.spyOn(service['client'].messages, 'stream').mockImplementation(() => {
        throw new Error('Connection refused')
      })

      await expect(async () => {
        for await (const _event of service.generate({ question: 'test', schema: mockSchema })) {
          // イベントを消費するだけ
        }
      }).rejects.toThrow(LlmApiError)
    })

    /**
     * 【テスト対象】LlmService.generate()
     * 【テスト内容】APIError 以外の非 Anthropic エラーがストリーム中に発生した場合に LlmApiError になること
     * 【前提条件】SDK のストリームが一般的な Error をスローする
     * 【期待結果】LlmApiError がスローされること
     */
    it('should throw LlmApiError for non-APIError errors during streaming', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-api-key-sk-xxxx'

      // 通常の Error（APIError でない）
      const genericError = new Error('Unexpected error')

      const service = new LlmService()
      vi.spyOn(service['client'].messages, 'stream').mockReturnValue(
        createErrorStream(genericError) as unknown as ReturnType<typeof service['client']['messages']['stream']>
      )

      await expect(async () => {
        for await (const _event of service.generate({ question: 'test', schema: mockSchema })) {
          // イベントを消費するだけ
        }
      }).rejects.toThrow(LlmApiError)
    })

    /**
     * 【テスト対象】LlmService.generate()
     * 【テスト内容】スキーマ情報がプロンプトに含まれること
     * 【前提条件】有効なスキーマとAPIキーが設定されている
     * 【期待結果】stream() のメッセージにデータベース名とテーブル名が含まれること
     */
    it('should include schema information in the prompt', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-api-key-sk-xxxx'

      const textChunks = ['```json\n{"sql": "SELECT 1", "chart_type": "table"}\n```']

      const service = new LlmService()
      const streamSpy = vi.spyOn(service['client'].messages, 'stream').mockReturnValue(
        createMockStream(textChunks) as ReturnType<typeof service['client']['messages']['stream']>
      )

      for await (const _event of service.generate({ question: 'テスト質問', schema: mockSchema })) {
        // イベントを消費するだけ
      }

      // 呼ばれた引数からメッセージを取得
      const callArgs = streamSpy.mock.calls[0][0] as { messages: Array<{ content: string }> }
      const userMessage = callArgs.messages[0].content

      expect(userMessage).toContain('testdb')
      expect(userMessage).toContain('orders')
      expect(userMessage).toContain('products')
      expect(userMessage).toContain('テスト質問')
    })
  })
})

// ---------------------------------------------------------------------------
// エラークラスのテスト
// ---------------------------------------------------------------------------

describe('Error classes', () => {
  /**
   * 【テスト対象】LlmConfigError
   * 【テスト内容】instanceof チェックが正しく動作すること
   * 【期待結果】LlmConfigError のインスタンスは Error かつ LlmConfigError であること
   */
  it('LlmConfigError should be instanceof Error and LlmConfigError', () => {
    const err = new LlmConfigError('test')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(LlmConfigError)
    expect(err.name).toBe('LlmConfigError')
    expect(err.type).toBe('LlmConfigError')
  })

  /**
   * 【テスト対象】LlmApiError
   * 【テスト内容】instanceof チェックが正しく動作すること
   * 【期待結果】LlmApiError のインスタンスは Error かつ LlmApiError であること
   */
  it('LlmApiError should be instanceof Error and LlmApiError', () => {
    const err = new LlmApiError('api error')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(LlmApiError)
    expect(err.type).toBe('LlmApiError')
  })

  /**
   * 【テスト対象】LlmTimeoutError
   * 【テスト内容】instanceof チェックが正しく動作すること
   * 【期待結果】LlmTimeoutError のインスタンスは Error かつ LlmTimeoutError であること
   */
  it('LlmTimeoutError should be instanceof Error and LlmTimeoutError', () => {
    const err = new LlmTimeoutError('timeout')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(LlmTimeoutError)
    expect(err.type).toBe('LlmTimeoutError')
  })

  /**
   * 【テスト対象】LlmParseError
   * 【テスト内容】instanceof チェックが正しく動作すること
   * 【期待結果】LlmParseError のインスタンスは Error かつ LlmParseError であること
   */
  it('LlmParseError should be instanceof Error and LlmParseError', () => {
    const err = new LlmParseError('parse error')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(LlmParseError)
    expect(err.type).toBe('LlmParseError')
  })
})
