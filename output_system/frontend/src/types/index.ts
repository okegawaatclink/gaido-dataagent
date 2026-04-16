/**
 * DataAgent フロントエンド 型定義
 *
 * バックエンド（api.md）のSSEイベント仕様に対応する型を定義する。
 * SSEイベント種別: message / sql / chart_type / result / error / done
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

// ---------------------------------------------------------------------------
// useChat フックの返り値型
// ---------------------------------------------------------------------------

/**
 * useChat フックの返り値
 *
 * @property messages     - 現在の会話のメッセージ一覧
 * @property isLoading    - LLMの応答待ち中かどうか（送信中〜done受信まで）
 * @property send         - 質問を送信する関数
 * @property clearMessages - 会話をリセットする関数
 */
export interface UseChatReturn {
  messages: ChatMessage[]
  isLoading: boolean
  send: (message: string) => Promise<void>
  clearMessages: () => void
}
