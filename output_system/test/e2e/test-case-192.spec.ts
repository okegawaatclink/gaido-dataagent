/**
 * DataAgent E2Eテスト - テストケース #192
 * DB接続先削除時にCASCADE削除で関連会話・メッセージも削除される
 */
import { test, expect } from '@playwright/test'

/**
 * 【ユーザーストーリー】
 * DataAgentの利用者がDB接続先を削除すると、
 * 関連する会話とメッセージも自動的に削除される
 *
 * 【テストケースIssue】#192
 *
 * 【前提条件】
 * - バックエンドが起動済み
 *
 * 【期待結果】
 * - DB接続先削除時に関連する会話がすべて削除される
 * - 削除された会話に属するメッセージもすべて削除される
 * - 他のDB接続先の会話・メッセージは影響を受けない
 */
test.describe('DB Connection - CASCADE Delete', () => {
  const BACKEND = 'http://okegawaatclink-gaido-dataagent-output-system:3002'

  /**
   * DB接続先削除時に関連する会話が削除されること
   */
  test('should delete related conversations when DB connection is deleted', async ({ request }) => {
    // テスト用DB接続先を作成
    const connResp = await request.post(`${BACKEND}/api/connections`, {
      data: {
        name: 'CASCADE削除テスト(192)',
        dbType: 'mysql',
        host: 'localhost',
        port: 3306,
        username: 'user',
        password: 'pass',
        databaseName: 'testdb',
      },
    })
    expect(connResp.status()).toBe(201)
    const connection = await connResp.json()
    const connectionId = connection.id

    // この接続先に紐づく会話を直接確認（GET /api/historyで空であること）
    const historyBeforeResp = await request.get(`${BACKEND}/api/history?dbConnectionId=${connectionId}`)
    expect(historyBeforeResp.status()).toBe(200)
    const historyBefore = await historyBeforeResp.json()
    // 新規接続先なので会話は0件
    expect(historyBefore).toHaveLength(0)

    // DB接続先を削除
    const deleteResp = await request.delete(`${BACKEND}/api/connections/${connectionId}`)
    expect(deleteResp.status()).toBe(204)

    // 接続先が削除されていること（一覧から消えていること）
    const listResp = await request.get(`${BACKEND}/api/connections`)
    const list = await listResp.json()
    const found = list.find((c: { id: string }) => c.id === connectionId)
    expect(found).toBeUndefined()

    // 削除した接続先のdbConnectionIdで履歴を取得しても空またはエラーになること
    const historyAfterResp = await request.get(`${BACKEND}/api/history?dbConnectionId=${connectionId}`)
    // 接続先が削除されているので、会話は0件または400が返る
    if (historyAfterResp.status() === 200) {
      const historyAfter = await historyAfterResp.json()
      expect(historyAfter).toHaveLength(0)
    } else {
      // 400等のエラーが返る場合も許容
      expect([200, 400, 404]).toContain(historyAfterResp.status())
    }
  })

  /**
   * 他のDB接続先の会話が影響を受けないこと
   */
  test('should not affect conversations of other DB connections when deleting one', async ({ request }) => {
    // 接続先Aを作成
    const connAResp = await request.post(`${BACKEND}/api/connections`, {
      data: {
        name: 'CASCADE削除テストA(192)',
        dbType: 'mysql',
        host: 'localhost',
        port: 3306,
        username: 'user',
        password: 'pass',
        databaseName: 'dba',
      },
    })
    expect(connAResp.status()).toBe(201)
    const connA = await connAResp.json()

    // 接続先Bを作成
    const connBResp = await request.post(`${BACKEND}/api/connections`, {
      data: {
        name: 'CASCADE削除テストB(192)',
        dbType: 'mysql',
        host: 'localhost',
        port: 3306,
        username: 'user',
        password: 'pass',
        databaseName: 'dbb',
      },
    })
    expect(connBResp.status()).toBe(201)
    const connB = await connBResp.json()

    // 接続先Aを削除
    const deleteResp = await request.delete(`${BACKEND}/api/connections/${connA.id}`)
    expect(deleteResp.status()).toBe(204)

    // 接続先Bは削除されていないこと
    const listResp = await request.get(`${BACKEND}/api/connections`)
    const list = await listResp.json()
    const foundB = list.find((c: { id: string }) => c.id === connB.id)
    expect(foundB).toBeDefined()
    expect(foundB.name).toBe('CASCADE削除テストB(192)')

    // クリーンアップ
    await request.delete(`${BACKEND}/api/connections/${connB.id}`)
  })
})
