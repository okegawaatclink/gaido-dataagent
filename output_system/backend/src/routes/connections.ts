/**
 * DB接続先管理 API ルート
 *
 * DB接続先（db_connections テーブル）の CRUD 操作と接続テストを提供する RESTful エンドポイント。
 * フロントエンドの接続先管理UI（PBI #148）が使用する。
 *
 * エンドポイント仕様 (api.md 参照):
 *   GET    /api/connections          - 接続先一覧取得（パスワード非返却）→ 200
 *   POST   /api/connections          - 接続先登録（バリデーション付き）→ 201 / 400 / 409
 *   PUT    /api/connections/:id      - 接続先更新 → 200 / 400 / 404
 *   DELETE /api/connections/:id      - 接続先削除（CASCADE）→ 204 / 404
 *   POST   /api/connections/test     - 接続テスト → 200 / 400
 *
 * セキュリティ:
 *   - パスワードはレスポンスに含めない（暗号化して SQLite に保存・内部利用のみ）
 *   - バリデーションで必須フィールドと dbType（mysql/postgresql のみ）を検証
 *   - エラーメッセージは統一フォーマット（{ error: string }）で返す
 *
 * 参考:
 *   - api.md: /api/connections エンドポイント仕様（OpenAPI定義）
 *   - services/connectionManager.ts: ビジネスロジック
 */

import { Router, Request, Response } from 'express'
import {
  create,
  getAll,
  update,
  remove,
  testConnection,
  DuplicateConnectionNameError,
  ConnectionNotFoundError,
  DbConnectionInput,
} from '../services/connectionManager'
import { invalidateSchemaCache, refreshSchema } from '../services/schema'
import { destroyConnection } from '../services/database'

const router = Router()

// =============================================================================
// バリデーションヘルパー
// =============================================================================

/**
 * 許可する dbType 一覧
 * api.md の定義に準拠。mysql / postgresql / graphql をサポート。
 * PBI #200: 'graphql' を追加
 */
const VALID_DB_TYPES = ['mysql', 'postgresql', 'graphql'] as const

/**
 * リクエストボディのバリデーション結果型
 */
interface ValidationResult {
  /** バリデーション成功時の入力データ */
  input?: DbConnectionInput
  /** バリデーションエラーメッセージ（失敗時のみ） */
  error?: string
}

/**
 * DB/GraphQL接続先のリクエストボディをバリデーションする
 *
 * DB接続（mysql / postgresql）の必須フィールド: name, dbType, host, port, username, databaseName
 * GraphQL接続の必須フィールド: name, dbType, endpointUrl
 *
 * バリデーションルール:
 *   共通:
 *   - name: 必須、文字列
 *   - dbType: 必須、'mysql' | 'postgresql' | 'graphql'
 *
 *   DB接続時（mysql/postgresql）:
 *   - host: 必須、文字列
 *   - port: 必須、1〜65535 の整数
 *   - username: 必須、文字列
 *   - databaseName: 必須、文字列
 *   - password: POST 時は必須、PUT 時は省略可（省略時は既存パスワードを維持）
 *
 *   GraphQL接続時:
 *   - endpointUrl: 必須、HTTP/HTTPSスキーマのURL形式
 *   - host/port/username/password/databaseName: 不要（あっても無視）
 *
 * @param body - リクエストボディ（型不明のため unknown）
 * @param requirePassword - パスワードを必須とするか（DB接続のPOST時: true, PUT時: false）
 * @returns バリデーション結果（input または error を含む）
 */
function validateConnectionInput(body: unknown, requirePassword: boolean): ValidationResult {
  if (typeof body !== 'object' || body === null) {
    return { error: 'Request body must be a JSON object.' }
  }

  const b = body as Record<string, unknown>

  // name は常に必須
  if (!b.name || b.name === '') {
    return { error: "Field 'name' is required." }
  }
  if (typeof b.name !== 'string') {
    return { error: "Field 'name' must be a string." }
  }

  // dbType の必須チェックと値チェック
  if (!b.dbType || b.dbType === '') {
    return { error: "Field 'dbType' is required." }
  }
  if (!VALID_DB_TYPES.includes(b.dbType as typeof VALID_DB_TYPES[number])) {
    return { error: `Field 'dbType' must be one of: ${VALID_DB_TYPES.join(', ')}.` }
  }

  const dbType = b.dbType as typeof VALID_DB_TYPES[number]

  // GraphQL接続時のバリデーション
  if (dbType === 'graphql') {
    // endpointUrl が必須
    if (!b.endpointUrl || b.endpointUrl === '') {
      return { error: "Field 'endpointUrl' is required for GraphQL connections." }
    }
    if (typeof b.endpointUrl !== 'string') {
      return { error: "Field 'endpointUrl' must be a string." }
    }
    // URL形式チェック（HTTPまたはHTTPSスキーマのみ許可）
    try {
      const url = new URL(b.endpointUrl)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return { error: "Field 'endpointUrl' must start with http:// or https://." }
      }
    } catch {
      return { error: "Field 'endpointUrl' must be a valid URL." }
    }

    return {
      input: {
        name: b.name,
        dbType: 'graphql',
        endpointUrl: b.endpointUrl,
      },
    }
  }

  // DB接続時（mysql / postgresql）のバリデーション: 従来通り
  const requiredDbFields = ['host', 'port', 'username', 'databaseName']
  for (const field of requiredDbFields) {
    if (b[field] === undefined || b[field] === null || b[field] === '') {
      return { error: `Field '${field}' is required.` }
    }
  }

  // パスワードの必須チェック（DB接続のPOST 時のみ）
  if (requirePassword && (b.password === undefined || b.password === null || b.password === '')) {
    return { error: "Field 'password' is required." }
  }

  // port の型・範囲チェック（1〜65535 の整数）
  const port = Number(b.port)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { error: "Field 'port' must be an integer between 1 and 65535." }
  }

  // 文字列フィールドの型チェック
  const stringFields = ['host', 'username', 'databaseName']
  for (const field of stringFields) {
    if (typeof b[field] !== 'string') {
      return { error: `Field '${field}' must be a string.` }
    }
  }

  return {
    input: {
      name: b.name,
      dbType: dbType as 'mysql' | 'postgresql' | 'graphql',
      host: b.host as string,
      port,
      username: b.username as string,
      password: b.password as string | undefined,
      databaseName: b.databaseName as string,
    },
  }
}

// =============================================================================
// エンドポイント定義
// =============================================================================

/**
 * GET /api/connections
 * DB接続先の一覧を取得する
 *
 * パスワードは返却しない（セキュリティ上の理由）。
 * name の昇順でソートして返す。
 *
 * @returns 200 OK - 接続先一覧（パスワードなし）
 *
 * レスポンス例:
 * [
 *   { "id": "uuid", "name": "本番DB", "dbType": "postgresql", "host": "...", ... }
 * ]
 */
router.get('/', (_req: Request, res: Response) => {
  try {
    const connections = getAll()
    res.json(connections)
  } catch (err) {
    console.error('[connections] GET / error:', err)
    res.status(500).json({ error: 'Internal server error.' })
  }
})

/**
 * POST /api/connections
 * DB接続先を新規登録する
 *
 * パスワードは暗号化して SQLite に保存する。
 * 接続名が重複する場合は 409 を返す。
 * 必須フィールドが未指定の場合は 400 を返す。
 *
 * @returns 201 Created - 登録された接続先情報（パスワードなし）
 * @returns 400 Bad Request - バリデーションエラー
 * @returns 409 Conflict - 接続名の重複
 */
router.post('/', async (req: Request, res: Response) => {
  // リクエストボディをバリデーション（パスワード必須）
  const validation = validateConnectionInput(req.body, true)
  if (validation.error) {
    return res.status(400).json({ error: validation.error })
  }

  try {
    const connection = create(validation.input!)

    // スキーマを非同期で自動取得・永続化（登録直後にキャッシュを温める）
    refreshSchema(connection.id).catch((err) => {
      console.warn(`[connections] POST / schema pre-fetch failed for ${connection.id}:`, err)
    })

    return res.status(201).json(connection)
  } catch (err) {
    if (err instanceof DuplicateConnectionNameError) {
      return res.status(409).json({ error: err.message })
    }
    console.error('[connections] POST / error:', err)
    return res.status(500).json({ error: 'Internal server error.' })
  }
})

/**
 * POST /api/connections/test
 * 接続テストを実行する
 *
 * 指定された接続情報で実際に DB/GraphQL エンドポイントに接続し、成功/失敗を返す。
 * タイムアウトは 5 秒以内（connectionManager.ts 内で設定）。
 *
 * PBI #200: GraphQL対応
 * - dbType='graphql': Introspection Query で接続テスト（パスワード不要）
 * - dbType='mysql'/'postgresql': 従来の SELECT 1 で接続テスト
 *
 * 注意: このルートは /api/connections/:id より先に定義する必要がある。
 * Express のルートマッチングは定義順に行われるため、'test' が :id として
 * マッチしてしまうのを防ぐ。
 *
 * @returns 200 OK - 接続成功（{ success: true, message: "Connection successful." }）
 * @returns 400 Bad Request - 接続失敗またはバリデーションエラー
 */
router.post('/test', async (req: Request, res: Response) => {
  // GraphQL接続テストの場合はパスワード不要（requirePassword=false）
  // DB接続テストの場合はパスワード必須（requirePassword=true）
  const body = req.body as Record<string, unknown>
  const isGraphQL = body.dbType === 'graphql'
  const validation = validateConnectionInput(req.body, !isGraphQL)
  if (validation.error) {
    return res.status(400).json({ error: validation.error })
  }

  try {
    const result = await testConnection(validation.input!)
    if (result.success) {
      return res.status(200).json(result)
    } else {
      // 接続失敗は 400 で返す（クライアント側の接続情報が誤っている可能性が高い）
      return res.status(400).json(result)
    }
  } catch (err) {
    console.error('[connections] POST /test error:', err)
    return res.status(500).json({ error: 'Internal server error.' })
  }
})

/**
 * POST /api/connections/:id/refresh-schema
 * 指定DB接続先のスキーマ情報をDBから再取得し永続化する
 *
 * テーブル定義が変更された場合にユーザーが手動で呼び出す。
 *
 * @param id - 対象の接続先UUID
 * @returns 200 OK - 再取得したスキーマ情報
 * @returns 404 Not Found - 指定IDが存在しない
 * @returns 500 Internal Server Error - DB接続エラー
 */
router.post('/:id/refresh-schema', async (req: Request<{ id: string }>, res: Response) => {
  const { id } = req.params

  try {
    const schema = await refreshSchema(id)
    return res.status(200).json({
      message: `スキーマを再取得しました（${schema.tables.length}テーブル）`,
      tables: schema.tables.length,
      cachedAt: new Date().toISOString(),
    })
  } catch (err) {
    if (err instanceof ConnectionNotFoundError) {
      return res.status(404).json({ error: err.message })
    }
    console.error(`[connections] POST /${id}/refresh-schema error:`, err)
    return res.status(500).json({
      error: 'スキーマの再取得に失敗しました。接続先の設定を確認してください。',
    })
  }
})

/**
 * PUT /api/connections/:id
 * DB接続先を更新する
 *
 * パスワードは省略可。省略時は既存パスワードを維持する。
 * 指定IDが存在しない場合は 404 を返す。
 * 接続名が重複する場合は 409 を返す。
 *
 * @param id - 更新する接続先の UUID
 * @returns 200 OK - 更新後の接続先情報（パスワードなし）
 * @returns 400 Bad Request - バリデーションエラー
 * @returns 404 Not Found - 指定IDが存在しない
 * @returns 409 Conflict - 接続名の重複
 */
router.put('/:id', async (req: Request<{ id: string }>, res: Response) => {
  const { id } = req.params

  // リクエストボディをバリデーション（パスワード省略可）
  const validation = validateConnectionInput(req.body, false)
  if (validation.error) {
    return res.status(400).json({ error: validation.error })
  }

  try {
    const updated = update(id, validation.input!)

    // 接続先更新時にスキーマキャッシュと接続プールを無効化する
    invalidateSchemaCache(id)
    await destroyConnection(id)

    // スキーマを非同期で再取得・永続化
    refreshSchema(id).catch((err) => {
      console.warn(`[connections] PUT /:id schema re-fetch failed for ${id}:`, err)
    })

    return res.status(200).json(updated)
  } catch (err) {
    if (err instanceof ConnectionNotFoundError) {
      return res.status(404).json({ error: err.message })
    }
    if (err instanceof DuplicateConnectionNameError) {
      return res.status(409).json({ error: err.message })
    }
    console.error('[connections] PUT /:id error:', err)
    return res.status(500).json({ error: 'Internal server error.' })
  }
})

/**
 * DELETE /api/connections/:id
 * DB接続先を削除する（関連会話も CASCADE 削除）
 *
 * 削除すると、紐づく conversations と messages も自動削除される（ON DELETE CASCADE）。
 * 指定IDが存在しない場合は 404 を返す。
 *
 * @param id - 削除する接続先の UUID
 * @returns 204 No Content - 削除成功（ボディなし）
 * @returns 404 Not Found - 指定IDが存在しない
 */
router.delete('/:id', async (req: Request<{ id: string }>, res: Response) => {
  const { id } = req.params

  try {
    remove(id)

    // PBI #149: 接続先削除時にスキーマキャッシュと接続プールを無効化する
    // 削除された接続先のリソースを速やかに解放してメモリリークを防ぐ
    invalidateSchemaCache(id)
    await destroyConnection(id)

    // 204 No Content: 削除成功はボディを返さない（RESTの慣例）
    return res.status(204).send()
  } catch (err) {
    if (err instanceof ConnectionNotFoundError) {
      return res.status(404).json({ error: err.message })
    }
    console.error('[connections] DELETE /:id error:', err)
    return res.status(500).json({ error: 'Internal server error.' })
  }
})

export default router
