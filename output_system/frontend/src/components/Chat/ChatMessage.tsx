/**
 * ChatMessage コンポーネント
 *
 * チャットエリアに表示される1件のメッセージを描画するコンポーネント。
 * user/assistant ロールに応じて表示スタイルが切り替わる。
 *
 * アシスタントメッセージには以下を表示する:
 * - ストリーミングテキスト（StreamingText）
 * - 生成SQL（SQLDisplay）
 * - クエリ実行結果（ChartRenderer: Epic 3 PBI 3.1で実装。chart_typeに応じてグラフ/テーブルを描画）
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
import ChartRenderer from '../Chart/ChartRenderer'
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

        {/* クエリ実行結果（ChartRenderer: Epic 3 PBI 3.1で実装、chart_typeに応じてグラフ/テーブルを描画） */}
        {!isUser && message.result && (
          <div className="chat-message__result">
            <ChartRenderer result={message.result} chartType={message.chartType} />
          </div>
        )}

        {/* AI分析コメント（アシスタントメッセージのみ） */}
        {!isUser && message.analysis && (
          <div className="chat-message__analysis">
            <div className="chat-message__analysis-header">
              <span className="chat-message__analysis-icon" aria-hidden="true">💡</span>
              <span>AIの分析</span>
            </div>
            <div className="chat-message__analysis-text">
              <StreamingText
                text={message.analysis}
                isStreaming={message.isStreaming}
              />
            </div>
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
