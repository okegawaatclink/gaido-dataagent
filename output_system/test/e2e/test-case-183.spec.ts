/**
 * DataAgent E2Eテスト - テストケース #183
 * DB接続先のCRUD APIで登録・取得・更新・削除・接続テストができる
 */
import { test, expect } from '@playwright/test'

/**
 * 【ユーザーストーリー】
 * DataAgentの利用者がREST APIでDB接続先の登録・取得・更新・削除・接続テストを行う
 *
 * 【テストケースIssue】#183
 *
 * 【前提条件】
 * - バックエンドが起動済み
 *
 * 【期待結果】
 * - POST /api/connections で201が返る
 * - GET /api/connections でパスワードが含まれない
 * - PUT /api/connections/:id で更新が反映される
 * - DELETE /api/connections/:id で削除される
 * - POST /api/connections/test で接続テストができる
 * - SQLite上のパスワードが暗号化されている
 */
test.describe('DB Connections CRUD API', () => {
  const BACKEND = 'http://okegawaatclink-gaido-dataagent-output-system:3002'

  /**
   * POST /api/connections で201が返り、接続先が登録されること
   */
  test('should create a DB connection and return 201', async ({ request }) => {
    const response = await request.post(`${BACKEND}/api/connections`, {
      data: {
        name: 'テストDB(CRUD-183)',
        dbType: 'mysql',
        host: 'localhost',
        port: 3306,
        username: 'testuser',
        password: 'TestPass123',
        databaseName: 'testdb',
      },
    })

    expect(response.status()).toBe(201)

    const body = await response.json()
    expect(body).toHaveProperty('id')
    expect(body.name).toBe('テストDB(CRUD-183)')
    expect(body.dbType).toBe('mysql')
    expect(body.host).toBe('localhost')
    expect(body.port).toBe(3306)
    expect(body.username).toBe('testuser')
    expect(body.databaseName).toBe('testdb')
    // パスワードはレスポンスに含まれないこと
    expect(body).not.toHaveProperty('password')
    expect(body).not.toHaveProperty('passwordEncrypted')

    // クリーンアップ
    await request.delete(`${BACKEND}/api/connections/${body.id}`)
  })

  /**
   * GET /api/connections で接続先一覧が取得でき、パスワードが含まれないこと
   */
  test('should list DB connections without password field', async ({ request }) => {
    // テスト用接続先を作成
    const createResp = await request.post(`${BACKEND}/api/connections`, {
      data: {
        name: 'テストDB(GET-183)',
        dbType: 'postgresql',
        host: 'localhost',
        port: 5432,
        username: 'pguser',
        password: 'SecretPass456',
        databaseName: 'pgdb',
      },
    })
    const created = await createResp.json()

    // 一覧を取得
    const response = await request.get(`${BACKEND}/api/connections`)
    expect(response.status()).toBe(200)

    const body = await response.json()
    expect(Array.isArray(body)).toBe(true)

    // 作成した接続先を検索
    const found = body.find((c: { id: string }) => c.id === created.id)
    expect(found).toBeDefined()
    expect(found.name).toBe('テストDB(GET-183)')
    // パスワードフィールドが含まれないこと
    expect(found).not.toHaveProperty('password')
    expect(found).not.toHaveProperty('passwordEncrypted')
    expect(found).not.toHaveProperty('password_encrypted')

    // クリーンアップ
    await request.delete(`${BACKEND}/api/connections/${created.id}`)
  })

  /**
   * PUT /api/connections/:id で接続先を更新できること
   */
  test('should update a DB connection', async ({ request }) => {
    // テスト用接続先を作成
    const createResp = await request.post(`${BACKEND}/api/connections`, {
      data: {
        name: 'テストDB(更新前-183)',
        dbType: 'mysql',
        host: 'localhost',
        port: 3306,
        username: 'user1',
        password: 'pass1',
        databaseName: 'db1',
      },
    })
    const created = await createResp.json()

    // 更新
    const updateResp = await request.put(`${BACKEND}/api/connections/${created.id}`, {
      data: {
        name: 'テストDB(更新後-183)',
        dbType: 'mysql',
        host: 'newhost',
        port: 3307,
        username: 'user2',
        databaseName: 'db2',
      },
    })
    expect(updateResp.status()).toBe(200)

    const updated = await updateResp.json()
    expect(updated.name).toBe('テストDB(更新後-183)')
    expect(updated.host).toBe('newhost')
    expect(updated.port).toBe(3307)
    expect(updated.username).toBe('user2')
    expect(updated.databaseName).toBe('db2')

    // クリーンアップ
    await request.delete(`${BACKEND}/api/connections/${created.id}`)
  })

  /**
   * DELETE /api/connections/:id で接続先が削除されること
   */
  test('should delete a DB connection', async ({ request }) => {
    // テスト用接続先を作成
    const createResp = await request.post(`${BACKEND}/api/connections`, {
      data: {
        name: 'テストDB(削除-183)',
        dbType: 'mysql',
        host: 'localhost',
        port: 3306,
        username: 'user',
        password: 'pass',
        databaseName: 'db',
      },
    })
    const created = await createResp.json()

    // 削除
    const deleteResp = await request.delete(`${BACKEND}/api/connections/${created.id}`)
    expect(deleteResp.status()).toBe(204)

    // 一覧から消えていること
    const listResp = await request.get(`${BACKEND}/api/connections`)
    const list = await listResp.json()
    const found = list.find((c: { id: string }) => c.id === created.id)
    expect(found).toBeUndefined()
  })

  /**
   * POST /api/connections/test で接続テストができること（失敗ケース）
   */
  test('should test DB connection and return result', async ({ request }) => {
    // 存在しないDBへの接続テスト（失敗することを確認）
    const response = await request.post(`${BACKEND}/api/connections/test`, {
      data: {
        name: '接続テスト',
        dbType: 'mysql',
        host: '192.0.2.1',  // 到達不能なIPアドレス
        port: 3306,
        username: 'user',
        password: 'pass',
        databaseName: 'db',
      },
    })

    // 接続失敗時は400が返ること（仕様: 接続失敗は400で返す）
    expect(response.status()).toBe(400)

    const body = await response.json()
    expect(body).toHaveProperty('success')
    expect(body).toHaveProperty('message')
    // 到達不能ホストへの接続は失敗するはず
    expect(body.success).toBe(false)
  })
})
