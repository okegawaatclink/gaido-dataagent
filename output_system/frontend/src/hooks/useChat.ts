/**
 * useChat - チャットロジックフック
 *
 * チャット画面のメッセージ状態管理と、POST /api/chat SSEストリーミングの
 * 購読・パースを担当するカスタムフック。
 *
 * 設計方針:
 * - fetch + ReadableStream で SSE を受信（EventSource は POST 不可のため）
 * - SSEイベント種別に応じて React state を更新
 * - 最後のアシスタントメッセージを逐次更新（immer不使用、React標準setState）
 * - AbortController でストリームのキャンセルに対応（コンポーネントアンマウント時）
 * - conversationId を管理し、継続会話のリクエストに含める（PBI #13 Epic 4）
 * - 履歴復元は restoreConversation() ラッパー経由で行い、内部 setState を外部に公開しない
 *
 * PBI #149 更新:
 * - send() に dbConnectionId パラメータを追加（選択中のDB接続先ID）
 * - POST /api/chat のリクエストボディに dbConnectionId を含める
 *
 * SSEイベント仕様（api.md / chat.ts 準拠）:
 *   event: conversation - 会話ID通知（conversationId プロパティ）※PBI #13 追加
 *   event: message      - テキストチャンク（chunk プロパティ）
 *   event: sql          - 生成SQL（sql プロパティ）
 *   event: chart_type   - グラフ種類（chartType プロパティ）
 *   event: result       - クエリ結果（columns / rows / chartType プロパティ）
 *   event: analysis     - AI分析コメントチャンク（chunk プロパティ）
 *   event: error        - エラーメッセージ（message プロパティ）
 *   event: done         - ストリーム終了（データなし）
 */

import { useState, useCallback, useRef } from 'react'
import type {
  ChatMessage,
  UseChatReturn,
  ChartType,
  SseMessageData,
  SseSqlData,
  SseChartTypeData,
  SseResultData,
  SseErrorData,
  QueryResult,
} from '../types'
import { streamSseEvents } from './useStreaming'
import { buildApiUrl } from '../services/api'

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** バックエンドの /api/chat エンドポイントURL */
const CHAT_API_URL = buildApiUrl('/api/chat')

// ---------------------------------------------------------------------------
// ヘルパー関数
// ---------------------------------------------------------------------------

/**
 * ユニークIDを生成するヘルパー
 *
 * crypto.randomUUID() は HTTPS または localhost 環境でのみ利用可能。
 * HTTP 経由（開発環境のコンテナ名アクセス等）では使えないため、
 * Math.random() ベースのフォールバックを使用する。
 *
 * @returns ユニークなID文字列
 */
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // HTTP 環境用フォールバック（十分な一意性を確保）
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

/**
 * 新しいユーザーメッセージを生成する
 *
 * @param content - メッセージテキスト
 * @returns ChatMessage - ユーザーメッセージオブジェクト
 */
function createUserMessage(content: string): ChatMessage {
  return {
    id: generateId(),
    role: 'user',
    content,
    sql: null,
    chartType: null,
    result: null,
    error: null,
    analysis: null,
    isStreaming: false,
    createdAt: new Date(),
  }
}

/**
 * 新しいアシスタントメッセージ（初期状態）を生成する
 * ストリーミング中は isStreaming: true のまま更新される
 *
 * @returns ChatMessage - アシスタントメッセージオブジェクト（ストリーミング開始状態）
 */
function createAssistantMessage(): ChatMessage {
  return {
    id: generateId(),
    role: 'assistant',
    content: '',
    sql: null,
    chartType: null,
    result: null,
    error: null,
    analysis: null,
    isStreaming: true,
    createdAt: new Date(),
  }
}

// ---------------------------------------------------------------------------
// useChat フック
// ---------------------------------------------------------------------------

/**
 * チャットロジックを管理するカスタムフック
 *
 * 返り値:
 * - messages: 現在の会話のメッセージ一覧（ユーザー + アシスタント交互）
 * - isLoading: LLMの応答待ち中かどうか（送信後〜done受信まで true）
 * - conversationId: 現在の会話ID（バックエンドから SSE conversation イベントで受け取る）
 * - send: 質問を送信する非同期関数
 * - clearMessages: 会話をリセットする関数（conversationId もリセット）
 * - restoreConversation: 履歴から会話を復元するラッパー関数（messages と conversationId を一括設定）
 *
 * 設計原則:
 * - React 内部型（React.Dispatch）は公開インターフェースに露出させない
 * - 外部から状態を変更する場合は意図が明確なラッパー関数を通じて行う
 */
export function useChat(): UseChatReturn {
  // 会話内のメッセージ一覧
  const [messages, setMessages] = useState<ChatMessage[]>([])
  // ローディング状態（ストリーミング受信中は true）
  const [isLoading, setIsLoading] = useState(false)
  // 現在の会話ID（バックエンドから受け取る。新規会話時は null）
  const [conversationId, setConversationId] = useState<string | null>(null)
  // AbortController の ref（コンポーネントアンマウント時にストリームをキャンセルするため）
  const abortControllerRef = useRef<AbortController | null>(null)

  /**
   * アシスタントメッセージを ID で特定して部分更新する
   *
   * React の関数型 setState を使い、最新の messages から対象IDのメッセージを
   * 見つけて更新する。
   *
   * @param messageId - 更新対象のメッセージID
   * @param updater   - 現在の ChatMessage を受け取り更新後を返す関数
   */
  const updateAssistantMessage = useCallback(
    (messageId: string, updater: (prev: ChatMessage) => ChatMessage) => {
      setMessages((prev) =>
        prev.map((msg) => (msg.id === messageId ? updater(msg) : msg)),
      )
    },
    [],
  )

  /**
   * 質問を送信してSSEストリームを購読する
   *
   * 処理フロー:
   * 1. ユーザーメッセージを messages に追加
   * 2. アシスタントメッセージ（空）を追加してストリーミング開始
   * 3. SSEイベントを受信して逐次 state を更新
   * 4. conversation イベントで conversationId を受け取る（PBI #13）
   * 5. done イベントまたはエラーで isLoading を false に
   *
   * @param message - ユーザーが入力した質問テキスト
   * @param dbConnectionId - 選択中のDB接続先ID（UUID）。PBI #149 で追加。
   */
  const send = useCallback(
    async (message: string, dbConnectionId: string) => {
      // 空メッセージは送信しない
      const trimmed = message.trim()
      if (!trimmed) return

      // dbConnectionId が未設定の場合は送信しない（UI側でバリデーション済みのはずだが念のため）
      if (!dbConnectionId) {
        console.warn('[useChat] dbConnectionId is required but not provided')
        return
      }

      // 前のリクエストが進行中であれば中断
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

      // 新しい AbortController を生成
      const abortController = new AbortController()
      abortControllerRef.current = abortController

      // ユーザーメッセージを追加
      const userMessage = createUserMessage(trimmed)
      // アシスタントメッセージ（ストリーミング中）を追加
      const assistantMessage = createAssistantMessage()

      setMessages((prev) => [...prev, userMessage, assistantMessage])
      setIsLoading(true)

      const assistantMessageId = assistantMessage.id

      try {
        // SSEストリームを購読
        // dbConnectionId（PBI #149 追加）と conversationId をリクエストボディに含める
        const requestBody: Record<string, unknown> = {
          message: trimmed,
          // 選択中のDB接続先ID（必須: バックエンドがスキーマ取得・クエリ実行に使用）
          dbConnectionId,
        }
        // 現在の conversationId を閉じ込めるため、送信前に変数に取得する
        // （useState の値は非同期で古くなる場合があるため、ref を使う方が安全だが、
        //   SSE で conversationId を受け取るまで変化しないため useState で十分）
        const currentConversationId = conversationId
        if (currentConversationId) {
          requestBody.conversationId = currentConversationId
        }

        const generator = streamSseEvents(
          CHAT_API_URL,
          requestBody,
          abortController.signal,
        )

        for await (const sseEvent of generator) {
          // AbortController でキャンセルされた場合はループを抜ける
          if (abortController.signal.aborted) {
            break
          }

          switch (sseEvent.event) {
            case 'message': {
              // テキストチャンクを逐次追加（ストリーミング表示）
              const data = sseEvent.data as SseMessageData
              if (data.chunk) {
                updateAssistantMessage(assistantMessageId, (prev) => ({
                  ...prev,
                  content: prev.content + data.chunk,
                }))
              }
              break
            }

            case 'sql': {
              // 生成されたSQL文を保存
              const data = sseEvent.data as SseSqlData
              if (data.sql) {
                updateAssistantMessage(assistantMessageId, (prev) => ({
                  ...prev,
                  sql: data.sql,
                }))
              }
              break
            }

            case 'chart_type': {
              // 推奨グラフ種類を保存
              const data = sseEvent.data as SseChartTypeData
              if (data.chartType) {
                updateAssistantMessage(assistantMessageId, (prev) => ({
                  ...prev,
                  chartType: data.chartType as ChartType,
                }))
              }
              break
            }

            case 'result': {
              // クエリ実行結果を保存
              const data = sseEvent.data as SseResultData
              const queryResult: QueryResult = {
                columns: data.columns ?? [],
                rows: data.rows ?? [],
                chartType: (data.chartType as ChartType | null) ?? null,
              }
              updateAssistantMessage(assistantMessageId, (prev) => ({
                ...prev,
                result: queryResult,
                // chart_type が result にも含まれる場合は上書き
                chartType: queryResult.chartType ?? prev.chartType,
              }))
              break
            }

            case 'error': {
              // エラーメッセージを保存
              const data = sseEvent.data as SseErrorData
              updateAssistantMessage(assistantMessageId, (prev) => ({
                ...prev,
                error: data.message ?? '不明なエラーが発生しました',
                isStreaming: false,
              }))
              break
            }

            case 'analysis': {
              // AI分析コメントのチャンクを逐次追加
              const data = sseEvent.data as SseMessageData
              if (data.chunk) {
                updateAssistantMessage(assistantMessageId, (prev) => ({
                  ...prev,
                  analysis: (prev.analysis ?? '') + data.chunk,
                }))
              }
              break
            }

            case 'conversation': {
              // バックエンドから会話IDを受け取る（PBI #13 Epic 4 追加）
              // この conversation イベントにより、フロントエンドが conversationId を知る
              const data = sseEvent.data as { conversationId: string }
              if (data.conversationId) {
                setConversationId(data.conversationId)
              }
              break
            }

            case 'done': {
              // ストリーム終了: isStreaming を false にして完了
              updateAssistantMessage(assistantMessageId, (prev) => ({
                ...prev,
                isStreaming: false,
              }))
              break
            }
          }
        }
      } catch (err) {
        // fetch エラー / ネットワークエラー
        // AbortError は意図的なキャンセルなのでエラーとして扱わない
        if (err instanceof DOMException && err.name === 'AbortError') {
          // キャンセルは正常終了
          updateAssistantMessage(assistantMessageId, (prev) => ({
            ...prev,
            isStreaming: false,
          }))
        } else {
          console.error('[useChat] stream error:', err)
          const errorMessage =
            err instanceof Error
              ? err.message
              : '通信エラーが発生しました。接続を確認してください。'
          updateAssistantMessage(assistantMessageId, (prev) => ({
            ...prev,
            error: errorMessage,
            isStreaming: false,
          }))
        }
      } finally {
        setIsLoading(false)
        // 参照をクリア
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null
        }
      }
    },
    [conversationId, updateAssistantMessage],
  )

  /**
   * 会話をリセットする
   *
   * 送信中のリクエストがある場合はキャンセルしてからリセットする。
   * conversationId もリセットして新規会話状態に戻す（PBI #13 追加）。
   * 履歴は削除しない（履歴はサイドバーから参照可能）。
   */
  const clearMessages = useCallback(() => {
    // 進行中のリクエストをキャンセル
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setMessages([])
    setIsLoading(false)
    // conversationId をリセット（新しい会話として扱う）
    setConversationId(null)
  }, [])

  /**
   * 履歴から会話を復元するラッパー関数
   *
   * React.Dispatch 型を直接公開する代わりに、履歴復元という操作の意図を
   * 明確に表現した専用ラッパーを提供する。
   * これにより、useChat の内部状態管理の実装詳細（setState）を外部に漏洩させない。
   *
   * @param id       - 復元する会話のID
   * @param loadedMessages - 復元するメッセージ一覧（GET /api/history/:id のレスポンス）
   */
  const restoreConversation = useCallback(
    (id: string, loadedMessages: ChatMessage[]) => {
      setMessages(loadedMessages)
      setConversationId(id)
    },
    [],
  )

  return {
    messages,
    isLoading,
    conversationId,
    send,
    clearMessages,
    restoreConversation,
  }
}
