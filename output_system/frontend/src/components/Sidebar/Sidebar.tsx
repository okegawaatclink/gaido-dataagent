/**
 * Sidebar コンポーネント
 *
 * 左サイドバー（幅250px）。会話履歴一覧と検索ボックスを表示する。
 *
 * PBI #9 スコープ: 以下を実装
 * - 検索ボックス（プレースホルダー表示のみ）
 * - 履歴一覧プレースホルダー（Epic 4 で本実装）
 *
 * screens.md ワイヤーフレーム準拠:
 * - 幅250px
 * - 検索ボックス
 * - 履歴アイテム一覧
 */

import { type FC } from 'react'
import HistoryItem from './HistoryItem'

/**
 * Sidebar コンポーネントの Props
 *
 * @property onNewChat - 「新しい会話」ボタンクリック時のコールバック
 */
interface SidebarProps {
  onNewChat: () => void
}

/**
 * プレースホルダー用のサンプル履歴データ
 * Epic 4 で実際のAPIデータに置き換える
 */
const PLACEHOLDER_HISTORY = [
  { id: 'h1', title: '売上の月別推移を教えて' },
  { id: 'h2', title: '部門別の人数は？' },
  { id: 'h3', title: '先月の注文トップ10' },
]

/**
 * 左サイドバーコンポーネント
 *
 * @param props - SidebarProps
 */
const Sidebar: FC<SidebarProps> = ({ onNewChat }) => {
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
          // Epic 4 で検索機能を実装（現在はプレースホルダー）
          readOnly
        />
      </div>

      {/* 履歴一覧 */}
      <nav className="sidebar-history" aria-label="会話履歴">
        {/* Epic 4 実装前のプレースホルダー */}
        <p className="sidebar-history-placeholder-label">
          過去の会話
        </p>
        {PLACEHOLDER_HISTORY.map((item) => (
          <HistoryItem
            key={item.id}
            id={item.id}
            title={item.title}
            isActive={false}
            // Epic 4 で会話切り替え機能を実装
            onClick={() => {}}
          />
        ))}
        {/* 履歴が実装されていない旨のノート（開発中表示） */}
        <p className="sidebar-history-note">
          ※ 履歴機能は今後のアップデートで対応予定です
        </p>
      </nav>
    </aside>
  )
}

export default Sidebar
