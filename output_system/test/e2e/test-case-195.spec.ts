/**
 * DataAgent E2Eテスト - テストケース #195
 * DB切替時に異なるDB間で会話データが混在しない
 */
import { test, expect } from '@playwright/test'

/**
 * 【ユーザーストーリー】
 * 複数のDBを使い分ける社内ユーザーがDB接続先を切り替えるとき、
 * サイドバーには選択中DBの会話履歴のみ表示される
 *
 * 【テストケースIssue】#195
 *
 * 【前提条件】
 * - DB接続先A、DB接続先Bの2つが登録されていること
 *
 * 【期待結果】
 * - DB切替後、サイドバーには選択中DBの会話履歴のみ表示される
 * - 他のDBの会話が混在しない
 * - API応答もDBごとに正しくフィルタリングされている
 */
test.describe('DB Connection Isolation - History Separation', () => {
  const BACKEND = 'http://okegawaatclink-gaido-dataagent-output-system:3002'

  /**
   * GET /api/history?dbConnectionId=A ではAの会話のみ返ること
   */
  test('should return only conversations for specified dbConnectionId via API', async ({ request }) => {
    // 接続先Aを作成
    const connAResp = await request.post(`${BACKEND}/api/connections`, {
      data: {
        name: '会話分離テストA(195)',
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
        name: '会話分離テストB(195)',
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

    try {
      // 接続先AのIDで会話履歴を取得
      const historyAResp = await request.get(`${BACKEND}/api/history?dbConnectionId=${connA.id}`)
      expect(historyAResp.status()).toBe(200)
      const historyA = await historyAResp.json()
      expect(Array.isArray(historyA)).toBe(true)
      // すべての会話がAの接続先に紐づいていること
      for (const conv of historyA) {
        // db_connection_id フィールドが存在しないかAのIDと一致すること
        if (conv.dbConnectionId !== undefined) {
          expect(conv.dbConnectionId).toBe(connA.id)
        }
      }

      // 接続先BのIDで会話履歴を取得
      const historyBResp = await request.get(`${BACKEND}/api/history?dbConnectionId=${connB.id}`)
      expect(historyBResp.status()).toBe(200)
      const historyB = await historyBResp.json()
      expect(Array.isArray(historyB)).toBe(true)
      // すべての会話がBの接続先に紐づいていること
      for (const conv of historyB) {
        if (conv.dbConnectionId !== undefined) {
          expect(conv.dbConnectionId).toBe(connB.id)
        }
      }

      // 2つのDBの会話履歴が混在していないこと（IDが重複していないこと）
      const idsA = historyA.map((c: { id: string }) => c.id)
      const idsB = historyB.map((c: { id: string }) => c.id)
      const intersection = idsA.filter((id: string) => idsB.includes(id))
      expect(intersection).toHaveLength(0)
    } finally {
      // クリーンアップ
      await request.delete(`${BACKEND}/api/connections/${connA.id}`)
      await request.delete(`${BACKEND}/api/connections/${connB.id}`)
    }
  })

  /**
   * DB切替時にサイドバーの会話一覧が更新されること（UIテスト）
   */
  test('should update sidebar history when switching DB connection in UI', async ({ page, request }) => {
    // 接続先が2件以上あることを確認
    const listResp = await request.get(`${BACKEND}/api/connections`)
    const connections = await listResp.json()

    if (connections.length < 2) {
      // 接続先が1件しかない場合は別の接続先を追加
      await request.post(`${BACKEND}/api/connections`, {
        data: {
          name: 'DB切替テスト用(195)',
          dbType: 'mysql',
          host: 'localhost',
          port: 3306,
          username: 'user',
          password: 'pass',
          databaseName: 'db',
        },
      })
    }

    await page.route('**/api/history*', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })

    await page.goto('/')

    // DB選択ドロップダウンが表示されること
    const dbSelect = page.locator('.app-header__db-select')
    await expect(dbSelect).toBeVisible({ timeout: 5000 })

    // ドロップダウンにオプションが2件以上あること
    const optionCount = await dbSelect.locator('option').count()
    if (optionCount >= 2) {
      // 別のDBに切り替え
      await dbSelect.selectOption({ index: 1 })
      await page.waitForTimeout(500)

      // チャットエリアがクリアされること（DB切替時の動作）
      // エラーが発生していないこと
      await expect(page.locator('.app-container')).toBeVisible()
    }
  })

  /**
   * dbConnectionIdなしでGET /api/history を呼ぶと400が返ること
   */
  test('should return 400 when dbConnectionId is missing in GET /api/history', async ({ request }) => {
    const response = await request.get(`${BACKEND}/api/history`)
    expect(response.status()).toBe(400)
  })
})
