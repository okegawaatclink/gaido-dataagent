/**
 * ChatContainer コンポーネント
 *
 * チャット画面のメインコンテナ。useChat フックを利用して
 * チャットエリア（メッセージリスト）と入力エリアを統合する。
 *
 * レイアウト:
 * - チャットエリア: スクロール可能な領域（最新メッセージが下に表示）
 * - 入力エリア: 下部固定（ChitInput コンポーネント）
 *
 * ウェルカムメッセージ:
 * - メッセージが0件の場合は使い方のヒントを表示する
 */

import { useEffect, useRef, type FC } from 'react'
import { useChat } from '../../hooks/useChat'
import ChatMessage from './ChatMessage'
import ChatInput from './ChatInput'
import Loading from '../common/Loading'

/**
 * チャットコンテナコンポーネント
 *
 * チャット全体（メッセージ一覧 + 入力フォーム）を管理する。
 * メッセージ追加時は自動的に最下部にスクロールする。
 *
 * Props なし（useChat フックが全状態を管理する）
 */
const ChatContainer: FC = () => {
  // チャット状態と操作関数を useChat フックから取得
  const { messages, isLoading, send } = useChat()

  // チャットエリアの最下部へのスクロール用 ref
  const messagesEndRef = useRef<HTMLDivElement>(null)

  /**
   * メッセージが追加・更新されたら自動スクロール
   * ストリーミング中も逐次スクロールする
   */
  useEffect(() => {
    if (messagesEndRef.current) {
      // smooth スクロールでなだらかに最下部へ移動
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  return (
    <div className="chat-container">
      {/* チャットエリア（スクロール可能） */}
      <div
        className="chat-messages-area"
        role="log"
        aria-label="チャット履歴"
        aria-live="polite"
        aria-relevant="additions"
      >
        {/* メッセージが0件の場合のウェルカムメッセージ */}
        {messages.length === 0 && !isLoading && (
          <div className="chat-welcome">
            <div className="chat-welcome__icon" aria-hidden="true">🤖</div>
            <h2 className="chat-welcome__title">DataAgent へようこそ</h2>
            <p className="chat-welcome__description">
              自然言語でデータベースに質問できます。
              <br />
              SQLの知識がなくてもデータ分析が可能です。
            </p>
            <div className="chat-welcome__examples">
              <p className="chat-welcome__examples-label">質問の例:</p>
              <ul className="chat-welcome__examples-list">
                <li>今月の売上トップ10を教えて</li>
                <li>部門別の従業員数はいくつですか？</li>
                <li>先週の注文数を日別に集計してください</li>
              </ul>
            </div>
          </div>
        )}

        {/* メッセージリスト */}
        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}

        {/* ローディング表示（ストリーミング開始前の待ち状態） */}
        {isLoading && messages.length % 2 === 1 && (
          // ユーザーメッセージが送信されてアシスタントの応答待ちの場合
          // （奇数件 = ユーザーメッセージが最後）
          <Loading message="SQLを生成しています..." />
        )}

        {/* 自動スクロールのアンカー要素 */}
        <div ref={messagesEndRef} aria-hidden="true" />
      </div>

      {/* 入力エリア（下部固定） */}
      <div className="chat-input-wrapper">
        <ChatInput onSend={send} isLoading={isLoading} />
      </div>
    </div>
  )
}

export default ChatContainer
