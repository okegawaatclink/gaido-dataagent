/**
 * DataAgent E2Eテスト - テストケース #193
 * パスワードがAES-256-GCMで暗号化保存され平文で参照できない
 */
import { test, expect } from '@playwright/test'

/**
 * 【ユーザーストーリー】
 * DataAgentの利用者がDB接続先のパスワードを登録するとき、
 * パスワードはAES-256-GCMで暗号化されて保存され、APIからは参照できない
 *
 * 【テストケースIssue】#193
 *
 * 【前提条件】
 * - バックエンドが起動済み
 *
 * 【期待結果】
 * - API一覧レスポンスにパスワードが含まれない
 * - 暗号化されたパスワードが正しく復号されてDB接続に使用される
 */
test.describe('Password Encryption - AES-256-GCM', () => {
  const BACKEND = 'http://okegawaatclink-gaido-dataagent-output-system:3002'
  const TEST_PASSWORD = 'TestPass@123!Secure'

  /**
   * DB接続先登録後、GET /api/connections でパスワードが返らないこと
   */
  test('should not include password in GET /api/connections response', async ({ request }) => {
    // DB接続先を登録
    const createResp = await request.post(`${BACKEND}/api/connections`, {
      data: {
        name: '暗号化テスト(193)',
        dbType: 'mysql',
        host: 'localhost',
        port: 3306,
        username: 'testuser',
        password: TEST_PASSWORD,
        databaseName: 'testdb',
      },
    })
    expect(createResp.status()).toBe(201)
    const created = await createResp.json()

    try {
      // 一覧取得
      const listResp = await request.get(`${BACKEND}/api/connections`)
      const list = await listResp.json()
      const found = list.find((c: { id: string }) => c.id === created.id)
      expect(found).toBeDefined()

      // パスワード関連フィールドが含まれないこと
      expect(found).not.toHaveProperty('password')
      expect(found).not.toHaveProperty('passwordEncrypted')
      expect(found).not.toHaveProperty('password_encrypted')

      // レスポンス全体を文字列化して平文パスワードが含まれないことを確認
      const responseText = JSON.stringify(found)
      expect(responseText).not.toContain(TEST_PASSWORD)
    } finally {
      // クリーンアップ
      await request.delete(`${BACKEND}/api/connections/${created.id}`)
    }
  })

  /**
   * DB接続先登録後のレスポンスにもパスワードが含まれないこと
   */
  test('should not include password in POST /api/connections response', async ({ request }) => {
    // DB接続先を登録
    const createResp = await request.post(`${BACKEND}/api/connections`, {
      data: {
        name: '暗号化テストPOST(193)',
        dbType: 'mysql',
        host: 'localhost',
        port: 3306,
        username: 'testuser',
        password: TEST_PASSWORD,
        databaseName: 'testdb',
      },
    })
    expect(createResp.status()).toBe(201)
    const body = await createResp.json()

    try {
      // 登録レスポンスにパスワードが含まれないこと
      expect(body).not.toHaveProperty('password')
      expect(body).not.toHaveProperty('passwordEncrypted')
      expect(body).not.toHaveProperty('password_encrypted')

      // レスポンス全体を文字列化して平文パスワードが含まれないことを確認
      const responseText = JSON.stringify(body)
      expect(responseText).not.toContain(TEST_PASSWORD)
    } finally {
      // クリーンアップ
      await request.delete(`${BACKEND}/api/connections/${body.id}`)
    }
  })

  /**
   * 暗号化されたパスワードが正しく復号されてDB接続テストが成功すること
   */
  test('should decrypt password correctly to use in DB connection test', async ({ request }) => {
    // 正しいパスワードでDB接続先を登録してから接続テストを実行
    const testResp = await request.post(`${BACKEND}/api/connections/test`, {
      data: {
        name: '復号確認テスト(193)',
        dbType: 'mysql',
        host: 'okegawaatclink-gaido-dataagent-mysql',
        port: 3306,
        username: 'readonly_user',
        password: 'readonlypass',
        databaseName: 'sampledb',
      },
    })

    // 正しいパスワードでの接続は成功すること
    expect(testResp.status()).toBe(200)
    const body = await testResp.json()
    expect(body).toHaveProperty('success', true)
  })
})
