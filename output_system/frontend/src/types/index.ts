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
// DB接続先関連型（PBI #148 追加、PBI #200 GraphQL対応）
// ---------------------------------------------------------------------------

/**
 * DB種別
 * バックエンドの DbConnection.dbType に対応する。
 * PBI #200: 'graphql' を追加
 */
export type DbType = 'mysql' | 'postgresql' | 'graphql'

/**
 * DB接続先（読み取り用）
 * GET /api/connections レスポンスの各要素に対応する。
 * パスワードは返却されない（セキュリティ要件）。
 *
 * PBI #200: GraphQL対応
 * - dbType に 'graphql' を追加
 * - endpointUrl を追加（GraphQL時のみ）
 * - host/port/username/databaseName はGraphQL時はnull
 *
 * @property id           - 接続先の一意識別子（UUID）
 * @property name         - 接続名（例: "本番DB"）
 * @property dbType       - DB種別（mysql / postgresql / graphql）
 * @property host         - ホスト名またはIPアドレス（GraphQL時はnull）
 * @property port         - ポート番号（GraphQL時はnull）
 * @property username     - DBユーザー名（GraphQL時はnull）
 * @property databaseName - データベース名（GraphQL時はnull）
 * @property endpointUrl  - GraphQLエンドポイントURL（DB時はnull）
 * @property isLastUsed   - 最後に使用した接続先かどうか
 * @property createdAt    - 作成日時（ISO 8601文字列）
 * @property updatedAt    - 更新日時（ISO 8601文字列）
 */
export interface DbConnection {
  id: string
  name: string
  dbType: DbType
  host: string | null
  port: number | null
  username: string | null
  databaseName: string | null
  endpointUrl: string | null
  isLastUsed: boolean
  createdAt: string
  updatedAt: string
}

/**
 * DB接続先入力（作成・更新用）
 * POST /api/connections / PUT /api/connections/:id のリクエストボディに対応する。
 * パスワードを含む（登録・更新時のみ送信）。
 *
 * PBI #200: GraphQL対応
 * - dbType に 'graphql' を追加
 * - endpointUrl を追加（GraphQL時は必須、DB時は不要）
 * - host/port/username/password/databaseName はGraphQL時は不要
 *
 * @property name         - 接続名
 * @property dbType       - DB種別（mysql / postgresql / graphql）
 * @property host         - ホスト名またはIPアドレス（DB時必須、GraphQL時不要）
 * @property port         - ポート番号（文字列として入力されることもあるためunion型）（DB時必須、GraphQL時不要）
 * @property username     - DBユーザー名（DB時必須、GraphQL時不要）
 * @property password     - DBパスワード（平文。バックエンドで暗号化して保存）（DB時必須、GraphQL時不要）
 * @property databaseName - データベース名（DB時必須、GraphQL時不要）
 * @property endpointUrl  - GraphQLエンドポイントURL（GraphQL時必須、DB時不要）
 */
export interface DbConnectionInput {
  name: string
  dbType: DbType
  host?: string
  port?: number | string
  username?: string
  password?: string
  databaseName?: string
  endpointUrl?: string
}

/**
 * DB接続テスト結果
 * POST /api/connections/test のレスポンスボディに対応する。
 *
 * @property success - 接続成功かどうか
 * @property message - 成功/失敗メッセージ
 */
export interface DbConnectionTestResult {
  success: boolean
  message: string
}

/**
 * useDbConnections フックの返り値型
 *
 * @property connections      - DB接続先一覧
 * @property isLoading        - 一覧取得中かどうか
 * @property error            - エラーメッセージ（null = エラーなし）
 * @property fetchConnections - 一覧を再取得する関数
 * @property createConnection - 新規接続先を登録する関数
 * @property updateConnection - 既存接続先を更新する関数
 * @property deleteConnection - 接続先を削除する関数
 * @property testConnection   - 接続テストを実行する関数
 */
export interface UseDbConnectionsReturn {
  connections: DbConnection[]
  isLoading: boolean
  error: string | null
  fetchConnections: () => Promise<void>
  createConnection: (input: DbConnectionInput) => Promise<DbConnection>
  updateConnection: (id: string, input: DbConnectionInput) => Promise<DbConnection>
  deleteConnection: (id: string) => Promise<void>
  testConnection: (input: DbConnectionInput) => Promise<DbConnectionTestResult>
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
 * PBI #149 更新:
 * - send() が dbConnectionId を受け取るよう変更（選択中のDB接続先ID）
 *
 * 設計原則:
 * - React.Dispatch 等の内部型は公開インターフェースに露出させない
 * - 外部から状態を変更する場合は意図が明確なラッパー関数（restoreConversation）を使用する
 *
 * @property messages             - 現在の会話のメッセージ一覧
 * @property isLoading            - LLMの応答待ち中かどうか（送信中〜done受信まで）
 * @property conversationId       - 現在の会話ID（バックエンドから受け取る。null = 新規会話）
 * @property send                 - 質問を送信する関数（dbConnectionId が必須）
 * @property clearMessages        - 会話をリセットする関数（conversationId もリセット）
 * @property restoreConversation  - 履歴から会話を復元する関数（messages と conversationId を一括設定）
 */
export interface UseChatReturn {
  messages: ChatMessage[]
  isLoading: boolean
  conversationId: string | null
  /** @param message - ユーザーの質問テキスト */
  /** @param dbConnectionId - 選択中のDB接続先ID（UUID）。必須。 */
  send: (message: string, dbConnectionId: string) => Promise<void>
  clearMessages: () => void
  restoreConversation: (id: string, loadedMessages: ChatMessage[]) => void
}
