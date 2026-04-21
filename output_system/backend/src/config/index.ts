/**
 * DataAgent バックエンド 設定モジュール
 *
 * 環境変数から設定値を読み込み、型安全なオブジェクトとして提供する。
 * 必須の環境変数が未設定の場合は起動時にエラーを投げる。
 *
 * 参照される環境変数:
 *   ANTHROPIC_API_KEY    : Claude APIキー（必須）
 *   ANTHROPIC_MODEL      : 使用するClaude モデル名（省略時: claude-sonnet-4-20250514）
 *   DB_ENCRYPTION_KEY    : DB接続先パスワード暗号化キー（32バイト hex、必須）
 *   BACKEND_PORT         : バックエンドのポート番号（省略時: 3002）
 *   CORS_ALLOWED_ORIGINS : CORSで許可するオリジン（カンマ区切り）
 *   HISTORY_DB_PATH      : SQLite履歴DBのファイルパス（省略時: /app/data/history.sqlite）
 *   CHAT_RATE_LIMIT_MAX  : POST /api/chat のレートリミット最大リクエスト数（省略時: 10）
 *   CHAT_RATE_LIMIT_WINDOW : POST /api/chat のレートリミットウィンドウ秒数（省略時: 60）
 *   HISTORY_RATE_LIMIT_MAX  : /api/history のレートリミット最大リクエスト数（省略時: 60）
 *   HISTORY_RATE_LIMIT_WINDOW : /api/history のレートリミットウィンドウ秒数（省略時: 60）
 */

// =============================================================================
// Claude API 設定
// =============================================================================

/**
 * Anthropic Claude API キー
 * 未設定の場合は空文字（サービス側でエラーハンドリングする）
 */
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? ''

/**
 * 使用するClaude モデル名
 * デフォルト: claude-sonnet-4-20250514
 */
export const ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514'

// =============================================================================
// DB接続先暗号化設定
// =============================================================================

/**
 * DB接続先パスワードの暗号化キー
 * AES-256-GCM暗号化に使用する32バイトのhex文字列（64文字）
 * 未設定の場合は空文字（encryption.ts側でエラーを発生させる）
 */
export const DB_ENCRYPTION_KEY = process.env.DB_ENCRYPTION_KEY ?? ''

// =============================================================================
// サーバー設定
// =============================================================================

/**
 * バックエンドサーバーのポート番号
 * 環境変数 BACKEND_PORT が設定されている場合はその値を使用
 * デフォルト: 3002（instance-config.md: バックエンドホストポート）
 */
export const BACKEND_PORT = parseInt(process.env.BACKEND_PORT ?? '3002', 10)

// =============================================================================
// CORS 設定
// =============================================================================

/**
 * CORSで許可するオリジンのデフォルト値
 */
const DEFAULT_CORS_ORIGINS = [
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://okegawaatclink-gaido-dataagent-output-system:3001',
]

/**
 * CORSで許可するオリジン一覧
 * 環境変数 CORS_ALLOWED_ORIGINS（カンマ区切り）で上書き可能
 */
export const CORS_ALLOWED_ORIGINS: string[] = process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
  : DEFAULT_CORS_ORIGINS

// =============================================================================
// SQLite 履歴DB設定
// =============================================================================

/**
 * SQLite履歴DBのファイルパス
 * Dockerのnamed volumeマウント先（/app/data/）に配置することで永続化する
 * デフォルト: /app/data/history.sqlite
 */
export const HISTORY_DB_PATH =
  process.env.HISTORY_DB_PATH ?? '/app/data/history.sqlite'

// =============================================================================
// レートリミット設定
// =============================================================================

/**
 * POST /api/chat のレートリミット設定
 * Cost Amplification Attack対策として、1ユーザーあたりの送信頻度を制限する
 */
export const CHAT_RATE_LIMIT = {
  /** ウィンドウ期間内の最大リクエスト数（デフォルト: 10） */
  max: parseInt(process.env.CHAT_RATE_LIMIT_MAX ?? '10', 10),
  /** ウィンドウ期間（秒）（デフォルト: 60） */
  windowSec: parseInt(process.env.CHAT_RATE_LIMIT_WINDOW ?? '60', 10),
}

/**
 * GET/DELETE /api/history のレートリミット設定
 */
export const HISTORY_RATE_LIMIT = {
  /** ウィンドウ期間内の最大リクエスト数（デフォルト: 60） */
  max: parseInt(process.env.HISTORY_RATE_LIMIT_MAX ?? '60', 10),
  /** ウィンドウ期間（秒）（デフォルト: 60） */
  windowSec: parseInt(process.env.HISTORY_RATE_LIMIT_WINDOW ?? '60', 10),
}
