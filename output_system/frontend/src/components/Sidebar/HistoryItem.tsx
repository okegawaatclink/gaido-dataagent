/**
 * HistoryItem コンポーネント
 *
 * サイドバーに表示される会話履歴の1件のアイテム。
 * クリックで会話を復元し、×ボタンで削除できる。
 *
 * PBI #13 (Epic 4 - 履歴管理) で本実装。
 * - クリック: 会話詳細を取得してチャットエリアに復元
 * - ×ボタン: 削除確認ダイアログ→DELETE /api/history/:id
 * - アクティブ状態: 現在表示中の会話をハイライト表示
 */

import type { FC } from 'react'

/**
 * HistoryItem コンポーネントの Props
 *
 * @property id        - 会話ID（UUID v4）
 * @property title     - 会話のタイトル（最初の質問テキスト）
 * @property isActive  - 現在アクティブな会話かどうか（ハイライト表示に使用）
 * @property onClick   - クリック時のコールバック（会話IDを引数に渡す）
 * @property onDelete  - 削除ボタンクリック時のコールバック（会話IDを引数に渡す）
 */
interface HistoryItemProps {
  id: string
  title: string
  isActive?: boolean
  onClick?: (id: string) => void
  onDelete?: (id: string) => void
}

/**
 * 会話履歴アイテムコンポーネント
 *
 * アイテム全体をクリックすると会話を復元する。
 * ホバー時に表示される×ボタンで削除確認ダイアログを表示し、
 * 確認後に親コンポーネントに削除を委譲する。
 *
 * @param props - HistoryItemProps
 */
const HistoryItem: FC<HistoryItemProps> = ({
  id,
  title,
  isActive = false,
  onClick,
  onDelete,
}) => {
  /**
   * アイテムクリック時のハンドラ
   * 親コンポーネントに会話IDを渡して会話を復元させる
   */
  const handleClick = () => {
    onClick?.(id)
  }

  /**
   * 削除ボタンクリック時のハンドラ
   *
   * ブラウザの confirm ダイアログで削除確認を行い、
   * 承認された場合のみ親コンポーネントに削除を委譲する。
   * 削除ボタンのクリックイベントがアイテム全体のクリックに伝播しないよう
   * stopPropagation() を呼ぶ。
   *
   * @param e - マウスイベント
   */
  const handleDeleteClick = (e: React.MouseEvent) => {
    // アイテム本体のクリックハンドラ（会話選択）に伝播させない
    e.stopPropagation()

    // 削除確認ダイアログ（MVP: ブラウザのconfirmで十分）
    const confirmed = window.confirm(`この会話を削除しますか？\n「${title}」`)
    if (confirmed) {
      onDelete?.(id)
    }
  }

  return (
    <div
      className={`history-item ${isActive ? 'history-item--active' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`会話: ${title}`}
      aria-current={isActive ? 'page' : undefined}
      onClick={handleClick}
      onKeyDown={(e) => {
        // キーボードアクセシビリティ: Enter/Space でクリックと同等の動作
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleClick()
        }
      }}
    >
      {/* 会話アイコン */}
      <span className="history-item__icon" aria-hidden="true">
        💬
      </span>
      {/* タイトル（長い場合は省略表示） */}
      <span className="history-item__title">{title}</span>
      {/* 削除ボタン（ホバー時に表示） */}
      <button
        className="history-item__delete-btn"
        onClick={handleDeleteClick}
        type="button"
        aria-label={`会話「${title}」を削除`}
        title="この会話を削除"
      >
        ×
      </button>
    </div>
  )
}

export default HistoryItem
