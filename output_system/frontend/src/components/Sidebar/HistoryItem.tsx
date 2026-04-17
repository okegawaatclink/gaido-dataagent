/**
 * HistoryItem コンポーネント
 *
 * サイドバーに表示される会話履歴の1件のアイテム。
 * クリックで会話を切り替える（履歴機能は Epic 4 で本実装）。
 *
 * PBI #9 スコープ: プレースホルダー表示のみ
 * Epic 4 で実際の履歴データと接続する。
 */

import type { FC } from 'react'

/**
 * HistoryItem コンポーネントの Props
 *
 * @property id        - 会話ID
 * @property title     - 会話のタイトル（最初の質問テキストを使用）
 * @property isActive  - 現在アクティブな会話かどうか
 * @property onClick   - クリック時のコールバック
 */
interface HistoryItemProps {
  id: string
  title: string
  isActive?: boolean
  onClick?: (id: string) => void
}

/**
 * 会話履歴アイテムコンポーネント
 *
 * @param props - HistoryItemProps
 */
const HistoryItem: FC<HistoryItemProps> = ({
  id,
  title,
  isActive = false,
  onClick,
}) => {
  return (
    <button
      className={`history-item ${isActive ? 'history-item--active' : ''}`}
      onClick={() => onClick?.(id)}
      type="button"
      aria-label={`会話: ${title}`}
      aria-current={isActive ? 'page' : undefined}
    >
      {/* 会話アイコン */}
      <span className="history-item__icon" aria-hidden="true">
        💬
      </span>
      {/* タイトル（長い場合は省略表示） */}
      <span className="history-item__title">{title}</span>
    </button>
  )
}

export default HistoryItem
