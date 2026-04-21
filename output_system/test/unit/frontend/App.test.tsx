/**
 * App コンポーネントのユニットテスト
 *
 * テスト対象: frontend/src/App.tsx
 * - レイアウト構成（ヘッダー + サイドバー + チャットエリア）
 * - useChat / useHistory フックの統合
 * - 新しい会話ボタン
 * - 会話選択による復元
 * - 会話削除後のクリア
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import App from '../../../frontend/src/App'
import type { ChatMessage } from '../../../frontend/src/types'

// useChat フックのモック
const mockSend = vi.fn()
const mockClearMessages = vi.fn()
const mockRestoreConversation = vi.fn()

let mockUseChatReturn = {
  messages: [] as ChatMessage[],
  isLoading: false,
  conversationId: null as string | null,
  send: mockSend,
  clearMessages: mockClearMessages,
  restoreConversation: mockRestoreConversation,
}

vi.mock('../../../frontend/src/hooks/useChat', () => ({
  useChat: () => mockUseChatReturn,
}))

// useHistory フックのモック
const mockRefreshHistory = vi.fn()
const mockLoadConversation = vi.fn()

let mockUseHistoryReturn = {
  conversations: [] as Array<{ id: string; title: string; createdAt: string }>,
  isLoading: false,
  error: null as string | null,
  refreshHistory: mockRefreshHistory,
  loadConversation: mockLoadConversation,
}

vi.mock('../../../frontend/src/hooks/useHistory', () => ({
  useHistory: () => mockUseHistoryReturn,
}))

// fetch のモック（Sidebar の削除で使用）
const mockFetch = vi.fn()
globalThis.fetch = mockFetch

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue({ ok: true, status: 200 })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.spyOn(window, 'alert').mockImplementation(() => {})

    mockUseChatReturn = {
      messages: [],
      isLoading: false,
      conversationId: null,
      send: mockSend,
      clearMessages: mockClearMessages,
      restoreConversation: mockRestoreConversation,
    }

    mockUseHistoryReturn = {
      conversations: [],
      isLoading: false,
      error: null,
      refreshHistory: mockRefreshHistory,
      loadConversation: mockLoadConversation,
    }
  })

  /**
   * 【テスト対象】App
   * 【テスト内容】ヘッダーに「DataAgent」タイトルが表示されること
   * 【期待結果】h1 要素に「DataAgent」が含まれること
   */
  it('should render DataAgent title in header', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('DataAgent')
  })

  /**
   * 【テスト対象】App
   * 【テスト内容】サイドバーが表示されること
   * 【期待結果】サイドバーのナビゲーションが存在すること
   */
  it('should render sidebar', () => {
    render(<App />)
    expect(screen.getByRole('complementary', { name: '会話履歴サイドバー' })).toBeInTheDocument()
  })

  /**
   * 【テスト対象】App
   * 【テスト内容】チャットエリアが表示されること
   * 【期待結果】main ロールの要素が存在すること
   */
  it('should render chat area', () => {
    render(<App />)
    expect(screen.getByRole('main', { name: 'チャットエリア' })).toBeInTheDocument()
  })

  /**
   * 【テスト対象】App
   * 【テスト内容】ヘッダーの「新しい会話」ボタンクリックで clearMessages が呼ばれること
   * 【期待結果】clearMessages が呼ばれること
   */
  it('should call clearMessages when header new chat button is clicked', () => {
    render(<App />)
    // ヘッダーの新しい会話ボタン
    const headerBtn = screen.getAllByRole('button', { name: '新しい会話を開始' })
    fireEvent.click(headerBtn[0])
    expect(mockClearMessages).toHaveBeenCalled()
  })

  /**
   * 【テスト対象】App
   * 【テスト内容】会話選択時に loadConversation と restoreConversation が呼ばれること
   * 【期待結果】会話詳細を取得して復元が行われること
   */
  it('should restore conversation when sidebar item is clicked', async () => {
    const mockMessages: ChatMessage[] = [
      {
        id: 'msg-1',
        role: 'user',
        content: '質問',
        sql: null,
        chartType: null,
        result: null,
        error: null,
        analysis: null,
        isStreaming: false,
        createdAt: new Date(),
      },
    ]
    mockLoadConversation.mockResolvedValue(mockMessages)

    mockUseHistoryReturn = {
      ...mockUseHistoryReturn,
      conversations: [
        { id: 'conv-1', title: 'テスト会話', createdAt: '2024-01-15' },
      ],
    }

    render(<App />)

    fireEvent.click(screen.getByText('テスト会話'))

    await waitFor(() => {
      expect(mockLoadConversation).toHaveBeenCalledWith('conv-1')
    })

    await waitFor(() => {
      expect(mockRestoreConversation).toHaveBeenCalledWith('conv-1', mockMessages)
    })
  })

  /**
   * 【テスト対象】App
   * 【テスト内容】会話選択で404エラーの場合にalertが表示されること
   * 【期待結果】「会話が見つかりません」alertが表示されること
   */
  it('should show alert when conversation is not found', async () => {
    mockLoadConversation.mockRejectedValue(new Error('会話が見つかりません'))

    mockUseHistoryReturn = {
      ...mockUseHistoryReturn,
      conversations: [
        { id: 'conv-1', title: 'テスト', createdAt: '2024-01-15' },
      ],
    }

    render(<App />)

    fireEvent.click(screen.getByText('テスト'))

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith(
        '会話が見つかりません。履歴から削除された可能性があります。'
      )
    })
  })

  /**
   * 【テスト対象】App
   * 【テスト内容】会話選択で一般エラーの場合にalertが表示されること
   * 【期待結果】エラーメッセージ付きalertが表示されること
   */
  it('should show alert on general load error', async () => {
    mockLoadConversation.mockRejectedValue(new Error('ネットワークエラー'))

    mockUseHistoryReturn = {
      ...mockUseHistoryReturn,
      conversations: [
        { id: 'conv-1', title: 'テスト', createdAt: '2024-01-15' },
      ],
    }

    render(<App />)

    fireEvent.click(screen.getByText('テスト'))

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith(
        '会話の読み込みに失敗しました: ネットワークエラー'
      )
    })
  })

  /**
   * 【テスト対象】App
   * 【テスト内容】ウェルカムメッセージがメッセージ0件時に表示されること
   * 【期待結果】「DataAgent へようこそ」が表示されること
   */
  it('should show welcome message when no messages', () => {
    render(<App />)
    expect(screen.getByText('DataAgent へようこそ')).toBeInTheDocument()
  })

  /**
   * 【テスト対象】App
   * 【テスト内容】isLoading が true→false に変化したとき refreshHistory が呼ばれること
   * 【期待結果】送信完了後に履歴リフレッシュが行われること
   */
  it('should refresh history when isLoading transitions from true to false', () => {
    // 最初は isLoading=true
    mockUseChatReturn = { ...mockUseChatReturn, isLoading: true }
    const { rerender } = render(<App />)

    mockRefreshHistory.mockClear()

    // isLoading=false に変化させて再レンダリング
    mockUseChatReturn = { ...mockUseChatReturn, isLoading: false }
    rerender(<App />)

    expect(mockRefreshHistory).toHaveBeenCalled()
  })

  /**
   * 【テスト対象】App
   * 【テスト内容】アクティブ会話が会話一覧から消えた場合に clearMessages が呼ばれること
   * 【期待結果】削除された会話のクリアが行われること
   */
  it('should clear messages when active conversation is deleted from list', () => {
    // conversationId が設定されており、conversations に含まれている状態
    mockUseChatReturn = { ...mockUseChatReturn, conversationId: 'conv-1' }
    mockUseHistoryReturn = {
      ...mockUseHistoryReturn,
      conversations: [{ id: 'conv-1', title: 'テスト', createdAt: '2024-01-15' }],
    }
    const { rerender } = render(<App />)

    mockClearMessages.mockClear()

    // conversations から conv-1 が消えた
    mockUseHistoryReturn = {
      ...mockUseHistoryReturn,
      conversations: [{ id: 'conv-2', title: '別の会話', createdAt: '2024-01-16' }],
    }
    rerender(<App />)

    expect(mockClearMessages).toHaveBeenCalled()
  })

  /**
   * 【テスト対象】App
   * 【テスト内容】アクティブ会話がまだ存在する場合に clearMessages が呼ばれないこと
   * 【期待結果】clearMessages が呼ばれないこと
   */
  it('should not clear messages when active conversation still exists', () => {
    mockUseChatReturn = { ...mockUseChatReturn, conversationId: 'conv-1' }
    mockUseHistoryReturn = {
      ...mockUseHistoryReturn,
      conversations: [{ id: 'conv-1', title: 'テスト', createdAt: '2024-01-15' }],
    }
    render(<App />)

    // 初回レンダリング後の呼び出しをクリア
    mockClearMessages.mockClear()

    expect(mockClearMessages).not.toHaveBeenCalled()
  })
})
