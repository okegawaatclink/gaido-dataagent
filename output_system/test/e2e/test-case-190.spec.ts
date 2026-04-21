/**
 * DataAgent E2Eテスト - テストケース #190
 * DB接続名の重複登録で409エラーが返る
 */
import { test, expect } from '@playwright/test'

/**
 * 【ユーザーストーリー】
 * DataAgentの利用者が同じ接続名でDB接続先を登録しようとすると409エラーが返る
 *
 * 【テストケースIssue】#190
 *
 * 【前提条件】
 * - バックエンドが起動済み
 *
 * 【期待結果】
 * - 同名の接続先を登録しようとすると409 Conflictエラーが返る
 * - エラーメッセージで重複が明確にわかる
 */
test.describe('DB Connection - Duplicate Name Error', () => {
  const BACKEND = 'http://okegawaatclink-gaido-dataagent-output-system:3002'

  /**
   * 同じ接続名でDB接続先を2回登録すると2回目は409エラーが返ること
   */
  test('should return 409 when registering duplicate connection name', async ({ request }) => {
    const connectionName = '重複テストDB(190)'

    // 最初の登録
    const firstResp = await request.post(`${BACKEND}/api/connections`, {
      data: {
        name: connectionName,
        dbType: 'mysql',
        host: 'localhost',
        port: 3306,
        username: 'user1',
        password: 'pass1',
        databaseName: 'db1',
      },
    })
    expect(firstResp.status()).toBe(201)
    const created = await firstResp.json()

    try {
      // 同名で2回目の登録試行
      const secondResp = await request.post(`${BACKEND}/api/connections`, {
        data: {
          name: connectionName,
          dbType: 'postgresql',
          host: 'another-host',
          port: 5432,
          username: 'user2',
          password: 'pass2',
          databaseName: 'db2',
        },
      })

      expect(secondResp.status()).toBe(409)

      const body = await secondResp.json()
      // エラーメッセージが返ること
      expect(body).toHaveProperty('error')
      expect(typeof body.error).toBe('string')
    } finally {
      // クリーンアップ
      await request.delete(`${BACKEND}/api/connections/${created.id}`)
    }
  })

  /**
   * 異なる接続名での登録は成功すること（重複チェックが接続名のみであることを確認）
   */
  test('should allow registering with different connection names', async ({ request }) => {
    const name1 = '接続名A(190)'
    const name2 = '接続名B(190)'
    const ids: string[] = []

    try {
      // 1件目の登録
      const resp1 = await request.post(`${BACKEND}/api/connections`, {
        data: {
          name: name1,
          dbType: 'mysql',
          host: 'localhost',
          port: 3306,
          username: 'user',
          password: 'pass',
          databaseName: 'db',
        },
      })
      expect(resp1.status()).toBe(201)
      const conn1 = await resp1.json()
      ids.push(conn1.id)

      // 2件目の登録（異なる名前）
      const resp2 = await request.post(`${BACKEND}/api/connections`, {
        data: {
          name: name2,
          dbType: 'mysql',
          host: 'localhost',
          port: 3306,
          username: 'user',
          password: 'pass',
          databaseName: 'db',
        },
      })
      expect(resp2.status()).toBe(201)
      const conn2 = await resp2.json()
      ids.push(conn2.id)

      // 両方が一覧に存在すること
      const listResp = await request.get(`${BACKEND}/api/connections`)
      const list = await listResp.json()
      const foundNames = list.map((c: { name: string }) => c.name)
      expect(foundNames).toContain(name1)
      expect(foundNames).toContain(name2)
    } finally {
      // クリーンアップ
      for (const id of ids) {
        await request.delete(`${BACKEND}/api/connections/${id}`)
      }
    }
  })
})
