/**
 * DB接続先管理 API ルート（connections.ts）のユニットテスト
 *
 * GET/POST/PUT/DELETE /api/connections と POST /api/connections/test の動作を検証する。
 * connectionManager サービスはモック化して使用する。
 *
 * テスト対象:
 *   - GET /api/connections          : 接続先一覧の正常取得
 *   - POST /api/connections         : 正常登録（201）、バリデーションエラー（400）、重複名（409）
 *   - PUT /api/connections/:id      : 正常更新（200）、バリデーションエラー（400）、存在しないID（404）
 *   - DELETE /api/connections/:id   : 正常削除（204）、存在しないID（404）
 *   - POST /api/connections/test    : 接続成功（200）、接続失敗（400）、バリデーションエラー（400）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

// ---------------------------------------------------------------------------
// モジュールモック（vi.mock は巻き上げされるためimportより前に配置）
// ---------------------------------------------------------------------------

vi.mock('../../backend/src/services/connectionManager', () => ({
  create: vi.fn(),
  getAll: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  testConnection: vi.fn(),
  DuplicateConnectionNameError: class DuplicateConnectionNameError extends Error {
    constructor(name: string) {
      super(`Connection name '${name}' already exists.`)
      this.name = 'DuplicateConnectionNameError'
    }
  },
  ConnectionNotFoundError: class ConnectionNotFoundError extends Error {
    constructor(id: string) {
      super(`DB connection with id '${id}' not found.`)
      this.name = 'ConnectionNotFoundError'
    }
  },
}))

// ---------------------------------------------------------------------------
// モックのインポート
// ---------------------------------------------------------------------------

import {
  create,
  getAll,
  update,
  remove,
  testConnection,
  DuplicateConnectionNameError,
  ConnectionNotFoundError,
} from '../../backend/src/services/connectionManager'

// ---------------------------------------------------------------------------
// テスト用フィクスチャ
// ---------------------------------------------------------------------------

/** テスト用接続先UUID */
const TEST_CONN_UUID = '550e8400-e29b-41d4-a716-446655440000'

/** テスト用接続先データ（API レスポンス形式） */
const mockConnectionPublic = {
  id: TEST_CONN_UUID,
  name: 'テスト接続',
  dbType: 'mysql' as const,
  host: 'localhost',
  port: 3306,
  username: 'user',
  databaseName: 'testdb',
  isLastUsed: false,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T01:00:00.000Z',
}

/** テスト用の有効なリクエストボディ */
const validCreateBody = {
  name: 'テスト接続',
  dbType: 'mysql',
  host: 'localhost',
  port: 3306,
  username: 'user',
  password: 'secret',
  databaseName: 'testdb',
}

// ---------------------------------------------------------------------------
// テストアプリのセットアップ
// ---------------------------------------------------------------------------

/**
 * テスト用 Express アプリを作成する
 * connections ルートのみを登録し、本番の index.ts とは独立させる
 */
async function createTestApp() {
  const app = express()
  app.use(express.json())
  const { default: connectionsRouter } = await import('../../backend/src/routes/connections')
  app.use('/api/connections', connectionsRouter)
  return app
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe('GET /api/connections', () => {
  let app: express.Application

  beforeEach(async () => {
    vi.resetAllMocks()
    app = await createTestApp()
  })

  /**
   * 【テスト対象】GET /api/connections
   * 【テスト内容】接続先一覧が正常に取得できること
   * 【期待結果】200 OK で接続先配列が返ること
   */
  it('should return 200 with list of connections', async () => {
    vi.mocked(getAll).mockReturnValue([mockConnectionPublic])

    const res = await request(app).get('/api/connections')

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].name).toBe('テスト接続')
    // パスワード関連フィールドがないこと
    expect(res.body[0].password).toBeUndefined()
    expect(res.body[0].password_encrypted).toBeUndefined()
  })

  /**
   * 【テスト対象】GET /api/connections
   * 【テスト内容】接続先が0件の場合に空配列が返ること
   * 【期待結果】200 OK で空配列が返ること
   */
  it('should return 200 with empty array when no connections exist', async () => {
    vi.mocked(getAll).mockReturnValue([])

    const res = await request(app).get('/api/connections')

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })
})

describe('POST /api/connections', () => {
  let app: express.Application

  beforeEach(async () => {
    vi.resetAllMocks()
    app = await createTestApp()
  })

  /**
   * 【テスト対象】POST /api/connections
   * 【テスト内容】有効なリクエストで接続先が登録されること
   * 【期待結果】201 Created で登録された接続先情報が返ること
   */
  it('should return 201 with created connection on valid request', async () => {
    vi.mocked(create).mockReturnValue(mockConnectionPublic)

    const res = await request(app)
      .post('/api/connections')
      .send(validCreateBody)

    expect(res.status).toBe(201)
    expect(res.body.id).toBe(TEST_CONN_UUID)
    expect(res.body.name).toBe('テスト接続')
    expect(res.body.password).toBeUndefined()
  })

  /**
   * 【テスト対象】POST /api/connections
   * 【テスト内容】必須フィールド未指定時に 400 が返ること
   * 【期待結果】各必須フィールドが未指定で 400 Bad Request が返ること
   *
   * 【入力例】
   * - name なし
   * - dbType なし
   * - host なし
   * - port なし
   * - username なし
   * - password なし
   * - databaseName なし
   */
  it('should return 400 when required fields are missing', async () => {
    const requiredFields = ['name', 'dbType', 'host', 'port', 'username', 'password', 'databaseName']

    for (const field of requiredFields) {
      const body = { ...validCreateBody }
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete (body as Record<string, unknown>)[field]

      const res = await request(app)
        .post('/api/connections')
        .send(body)

      expect(res.status).toBe(400)
      expect(res.body.error).toBeTruthy()
    }
  })

  /**
   * 【テスト対象】POST /api/connections
   * 【テスト内容】不正な dbType 指定時に 400 が返ること
   * 【期待結果】mysql/postgresql 以外は 400 Bad Request
   */
  it('should return 400 for invalid dbType', async () => {
    const res = await request(app)
      .post('/api/connections')
      .send({ ...validCreateBody, dbType: 'sqlite' })

    expect(res.status).toBe(400)
    expect(res.body.error).toContain('dbType')
  })

  /**
   * 【テスト対象】POST /api/connections
   * 【テスト内容】不正なポート番号で 400 が返ること
   * 【期待結果】0, 65536, 文字列などの不正ポートで 400 Bad Request
   */
  it('should return 400 for invalid port number', async () => {
    const invalidPorts = [0, 65536, -1, 'abc', 3.14]

    for (const port of invalidPorts) {
      const res = await request(app)
        .post('/api/connections')
        .send({ ...validCreateBody, port })

      expect(res.status).toBe(400)
    }
  })

  /**
   * 【テスト対象】POST /api/connections
   * 【テスト内容】接続名の重複時に 409 が返ること
   * 【期待結果】409 Conflict が返ること
   */
  it('should return 409 when connection name already exists', async () => {
    vi.mocked(create).mockImplementation(() => {
      throw new DuplicateConnectionNameError('テスト接続')
    })

    const res = await request(app)
      .post('/api/connections')
      .send(validCreateBody)

    expect(res.status).toBe(409)
    expect(res.body.error).toContain('テスト接続')
  })
})

describe('PUT /api/connections/:id', () => {
  let app: express.Application

  beforeEach(async () => {
    vi.resetAllMocks()
    app = await createTestApp()
  })

  /**
   * 【テスト対象】PUT /api/connections/:id
   * 【テスト内容】有効なリクエストで接続先が更新されること
   * 【期待結果】200 OK で更新後の接続先情報が返ること
   */
  it('should return 200 with updated connection on valid request', async () => {
    const updatedConnection = { ...mockConnectionPublic, name: '更新後' }
    vi.mocked(update).mockReturnValue(updatedConnection)

    const res = await request(app)
      .put(`/api/connections/${TEST_CONN_UUID}`)
      .send({ ...validCreateBody, name: '更新後' })

    expect(res.status).toBe(200)
    expect(res.body.name).toBe('更新後')
  })

  /**
   * 【テスト対象】PUT /api/connections/:id
   * 【テスト内容】存在しないIDを更新しようとした場合に 404 が返ること
   * 【期待結果】404 Not Found が返ること
   */
  it('should return 404 when connection not found', async () => {
    vi.mocked(update).mockImplementation(() => {
      throw new ConnectionNotFoundError('non-existent-id')
    })

    const res = await request(app)
      .put('/api/connections/non-existent-id')
      .send(validCreateBody)

    expect(res.status).toBe(404)
    expect(res.body.error).toBeTruthy()
  })

  /**
   * 【テスト対象】PUT /api/connections/:id
   * 【テスト内容】パスワードを省略しても更新が成功すること（PUTはパスワード省略可）
   * 【期待結果】200 OK が返ること
   */
  it('should return 200 when password is omitted in PUT request', async () => {
    vi.mocked(update).mockReturnValue(mockConnectionPublic)

    const bodyWithoutPassword = { ...validCreateBody }
    delete (bodyWithoutPassword as Record<string, unknown>).password

    const res = await request(app)
      .put(`/api/connections/${TEST_CONN_UUID}`)
      .send(bodyWithoutPassword)

    expect(res.status).toBe(200)
  })

  /**
   * 【テスト対象】PUT /api/connections/:id
   * 【テスト内容】必須フィールド未指定時に 400 が返ること
   * 【期待結果】400 Bad Request が返ること
   */
  it('should return 400 when required fields are missing in PUT', async () => {
    const res = await request(app)
      .put(`/api/connections/${TEST_CONN_UUID}`)
      .send({ name: 'テスト' }) // 他の必須フィールドなし

    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/connections/:id', () => {
  let app: express.Application

  beforeEach(async () => {
    vi.resetAllMocks()
    app = await createTestApp()
  })

  /**
   * 【テスト対象】DELETE /api/connections/:id
   * 【テスト内容】接続先が正常に削除されること
   * 【期待結果】204 No Content が返ること（ボディなし）
   */
  it('should return 204 on successful deletion', async () => {
    vi.mocked(remove).mockReturnValue(undefined)

    const res = await request(app)
      .delete(`/api/connections/${TEST_CONN_UUID}`)

    expect(res.status).toBe(204)
    expect(res.body).toEqual({}) // ボディなし
  })

  /**
   * 【テスト対象】DELETE /api/connections/:id
   * 【テスト内容】存在しないIDを削除しようとした場合に 404 が返ること
   * 【期待結果】404 Not Found が返ること
   */
  it('should return 404 when connection not found', async () => {
    vi.mocked(remove).mockImplementation(() => {
      throw new ConnectionNotFoundError('non-existent-id')
    })

    const res = await request(app)
      .delete('/api/connections/non-existent-id')

    expect(res.status).toBe(404)
    expect(res.body.error).toBeTruthy()
  })
})

describe('POST /api/connections/test', () => {
  let app: express.Application

  beforeEach(async () => {
    vi.resetAllMocks()
    app = await createTestApp()
  })

  /**
   * 【テスト対象】POST /api/connections/test
   * 【テスト内容】接続テストが成功した場合に 200 が返ること
   * 【期待結果】200 OK で { success: true, message: 'Connection successful.' } が返ること
   */
  it('should return 200 when connection test succeeds', async () => {
    vi.mocked(testConnection).mockResolvedValue({
      success: true,
      message: 'Connection successful.',
    })

    const res = await request(app)
      .post('/api/connections/test')
      .send(validCreateBody)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.message).toBe('Connection successful.')
  })

  /**
   * 【テスト対象】POST /api/connections/test
   * 【テスト内容】接続テストが失敗した場合に 400 が返ること
   * 【期待結果】400 Bad Request で { success: false, message: '...' } が返ること
   */
  it('should return 400 when connection test fails', async () => {
    vi.mocked(testConnection).mockResolvedValue({
      success: false,
      message: 'Connection failed: ECONNREFUSED',
    })

    const res = await request(app)
      .post('/api/connections/test')
      .send(validCreateBody)

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toContain('Connection failed')
  })

  /**
   * 【テスト対象】POST /api/connections/test
   * 【テスト内容】必須フィールド未指定時に 400 が返ること（バリデーションエラー）
   * 【期待結果】400 Bad Request が返ること
   */
  it('should return 400 when required fields are missing in test request', async () => {
    const res = await request(app)
      .post('/api/connections/test')
      .send({ name: 'テスト' }) // 他の必須フィールドなし

    expect(res.status).toBe(400)
    expect(res.body.error).toBeTruthy()
  })

  /**
   * 【テスト対象】POST /api/connections/test
   * 【テスト内容】POST /api/connections/test が /:id ルートと競合しないこと
   * 【期待結果】'test' が ID として解釈されず、testConnection が呼ばれること
   *
   * Express のルート定義順により、/test が /:id より先にマッチすることを確認する
   */
  it('should not confuse /test route with /:id route', async () => {
    vi.mocked(testConnection).mockResolvedValue({
      success: true,
      message: 'Connection successful.',
    })

    const res = await request(app)
      .post('/api/connections/test')
      .send(validCreateBody)

    // testConnection が呼ばれること（update が呼ばれないこと）
    expect(testConnection).toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(res.status).toBe(200)
  })
})
