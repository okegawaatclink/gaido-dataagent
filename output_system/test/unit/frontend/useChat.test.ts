/**
 * 【モジュール】frontend/src/hooks/useChat
 * チャットロジックフック（SSE購読・状態管理）のユニットテスト
 *
 * 注意: useChat は fetch を直接呼ぶ useStreaming.ts に依存するため、
 * global.fetch をモック化してテストする。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useChat } from '../../../frontend/src/hooks/useChat'

// ---------------------------------------------------------------------------
// テスト用ヘルパー
// ---------------------------------------------------------------------------

/**
 * SSEイベントブロックの文字列配列から ReadableStream を生成するヘルパー
 * チャンクは1ブロックずつ送信される
 */
function createSseStream(blocks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let index = 0
  return new ReadableStream({
    pull(controller) {
      if (index < blocks.length) {
        controller.enqueue(encoder.encode(blocks[index++]))
      } else {
        controller.close()
      }
    },
  })
}

/**
 * fetch をモック化して SSE ストリームを返すようにする
 *
 * @param sseBlocks - SSEイベントブロックの配列
 */
function mockChatApi(sseBlocks: string[]) {
  vi.mocked(global.fetch).mockResolvedValueOnce(
    new Response(createSseStream(sseBlocks), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }),
  )
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe('useChat', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.reject(new Error('fetch not mocked')),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /**
   * 【テスト対象】useChat フックの初期状態
   * 【テスト内容】フック初期化時の状態を確認
   * 【期待結果】messages が空配列、isLoading が false、conversationId が null であること
   */
  it('should initialize with empty messages and not loading', () => {
    // Act
    const { result } = renderHook(() => useChat())

    // Assert
    expect(result.current.messages).toEqual([])
    expect(result.current.isLoading).toBe(false)
    expect(result.current.conversationId).toBeNull()
    expect(typeof result.current.send).toBe('function')
    expect(typeof result.current.clearMessages).toBe('function')
    expect(typeof result.current.setMessages).toBe('function')
    expect(typeof result.current.setConversationId).toBe('function')
  })

  /**
   * 【テスト対象】useChat の send 関数
   * 【テスト内容】質問を送信すると、ユーザーメッセージとアシスタントメッセージが追加される
   * 【期待結果】messages に user ロールと assistant ロールのメッセージが追加されること
   *
   * 【入力例】"今月の売上を教えて"
   */
  it('should add user and assistant messages when send is called', async () => {
    // Arrange: SSEストリームをモック
    mockChatApi([
      'event: message\ndata: {"chunk":"SQL を生成しました。"}\n\n',
      'event: sql\ndata: {"sql":"SELECT * FROM sales"}\n\n',
      'event: done\ndata: {}\n\n',
    ])
    const { result } = renderHook(() => useChat())

    // Act: 質問を送信
    await act(async () => {
      await result.current.send('今月の売上を教えて')
    })

    // Assert: ユーザーメッセージとアシスタントメッセージが追加されること
    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2)
    })

    const userMsg = result.current.messages[0]
    expect(userMsg.role).toBe('user')
    expect(userMsg.content).toBe('今月の売上を教えて')

    const assistantMsg = result.current.messages[1]
    expect(assistantMsg.role).toBe('assistant')
  })

  /**
   * 【テスト対象】useChat の send 関数
   * 【テスト内容】ストリーミング受信中はメッセージが逐次更新される
   * 【期待結果】done 受信後に content がチャンクの結合値になっていること
   */
  it('should accumulate text chunks in assistant message content', async () => {
    // Arrange: 複数のテキストチャンクをシミュレート
    mockChatApi([
      'event: message\ndata: {"chunk":"SQLを"}\n\n',
      'event: message\ndata: {"chunk":"生成しました。"}\n\n',
      'event: done\ndata: {}\n\n',
    ])
    const { result } = renderHook(() => useChat())

    // Act
    await act(async () => {
      await result.current.send('test')
    })

    // Assert: チャンクが結合されていること
    await waitFor(() => {
      const assistantMsg = result.current.messages[1]
      expect(assistantMsg.content).toBe('SQLを生成しました。')
    })
  })

  /**
   * 【テスト対象】useChat の send 関数
   * 【テスト内容】sql イベントを受信するとアシスタントメッセージの sql フィールドが更新される
   * 【期待結果】messages[1].sql に受信したSQL文が設定されること
   */
  it('should set sql field when sql event is received', async () => {
    // Arrange
    mockChatApi([
      'event: message\ndata: {"chunk":"以下のSQLを生成しました"}\n\n',
      'event: sql\ndata: {"sql":"SELECT id, name FROM users"}\n\n',
      'event: done\ndata: {}\n\n',
    ])
    const { result } = renderHook(() => useChat())

    // Act
    await act(async () => {
      await result.current.send('ユーザー一覧を教えて')
    })

    // Assert
    await waitFor(() => {
      expect(result.current.messages[1].sql).toBe('SELECT id, name FROM users')
    })
  })

  /**
   * 【テスト対象】useChat の send 関数
   * 【テスト内容】result イベントを受信するとアシスタントメッセージの result フィールドが更新される
   * 【期待結果】columns/rows/chartType が正しく設定されること
   */
  it('should set result field when result event is received', async () => {
    // Arrange
    const resultData = {
      columns: ['id', 'name'],
      rows: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }],
      chartType: 'table',
    }
    mockChatApi([
      `event: result\ndata: ${JSON.stringify(resultData)}\n\n`,
      'event: done\ndata: {}\n\n',
    ])
    const { result } = renderHook(() => useChat())

    // Act
    await act(async () => {
      await result.current.send('ユーザー一覧を教えて')
    })

    // Assert
    await waitFor(() => {
      const assistantMsg = result.current.messages[1]
      expect(assistantMsg.result).not.toBeNull()
      expect(assistantMsg.result?.columns).toEqual(['id', 'name'])
      expect(assistantMsg.result?.rows).toHaveLength(2)
    })
  })

  /**
   * 【テスト対象】useChat の send 関数
   * 【テスト内容】error イベントを受信するとアシスタントメッセージの error フィールドが更新される
   * 【期待結果】error に受信したエラーメッセージが設定され、isStreaming が false になること
   */
  it('should set error field when error event is received', async () => {
    // Arrange
    mockChatApi([
      'event: error\ndata: {"message":"DBスキーマの取得に失敗しました。"}\n\n',
      'event: done\ndata: {}\n\n',
    ])
    const { result } = renderHook(() => useChat())

    // Act
    await act(async () => {
      await result.current.send('エラーを起こす質問')
    })

    // Assert
    await waitFor(() => {
      const assistantMsg = result.current.messages[1]
      expect(assistantMsg.error).toBe('DBスキーマの取得に失敗しました。')
    })
  })

  /**
   * 【テスト対象】useChat の send 関数
   * 【テスト内容】done 受信後は isStreaming が false になること
   * 【期待結果】ストリーミング完了後に isStreaming: false
   */
  it('should set isStreaming to false after done event', async () => {
    // Arrange
    mockChatApi([
      'event: message\ndata: {"chunk":"完了"}\n\n',
      'event: done\ndata: {}\n\n',
    ])
    const { result } = renderHook(() => useChat())

    // Act
    await act(async () => {
      await result.current.send('test')
    })

    // Assert
    await waitFor(() => {
      const assistantMsg = result.current.messages[1]
      expect(assistantMsg.isStreaming).toBe(false)
    })
  })

  /**
   * 【テスト対象】useChat の send 関数
   * 【テスト内容】空メッセージを送信しても何も起こらないこと
   * 【期待結果】messages が空のままで fetch が呼ばれないこと
   */
  it('should not send empty message', async () => {
    // Act
    const { result } = renderHook(() => useChat())
    await act(async () => {
      await result.current.send('   ')
    })

    // Assert
    expect(result.current.messages).toHaveLength(0)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  /**
   * 【テスト対象】useChat の send 関数
   * 【テスト内容】conversation イベントを受信すると conversationId が更新される（PBI #13）
   * 【期待結果】conversationId に受信した値が設定されること
   */
  it('should set conversationId when conversation event is received', async () => {
    // Arrange
    const testConversationId = '550e8400-e29b-41d4-a716-446655440001'
    mockChatApi([
      `event: conversation\ndata: {"conversationId":"${testConversationId}"}\n\n`,
      'event: message\ndata: {"chunk":"回答"}\n\n',
      'event: done\ndata: {}\n\n',
    ])
    const { result } = renderHook(() => useChat())

    // Act
    await act(async () => {
      await result.current.send('test')
    })

    // Assert: conversationId が設定されること
    await waitFor(() => {
      expect(result.current.conversationId).toBe(testConversationId)
    })
  })

  /**
   * 【テスト対象】useChat の clearMessages 関数
   * 【テスト内容】clearMessages を呼ぶと messages と conversationId がリセットされること
   * 【期待結果】messages が空配列、conversationId が null になること
   */
  it('should clear messages when clearMessages is called', async () => {
    // Arrange: 先にメッセージを追加
    mockChatApi([
      'event: message\ndata: {"chunk":"test"}\n\n',
      'event: done\ndata: {}\n\n',
    ])
    const { result } = renderHook(() => useChat())
    await act(async () => {
      await result.current.send('test')
    })
    await waitFor(() => expect(result.current.messages).toHaveLength(2))

    // Act: クリア
    act(() => {
      result.current.clearMessages()
    })

    // Assert
    expect(result.current.messages).toHaveLength(0)
    expect(result.current.isLoading).toBe(false)
    // PBI #13 追加: clearMessages で conversationId もリセットされること
    expect(result.current.conversationId).toBeNull()
  })

  /**
   * 【テスト対象】useChat の send 関数
   * 【テスト内容】fetch がネットワークエラーを返した場合
   * 【期待結果】アシスタントメッセージの error フィールドにエラーメッセージが設定されること
   */
  it('should handle fetch network error gracefully', async () => {
    // Arrange: fetch がネットワークエラーをスロー
    vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network Error'))
    const { result } = renderHook(() => useChat())

    // Act
    await act(async () => {
      await result.current.send('test')
    })

    // Assert: エラーメッセージが設定されること
    await waitFor(() => {
      const assistantMsg = result.current.messages[1]
      expect(assistantMsg.error).toBe('Network Error')
      expect(assistantMsg.isStreaming).toBe(false)
    })
    expect(result.current.isLoading).toBe(false)
  })
})
