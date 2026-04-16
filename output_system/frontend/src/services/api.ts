/**
 * APIサービス設定
 *
 * バックエンドAPIのベースURLを管理する。
 * 環境変数 VITE_API_BASE_URL でカスタマイズ可能。
 *
 * 環境ごとのURL設定:
 * - 開発時（vite dev）: VITE_API_BASE_URL で指定（例: http://localhost:3002）
 * - Docker本番: VITE_API_BASE_URL で指定（コンテナ間通信のURL）
 * - 未設定時: 相対パス（フロントと同一ホストにバックエンドがある場合）
 *
 * 参考: instance-config.md のバックエンドURL設定
 */

/**
 * APIベースURL
 * VITE_API_BASE_URL 環境変数から取得する。
 * 未設定時は空文字（相対パス）で、同一オリジンのバックエンドに接続する。
 *
 * Docker環境では docker-compose.yml または .env で設定すること:
 *   VITE_API_BASE_URL=http://okegawaatclink-gaido-dataagent-output-system-backend:3002
 */
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? ''

/**
 * APIエンドポイントURLを構築する
 *
 * @param path - APIパス（先頭に/を含む。例: '/api/chat'）
 * @returns 完全なURL文字列
 */
export function buildApiUrl(path: string): string {
  return `${API_BASE_URL}${path}`
}
