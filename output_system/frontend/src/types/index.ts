/**
 * DataAgent フロントエンド 型定義
 *
 * バックエンド（api.md）のSSEイベント仕様に対応する型を定義する。
 * SSEイベント種別: message / sql / chart_type / result / error / done / conversation
 *
 * PBI #13 更新:
 * - UseChatReturn に conversationId を追加
 * - UseChatReturn に restoreConversation を追加（履歴復元用ラッパー。React.Dispatch を直接公開しない）
 * - SseConversationData を追加（event: conversation のデータ型）
 */

// ---------------------------------------------------------------------------
// チャット関連
// ---------------------------------------------------------------------------

/**
 * グラフ種類の列挙型
 * バックエンドのLLMサービスが返す chart_type イベントの値に対応する。
 */
export type ChartType = 'bar' | 'line' | 'pie' | 'table'

/**
 * クエリ実行結果
 * event: result で受け取るデータ形式（api.md準拠）
 *
 * @property columns - 列名一覧
 * @property rows    - データ行（キー: カラム名、値: 任意の型）
 * @property chartType - 推奨グラフ種類（LLMが選択）
 */
export interface QueryResult {
  columns: string[]
  rows: Record<string, unknown>[]
  chartType: ChartType | null
}

/**
 * チャットメッセージのロール
 * user: ユーザーが送信したメッセージ
 * assistant: アシスタント（LLM）の応答
 */
export type MessageRole = 'user' | 'assistant'

/**
 * チャットメッセージ
 * チャットエリアに表示される1件のメッセージを表す。
 *
 * @property id        - メッセージの一意識別子（crypto.randomUUID()で生成）
 * @property role      - メッセージの送信者ロール
 * @property content   - テキスト内容（ストリーミングで逐次追加される）
 * @property sql       - 生成されたSQL文（アシスタントメッセージのみ、nullの場合もあり）
 * @property chartType - 推奨グラフ種類（アシスタントメッセージのみ）
 * @property result    - クエリ実行結果（アシスタントメッセージのみ）
 * @property error     - エラーメッセージ（エラー発生時のみ）
 * @property isStreaming - ストリーミング受信中かどうか
 * @property createdAt - メッセージ作成日時
 */
export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  sql: string | null
  chartType: ChartType | null
  result: QueryResult | null
  error: string | null
  analysis: string | null
  isStreaming: boolean
  createdAt: Date
}

// ---------------------------------------------------------------------------
// SSEイベント型（バックエンドからのストリーミングデータ）
// ---------------------------------------------------------------------------

/**
 * SSE: message イベントのデータ
 * LLMが生成したテキストのチャンク（逐次送信される）
 */
export interface SseMessageData {
  chunk: string
}

/**
 * SSE: sql イベントのデータ
 * 抽出されたSQL文全体
 */
export interface SseSqlData {
  sql: string
}

/**
 * SSE: chart_type イベントのデータ
 * 推奨グラフ種類
 */
export interface SseChartTypeData {
  chartType: ChartType
}

/**
 * SSE: result イベントのデータ
 * クエリ実行結果（QueryResult形式）
 */
export interface SseResultData {
  columns: string[]
  rows: Record<string, unknown>[]
  chartType: ChartType | null
}

/**
 * SSE: error イベントのデータ
 * ユーザー向けエラーメッセージ
 */
export interface SseErrorData {
  message: string
}

/**
 * SSE: conversation イベントのデータ（PBI #13 Epic 4 追加）
 * バックエンドが新規会話作成時にフロントエンドに通知する会話ID
 */
export interface SseConversationData {
  conversationId: string
}

// ---------------------------------------------------------------------------
// useChat フックの返り値型
// ---------------------------------------------------------------------------

/**
 * useChat フックの返り値
 *
 * PBI #13 更新:
 * - conversationId を追加（現在の会話ID。新規会話時は null）
 * - restoreConversation を追加（履歴復元用ラッパー関数）
 *
 * 設計原則:
 * - React.Dispatch 等の内部型は公開インターフェースに露出させない
 * - 外部から状態を変更する場合は意図が明確なラッパー関数（restoreConversation）を使用する
 *
 * @property messages             - 現在の会話のメッセージ一覧
 * @property isLoading            - LLMの応答待ち中かどうか（送信中〜done受信まで）
 * @property conversationId       - 現在の会話ID（バックエンドから受け取る。null = 新規会話）
 * @property send                 - 質問を送信する関数
 * @property clearMessages        - 会話をリセットする関数（conversationId もリセット）
 * @property restoreConversation  - 履歴から会話を復元する関数（messages と conversationId を一括設定）
 */
export interface UseChatReturn {
  messages: ChatMessage[]
  isLoading: boolean
  conversationId: string | null
  send: (message: string) => Promise<void>
  clearMessages: () => void
  restoreConversation: (id: string, loadedMessages: ChatMessage[]) => void
}
