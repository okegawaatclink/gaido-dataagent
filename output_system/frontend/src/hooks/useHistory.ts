/**
 * useHistory - 会話履歴管理フック
 *
 * GET /api/history?dbConnectionId=xxx で会話一覧を取得し、
 * GET /api/history/:id で会話詳細を取得するカスタムフック。
 *
 * PBI #13 (Epic 4 - 履歴管理) で実装。
 * PBI #151 更新: dbConnectionId パラメータに対応。DB接続先別に会話履歴を管理する。
 *
 * 設計方針:
 * - シンプルな useEffect + fetch パターンを採用（React Query は不使用）
 * - dbConnectionId が変わると自動でリフレッシュ（useEffect の依存配列に含める）
 * - 履歴一覧の手動リフレッシュ（refreshHistory を外部から呼び出し可能）
 * - 会話詳細の取得は loadConversation 関数で明示的に行う
 * - エラーハンドリング: API 失敗時は error state にメッセージを設定
 */

import { useState, useCallback, useEffect } from 'react'
import type { ChartType, ChatMessage, QueryResult } from '../types'
import { buildApiUrl } from '../services/api'

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/**
 * API レスポンス: GET /api/history の1件分
 * バックエンドの ConversationSummary（camelCase）に対応する
 */
export interface ConversationSummary {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

/**
 * API レスポンス: GET /api/history/:id の messages 配列の1件分
 * バックエンドの MessageResponse（camelCase）に対応する
 */
export interface HistoryMessageResponse {
  id: string
  role: 'user' | 'assistant'
  content: string
  sql: string | null
  chartType: string | null
  queryResult: {
    columns: string[]
    rows: Record<string, unknown>[]
    chartType: ChartType | null
  } | null
  error: string | null
  analysis?: string | null
  createdAt: string
}

/**
 * API レスポンス: GET /api/history/:id のレスポンス全体
 */
export interface ConversationDetail extends ConversationSummary {
  messages: HistoryMessageResponse[]
}

/**
 * useHistory フックの返り値
 *
 * @property conversations     - 会話一覧（更新日時降順）
 * @property isLoading         - 一覧取得中フラグ
 * @property error             - エラーメッセージ（エラー時のみ）
 * @property refreshHistory    - 会話一覧を再取得する関数
 * @property loadConversation  - 指定IDの会話詳細を取得してChatMessage配列に変換する関数
 */
export interface UseHistoryReturn {
  conversations: ConversationSummary[]
  isLoading: boolean
  error: string | null
  refreshHistory: () => void
  loadConversation: (id: string) => Promise<ChatMessage[]>
}

// ---------------------------------------------------------------------------
// API URL
// ---------------------------------------------------------------------------

/** GET /api/history エンドポイントのベースURL */
const HISTORY_API_BASE_URL = buildApiUrl('/api/history')

// ---------------------------------------------------------------------------
// 変換ヘルパー
// ---------------------------------------------------------------------------

/**
 * HistoryMessageResponse を ChatMessage に変換する
 *
 * バックエンドからの履歴メッセージをフロントエンドの ChatMessage 型に変換する。
 * isStreaming は false（履歴なのでストリーミング中ではない）。
 * queryResult は result に格納する。
 *
 * @param msg - バックエンドの HistoryMessageResponse
 * @returns フロントエンドの ChatMessage
 */
function toFrontendMessage(msg: HistoryMessageResponse): ChatMessage {
  // queryResult を ChatMessage の result 形式（QueryResult）に変換
  let result: QueryResult | null = null
  if (msg.queryResult) {
    result = {
      columns: msg.queryResult.columns,
      rows: msg.queryResult.rows,
      chartType: msg.queryResult.chartType,
    }
  }

  return {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    sql: msg.sql,
    chartType: (msg.chartType as ChartType | null) ?? null,
    result,
    error: msg.error,
    analysis: msg.analysis ?? null,
    isStreaming: false,  // 履歴はストリーミング中ではない
    createdAt: new Date(msg.createdAt),
    dbMessageId: msg.id,  // 履歴復元時はIDがそのままDB上のID
  }
}

// ---------------------------------------------------------------------------
// useHistory フック
// ---------------------------------------------------------------------------

/**
 * 会話履歴を管理するカスタムフック
 *
 * dbConnectionId が変わると自動で GET /api/history?dbConnectionId=xxx を呼び出す。
 * refreshHistory を呼び出すことで一覧を手動再取得できる。
 *
 * PBI #151 追加: dbConnectionId パラメータでDB別に履歴をフィルタリングする。
 * - dbConnectionId が null の場合は取得を行わず空配列を返す
 * - dbConnectionId が変わると自動で再取得（DB切替時のサイドバー更新に使用）
 *
 * @param dbConnectionId - フィルタリングするDB接続先ID（null = 未選択）
 * @returns UseHistoryReturn
 */
export function useHistory(dbConnectionId: string | null = null): UseHistoryReturn {
  /** 会話一覧（更新日時降順） */
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  /** 一覧取得中フラグ */
  const [isLoading, setIsLoading] = useState(false)
  /** エラーメッセージ */
  const [error, setError] = useState<string | null>(null)
  /** リフレッシュトリガー（カウントアップで useEffect を再実行する） */
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  /**
   * 会話一覧を再取得するトリガー関数
   * 呼び出すたびに refreshTrigger が増加し、useEffect が再実行される
   */
  const refreshHistory = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1)
  }, [])

  /**
   * 会話一覧を取得する副作用
   * マウント時、refreshTrigger 変化時、dbConnectionId 変化時に実行される。
   * dbConnectionId が null の場合は空配列をセットして終了する。
   */
  useEffect(() => {
    // dbConnectionId が未選択の場合は取得しない（DB選択前の空状態）
    if (!dbConnectionId) {
      setConversations([])
      setError(null)
      setIsLoading(false)
      return
    }

    let isCancelled = false  // コンポーネントアンマウント後の state 更新を防ぐ

    const fetchHistory = async () => {
      setIsLoading(true)
      setError(null)

      try {
        // dbConnectionId クエリパラメータを付与して API を呼び出す（PBI #151 追加）
        const url = `${HISTORY_API_BASE_URL}?dbConnectionId=${encodeURIComponent(dbConnectionId)}`
        const response = await fetch(url)
        if (!response.ok) {
          throw new Error(`履歴の取得に失敗しました (HTTP ${response.status})`)
        }
        const data: ConversationSummary[] = await response.json()
        if (!isCancelled) {
          setConversations(data)
        }
      } catch (err) {
        if (!isCancelled) {
          const message = err instanceof Error ? err.message : '履歴の取得に失敗しました'
          setError(message)
          console.error('[useHistory] fetch error:', err)
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    }

    fetchHistory()

    // クリーンアップ: コンポーネントアンマウント時に state 更新をキャンセル
    return () => {
      isCancelled = true
    }
  }, [refreshTrigger, dbConnectionId])  // dbConnectionId が変わると自動リフレッシュ

  /**
   * 指定IDの会話詳細を取得してChatMessage配列に変換する
   *
   * GET /api/history/:id を呼び出し、メッセージ配列をフロントエンドの
   * ChatMessage 型に変換して返す。
   * 会話が見つからない場合は Error をスロー（404）。
   *
   * @param id - 取得する会話のID（UUID v4）
   * @returns Promise<ChatMessage[]> - 変換後のメッセージ配列
   * @throws Error - APIエラー時（404含む）
   */
  const loadConversation = useCallback(async (id: string): Promise<ChatMessage[]> => {
    const url = buildApiUrl(`/api/history/${encodeURIComponent(id)}`)
    const response = await fetch(url)

    if (response.status === 404) {
      throw new Error('会話が見つかりません')
    }

    if (!response.ok) {
      throw new Error(`会話の取得に失敗しました (HTTP ${response.status})`)
    }

    const detail: ConversationDetail = await response.json()
    return detail.messages.map(toFrontendMessage)
  }, [])

  return {
    conversations,
    isLoading,
    error,
    refreshHistory,
    loadConversation,
  }
}
