/**
 * APIサービス設定
 *
 * バックエンドAPIのベースURLを管理し、各エンドポイントへの呼び出し関数を提供する。
 * 環境変数 VITE_API_BASE_URL でカスタマイズ可能。
 *
 * 環境ごとのURL設定:
 * - 開発時（vite dev）: VITE_API_BASE_URL で指定（例: http://localhost:3002）
 * - Docker本番: VITE_API_BASE_URL で指定（コンテナ間通信のURL）
 * - 未設定時: 相対パス（フロントと同一ホストにバックエンドがある場合）
 *
 * 参考: instance-config.md のバックエンドURL設定
 *
 * PBI #148 更新:
 * - DB接続先 CRUD API 呼び出し関数を追加（getConnections, createConnection,
 *   updateConnection, deleteConnection, testConnection）
 */

import type { DbConnection, DbConnectionInput, DbConnectionTestResult } from '../types'

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

// ---------------------------------------------------------------------------
// DB接続先 API 呼び出し関数（PBI #148 追加）
// ---------------------------------------------------------------------------

/**
 * DB接続先一覧を取得する
 *
 * GET /api/connections
 * パスワードはレスポンスに含まれない（バックエンドで除外済み）。
 *
 * @returns DB接続先の配列
 * @throws Error - 取得失敗時（HTTP 4xx/5xx）
 */
export async function getConnections(): Promise<DbConnection[]> {
  const response = await fetch(buildApiUrl('/api/connections'), {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`DB接続先一覧の取得に失敗しました: ${response.status} ${errorText}`)
  }

  return response.json() as Promise<DbConnection[]>
}

/**
 * DB接続先を新規登録する
 *
 * POST /api/connections
 * 同じ接続名が既に存在する場合は 409 Conflict が返る。
 *
 * @param input - 登録する接続先情報（パスワード含む）
 * @returns 登録されたDB接続先（パスワードなし）
 * @throws Error - バリデーションエラー（400）・接続名重複（409）・その他エラー
 */
export async function createConnection(input: DbConnectionInput): Promise<DbConnection> {
  // port は文字列で来た場合でも数値に変換してAPIへ送信する
  const body: DbConnectionInput = {
    ...input,
    port: Number(input.port),
  }

  const response = await fetch(buildApiUrl('/api/connections'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: response.statusText }))
    const message = (errorData as { message?: string }).message ?? response.statusText
    throw new Error(`DB接続先の登録に失敗しました: ${message}`)
  }

  return response.json() as Promise<DbConnection>
}

/**
 * 既存のDB接続先を更新する
 *
 * PUT /api/connections/:id
 *
 * @param id    - 更新する接続先のID
 * @param input - 更新内容（パスワード含む）
 * @returns 更新されたDB接続先（パスワードなし）
 * @throws Error - 存在しない接続先（404）・バリデーションエラー（400）・その他エラー
 */
export async function updateConnection(
  id: string,
  input: DbConnectionInput,
): Promise<DbConnection> {
  // port は文字列で来た場合でも数値に変換してAPIへ送信する
  const body: DbConnectionInput = {
    ...input,
    port: Number(input.port),
  }

  const response = await fetch(buildApiUrl(`/api/connections/${id}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: response.statusText }))
    const message = (errorData as { message?: string }).message ?? response.statusText
    throw new Error(`DB接続先の更新に失敗しました: ${message}`)
  }

  return response.json() as Promise<DbConnection>
}

/**
 * DB接続先を削除する
 *
 * DELETE /api/connections/:id
 * 関連する全会話・メッセージも合わせて削除される（バックエンド側の仕様）。
 *
 * @param id - 削除する接続先のID
 * @throws Error - 存在しない接続先（404）・その他エラー
 */
export async function deleteConnection(id: string): Promise<void> {
  const response = await fetch(buildApiUrl(`/api/connections/${id}`), {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: response.statusText }))
    const message = (errorData as { message?: string }).message ?? response.statusText
    throw new Error(`DB接続先の削除に失敗しました: ${message}`)
  }
  // 204 No Content: ボディなし
}

/**
 * DB接続テストを実行する
 *
 * POST /api/connections/test
 * 入力した接続情報でDBへの接続を試行し、成功/失敗を返す。
 * 200 は接続成功、400 は接続失敗（エラーメッセージ付き）を示す。
 *
 * @param input - テストする接続情報（パスワード含む）
 * @returns 接続テスト結果（success: boolean, message: string）
 * @throws Error - ネットワークエラー等の予期しないエラー
 */
export async function testConnection(
  input: DbConnectionInput,
): Promise<DbConnectionTestResult> {
  // port は文字列で来た場合でも数値に変換してAPIへ送信する
  const body: DbConnectionInput = {
    ...input,
    port: Number(input.port),
  }

  const response = await fetch(buildApiUrl('/api/connections/test'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  // 200（成功）と 400（接続失敗）のどちらも JSON を返す
  const data = await response.json() as DbConnectionTestResult

  return data
}
