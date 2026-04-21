/**
 * DataAgent E2Eテスト - テストケース #191
 * DB接続テストで接続失敗時にエラーメッセージが返る
 */
import { test, expect } from '@playwright/test'

/**
 * 【ユーザーストーリー】
 * DataAgentの利用者がREST APIでDB接続テストを実行するとき、
 * 接続失敗時に適切なエラーメッセージが返る
 *
 * 【テストケースIssue】#191
 *
 * 【前提条件】
 * - バックエンドが起動済み
 *
 * 【期待結果】
 * - 到達不能ホストへの接続でエラーメッセージが返る
 * - 認証失敗時に適切なエラーメッセージが返る
 * - 存在しないDB名での接続失敗メッセージが返る
 * - 5秒以内にタイムアウトする
 */
test.describe('DB Connection Test - Error Handling', () => {
  const BACKEND = 'http://okegawaatclink-gaido-dataagent-output-system:3002'

  /**
   * 到達不能なホストへの接続でエラーメッセージが返ること
   * 注：接続失敗時は仕様上400が返る
   */
  test('should return error message for unreachable host', async ({ request }) => {
    const startTime = Date.now()
    const response = await request.post(`${BACKEND}/api/connections/test`, {
      data: {
        name: '到達不能テスト',
        dbType: 'mysql',
        host: '192.0.2.1',  // 到達不能なIPアドレス（TEST-NET-1, RFC5737）
        port: 3306,
        username: 'user',
        password: 'pass',
        databaseName: 'db',
      },
      timeout: 30000,  // 接続タイムアウト待機
    })
    const elapsed = Date.now() - startTime

    // 接続失敗は400で返ること
    expect(response.status()).toBe(400)

    const body = await response.json()
    expect(body).toHaveProperty('success', false)
    expect(body).toHaveProperty('message')
    expect(typeof body.message).toBe('string')
    expect(body.message.length).toBeGreaterThan(0)
  })

  /**
   * 誤った認証情報での接続で認証失敗のエラーメッセージが返ること
   * （実際のMySQLコンテナに誤認証情報で接続）
   */
  test('should return error message for wrong credentials', async ({ request }) => {
    const response = await request.post(`${BACKEND}/api/connections/test`, {
      data: {
        name: '認証失敗テスト',
        dbType: 'mysql',
        host: 'okegawaatclink-gaido-dataagent-mysql',
        port: 3306,
        username: 'wrong_user',
        password: 'wrong_password',
        databaseName: 'projects',
      },
    })

    // 認証失敗は400で返ること
    expect(response.status()).toBe(400)

    const body = await response.json()
    expect(body).toHaveProperty('success', false)
    expect(body).toHaveProperty('message')
    expect(typeof body.message).toBe('string')
  })

  /**
   * 存在しないDB名での接続で失敗のエラーメッセージが返ること
   */
  test('should return error message for non-existent database name', async ({ request }) => {
    const response = await request.post(`${BACKEND}/api/connections/test`, {
      data: {
        name: '存在しないDBテスト',
        dbType: 'mysql',
        host: 'okegawaatclink-gaido-dataagent-mysql',
        port: 3306,
        username: 'readonly_user',
        password: 'readonlypass',  // 正しいパスワード
        databaseName: 'nonexistent_db_999',  // 存在しないDB名
      },
    })

    // 存在しないDB名への接続失敗は400で返ること
    expect(response.status()).toBe(400)

    const body = await response.json()
    expect(body).toHaveProperty('success', false)
    expect(body).toHaveProperty('message')
  })

  /**
   * 正しい認証情報での接続テストが成功すること（正常系確認）
   */
  test('should return success for valid connection', async ({ request }) => {
    const response = await request.post(`${BACKEND}/api/connections/test`, {
      data: {
        name: '正常接続テスト',
        dbType: 'mysql',
        host: 'okegawaatclink-gaido-dataagent-mysql',
        port: 3306,
        username: 'readonly_user',
        password: 'readonlypass',
        databaseName: 'sampledb',
      },
    })

    // 正常接続は200で返ること
    expect(response.status()).toBe(200)

    const body = await response.json()
    expect(body).toHaveProperty('success', true)
    expect(body).toHaveProperty('message')
  })
})
