/**
 * DataAgent バックエンド 型定義
 *
 * バックエンド全体で共通して使用する型を定義する。
 * ルート・サービス・設定モジュール間の型整合性を確保するために使用。
 *
 * PBI #145 初期雛形:
 * - DbType, AppConfig 等の基本型
 *
 * PBI #146〜 で順次追加:
 * - DbConnection型（DB接続先管理機能）
 */

// =============================================================================
// データベース関連型
// =============================================================================

/**
 * サポートするデータベースタイプ
 * knex.js のクライアント識別子に対応する
 */
export type DbType = 'postgresql' | 'mysql'

/**
 * DB接続設定
 * knex.jsの接続設定オブジェクトに渡す値
 */
export interface DbConnectionConfig {
  /** DBタイプ（postgresql / mysql） */
  type: DbType
  /** DBホスト名またはIPアドレス */
  host: string
  /** DBポート番号 */
  port: number
  /** DBユーザー名 */
  user: string
  /** DBパスワード */
  password: string
  /** データベース名 */
  database: string
}

// =============================================================================
// API レスポンス型
// =============================================================================

/**
 * ヘルスチェックレスポンス
 * GET /api/health が返すJSONの型
 */
export interface HealthCheckResponse {
  /** ステータス文字列（"ok"） */
  status: string
  /** タイムスタンプ（ISO 8601形式） */
  timestamp: string
  /** アプリバージョン */
  version: string
}

/**
 * 標準エラーレスポンス
 * 各エンドポイントがエラー時に返すJSONの型
 */
export interface ErrorResponse {
  /** ユーザー向けエラーメッセージ */
  error: string
  /** 詳細情報（開発時のデバッグ用、本番環境では省略可能） */
  detail?: string
}

// =============================================================================
// チャット関連型
// =============================================================================

/**
 * チャットリクエストボディ
 * POST /api/chat に送信するJSONの型
 */
export interface ChatRequest {
  /** ユーザーの質問文 */
  message: string
  /** 会話ID（継続会話の場合に指定。新規会話時はnullまたは省略） */
  conversationId?: string | null
  /** DB接続先ID（PBI #146以降で使用） */
  dbConnectionId?: string | null
}

// =============================================================================
// 会話履歴型
// =============================================================================

/**
 * 会話サマリ（一覧表示用）
 * GET /api/history が返す配列の要素型
 */
export interface ConversationSummary {
  /** 会話の一意識別子（UUID） */
  id: string
  /** 会話のタイトル（最初のユーザーメッセージから自動生成） */
  title: string
  /** 会話の作成日時（ISO 8601形式） */
  createdAt: string
  /** 会話の最終更新日時（ISO 8601形式） */
  updatedAt: string
}
