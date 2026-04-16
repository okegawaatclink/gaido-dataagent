/**
 * ChatMessage コンポーネント
 *
 * チャットエリアに表示される1件のメッセージを描画するコンポーネント。
 * user/assistant ロールに応じて表示スタイルが切り替わる。
 *
 * アシスタントメッセージには以下を表示する:
 * - ストリーミングテキスト（StreamingText）
 * - 生成SQL（SQLDisplay）
 * - クエリ実行結果（DataTable: Epic 3で本格 ChartRenderer に置き換え予定）
 * - エラーメッセージ（ErrorMessage）
 *
 * XSS対策:
 * - ユーザー入力・LLM出力はすべてReactの自動エスケープに任せる
 * - dangerouslySetInnerHTML は使用しない
 */

import type { FC } from 'react'
import type { ChatMessage as ChatMessageType } from '../../types'
import StreamingText from './StreamingText'
import SQLDisplay from '../SQL/SQLDisplay'
import DataTable from '../Chart/DataTable'
import ErrorMessage from '../common/ErrorMessage'

/**
 * ChatMessage コンポーネントの Props
 *
 * @property message - 表示するチャットメッセージオブジェクト
 */
interface ChatMessageProps {
  message: ChatMessageType
}

/**
 * チャットメッセージ表示コンポーネント
 *
 * user ロール: 右寄せの吹き出しで質問テキストを表示する
 * assistant ロール: 左寄せで応答テキスト・SQL・結果・エラーを表示する
 *
 * @param props - ChatMessageProps
 */
const ChatMessage: FC<ChatMessageProps> = ({ message }) => {
  const isUser = message.role === 'user'

  return (
    <div
      className={`chat-message ${isUser ? 'chat-message--user' : 'chat-message--assistant'}`}
      role="article"
      aria-label={isUser ? 'ユーザーのメッセージ' : 'アシスタントのメッセージ'}
    >
      {/* アバター */}
      <div className="chat-message__avatar" aria-hidden="true">
        {isUser ? '👤' : '🤖'}
      </div>

      {/* メッセージコンテンツ */}
      <div className="chat-message__content">
        {/* ロールラベル */}
        <div className="chat-message__role">
          {isUser ? 'あなた' : 'DataAgent'}
        </div>

        {/* テキスト本文（ストリーミング表示対応） */}
        {message.content && (
          <div className="chat-message__text">
            <StreamingText
              text={message.content}
              isStreaming={message.isStreaming}
            />
          </div>
        )}

        {/* ストリーミング中でコンテンツが空の場合のローディング表示 */}
        {message.isStreaming && !message.content && (
          <div className="chat-message__text">
            <span className="streaming-cursor" aria-hidden="true">|</span>
          </div>
        )}

        {/* 生成SQL表示（アシスタントメッセージのみ） */}
        {!isUser && message.sql && (
          <div className="chat-message__sql">
            <SQLDisplay sql={message.sql} />
          </div>
        )}

        {/* クエリ実行結果（DataTable: Task 2.3.3 暫定実装、Epic 3 で ChartRenderer に置き換え） */}
        {!isUser && message.result && (
          <div className="chat-message__result">
            <DataTable result={message.result} />
          </div>
        )}

        {/* エラーメッセージ（アシスタントメッセージのみ） */}
        {!isUser && message.error && (
          <div className="chat-message__error">
            <ErrorMessage message={message.error} />
          </div>
        )}
      </div>
    </div>
  )
}

export default ChatMessage
