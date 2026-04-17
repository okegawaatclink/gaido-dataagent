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
 *
 * SSEイベント仕様（api.md / chat.ts 準拠）:
 *   event: message      - テキストチャンク（chunk プロパティ）
 *   event: sql          - 生成SQL（sql プロパティ）
 *   event: chart_type   - グラフ種類（chartType プロパティ）
 *   event: result       - クエリ結果（columns / rows / chartType プロパティ）
 *   event: error        - エラーメッセージ（message プロパティ）
 *   event: done         - ストリーム終了（データなし）
 *   event: conversation - 会話ID通知（conversationId プロパティ）※PBI #13 追加
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
 * - setMessages: 外部（履歴復元時）からメッセージを設定する関数
 * - setConversationId: 外部から conversationId を設定する関数（履歴復元時）
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
   */
  const send = useCallback(
    async (message: string) => {
      // 空メッセージは送信しない
      const trimmed = message.trim()
      if (!trimmed) return

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
        // conversationId が存在する場合はリクエストボディに含めて継続会話を示す
        const requestBody: Record<string, unknown> = { message: trimmed }
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

  return {
    messages,
    isLoading,
    conversationId,
    send,
    clearMessages,
    setMessages,
    setConversationId,
  }
}
