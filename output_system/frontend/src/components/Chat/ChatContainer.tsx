/**
 * ChatContainer コンポーネント
 *
 * チャット画面のメインコンテナ。メッセージリストと入力エリアを統合する。
 *
 * PBI #13 更新（Epic 4 - 履歴管理）:
 * - useChat フックを直接呼ばず、App.tsx から Props で messages / isLoading / onSend を受け取る
 * - これにより App.tsx が useChat と useHistory を統合した状態管理を担える
 *
 * レイアウト:
 * - チャットエリア: スクロール可能な領域（最新メッセージが下に表示）
 * - 入力エリア: 下部固定（ChatInput コンポーネント）
 *
 * ウェルカムメッセージ:
 * - メッセージが0件の場合は使い方のヒントを表示する
 */

import { useEffect, useRef, type FC } from 'react'
import type { ChatMessage as ChatMessageType } from '../../types'
import ChatMessage from './ChatMessage'
import ChatInput from './ChatInput'
import Loading from '../common/Loading'

/**
 * ChatContainer コンポーネントの Props
 *
 * @property messages   - 現在の会話のメッセージ一覧（App.tsx の useChat から渡す）
 * @property isLoading  - LLMの応答待ち中かどうか
 * @property onSend     - メッセージ送信ハンドラ
 */
interface ChatContainerProps {
  messages: ChatMessageType[]
  isLoading: boolean
  onSend: (message: string) => Promise<void>
}

/**
 * チャットコンテナコンポーネント
 *
 * チャット全体（メッセージ一覧 + 入力フォーム）を管理する。
 * メッセージ追加時は自動的に最下部にスクロールする。
 *
 * @param props - ChatContainerProps
 */
const ChatContainer: FC<ChatContainerProps> = ({ messages, isLoading, onSend }) => {
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
        <ChatInput onSend={onSend} isLoading={isLoading} />
      </div>
    </div>
  )
}

export default ChatContainer
