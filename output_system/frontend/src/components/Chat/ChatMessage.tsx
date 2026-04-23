/**
 * ChatMessage コンポーネント
 *
 * チャットエリアに表示される1件のメッセージを描画するコンポーネント。
 * user/assistant ロールに応じて表示スタイルが切り替わる。
 *
 * アシスタントメッセージには以下を表示する:
 * - ストリーミングテキスト（StreamingText）
 * - 生成SQL または GraphQLクエリ（SQLDisplay: dbType に応じてラベルを切替）
 * - クエリ実行結果（ChartRenderer: Epic 3 PBI 3.1で実装。chart_typeに応じてグラフ/テーブルを描画）
 * - AI分析コメント（StreamingText）
 * - エラーメッセージ（ErrorMessage）
 *
 * PBI #201 更新:
 * - dbType プロパティを追加（graphql の場合 SQLDisplay のラベルを「GraphQLクエリ」に変更）
 *
 * XSS対策:
 * - ユーザー入力・LLM出力はすべてReactの自動エスケープに任せる
 * - dangerouslySetInnerHTML は使用しない
 */

import { useState, useCallback, type FC } from 'react'
import type { ChatMessage as ChatMessageType, DbType } from '../../types'
import StreamingText from './StreamingText'
import SQLDisplay from '../SQL/SQLDisplay'
import ChartRenderer from '../Chart/ChartRenderer'
import ErrorMessage from '../common/ErrorMessage'

/** 大きな結果セットとみなす行数の閾値 */
const LARGE_RESULT_THRESHOLD = 100

/**
 * ChatMessage コンポーネントの Props
 *
 * @property message - 表示するチャットメッセージオブジェクト
 * @property dbType  - 選択中のDB接続先タイプ（省略時はSQLとして扱う）
 *                     'graphql' の場合、SQLDisplayのラベルを「生成されたGraphQLクエリ」に変更する
 * @property onAnalyze - 分析ボタンクリック時のコールバック（省略時はボタン非表示）
 * @property userQuestion - 元のユーザーの質問テキスト（分析リクエストに必要）
 */
interface ChatMessageProps {
  message: ChatMessageType
  /** DB種別（'mysql' / 'postgresql' / 'graphql'）。省略時はSQLとして扱う */
  dbType?: DbType
  /** 分析ボタンクリック時のコールバック */
  onAnalyze?: (messageId: string, question: string, dbType: string) => void
  /** 元のユーザーの質問テキスト */
  userQuestion?: string
}

/**
 * チャットメッセージ表示コンポーネント
 *
 * user ロール: 右寄せの吹き出しで質問テキストを表示する
 * assistant ロール: 左寄せで応答テキスト・SQL/GraphQL・結果・エラーを表示する
 *
 * @param props - ChatMessageProps
 */
const ChatMessage: FC<ChatMessageProps> = ({ message, dbType, onAnalyze, userQuestion }) => {
  const isUser = message.role === 'user'
  const [showLargeWarning, setShowLargeWarning] = useState(false)

  // SQLDisplay に渡すラベル
  // GraphQL接続の場合は「生成されたGraphQLクエリ」、DB接続の場合は「生成されたSQL」
  const queryLabel = dbType === 'graphql' ? '生成されたGraphQLクエリ' : '生成されたSQL'

  // 分析ボタンのクリックハンドラ
  const handleAnalyzeClick = useCallback(() => {
    if (!onAnalyze || !userQuestion) return
    const rowCount = message.result?.rows?.length ?? 0

    if (rowCount >= LARGE_RESULT_THRESHOLD) {
      setShowLargeWarning(true)
      return
    }

    onAnalyze(message.id, userQuestion, dbType ?? 'mysql')
  }, [onAnalyze, userQuestion, message.id, message.result, dbType])

  // 警告を確認して分析を実行
  const handleConfirmAnalyze = useCallback(() => {
    setShowLargeWarning(false)
    if (onAnalyze && userQuestion) {
      onAnalyze(message.id, userQuestion, dbType ?? 'mysql')
    }
  }, [onAnalyze, userQuestion, message.id, dbType])

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

        {/* 生成SQL/GraphQLクエリ表示（アシスタントメッセージのみ） */}
        {/* dbType に応じてラベルを切替（PBI #201）: DB接続="生成されたSQL", GraphQL="生成されたGraphQLクエリ" */}
        {!isUser && message.sql && (
          <div className="chat-message__sql">
            <SQLDisplay sql={message.sql} label={queryLabel} />
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

        {/* AIに分析させるボタン（結果あり・分析未実施・ストリーミング中でない場合） */}
        {!isUser && message.result && !message.analysis && !message.isStreaming && onAnalyze && (
          <div className="chat-message__analyze">
            {showLargeWarning ? (
              <div className="chat-message__analyze-warning" role="alert">
                <p>
                  ⚠️ 結果が {message.result.rows.length} 行あります。
                  分析にはトークンを多く消費する可能性があります。
                </p>
                <div className="chat-message__analyze-warning-actions">
                  <button
                    type="button"
                    className="chat-message__analyze-warning-btn chat-message__analyze-warning-btn--confirm"
                    onClick={handleConfirmAnalyze}
                  >
                    分析する
                  </button>
                  <button
                    type="button"
                    className="chat-message__analyze-warning-btn chat-message__analyze-warning-btn--cancel"
                    onClick={() => setShowLargeWarning(false)}
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="chat-message__analyze-btn"
                onClick={handleAnalyzeClick}
              >
                💡 AIに分析させる
              </button>
            )}
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
