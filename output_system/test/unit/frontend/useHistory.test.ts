/**
 * 【モジュール】frontend/src/hooks/useHistory
 * 会話履歴管理フックのユニットテスト
 *
 * テスト方針:
 * - global.fetch をモック化してAPIコールをシミュレート
 * - GET /api/history（一覧取得）、GET /api/history/:id（詳細取得）の動作を検証
 * - refreshHistory による再取得トリガーを確認
 * - loadConversation の変換ロジック（HistoryMessageResponse → ChatMessage）を確認
 * - エラーハンドリング（API失敗時、404）を確認
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useHistory } from '../../../frontend/src/hooks/useHistory'

// ---------------------------------------------------------------------------
// テスト用データ
// ---------------------------------------------------------------------------

/**
 * テスト用の会話サマリーデータ（GET /api/history のレスポンス）
 */
const mockConversations = [
  {
    id: '550e8400-e29b-41d4-a716-446655440001',
    title: '今月の売上データを教えて',
    createdAt: '2024-01-02T10:00:00.000Z',
    updatedAt: '2024-01-02T10:05:00.000Z',
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440002',
    title: '部門別の従業員数は？',
    createdAt: '2024-01-01T09:00:00.000Z',
    updatedAt: '2024-01-01T09:02:00.000Z',
  },
]

/**
 * テスト用の会話詳細データ（GET /api/history/:id のレスポンス）
 */
const mockConversationDetail = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  title: '今月の売上データを教えて',
  createdAt: '2024-01-02T10:00:00.000Z',
  updatedAt: '2024-01-02T10:05:00.000Z',
  messages: [
    {
      id: 'msg-001',
      role: 'user' as const,
      content: '今月の売上データを教えて',
      sql: null,
      chartType: null,
      queryResult: null,
      error: null,
      createdAt: '2024-01-02T10:00:00.000Z',
    },
    {
      id: 'msg-002',
      role: 'assistant' as const,
      content: '以下のSQLを生成しました。',
      sql: 'SELECT * FROM sales WHERE month = 1',
      chartType: 'bar',
      queryResult: {
        columns: ['id', 'amount'],
        rows: [{ id: 1, amount: 10000 }],
        chartType: 'bar' as const,
      },
      error: null,
      createdAt: '2024-01-02T10:00:05.000Z',
    },
  ],
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe('useHistory', () => {
  beforeEach(() => {
    // fetch のデフォルトモック（明示的にモックしなかった場合はエラー）
    vi.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.reject(new Error('fetch not mocked')),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /**
   * 【テスト対象】useHistory の初期化
   * 【テスト内容】フック初期化時は自動的に GET /api/history を呼び出す
   * 【期待結果】conversations が取得され、isLoading が false になること
   */
  it('should fetch history on mount and set conversations', async () => {
    // Arrange: GET /api/history をモック
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockConversations), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    // Act
    const { result } = renderHook(() => useHistory())

    // Assert: マウント直後はローディング中
    expect(result.current.isLoading).toBe(true)

    // Assert: 取得完了後は会話一覧が設定されること
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.conversations).toHaveLength(2)
    expect(result.current.conversations[0].id).toBe('550e8400-e29b-41d4-a716-446655440001')
    expect(result.current.conversations[0].title).toBe('今月の売上データを教えて')
    expect(result.current.error).toBeNull()
  })

  /**
   * 【テスト対象】useHistory の refreshHistory
   * 【テスト内容】refreshHistory を呼ぶと GET /api/history が再度呼ばれる
   * 【期待結果】fetch が2回呼ばれ、最新の会話一覧に更新されること
   */
  it('should refetch history when refreshHistory is called', async () => {
    // Arrange: 1回目と2回目で異なるデータを返す
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockConversations), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([mockConversations[0]]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )

    const { result } = renderHook(() => useHistory())

    // 1回目の fetch 完了を待つ
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.conversations).toHaveLength(2)

    // Act: 再取得をトリガー
    act(() => {
      result.current.refreshHistory()
    })

    // Assert: 2回目のfetch完了後に会話数が減っていること
    await waitFor(() => {
      expect(result.current.conversations).toHaveLength(1)
    })
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  /**
   * 【テスト対象】useHistory の初期化
   * 【テスト内容】GET /api/history が 500 エラーを返した場合
   * 【期待結果】error が設定され、conversations が空配列のままであること
   */
  it('should set error when fetch returns HTTP error', async () => {
    // Arrange: 500 エラーをモック
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const { result } = renderHook(() => useHistory())

    // Assert: エラーが設定されること
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.error).toContain('500')
    expect(result.current.conversations).toHaveLength(0)
  })

  /**
   * 【テスト対象】useHistory の初期化
   * 【テスト内容】fetch がネットワークエラーをスローした場合
   * 【期待結果】error にエラーメッセージが設定されること
   */
  it('should set error when fetch throws network error', async () => {
    // Arrange: ネットワークエラーをシミュレート
    vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network Error'))

    const { result } = renderHook(() => useHistory())

    // Assert
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.error).toBe('Network Error')
    expect(result.current.conversations).toHaveLength(0)
  })

  /**
   * 【テスト対象】useHistory の loadConversation
   * 【テスト内容】loadConversation を呼ぶと GET /api/history/:id を呼び出し、
   * HistoryMessageResponse を ChatMessage 配列に変換して返す
   * 【期待結果】
   * - messages 配列の長さが正しいこと
   * - user メッセージの role/content が正しいこと
   * - assistant メッセージの sql/chartType/result が変換されること
   * - isStreaming が false であること（履歴は常に非ストリーミング）
   */
  it('should load conversation detail and convert to ChatMessage array', async () => {
    // Arrange: GET /api/history（マウント時）と GET /api/history/:id をモック
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockConversations), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockConversationDetail), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )

    const { result } = renderHook(() => useHistory())

    // マウント時の fetch 完了を待つ
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Act: 会話詳細を取得
    let messages: ReturnType<typeof result.current.loadConversation> extends Promise<infer T> ? T : never = []
    await act(async () => {
      messages = await result.current.loadConversation('550e8400-e29b-41d4-a716-446655440001')
    })

    // Assert: メッセージが正しく変換されていること
    expect(messages).toHaveLength(2)

    // ユーザーメッセージの確認
    const userMsg = messages[0]
    expect(userMsg.role).toBe('user')
    expect(userMsg.content).toBe('今月の売上データを教えて')
    expect(userMsg.sql).toBeNull()
    expect(userMsg.isStreaming).toBe(false)

    // アシスタントメッセージの確認
    const assistantMsg = messages[1]
    expect(assistantMsg.role).toBe('assistant')
    expect(assistantMsg.sql).toBe('SELECT * FROM sales WHERE month = 1')
    expect(assistantMsg.chartType).toBe('bar')
    expect(assistantMsg.result).not.toBeNull()
    expect(assistantMsg.result?.columns).toEqual(['id', 'amount'])
    expect(assistantMsg.result?.rows).toHaveLength(1)
    expect(assistantMsg.isStreaming).toBe(false)

    // createdAt が Date オブジェクトに変換されていること
    expect(userMsg.createdAt).toBeInstanceOf(Date)
    expect(assistantMsg.createdAt).toBeInstanceOf(Date)
  })

  /**
   * 【テスト対象】useHistory の loadConversation
   * 【テスト内容】存在しない会話ID（404）の場合はエラーをスローする
   * 【期待結果】「会話が見つかりません」エラーがスローされること
   */
  it('should throw error when conversation is not found (404)', async () => {
    // Arrange
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: '指定された会話が見つかりません。' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }),
      )

    const { result } = renderHook(() => useHistory())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Act & Assert: エラーがスローされること
    await expect(
      result.current.loadConversation('non-existent-id'),
    ).rejects.toThrow('会話が見つかりません')
  })

  /**
   * 【テスト対象】useHistory の loadConversation
   * 【テスト内容】queryResult が null のアシスタントメッセージを正しく変換する
   * 【期待結果】result フィールドが null であること（クラッシュしないこと）
   */
  it('should handle null queryResult in assistant message', async () => {
    // Arrange: queryResult が null のメッセージを含む詳細データ
    const detailWithNullResult = {
      ...mockConversationDetail,
      messages: [
        {
          id: 'msg-003',
          role: 'user' as const,
          content: 'テスト質問',
          sql: null,
          chartType: null,
          queryResult: null,  // null の場合
          error: null,
          createdAt: '2024-01-03T10:00:00.000Z',
        },
        {
          id: 'msg-004',
          role: 'assistant' as const,
          content: 'エラーが発生しました',
          sql: null,
          chartType: null,
          queryResult: null,  // エラー時は null
          error: 'SQL実行エラー',
          createdAt: '2024-01-03T10:00:05.000Z',
        },
      ],
    }

    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(detailWithNullResult), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )

    const { result } = renderHook(() => useHistory())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Act
    let messages: ReturnType<typeof result.current.loadConversation> extends Promise<infer T> ? T : never = []
    await act(async () => {
      messages = await result.current.loadConversation(mockConversationDetail.id)
    })

    // Assert: result が null でもクラッシュしないこと
    expect(messages).toHaveLength(2)
    expect(messages[0].result).toBeNull()
    expect(messages[1].result).toBeNull()
    expect(messages[1].error).toBe('SQL実行エラー')
  })
})
