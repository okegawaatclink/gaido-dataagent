/**
 * DataAgent E2Eテスト - テストケース #189
 * DB接続先登録時に必須フィールド未指定で400エラーが返る
 */
import { test, expect } from '@playwright/test'

/**
 * 【ユーザーストーリー】
 * DataAgentの利用者がREST APIでDB接続先を登録するとき、
 * 必須フィールドが未指定の場合は400エラーが返る
 *
 * 【テストケースIssue】#189
 *
 * 【前提条件】
 * - バックエンドが起動済み
 *
 * 【期待結果】
 * - 必須フィールド未指定時に400エラーとエラーメッセージが返る
 * - 不正なDB種別指定時に400エラーが返る
 * - 存在しないIDへの更新・削除で404エラーが返る
 */
test.describe('DB Connections API - Validation and Error Handling', () => {
  const BACKEND = 'http://okegawaatclink-gaido-dataagent-output-system:3002'

  /**
   * POST /api/connections で接続名が未指定の場合に400エラーが返ること
   */
  test('should return 400 when name is missing in POST /api/connections', async ({ request }) => {
    const response = await request.post(`${BACKEND}/api/connections`, {
      data: {
        // nameを省略
        dbType: 'mysql',
        host: 'localhost',
        port: 3306,
        username: 'user',
        password: 'pass',
        databaseName: 'db',
      },
    })

    expect(response.status()).toBe(400)

    const body = await response.json()
    expect(body).toHaveProperty('error')
    expect(typeof body.error).toBe('string')
  })

  /**
   * POST /api/connections でホストが未指定の場合に400エラーが返ること
   */
  test('should return 400 when host is missing in POST /api/connections', async ({ request }) => {
    const response = await request.post(`${BACKEND}/api/connections`, {
      data: {
        name: 'テスト接続',
        dbType: 'mysql',
        // hostを省略
        port: 3306,
        username: 'user',
        password: 'pass',
        databaseName: 'db',
      },
    })

    expect(response.status()).toBe(400)

    const body = await response.json()
    expect(body).toHaveProperty('error')
  })

  /**
   * POST /api/connections で不正なDB種別を指定した場合に400エラーが返ること
   */
  test('should return 400 when invalid dbType is specified', async ({ request }) => {
    const response = await request.post(`${BACKEND}/api/connections`, {
      data: {
        name: 'テスト接続',
        dbType: 'oracle',  // 無効なDB種別
        host: 'localhost',
        port: 1521,
        username: 'user',
        password: 'pass',
        databaseName: 'db',
      },
    })

    expect(response.status()).toBe(400)

    const body = await response.json()
    expect(body).toHaveProperty('error')
  })

  /**
   * PUT /api/connections/:id で存在しないIDを指定した場合に404エラーが返ること
   */
  test('should return 404 when updating non-existent connection', async ({ request }) => {
    const nonExistentId = '00000000-0000-0000-0000-000000000000'
    const response = await request.put(`${BACKEND}/api/connections/${nonExistentId}`, {
      data: {
        name: 'テスト接続',
        dbType: 'mysql',
        host: 'localhost',
        port: 3306,
        username: 'user',
        databaseName: 'db',
      },
    })

    expect(response.status()).toBe(404)
  })

  /**
   * DELETE /api/connections/:id で存在しないIDを指定した場合に404エラーが返ること
   */
  test('should return 404 when deleting non-existent connection', async ({ request }) => {
    const nonExistentId = '00000000-0000-0000-0000-000000000000'
    const response = await request.delete(`${BACKEND}/api/connections/${nonExistentId}`)

    expect(response.status()).toBe(404)
  })

  /**
   * POST /api/connections でパスワードが未指定の場合に400エラーが返ること
   */
  test('should return 400 when password is missing in POST /api/connections', async ({ request }) => {
    const response = await request.post(`${BACKEND}/api/connections`, {
      data: {
        name: 'テスト接続',
        dbType: 'mysql',
        host: 'localhost',
        port: 3306,
        username: 'user',
        // passwordを省略
        databaseName: 'db',
      },
    })

    expect(response.status()).toBe(400)

    const body = await response.json()
    expect(body).toHaveProperty('error')
  })

  /**
   * POST /api/connections でDB名が未指定の場合に400エラーが返ること
   */
  test('should return 400 when databaseName is missing in POST /api/connections', async ({ request }) => {
    const response = await request.post(`${BACKEND}/api/connections`, {
      data: {
        name: 'テスト接続',
        dbType: 'mysql',
        host: 'localhost',
        port: 3306,
        username: 'user',
        password: 'pass',
        // databaseNameを省略
      },
    })

    expect(response.status()).toBe(400)

    const body = await response.json()
    expect(body).toHaveProperty('error')
  })
})
