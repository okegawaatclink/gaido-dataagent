/**
 * /api/schema ルート
 *
 * 接続先DBのスキーマ情報を返すエンドポイント。
 * services/schema.ts の fetchSchema() を呼び出し、JSON形式で返却する。
 *
 * エンドポイント仕様 (api.md 参照):
 *   GET /api/schema
 *   200: { database: string, tables: [{ name: string, columns: [...] }] }
 *   500: { error: string, details?: string }
 */

import { Router, Request, Response } from 'express'
import { fetchSchema } from '../services/schema'

const router = Router()

/**
 * GET /api/schema
 * 接続先DBのテーブル・カラム情報を取得する
 *
 * DB_TYPE に応じて PostgreSQL / MySQL の INFORMATION_SCHEMA を参照し、
 * テーブル名・カラム名・型・NULL許容の一覧を返す。
 *
 * @returns 200 - スキーマ情報JSON
 * @returns 500 - DB接続エラーまたはクエリエラー
 *
 * @example
 * ```
 * GET /api/schema
 * Response: {
 *   "database": "mydb",
 *   "tables": [
 *     {
 *       "name": "users",
 *       "columns": [
 *         { "name": "id",    "type": "integer", "nullable": false },
 *         { "name": "email", "type": "character varying", "nullable": false }
 *       ]
 *     }
 *   ]
 * }
 * ```
 */
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const schema = await fetchSchema()
    res.json(schema)
  } catch (error) {
    // 接続情報（パスワード等）がレスポンスに含まれないよう、
    // エラーメッセージのみを返す
    const message =
      error instanceof Error ? error.message : 'Unknown database error'

    console.error('[GET /api/schema] DB error:', message)

    res.status(500).json({
      error: 'DB接続またはスキーマ取得に失敗しました',
      details: message,
    })
  }
})

export default router
