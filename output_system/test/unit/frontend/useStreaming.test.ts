/**
 * 【モジュール】frontend/src/hooks/useStreaming
 * SSEストリーミング共通処理（fetch + ReadableStream でSSEをパース）のユニットテスト
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { streamSseEvents } from '../../../frontend/src/hooks/useStreaming'

// ---------------------------------------------------------------------------
// テスト用ヘルパー
// ---------------------------------------------------------------------------

/**
 * SSEレスポンスをシミュレートするReadableStreamを生成するヘルパー
 * バックエンドの sendSseEvent フォーマット（event: xxx\ndata: json\n\n）に準拠
 *
 * @param events - 送信するSSEイベントブロックの配列
 * @returns ReadableStream<Uint8Array>
 */
function createSseStream(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let index = 0
  return new ReadableStream({
    pull(controller) {
      if (index < events.length) {
        controller.enqueue(encoder.encode(events[index++]))
      } else {
        controller.close()
      }
    },
  })
}

/**
 * fetch モックを設定するヘルパー
 *
 * @param events - SSEイベントブロックの配列
 * @param statusCode - HTTPステータスコード（デフォルト200）
 */
function mockFetch(events: string[], statusCode = 200) {
  const stream = createSseStream(events)
  vi.mocked(global.fetch).mockResolvedValueOnce(
    new Response(stream, {
      status: statusCode,
      headers: { 'Content-Type': 'text/event-stream' },
    }),
  )
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe('useStreaming - streamSseEvents', () => {
  beforeEach(() => {
    // fetch をモック化
    vi.spyOn(global, 'fetch').mockImplementation(() => Promise.reject(new Error('not mocked')))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /**
   * 【テスト対象】streamSseEvents 関数
   * 【テスト内容】正常なSSEイベント（message/sql/result/done）を受信する場合
   * 【期待結果】各イベントが ParsedSseEvent としてyieldされること
   */
  it('should parse single message event correctly', async () => {
    // Arrange: message イベントのSSEブロック
    mockFetch(['event: message\ndata: {"chunk":"Hello"}\n\n'])

    // Act: ジェネレーターを実行してイベントを収集
    const events = []
    for await (const event of streamSseEvents('/api/chat', { message: 'test' })) {
      events.push(event)
    }

    // Assert: message イベントが正しくパースされること
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ event: 'message', data: { chunk: 'Hello' } })
  })

  /**
   * 【テスト対象】streamSseEvents 関数
   * 【テスト内容】複数のSSEイベント（message/sql/chart_type/result/done）を順番に受信する場合
   * 【期待結果】全イベントが順番通りにyieldされること
   */
  it('should parse multiple events in sequence', async () => {
    // Arrange: 複数のSSEイベントブロック（\n\n 区切り）
    const sseBlocks = [
      'event: message\ndata: {"chunk":"SQLを生成しました。"}\n\n',
      'event: sql\ndata: {"sql":"SELECT * FROM sales"}\n\n',
      'event: chart_type\ndata: {"chartType":"bar"}\n\n',
      'event: result\ndata: {"columns":["id","amount"],"rows":[{"id":1,"amount":100}],"chartType":"bar"}\n\n',
      'event: done\ndata: {}\n\n',
    ]
    mockFetch(sseBlocks)

    // Act
    const events = []
    for await (const event of streamSseEvents('/api/chat', { message: 'test' })) {
      events.push(event)
    }

    // Assert: 全5イベントが正しい順序でパースされること
    expect(events).toHaveLength(5)
    expect(events[0]).toEqual({ event: 'message', data: { chunk: 'SQLを生成しました。' } })
    expect(events[1]).toEqual({ event: 'sql', data: { sql: 'SELECT * FROM sales' } })
    expect(events[2]).toEqual({ event: 'chart_type', data: { chartType: 'bar' } })
    expect(events[3].event).toBe('result')
    expect(events[4]).toEqual({ event: 'done', data: {} })
  })

  /**
   * 【テスト対象】streamSseEvents 関数
   * 【テスト内容】チャンクが \n\n をまたいで分割されて届く場合（ネットワーク分割）
   * 【期待結果】バッファリングにより正しくイベントが結合されてパースされること
   *
   * 【前提条件】
   * SSEチャンクは任意のバイト境界で分割される場合がある
   */
  it('should handle chunks split across network boundaries', async () => {
    // Arrange: 1つのイベントが2チャンクに分割されて届く
    const encoder = new TextEncoder()
    let callCount = 0
    const chunks = [
      encoder.encode('event: message\n'),  // チャンク1: eventフィールドのみ
      encoder.encode('data: {"chunk":"World"}\n\n'),  // チャンク2: dataフィールド + 終端
    ]
    const stream = new ReadableStream({
      pull(controller) {
        if (callCount < chunks.length) {
          controller.enqueue(chunks[callCount++])
        } else {
          controller.close()
        }
      },
    })
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    )

    // Act
    const events = []
    for await (const event of streamSseEvents('/api/chat', { message: 'test' })) {
      events.push(event)
    }

    // Assert: 分割されたチャンクが結合されて正しくパースされること
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ event: 'message', data: { chunk: 'World' } })
  })

  /**
   * 【テスト対象】streamSseEvents 関数
   * 【テスト内容】HTTP 400エラーレスポンスが返った場合
   * 【期待結果】Error がスローされること
   */
  it('should throw Error on HTTP 400 response', async () => {
    // Arrange: 400レスポンス
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'message は必須です' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    // Act & Assert: エラーがスローされること
    await expect(async () => {
      for await (const _ of streamSseEvents('/api/chat', { message: '' })) {
        // noop
      }
    }).rejects.toThrow()
  })

  /**
   * 【テスト対象】streamSseEvents 関数
   * 【テスト内容】AbortController でキャンセルした場合
   * 【期待結果】AbortError がスローされること
   */
  it('should throw AbortError when signal is aborted', async () => {
    // Arrange: AbortController で即座にキャンセル
    const abortController = new AbortController()
    vi.mocked(global.fetch).mockImplementationOnce(() => {
      return Promise.reject(new DOMException('Aborted', 'AbortError'))
    })
    abortController.abort()

    // Act & Assert
    await expect(async () => {
      for await (const _ of streamSseEvents('/api/chat', { message: 'test' }, abortController.signal)) {
        // noop
      }
    }).rejects.toThrow(DOMException)
  })

  /**
   * 【テスト対象】streamSseEvents 関数
   * 【テスト内容】error イベントを受信した場合
   * 【期待結果】event: error として ParsedSseEvent がyieldされること
   */
  it('should yield error event correctly', async () => {
    // Arrange: errorイベント
    mockFetch([
      'event: error\ndata: {"message":"DBスキーマの取得に失敗しました。"}\n\n',
      'event: done\ndata: {}\n\n',
    ])

    // Act
    const events = []
    for await (const event of streamSseEvents('/api/chat', { message: 'test' })) {
      events.push(event)
    }

    // Assert
    expect(events[0]).toEqual({
      event: 'error',
      data: { message: 'DBスキーマの取得に失敗しました。' },
    })
  })
})
