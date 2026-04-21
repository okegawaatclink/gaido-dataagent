/**
 * Sidebar コンポーネント
 *
 * 左サイドバー（幅250px）。会話履歴一覧と検索ボックスを表示する。
 *
 * PBI #13 (Epic 4 - 履歴管理) 本実装:
 * - GET /api/history で実際の会話一覧を取得して表示
 * - 検索ボックスで履歴タイトルを部分一致フィルタ
 * - アイテムクリックで会話を復元（onSelectConversation コールバック）
 * - ×ボタンで会話を削除（DELETE /api/history/:id）
 * - 新しい会話ボタンで空のチャットエリアに遷移
 * - 現在の会話（activeConversationId）をアクティブ状態でハイライト
 * - API エラー時はエラーメッセージを表示
 *
 * screens.md ワイヤーフレーム準拠:
 * - 幅250px
 * - 検索ボックス
 * - 履歴アイテム一覧
 */

import { type FC, useState, useCallback } from 'react'
import HistoryItem from './HistoryItem'
import type { ConversationSummary } from '../../hooks/useHistory'
import { buildApiUrl } from '../../services/api'

/**
 * Sidebar コンポーネントの Props
 *
 * @property conversations         - 表示する会話一覧（useHistory から渡す）
 * @property isLoading             - 会話一覧取得中フラグ
 * @property historyError          - 会話一覧取得エラーメッセージ
 * @property activeConversationId  - 現在アクティブな会話のID（ハイライト表示用）
 * @property onNewChat             - 「新しい会話」ボタンクリック時のコールバック
 * @property onSelectConversation  - 会話アイテムクリック時のコールバック（会話IDを引数に渡す）
 * @property onHistoryRefresh      - 履歴削除後などにリフレッシュを要求するコールバック
 */
interface SidebarProps {
  conversations: ConversationSummary[]
  isLoading: boolean
  historyError: string | null
  activeConversationId: string | null
  onNewChat: () => void
  onSelectConversation: (id: string) => void
  onHistoryRefresh: () => void
}

/**
 * 左サイドバーコンポーネント
 *
 * 会話一覧を表示し、クリックで会話を復元、×ボタンで削除できる。
 * 検索ボックスでタイトルの部分一致フィルタが可能。
 *
 * @param props - SidebarProps
 */
const Sidebar: FC<SidebarProps> = ({
  conversations,
  isLoading,
  historyError,
  activeConversationId,
  onNewChat,
  onSelectConversation,
  onHistoryRefresh,
}) => {
  /**
   * 検索ボックスの入力値
   * 部分一致フィルタに使用する
   */
  const [searchQuery, setSearchQuery] = useState('')

  /**
   * 削除処理中の会話IDセット（削除中はUIを無効化する）
   * 複数削除の同時実行を考慮してSetで管理する
   */
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())

  /**
   * 検索ボックスの入力変更ハンドラ
   */
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value)
  }

  /**
   * 会話削除ハンドラ
   *
   * DELETE /api/history/:id を呼び出して会話を削除し、
   * 成功後に親コンポーネントに履歴リフレッシュを要求する。
   * 削除した会話が現在アクティブな会話だった場合、
   * 親コンポーネントの onNewChat を呼んで空チャットに戻す処理は
   * App.tsx 側で activeConversationId との比較で行う。
   *
   * @param id - 削除する会話のID
   */
  const handleDelete = useCallback(async (id: string) => {
    // 既に削除中の場合はスキップ
    if (deletingIds.has(id)) return

    // 削除中フラグを立てる
    setDeletingIds((prev) => new Set(prev).add(id))

    try {
      const url = buildApiUrl(`/api/history/${encodeURIComponent(id)}`)
      const response = await fetch(url, { method: 'DELETE' })

      if (response.status === 404) {
        // すでに削除済みの場合はリフレッシュして一覧を更新するだけ
        console.warn(`[Sidebar] Conversation ${id} not found (already deleted?)`)
        onHistoryRefresh()
        return
      }

      if (!response.ok) {
        console.error(`[Sidebar] DELETE /api/history/${id} failed: ${response.status}`)
        alert('削除に失敗しました。もう一度お試しください。')
        return
      }

      // 削除成功: 履歴一覧をリフレッシュ
      onHistoryRefresh()
    } catch (err) {
      console.error('[Sidebar] delete error:', err)
      alert('削除中にエラーが発生しました。接続を確認してください。')
    } finally {
      // 削除中フラグを解除
      setDeletingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }, [deletingIds, onHistoryRefresh])

  /**
   * 検索クエリで会話一覧をフィルタリングする
   * 大文字小文字を区別しない部分一致フィルタ
   */
  const filteredConversations = searchQuery
    ? conversations.filter((conv) =>
        conv.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : conversations

  return (
    <aside
      className="sidebar"
      aria-label="会話履歴サイドバー"
      style={{ width: '250px' }}
    >
      {/* 新しい会話ボタン */}
      <div className="sidebar-new-chat">
        <button
          className="sidebar-new-chat-btn"
          onClick={onNewChat}
          type="button"
          aria-label="新しい会話を開始"
        >
          <span aria-hidden="true">＋</span>
          新しい会話
        </button>
      </div>

      {/* 検索ボックス */}
      <div className="sidebar-search">
        <input
          className="sidebar-search-input"
          type="search"
          placeholder="履歴を検索..."
          aria-label="会話履歴を検索"
          value={searchQuery}
          onChange={handleSearchChange}
        />
      </div>

      {/* 履歴一覧 */}
      <nav className="sidebar-history" aria-label="会話履歴">
        {/* ローディング表示 */}
        {isLoading && (
          <p className="sidebar-history-loading" aria-live="polite">
            読み込み中...
          </p>
        )}

        {/* エラー表示 */}
        {historyError && !isLoading && (
          <p className="sidebar-history-error" role="alert">
            {historyError}
          </p>
        )}

        {/* 履歴が空の場合 */}
        {!isLoading && !historyError && filteredConversations.length === 0 && (
          <p className="sidebar-history-empty">
            {searchQuery ? '検索結果がありません' : 'まだ会話履歴がありません'}
          </p>
        )}

        {/* 履歴一覧（検索フィルタ適用後） */}
        {!isLoading && filteredConversations.length > 0 && (
          <>
            <p className="sidebar-history-placeholder-label">
              過去の会話
            </p>
            {filteredConversations.map((conv) => (
              <HistoryItem
                key={conv.id}
                id={conv.id}
                title={conv.title}
                createdAt={conv.createdAt}
                isActive={conv.id === activeConversationId}
                onClick={onSelectConversation}
                onDelete={deletingIds.has(conv.id) ? undefined : handleDelete}
              />
            ))}
          </>
        )}
      </nav>
    </aside>
  )
}

export default Sidebar
