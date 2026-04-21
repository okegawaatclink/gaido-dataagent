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
 *
 * PBI #151 更新:
 * - createdAt prop を追加して作成日時を表示する（screens.md サイドバーUI 準拠）
 */

import type { FC } from 'react'

/**
 * HistoryItem コンポーネントの Props
 *
 * @property id        - 会話ID（UUID v4）
 * @property title     - 会話のタイトル（最初の質問テキスト）
 * @property createdAt - 会話の作成日時（ISO 8601 文字列。省略時は表示しない）
 * @property isActive  - 現在アクティブな会話かどうか（ハイライト表示に使用）
 * @property onClick   - クリック時のコールバック（会話IDを引数に渡す）
 * @property onDelete  - 削除ボタンクリック時のコールバック（会話IDを引数に渡す）
 */
interface HistoryItemProps {
  id: string
  title: string
  createdAt?: string
  isActive?: boolean
  onClick?: (id: string) => void
  onDelete?: (id: string) => void
}

/**
 * ISO 8601 日付文字列をロケール対応の短い日時文字列に変換する
 *
 * 表示形式: MM/DD HH:mm（例: "01/15 14:30"）
 * 変換に失敗した場合は空文字を返す（エラー耐性）。
 *
 * @param isoString - ISO 8601 形式の日付文字列（例: "2024-01-15T14:30:00.000Z"）
 * @returns フォーマット済みの短い日時文字列（例: "01/15 14:30"）
 */
function formatCreatedAt(isoString: string): string {
  try {
    const date = new Date(isoString)
    // MM/DD HH:mm 形式にフォーマット（ロケールに依存しない一貫した表示）
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${month}/${day} ${hours}:${minutes}`
  } catch {
    return ''
  }
}

/**
 * 会話履歴アイテムコンポーネント
 *
 * アイテム全体をクリックすると会話を復元する。
 * ホバー時に表示される×ボタンで削除確認ダイアログを表示し、
 * 確認後に親コンポーネントに削除を委譲する。
 * createdAt が渡された場合は、タイトル下に作成日時を表示する。
 *
 * @param props - HistoryItemProps
 */
const HistoryItem: FC<HistoryItemProps> = ({
  id,
  title,
  createdAt,
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
      {/* タイトルと作成日時を縦に並べる */}
      <span className="history-item__content">
        {/* タイトル（長い場合は省略表示） */}
        <span className="history-item__title">{title}</span>
        {/* 作成日時（省略可能） */}
        {createdAt && (
          <span className="history-item__date" aria-label={`作成日時: ${createdAt}`}>
            {formatCreatedAt(createdAt)}
          </span>
        )}
      </span>
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
