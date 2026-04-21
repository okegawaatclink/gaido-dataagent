/**
 * useDbConnections - DB接続先管理フック
 *
 * DB接続先一覧の状態管理とCRUD操作を提供するカスタムフック。
 * バックエンドの /api/connections エンドポイントと連携する。
 *
 * 設計方針:
 * - useState + useEffect で接続先一覧を管理
 * - 各CRUD操作は楽観的更新を行わず、API呼び出し後に fetchConnections() で再取得する
 *   （シンプルな実装を優先。接続先数は通常少数のため性能問題は発生しない）
 * - 接続テスト結果は呼び出し元（コンポーネント）で Toast 表示する
 * - エラーは Error をthrowして呼び出し元でハンドリングする
 *
 * 参考: api.md /api/connections エンドポイント仕様
 *
 * PBI #148 追加
 */

import { useState, useEffect, useCallback } from 'react'
import type {
  DbConnection,
  DbConnectionInput,
  DbConnectionTestResult,
  UseDbConnectionsReturn,
} from '../types'
import {
  getConnections,
  createConnection as apiCreateConnection,
  updateConnection as apiUpdateConnection,
  deleteConnection as apiDeleteConnection,
  testConnection as apiTestConnection,
} from '../services/api'

/**
 * DB接続先管理カスタムフック
 *
 * マウント時に接続先一覧を自動取得する。
 * CRUD操作後は自動的に一覧を再取得して最新状態に保つ。
 *
 * 返り値:
 * - connections: DB接続先一覧（パスワードなし）
 * - isLoading: 一覧取得中かどうか
 * - error: エラーメッセージ（null = エラーなし）
 * - fetchConnections: 一覧を手動で再取得する関数
 * - createConnection: 新規接続先を登録する関数
 * - updateConnection: 既存接続先を更新する関数
 * - deleteConnection: 接続先を削除する関数
 * - testConnection: 接続テストを実行する関数（結果を返すのみ。Toast表示は呼び出し元で行う）
 */
export function useDbConnections(): UseDbConnectionsReturn {
  // DB接続先一覧
  const [connections, setConnections] = useState<DbConnection[]>([])
  // 一覧取得中のローディング状態
  const [isLoading, setIsLoading] = useState(false)
  // エラーメッセージ（null = エラーなし）
  const [error, setError] = useState<string | null>(null)

  /**
   * DB接続先一覧をバックエンドから取得して state を更新する
   *
   * エラー時はコンソールに出力し、error state を更新する。
   * ローディング状態を管理して二重リクエストを防ぐ。
   */
  const fetchConnections = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await getConnections()
      setConnections(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'DB接続先一覧の取得に失敗しました'
      console.error('[useDbConnections] fetchConnections error:', err)
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  /**
   * コンポーネントマウント時に接続先一覧を取得する
   */
  useEffect(() => {
    void fetchConnections()
  }, [fetchConnections])

  /**
   * 新規DB接続先を登録する
   *
   * 登録成功後に一覧を再取得して最新状態に保つ。
   *
   * @param input - 登録する接続先情報（接続名、DB種別、ホスト、ポート、ユーザー名、パスワード、DB名）
   * @returns 登録されたDB接続先（パスワードなし）
   * @throws Error - バリデーションエラー・接続名重複・その他エラー
   */
  const createConnection = useCallback(
    async (input: DbConnectionInput): Promise<DbConnection> => {
      const created = await apiCreateConnection(input)
      // 登録後に一覧を再取得して最新状態に保つ
      await fetchConnections()
      return created
    },
    [fetchConnections],
  )

  /**
   * 既存DB接続先を更新する
   *
   * 更新成功後に一覧を再取得して最新状態に保つ。
   *
   * @param id    - 更新する接続先のID
   * @param input - 更新内容（接続名、DB種別、ホスト、ポート、ユーザー名、パスワード、DB名）
   * @returns 更新されたDB接続先（パスワードなし）
   * @throws Error - 存在しない接続先・バリデーションエラー・その他エラー
   */
  const updateConnection = useCallback(
    async (id: string, input: DbConnectionInput): Promise<DbConnection> => {
      const updated = await apiUpdateConnection(id, input)
      // 更新後に一覧を再取得して最新状態に保つ
      await fetchConnections()
      return updated
    },
    [fetchConnections],
  )

  /**
   * DB接続先を削除する
   *
   * 削除成功後に一覧を再取得して最新状態に保つ。
   * 関連する全会話・メッセージもバックエンド側で削除される。
   *
   * @param id - 削除する接続先のID
   * @throws Error - 存在しない接続先・その他エラー
   */
  const deleteConnection = useCallback(
    async (id: string): Promise<void> => {
      await apiDeleteConnection(id)
      // 削除後に一覧を再取得して最新状態に保つ
      await fetchConnections()
    },
    [fetchConnections],
  )

  /**
   * DB接続テストを実行する
   *
   * 入力した接続情報でDBへの接続を試行し、結果を返す。
   * Toast表示は呼び出し元コンポーネントで行う（UI層の関心事を分離するため）。
   *
   * @param input - テストする接続情報（接続名、DB種別、ホスト、ポート、ユーザー名、パスワード、DB名）
   * @returns 接続テスト結果（success: boolean, message: string）
   * @throws Error - ネットワークエラー等の予期しないエラー
   */
  const testConnection = useCallback(
    async (input: DbConnectionInput): Promise<DbConnectionTestResult> => {
      return apiTestConnection(input)
    },
    [],
  )

  return {
    connections,
    isLoading,
    error,
    fetchConnections,
    createConnection,
    updateConnection,
    deleteConnection,
    testConnection,
  }
}
