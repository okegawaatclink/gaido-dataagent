/**
 * ChatInput コンポーネント
 *
 * チャット画面の下部固定の入力フィールドコンポーネント。
 * 自然言語の質問を入力して送信するためのUI。
 *
 * 操作:
 * - Shift+Enter キー: 送信（Enter は改行）
 * - 送信ボタンクリック: 送信
 * - ローディング中は入力フィールドと送信ボタンを無効化
 *
 * XSS対策:
 * - 入力値はReactの制御コンポーネントとして管理（value バインディング）
 * - 送信時はそのまま useChat.send() に渡す（エスケープはバックエンド側で対応）
 */

import { useState, useCallback, type FC, type KeyboardEvent, type ChangeEvent } from 'react'

/**
 * ChatInput コンポーネントの Props
 *
 * @property onSend    - 送信時に呼ばれるコールバック（引数: 入力テキスト）
 * @property isLoading - ローディング中かどうか（true の場合は入力・送信を無効化）
 * @property disabled  - 明示的に無効化するフラグ（デフォルト: false）
 */
interface ChatInputProps {
  onSend: (message: string) => void
  isLoading: boolean
  disabled?: boolean
}

/** 入力フィールドのプレースホルダーテキスト */
const PLACEHOLDER = '自然言語で質問を入力してください（例: 今月の売上トップ10を教えて）'

/**
 * チャット入力フォームコンポーネント
 *
 * テキストエリアと送信ボタンで構成される。
 * Shift+Enter: 送信、Enter: 改行
 *
 * @param props - ChatInputProps
 */
const ChatInput: FC<ChatInputProps> = ({
  onSend,
  isLoading,
  disabled = false,
}) => {
  // 入力テキストの状態
  const [inputText, setInputText] = useState('')

  // 入力を無効化すべきかどうか（ローディング中 or 明示的無効化）
  const isDisabled = isLoading || disabled

  /**
   * 入力フィールドの変更ハンドラ
   * 制御コンポーネントとして value と onChange を同期する
   */
  const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value)
  }, [])

  /**
   * 送信処理
   * 空メッセージはスキップする
   * 送信後に入力フィールドをクリアする
   */
  const handleSubmit = useCallback(() => {
    const trimmed = inputText.trim()
    if (!trimmed || isDisabled) return

    onSend(trimmed)
    // 送信後に入力フィールドをクリア
    setInputText('')
  }, [inputText, isDisabled, onSend])

  /**
   * キーボードイベントハンドラ
   * - Shift+Enter: 送信
   * - Enter のみ: 改行（デフォルト動作に任せる）
   */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && e.shiftKey) {
        // Shift+Enter押下時はフォームデフォルト動作（改行）を阻止して送信
        e.preventDefault()
        handleSubmit()
      }
      // Enter のみは e.preventDefault() を呼ばずにデフォルト改行を許可
    },
    [handleSubmit],
  )

  return (
    <div className="chat-input-area" role="form" aria-label="メッセージ入力">
      {/* テキスト入力エリア */}
      <textarea
        className="chat-input-textarea"
        value={inputText}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={isLoading ? '応答を待っています...' : PLACEHOLDER}
        disabled={isDisabled}
        rows={3}
        aria-label="質問を入力してください"
        aria-disabled={isDisabled}
      />

      {/* 送信ボタン */}
      <button
        className={`chat-input-send-btn ${isLoading ? 'chat-input-send-btn--loading' : ''}`}
        onClick={handleSubmit}
        disabled={isDisabled || !inputText.trim()}
        type="button"
        aria-label="送信"
        title={isLoading ? '応答待ち中...' : 'Shift+Enterで送信（Enterで改行）'}
      >
        {isLoading ? (
          // ローディング中はスピナーアイコン
          <span aria-hidden="true">⟳</span>
        ) : (
          // 通常時は送信アイコン
          <span aria-hidden="true">▶</span>
        )}
      </button>

      {/* キーボード操作のヒント */}
      <p className="chat-input-hint" aria-live="off">
        Shift+Enter で送信 / Enter で改行
      </p>
    </div>
  )
}

export default ChatInput
