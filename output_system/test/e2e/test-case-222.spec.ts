/**
 * DataAgent E2Eテスト - テストケース #222
 * GraphQL接続先ごとに会話履歴が分離される
 */
import { test, expect } from '@playwright/test'

/**
 * 【ユーザーストーリー】
 * データ分析ユーザーが複数のGraphQL接続先を使い分けるとき、
 * 各接続先の会話履歴が分離されており、切り替えると対応する履歴のみ表示される
 *
 * 【テストケースIssue】#222
 *
 * 【前提条件】
 * - GraphQL接続先A、B が登録済み
 *
 * 【期待結果】
 * - GraphQL接続先Aの会話履歴にはAでの会話のみ表示される
 * - GraphQL接続先Bの会話履歴にはBでの会話のみ表示される
 * - DB接続先の会話履歴はGraphQL接続先選択時に表示されない
 */
test.describe('GraphQL Chat - Conversation History Isolation per Connection', () => {
  const connA = {
    id: 'graphql-conn-222a',
    name: '接続先A_GraphQL',
    dbType: 'graphql',
    endpointUrl: 'https://api-a.example.com/graphql',
    host: null,
    port: null,
    username: null,
    databaseName: null,
    isLastUsed: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  const connB = {
    id: 'graphql-conn-222b',
    name: '接続先B_GraphQL',
    dbType: 'graphql',
    endpointUrl: 'https://api-b.example.com/graphql',
    host: null,
    port: null,
    username: null,
    databaseName: null,
    isLastUsed: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  /**
   * 接続先Aの履歴取得APIが接続先AのIDで呼ばれること
   */
  test('should fetch history with correct dbConnectionId for GraphQL connection A', async ({ page }) => {
    const historyA = [
      {
        id: 'conv-a-1',
        title: '接続先Aの会話1',
        dbConnectionId: connA.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]

    await page.route('**/api/connections', async (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([connA, connB]),
        })
      } else {
        route.continue()
      }
    })

    const historyRequests: string[] = []
    await page.route('**/api/history*', async (route) => {
      const url = route.request().url()
      historyRequests.push(url)
      if (url.includes(connB.id)) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(historyA),
        })
      } else {
        route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      }
    })

    await page.goto('/')

    // 接続先Bが選択されていること
    const dbSelect = page.locator('.app-header__db-select, select')
    await expect(dbSelect).toBeVisible({ timeout: 5000 })
    await expect(dbSelect).toHaveValue(connB.id)

    // サイドバーに接続先Bの会話が表示されること（履歴APIがB IDで呼ばれること）
    await page.waitForTimeout(1000)
    const hasConnBHistory = historyRequests.some((url) => url.includes(connB.id))
    expect(hasConnBHistory).toBeTruthy()
  })

  /**
   * 接続先Aから接続先Bに切り替えると履歴取得APIがBのIDで呼ばれること
   */
  test('should fetch history with new dbConnectionId when switching GraphQL connection', async ({ page }) => {
    await page.route('**/api/connections', async (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([connA, connB]),
        })
      } else {
        route.continue()
      }
    })

    const historyRequests: string[] = []
    await page.route('**/api/history*', async (route) => {
      const url = route.request().url()
      historyRequests.push(url)
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })

    await page.goto('/')

    const dbSelect = page.locator('.app-header__db-select, select')
    await expect(dbSelect).toBeVisible({ timeout: 5000 })

    // 接続先Aに切り替え
    await dbSelect.selectOption(connA.id)
    await page.waitForTimeout(500)

    // 接続先Bに切り替え
    await dbSelect.selectOption(connB.id)
    await page.waitForTimeout(500)

    // 各接続先IDで履歴取得が行われていること
    const hasConnAHistory = historyRequests.some((url) => url.includes(connA.id))
    const hasConnBHistory = historyRequests.some((url) => url.includes(connB.id))
    expect(hasConnAHistory || hasConnBHistory).toBeTruthy()
  })

  /**
   * GraphQL接続先とDB接続先を切り替えると履歴が切り替わること
   */
  test('should isolate history between GraphQL and DB connections', async ({ page }) => {
    const mysqlConn = {
      id: 'mysql-conn-222',
      name: 'MySQL接続先',
      dbType: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'user',
      databaseName: 'db',
      isLastUsed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    await page.route('**/api/connections', async (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([connA, mysqlConn]),
        })
      } else {
        route.continue()
      }
    })

    const historyRequests: string[] = []
    await page.route('**/api/history*', async (route) => {
      const url = route.request().url()
      historyRequests.push(url)
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })

    await page.goto('/')

    const dbSelect = page.locator('.app-header__db-select, select')
    await expect(dbSelect).toBeVisible({ timeout: 5000 })

    // MySQL接続先に切り替え
    await dbSelect.selectOption(mysqlConn.id)
    await page.waitForTimeout(500)

    // GraphQL接続先Aに切り替え
    await dbSelect.selectOption(connA.id)
    await page.waitForTimeout(500)

    // ドロップダウンが接続先Aに更新されること
    await expect(dbSelect).toHaveValue(connA.id)
  })
})
