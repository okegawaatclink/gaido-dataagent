/**
 * Toast コンポーネント
 *
 * 画面右上に一時的な通知を表示する共通コンポーネント。
 * 接続テスト結果（成功/失敗）やCRUD操作の結果通知に使用する。
 *
 * 設計方針:
 * - 画面右上に固定表示（position: fixed）
 * - 自動的に消える（duration ms 後）
 * - 成功（success）/失敗（error）/情報（info）の3種類に対応
 * - アクセシビリティ: role="alert" で通知内容をスクリーンリーダーに伝える
 *
 * 使い方:
 * ```tsx
 * const { toasts, showToast } = useToast()
 *
 * // 接続テスト成功時
 * showToast('接続に成功しました', 'success')
 *
 * // エラー時
 * showToast('接続に失敗しました: ...', 'error')
 *
 * // ToastContainer でレンダリング
 * <ToastContainer toasts={toasts} onRemove={removeToast} />
 * ```
 *
 * PBI #148 追加
 */

import { useState, useCallback, useEffect, type FC } from 'react'

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/**
 * トースト通知の種類
 * - success: 成功（緑色）
 * - error: エラー（赤色）
 * - info: 情報（青色）
 */
export type ToastType = 'success' | 'error' | 'info'

/**
 * トースト通知の1件分のデータ
 *
 * @property id       - 一意ID（自動生成）
 * @property message  - 表示するメッセージ
 * @property type     - トーストの種類（success/error/info）
 * @property duration - 表示時間（ミリ秒）。デフォルト: 4000ms
 */
export interface Toast {
  id: string
  message: string
  type: ToastType
  duration: number
}

// ---------------------------------------------------------------------------
// useToast フック
// ---------------------------------------------------------------------------

/**
 * トースト通知の状態管理フック
 *
 * Toast の追加・削除を管理する。
 * ToastContainer と組み合わせて使用する。
 *
 * @returns toasts - 現在表示中のトースト一覧
 * @returns showToast - トーストを追加する関数
 * @returns removeToast - トーストを手動削除する関数
 */
export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  /**
   * トースト通知を追加する
   *
   * 自動的に一意IDを生成し、指定された duration 後に自動削除する。
   *
   * @param message  - 表示するメッセージ
   * @param type     - トーストの種類（デフォルト: 'info'）
   * @param duration - 表示時間ミリ秒（デフォルト: 4000）
   */
  const showToast = useCallback(
    (message: string, type: ToastType = 'info', duration = 4000) => {
      // HTTP環境でも動作するIDを生成（crypto.randomUUID は HTTPS/localhost のみ）
      const id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

      const toast: Toast = { id, message, type, duration }
      setToasts((prev) => [...prev, toast])
    },
    [],
  )

  /**
   * 指定IDのトーストを削除する
   *
   * @param id - 削除するトーストのID
   */
  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return { toasts, showToast, removeToast }
}

// ---------------------------------------------------------------------------
// ToastItem コンポーネント（個別トースト）
// ---------------------------------------------------------------------------

/**
 * 個別トーストアイテムコンポーネント
 *
 * 表示開始後 duration ms が経過したら自動的に onRemove を呼び出す。
 *
 * @param toast    - 表示するトースト
 * @param onRemove - トースト削除コールバック
 */
const ToastItem: FC<{ toast: Toast; onRemove: (id: string) => void }> = ({
  toast,
  onRemove,
}) => {
  /**
   * duration ms 後に自動削除する
   * コンポーネントアンマウント時にタイマーをクリアする。
   */
  useEffect(() => {
    const timer = setTimeout(() => {
      onRemove(toast.id)
    }, toast.duration)

    return () => {
      clearTimeout(timer)
    }
  }, [toast.id, toast.duration, onRemove])

  return (
    <div
      className={`toast toast--${toast.type}`}
      role="alert"
      aria-live="polite"
      aria-atomic="true"
    >
      {/* トースト種別アイコン */}
      <span className="toast__icon" aria-hidden="true">
        {toast.type === 'success' && '✓'}
        {toast.type === 'error' && '✕'}
        {toast.type === 'info' && 'ℹ'}
      </span>
      {/* メッセージ本文 */}
      <span className="toast__message">{toast.message}</span>
      {/* 手動閉じるボタン */}
      <button
        className="toast__close"
        onClick={() => onRemove(toast.id)}
        type="button"
        aria-label="通知を閉じる"
      >
        ×
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ToastContainer コンポーネント
// ---------------------------------------------------------------------------

/**
 * トーストコンテナ
 *
 * 画面右上にトースト通知を積み上げて表示する。
 * useToast フックから取得した toasts と removeToast を渡す。
 *
 * @param toasts   - 表示するトースト一覧
 * @param onRemove - トースト削除コールバック
 */
export const ToastContainer: FC<{
  toasts: Toast[]
  onRemove: (id: string) => void
}> = ({ toasts, onRemove }) => {
  if (toasts.length === 0) return null

  return (
    <div className="toast-container" aria-label="通知エリア">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  )
}

export default ToastContainer
