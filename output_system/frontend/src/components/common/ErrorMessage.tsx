/**
 * ErrorMessage コンポーネント
 *
 * チャットメッセージ内でエラーが発生した際に表示するエラー表示コンポーネント。
 * ユーザーに「質問を変えてみてください」等のガイドを提示する。
 *
 * XSS対策: エラーメッセージはReactのデフォルト挙動（自動エスケープ）に任せる。
 * dangerouslySetInnerHTML は使用しない。
 */

import type { FC } from 'react'

/**
 * ErrorMessage コンポーネントの Props
 *
 * @property message - 表示するエラーメッセージ
 * @property guide   - ユーザー向けガイドメッセージ（省略時はデフォルトガイドを使用）
 */
interface ErrorMessageProps {
  message: string
  guide?: string
}

/** デフォルトのガイドメッセージ */
const DEFAULT_GUIDE = '質問を変えるか、しばらく待ってから再試行してください。'

/**
 * エラーメッセージ表示コンポーネント
 *
 * エラーアイコン + エラーメッセージ + ユーザー向けガイドを表示する。
 * 全テキストはReactの自動エスケープにより XSS を防止する。
 *
 * @param props - ErrorMessageProps
 */
const ErrorMessage: FC<ErrorMessageProps> = ({
  message,
  guide = DEFAULT_GUIDE,
}) => {
  return (
    <div className="error-message" role="alert" aria-label="エラー">
      {/* エラーアイコン（Unicode。画像依存なし） */}
      <span className="error-icon" aria-hidden="true">
        ⚠️
      </span>
      <div className="error-content">
        {/* エラーメッセージ本文（XSS: Reactの自動エスケープに任せる） */}
        <p className="error-text">{message}</p>
        {/* ガイドメッセージ */}
        <p className="error-guide">{guide}</p>
      </div>
    </div>
  )
}

export default ErrorMessage
