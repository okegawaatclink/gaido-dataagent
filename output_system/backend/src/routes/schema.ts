/**
 * /api/schema ルート
 *
 * 指定DB接続先のスキーマ情報を返すエンドポイント。
 * services/schema.ts の fetchSchema() を呼び出し、JSON形式で返却する。
 *
 * PBI #149 改修:
 *   - GET /api/schema?dbConnectionId=xxx: dbConnectionId クエリパラメータに対応
 *   - dbConnectionId が未指定の場合は 400 エラーを返す
 *   - 接続先が見つからない場合は 404 エラーを返す
 *
 * エンドポイント仕様 (api.md 参照):
 *   GET /api/schema?dbConnectionId=<uuid>
 *   200: { database: string, tables: [{ name: string, comment: string|null, columns: [...] }] }
 *   400: { error: string }（dbConnectionId 未指定 / 形式不正）
 *   404: { error: string }（接続先が見つからない）
 *   500: { error: string, details?: string }（DB接続エラー等）
 */

import { Router, Request, Response } from 'express'
import { validate as uuidValidate } from 'uuid'
import { fetchSchema, ConnectionNotFoundError } from '../services/schema'

const router = Router()

/**
 * GET /api/schema
 * 指定DB接続先のテーブル・カラム情報を取得する
 *
 * クエリパラメータ:
 *   dbConnectionId (必須): DB接続先ID（UUID）
 *
 * スキーマキャッシュが存在する場合はキャッシュから返す（高速レスポンス）。
 * キャッシュがない場合はDB接続してスキーマを取得し、キャッシュに保存する。
 *
 * @returns 200 - スキーマ情報JSON
 * @returns 400 - dbConnectionId 未指定 / UUID形式不正
 * @returns 404 - 指定IDの接続先が見つからない
 * @returns 500 - DB接続エラーまたはクエリエラー
 *
 * @example
 * ```
 * GET /api/schema?dbConnectionId=550e8400-e29b-41d4-a716-446655440000
 * Response: {
 *   "database": "mydb",
 *   "tables": [
 *     {
 *       "name": "users",
 *       "comment": "ユーザーマスタ",
 *       "columns": [
 *         { "name": "id",    "type": "integer",           "nullable": false, "comment": "ユーザーID" },
 *         { "name": "email", "type": "character varying", "nullable": false, "comment": "メールアドレス" }
 *       ]
 *     }
 *   ]
 * }
 * ```
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { dbConnectionId } = req.query

  // dbConnectionId のバリデーション（必須）
  if (!dbConnectionId || typeof dbConnectionId !== 'string' || dbConnectionId.trim() === '') {
    res.status(400).json({
      error: 'dbConnectionId クエリパラメータは必須です。',
    })
    return
  }

  // UUID v4 形式チェック（不正なIDを早期に弾く）
  if (!uuidValidate(dbConnectionId)) {
    res.status(400).json({
      error: 'dbConnectionId の形式が不正です。UUID v4 形式で指定してください。',
    })
    return
  }

  try {
    // fetchSchema() はキャッシュ優先で取得する
    const schema = await fetchSchema(dbConnectionId)
    res.json(schema)
  } catch (error) {
    // 接続先が見つからない場合は 404
    if (error instanceof ConnectionNotFoundError) {
      res.status(404).json({
        error: `指定されたDB接続先が見つかりません: ${dbConnectionId}`,
      })
      return
    }

    // その他のエラー（DB接続エラー等）は 500
    // 接続情報（パスワード等）がレスポンスに含まれないよう、
    // エラーメッセージのみを返す（詳細はサーバーログに記録）
    const message =
      error instanceof Error ? error.message : 'Unknown database error'

    console.error('[GET /api/schema] DB error:', message, 'dbConnectionId:', dbConnectionId)

    res.status(500).json({
      error: 'DB接続またはスキーマ取得に失敗しました',
      details: message,
    })
  }
})

export default router
