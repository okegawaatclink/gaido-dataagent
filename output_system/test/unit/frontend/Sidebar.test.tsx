/**
 * Sidebar コンポーネントのユニットテスト
 *
 * テスト対象: frontend/src/components/Sidebar/Sidebar.tsx
 * - 会話一覧の表示
 * - 検索フィルタ
 * - 新しい会話ボタン
 * - 削除機能（DELETE API呼び出し）
 * - ローディング/エラー/空状態
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import Sidebar from '../../../frontend/src/components/Sidebar/Sidebar'
import type { ConversationSummary } from '../../../frontend/src/hooks/useHistory'

// fetch のグローバルモック
const mockFetch = vi.fn()

const sampleConversations: ConversationSummary[] = [
  { id: 'conv-1', title: '売上トップ10を教えて', createdAt: '2024-01-15T10:00:00Z' },
  { id: 'conv-2', title: '部門別の人数', createdAt: '2024-01-14T09:00:00Z' },
  { id: 'conv-3', title: '在庫一覧の確認', createdAt: '2024-01-13T08:00:00Z' },
]

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = mockFetch
    mockFetch.mockResolvedValue({ ok: true, status: 200 })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.spyOn(window, 'alert').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /**
   * 【テスト対象】Sidebar
   * 【テスト内容】新しい会話ボタンが表示されること
   * 【期待結果】「新しい会話を開始」ボタンが存在すること
   */
  it('should render new chat button', () => {
    render(
      <Sidebar
        conversations={[]}
        isLoading={false}
        historyError={null}
        activeConversationId={null}
        onNewChat={vi.fn()}
        onSelectConversation={vi.fn()}
        onHistoryRefresh={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: '新しい会話を開始' })).toBeInTheDocument()
  })

  /**
   * 【テスト対象】Sidebar
   * 【テスト内容】新しい会話ボタンクリックで onNewChat が呼ばれること
   * 【期待結果】onNewChat コールバックが呼ばれること
   */
  it('should call onNewChat when new chat button is clicked', () => {
    const onNewChat = vi.fn()
    render(
      <Sidebar
        conversations={[]}
        isLoading={false}
        historyError={null}
        activeConversationId={null}
        onNewChat={onNewChat}
        onSelectConversation={vi.fn()}
        onHistoryRefresh={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '新しい会話を開始' }))
    expect(onNewChat).toHaveBeenCalledOnce()
  })

  /**
   * 【テスト対象】Sidebar
   * 【テスト内容】会話一覧が表示されること
   * 【期待結果】各会話のタイトルがDOMに存在すること
   */
  it('should render conversation list', () => {
    render(
      <Sidebar
        conversations={sampleConversations}
        isLoading={false}
        historyError={null}
        activeConversationId={null}
        onNewChat={vi.fn()}
        onSelectConversation={vi.fn()}
        onHistoryRefresh={vi.fn()}
      />
    )

    expect(screen.getByText('売上トップ10を教えて')).toBeInTheDocument()
    expect(screen.getByText('部門別の人数')).toBeInTheDocument()
    expect(screen.getByText('在庫一覧の確認')).toBeInTheDocument()
  })

  /**
   * 【テスト対象】Sidebar
   * 【テスト内容】検索ボックスで会話をフィルタできること
   * 【期待結果】検索クエリに一致する会話のみ表示されること
   */
  it('should filter conversations by search query', () => {
    render(
      <Sidebar
        conversations={sampleConversations}
        isLoading={false}
        historyError={null}
        activeConversationId={null}
        onNewChat={vi.fn()}
        onSelectConversation={vi.fn()}
        onHistoryRefresh={vi.fn()}
      />
    )

    const searchInput = screen.getByRole('searchbox')
    fireEvent.change(searchInput, { target: { value: '売上' } })

    expect(screen.getByText('売上トップ10を教えて')).toBeInTheDocument()
    expect(screen.queryByText('部門別の人数')).not.toBeInTheDocument()
    expect(screen.queryByText('在庫一覧の確認')).not.toBeInTheDocument()
  })

  /**
   * 【テスト対象】Sidebar
   * 【テスト内容】検索結果が0件の場合に適切なメッセージが表示されること
   * 【期待結果】「検索結果がありません」が表示されること
   */
  it('should show no results message when search has no matches', () => {
    render(
      <Sidebar
        conversations={sampleConversations}
        isLoading={false}
        historyError={null}
        activeConversationId={null}
        onNewChat={vi.fn()}
        onSelectConversation={vi.fn()}
        onHistoryRefresh={vi.fn()}
      />
    )

    const searchInput = screen.getByRole('searchbox')
    fireEvent.change(searchInput, { target: { value: 'zzzzz' } })

    expect(screen.getByText('検索結果がありません')).toBeInTheDocument()
  })

  /**
   * 【テスト対象】Sidebar
   * 【テスト内容】会話が空の場合に「まだ会話履歴がありません」が表示されること
   * 【期待結果】空メッセージが表示されること
   */
  it('should show empty message when no conversations', () => {
    render(
      <Sidebar
        conversations={[]}
        isLoading={false}
        historyError={null}
        activeConversationId={null}
        onNewChat={vi.fn()}
        onSelectConversation={vi.fn()}
        onHistoryRefresh={vi.fn()}
      />
    )
    expect(screen.getByText('まだ会話履歴がありません')).toBeInTheDocument()
  })

  /**
   * 【テスト対象】Sidebar
   * 【テスト内容】ローディング中に「読み込み中...」が表示されること
   * 【期待結果】ローディングメッセージが存在すること
   */
  it('should show loading message when isLoading', () => {
    render(
      <Sidebar
        conversations={[]}
        isLoading={true}
        historyError={null}
        activeConversationId={null}
        onNewChat={vi.fn()}
        onSelectConversation={vi.fn()}
        onHistoryRefresh={vi.fn()}
      />
    )
    expect(screen.getByText('読み込み中...')).toBeInTheDocument()
  })

  /**
   * 【テスト対象】Sidebar
   * 【テスト内容】エラー時にエラーメッセージが表示されること
   * 【期待結果】historyError のテキストが表示されること
   */
  it('should show error message when historyError is set', () => {
    render(
      <Sidebar
        conversations={[]}
        isLoading={false}
        historyError="接続エラー"
        activeConversationId={null}
        onNewChat={vi.fn()}
        onSelectConversation={vi.fn()}
        onHistoryRefresh={vi.fn()}
      />
    )
    expect(screen.getByText('接続エラー')).toBeInTheDocument()
  })

  /**
   * 【テスト対象】Sidebar
   * 【テスト内容】会話アイテムクリックで onSelectConversation が呼ばれること
   * 【期待結果】クリックした会話のIDが渡されること
   */
  it('should call onSelectConversation when conversation item is clicked', () => {
    const onSelect = vi.fn()
    render(
      <Sidebar
        conversations={sampleConversations}
        isLoading={false}
        historyError={null}
        activeConversationId={null}
        onNewChat={vi.fn()}
        onSelectConversation={onSelect}
        onHistoryRefresh={vi.fn()}
      />
    )

    fireEvent.click(screen.getByText('売上トップ10を教えて'))
    expect(onSelect).toHaveBeenCalledWith('conv-1')
  })

  /**
   * 【テスト対象】Sidebar
   * 【テスト内容】削除成功後に onHistoryRefresh が呼ばれること
   * 【期待結果】DELETE API 呼び出し後にリフレッシュが要求されること
   */
  it('should call onHistoryRefresh after successful delete', async () => {
    const onHistoryRefresh = vi.fn()
    mockFetch.mockResolvedValue({ ok: true, status: 200 })

    render(
      <Sidebar
        conversations={sampleConversations}
        isLoading={false}
        historyError={null}
        activeConversationId={null}
        onNewChat={vi.fn()}
        onSelectConversation={vi.fn()}
        onHistoryRefresh={onHistoryRefresh}
      />
    )

    // 削除ボタンをクリック
    const deleteButtons = screen.getAllByRole('button', { name: /削除/ })
    fireEvent.click(deleteButtons[0])

    await waitFor(() => {
      expect(onHistoryRefresh).toHaveBeenCalled()
    })
  })

  /**
   * 【テスト対象】Sidebar
   * 【テスト内容】DELETE が404の場合もリフレッシュが呼ばれること
   * 【期待結果】404レスポンスでもリフレッシュが要求されること
   */
  it('should refresh on 404 delete response', async () => {
    const onHistoryRefresh = vi.fn()
    mockFetch.mockResolvedValue({ ok: false, status: 404 })

    render(
      <Sidebar
        conversations={sampleConversations}
        isLoading={false}
        historyError={null}
        activeConversationId={null}
        onNewChat={vi.fn()}
        onSelectConversation={vi.fn()}
        onHistoryRefresh={onHistoryRefresh}
      />
    )

    const deleteButtons = screen.getAllByRole('button', { name: /削除/ })
    fireEvent.click(deleteButtons[0])

    await waitFor(() => {
      expect(onHistoryRefresh).toHaveBeenCalled()
    })
  })

  /**
   * 【テスト対象】Sidebar
   * 【テスト内容】DELETE がサーバーエラーの場合にalertが表示されること
   * 【期待結果】alert が「削除に失敗しました」で呼ばれること
   */
  it('should show alert on delete server error', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 })

    render(
      <Sidebar
        conversations={sampleConversations}
        isLoading={false}
        historyError={null}
        activeConversationId={null}
        onNewChat={vi.fn()}
        onSelectConversation={vi.fn()}
        onHistoryRefresh={vi.fn()}
      />
    )

    const deleteButtons = screen.getAllByRole('button', { name: /削除/ })
    fireEvent.click(deleteButtons[0])

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('削除に失敗しました。もう一度お試しください。')
    })
  })

  /**
   * 【テスト対象】Sidebar
   * 【テスト内容】DELETE がネットワークエラーの場合にalertが表示されること
   * 【期待結果】alert が「削除中にエラーが発生しました」で呼ばれること
   */
  it('should show alert on delete network error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))

    render(
      <Sidebar
        conversations={sampleConversations}
        isLoading={false}
        historyError={null}
        activeConversationId={null}
        onNewChat={vi.fn()}
        onSelectConversation={vi.fn()}
        onHistoryRefresh={vi.fn()}
      />
    )

    const deleteButtons = screen.getAllByRole('button', { name: /削除/ })
    fireEvent.click(deleteButtons[0])

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('削除中にエラーが発生しました。接続を確認してください。')
    })
  })

  /**
   * 【テスト対象】Sidebar
   * 【テスト内容】アクティブな会話がハイライトされること
   * 【期待結果】activeConversationId に一致するアイテムにactive クラスが付与されること
   */
  it('should highlight active conversation', () => {
    const { container } = render(
      <Sidebar
        conversations={sampleConversations}
        isLoading={false}
        historyError={null}
        activeConversationId="conv-2"
        onNewChat={vi.fn()}
        onSelectConversation={vi.fn()}
        onHistoryRefresh={vi.fn()}
      />
    )
    const activeItems = container.querySelectorAll('.history-item--active')
    expect(activeItems).toHaveLength(1)
  })

  /**
   * 【テスト対象】Sidebar
   * 【テスト内容】検索ボックスが表示されること
   * 【期待結果】searchbox ロールの要素が存在すること
   */
  it('should render search input', () => {
    render(
      <Sidebar
        conversations={[]}
        isLoading={false}
        historyError={null}
        activeConversationId={null}
        onNewChat={vi.fn()}
        onSelectConversation={vi.fn()}
        onHistoryRefresh={vi.fn()}
      />
    )
    expect(screen.getByRole('searchbox')).toBeInTheDocument()
  })
})
