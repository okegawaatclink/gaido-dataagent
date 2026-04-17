/**
 * 会話履歴 API ルート
 *
 * SQLite に保存された会話・メッセージ履歴を取得・削除する RESTful エンドポイント。
 * フロントエンドの履歴サイドバー（PBI 4.2）が使用する。
 *
 * エンドポイント仕様 (api.md 参照):
 *   GET    /api/history         - 会話一覧（updated_at 降順）
 *   GET    /api/history/:id     - 会話詳細（messages 配列付き）
 *   DELETE /api/history/:id     - 会話削除（CASCADE で messages も削除）
 *
 * レスポンス形式:
 *   - DB の snake_case カラムを camelCase に変換して返す
 *   - messages の query_result は JSON 文字列 → JSON オブジェクトに変換
 *
 * セキュリティ:
 *   - id パラメータはそのまま SQL に渡さず、Repository 関数のプリペアドステートメントを使用
 *   - 存在しない id は 404 を返す（情報漏洩のない一定のエラーレスポンス）
 */

import { Router, Request, Response } from 'express'
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import { validate as uuidValidate } from 'uuid'
import {
  getHistoryDb,
  listConversations,
  getConversationById,
  deleteConversation,
  listMessagesByConversationId,
  ConversationRow,
  MessageRow,
} from '../services/historyDb'

const router = Router()

/**
 * GET/DELETE /api/history レートリミット設定
 *
 * 大量の履歴取得・削除リクエストを防ぐ。
 * デフォルト: 60リクエスト/分/IP
 * 環境変数で上書き可能:
 *   HISTORY_RATE_LIMIT_MAX    - 最大リクエスト数（デフォルト: 60）
 *   HISTORY_RATE_LIMIT_WINDOW - ウィンドウ秒数（デフォルト: 60）
 */
const historyRateLimiter = rateLimit({
  windowMs: parseInt(process.env.HISTORY_RATE_LIMIT_WINDOW || '60', 10) * 1000,
  max: parseInt(process.env.HISTORY_RATE_LIMIT_MAX || '60', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'リクエスト数が制限を超えました。しばらく待ってから再試行してください。',
  },
  keyGenerator: (req) => {
    // X-Forwarded-For は任意の値に偽装可能（IPスプーフィングによるレートリミット回避リスク）。
    // このサービスはリバースプロキシを経由しない直接公開構成のため、
    // 直接接続 IP（req.socket.remoteAddress）のみを信頼する。
    // ipKeyGenerator を使用して IPv6 アドレスを /56 サブネット単位に正規化する
    //（IPv6 ユーザーが異なるアドレスで回避するのを防ぐ）。
    // リバースプロキシ導入時は index.ts で app.set('trust proxy', 1) を設定し、
    // keyGenerator: (req) => ipKeyGenerator(req.ip ?? '') に切り替えること。
    return ipKeyGenerator(req.socket.remoteAddress ?? 'unknown')
  },
})

// ---------------------------------------------------------------------------
// レスポンス型（camelCase）
// ---------------------------------------------------------------------------

/**
 * GET /api/history のレスポンス形式（1件分）
 * DB の snake_case を camelCase に変換して返す
 */
interface ConversationSummary {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

/**
 * GET /api/history/:id のメッセージ形式（1件分）
 */
interface MessageResponse {
  id: string
  role: 'user' | 'assistant'
  content: string
  sql: string | null
  chartType: string | null
  queryResult: unknown | null
  error: string | null
  createdAt: string
}

/**
 * GET /api/history/:id のレスポンス形式
 */
interface ConversationDetail extends ConversationSummary {
  messages: MessageResponse[]
}

// ---------------------------------------------------------------------------
// 変換ヘルパー
// ---------------------------------------------------------------------------

/**
 * ConversationRow（snake_case）を ConversationSummary（camelCase）に変換する
 *
 * @param row - DB から取得した ConversationRow
 * @returns camelCase に変換した ConversationSummary
 */
function toConversationSummary(row: ConversationRow): ConversationSummary {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * MessageRow（snake_case）を MessageResponse（camelCase）に変換する
 *
 * query_result は JSON 文字列として保存されているため、JSON.parse() で復元する。
 * パース失敗時は null を返す（壊れたデータへの耐障害性）。
 *
 * @param row - DB から取得した MessageRow
 * @returns camelCase に変換した MessageResponse
 */
function toMessageResponse(row: MessageRow): MessageResponse {
  let queryResult: unknown | null = null
  if (row.query_result != null) {
    try {
      queryResult = JSON.parse(row.query_result)
    } catch {
      // JSON パース失敗時は null として扱う（壊れたデータへの耐障害性）
      console.warn(`[history] Failed to parse query_result for message ${row.id}`)
    }
  }

  return {
    id: row.id,
    role: row.role,
    content: row.content,
    sql: row.sql,
    chartType: row.chart_type,
    queryResult,
    error: row.error,
    createdAt: row.created_at,
  }
}

// ---------------------------------------------------------------------------
// GET /api/history
// ---------------------------------------------------------------------------

/**
 * GET /api/history
 *
 * 全会話履歴を updated_at 降順で返す。
 *
 * レスポンス例:
 * ```json
 * [
 *   {
 *     "id": "550e8400-...",
 *     "title": "売上データを教えて",
 *     "createdAt": "2024-01-01T00:00:00.000Z",
 *     "updatedAt": "2024-01-01T01:00:00.000Z"
 *   }
 * ]
 * ```
 *
 * @returns 200 - ConversationSummary の配列
 * @returns 500 - サーバーエラー
 */
router.get('/', historyRateLimiter, (_req: Request, res: Response): void => {
  try {
    const db = getHistoryDb()
    const rows = listConversations(db)
    const conversations: ConversationSummary[] = rows.map(toConversationSummary)
    res.json(conversations)
  } catch (err) {
    console.error('[history] GET /api/history error:', err)
    res.status(500).json({ error: '履歴の取得に失敗しました。' })
  }
})

// ---------------------------------------------------------------------------
// GET /api/history/:id
// ---------------------------------------------------------------------------

/**
 * GET /api/history/:id
 *
 * 指定IDの会話詳細（messages 配列付き）を返す。
 *
 * レスポンス例:
 * ```json
 * {
 *   "id": "550e8400-...",
 *   "title": "売上データを教えて",
 *   "createdAt": "2024-01-01T00:00:00.000Z",
 *   "updatedAt": "2024-01-01T01:00:00.000Z",
 *   "messages": [
 *     { "id": "...", "role": "user", "content": "今月の売上を教えて", ... },
 *     { "id": "...", "role": "assistant", "content": "...", "sql": "SELECT ...", ... }
 *   ]
 * }
 * ```
 *
 * @param id - 取得する会話のUUID（パスパラメータ）
 * @returns 200 - ConversationDetail
 * @returns 404 - 会話が存在しない場合
 * @returns 500 - サーバーエラー
 */
router.get('/:id', historyRateLimiter, (req: Request, res: Response): void => {
  const id = req.params['id'] as string

  // UUID v4 形式バリデーション（非UUIDは 400 を返す）
  if (!uuidValidate(id)) {
    res.status(400).json({ error: '無効なIDです。UUID v4 形式で指定してください。' })
    return
  }

  try {
    const db = getHistoryDb()

    // 会話の存在確認
    const conversation = getConversationById(db, id)
    if (!conversation) {
      res.status(404).json({ error: '指定された会話が見つかりません。' })
      return
    }

    // メッセージ一覧を取得（created_at 昇順）
    const messageRows = listMessagesByConversationId(db, id)

    const detail: ConversationDetail = {
      ...toConversationSummary(conversation),
      messages: messageRows.map(toMessageResponse),
    }

    res.json(detail)
  } catch (err) {
    // ログインジェクション対策: ユーザー入力 id を直接文字列に埋め込まず構造化ログを使用
    console.error('[history] GET /api/history/:id error:', { id: JSON.stringify(id), err })
    res.status(500).json({ error: '会話詳細の取得に失敗しました。' })
  }
})

// ---------------------------------------------------------------------------
// DELETE /api/history/:id
// ---------------------------------------------------------------------------

/**
 * DELETE /api/history/:id
 *
 * 指定IDの会話とそのメッセージ（CASCADE）を削除する。
 *
 * @param id - 削除する会話のUUID（パスパラメータ）
 * @returns 204 - 削除成功（ボディなし）
 * @returns 404 - 会話が存在しない場合
 * @returns 500 - サーバーエラー
 */
router.delete('/:id', historyRateLimiter, (req: Request, res: Response): void => {
  const id = req.params['id'] as string

  // UUID v4 形式バリデーション（非UUIDは 400 を返す）
  if (!uuidValidate(id)) {
    res.status(400).json({ error: '無効なIDです。UUID v4 形式で指定してください。' })
    return
  }

  try {
    const db = getHistoryDb()

    // deleteConversation は変更行数を返す
    // 0 の場合は対象が存在しなかった（404）
    const changes = deleteConversation(db, id)

    if (changes === 0) {
      res.status(404).json({ error: '指定された会話が見つかりません。' })
      return
    }

    // 204 No Content（削除成功・ボディなし）
    res.status(204).end()
  } catch (err) {
    // ログインジェクション対策: ユーザー入力 id を直接文字列に埋め込まず構造化ログを使用
    console.error('[history] DELETE /api/history/:id error:', { id: JSON.stringify(id), err })
    res.status(500).json({ error: '会話の削除に失敗しました。' })
  }
})

export default router
