/**
 * DataAgent E2Eテスト - テストケース #216
 * GraphQL接続先がヘッダードロップダウンに「接続名 (graphql)」形式で表示される
 */
import { test, expect } from '@playwright/test'

/**
 * 【ユーザーストーリー】
 * データ分析ユーザーがGraphQL接続先を登録したとき、
 * チャット画面ヘッダーのDB選択ドロップダウンに「接続名 (graphql)」形式で表示される。
 * DB接続先は「接続名 (mysql)」「接続名 (postgresql)」形式で区別される。
 *
 * 【テストケースIssue】#216
 *
 * 【前提条件】
 * - GraphQL接続先が1件以上登録済み
 *
 * 【期待結果】
 * - ドロップダウンに「社内API (graphql)」形式で表示される
 * - DB接続先は「接続名 (mysql)」や「接続名 (postgresql)」形式で表示され、区別できる
 */
test.describe('GraphQL Connection - Dropdown Display Format', () => {
  /**
   * GraphQL接続先が「接続名 (graphql)」形式で表示されること
   */
  test('should display GraphQL connection as "name (graphql)" format in dropdown', async ({ page }) => {
    const graphqlConn = {
      id: 'graphql-conn-216',
      name: '社内API',
      dbType: 'graphql',
      endpointUrl: 'https://internal-api.example.com/graphql',
      host: null,
      port: null,
      username: null,
      databaseName: null,
      isLastUsed: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await page.route('**/api/connections', async (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([graphqlConn]),
        })
      } else {
        route.continue()
      }
    })
    await page.route('**/api/history*', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })
    await page.goto('/')

    // ヘッダーのDBドロップダウンを確認
    const dbSelect = page.locator('.app-header__db-select, select')
    await expect(dbSelect).toBeVisible({ timeout: 5000 })

    // 「社内API (graphql)」形式のオプションが含まれること
    const options = await dbSelect.locator('option').allTextContents()
    expect(options.some((opt) => opt.includes('社内API') && opt.toLowerCase().includes('graphql'))).toBeTruthy()
  })

  /**
   * MySQL接続先は「接続名 (mysql)」形式で表示されること
   */
  test('should display MySQL connection as "name (mysql)" format in dropdown', async ({ page }) => {
    const mysqlConn = {
      id: 'mysql-conn-216',
      name: '本番MySQL',
      dbType: 'mysql',
      host: 'db.example.com',
      port: 3306,
      username: 'admin',
      databaseName: 'production',
      isLastUsed: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await page.route('**/api/connections', async (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([mysqlConn]),
        })
      } else {
        route.continue()
      }
    })
    await page.route('**/api/history*', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })
    await page.goto('/')

    const dbSelect = page.locator('.app-header__db-select, select')
    await expect(dbSelect).toBeVisible({ timeout: 5000 })

    const options = await dbSelect.locator('option').allTextContents()
    expect(options.some((opt) => opt.includes('本番MySQL') && opt.toLowerCase().includes('mysql'))).toBeTruthy()
  })

  /**
   * 複数の接続先が混在する場合、それぞれ正しい形式で表示されること
   */
  test('should display mixed connections with correct format in dropdown', async ({ page }) => {
    const connections = [
      {
        id: 'graphql-conn-216b',
        name: '社内API',
        dbType: 'graphql',
        endpointUrl: 'https://api.example.com/graphql',
        host: null,
        port: null,
        username: null,
        databaseName: null,
        isLastUsed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'mysql-conn-216b',
        name: '売上DB',
        dbType: 'mysql',
        host: 'sales.example.com',
        port: 3306,
        username: 'user',
        databaseName: 'sales',
        isLastUsed: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'pg-conn-216b',
        name: '分析DB',
        dbType: 'postgresql',
        host: 'analytics.example.com',
        port: 5432,
        username: 'analyst',
        databaseName: 'analytics',
        isLastUsed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]
    await page.route('**/api/connections', async (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(connections),
        })
      } else {
        route.continue()
      }
    })
    await page.route('**/api/history*', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })
    await page.goto('/')

    const dbSelect = page.locator('.app-header__db-select, select')
    await expect(dbSelect).toBeVisible({ timeout: 5000 })

    const options = await dbSelect.locator('option').allTextContents()

    // GraphQL接続先が「(graphql)」形式で表示
    expect(options.some((opt) => opt.includes('社内API') && opt.toLowerCase().includes('graphql'))).toBeTruthy()
    // MySQL接続先が「(mysql)」形式で表示
    expect(options.some((opt) => opt.includes('売上DB') && opt.toLowerCase().includes('mysql'))).toBeTruthy()
    // PostgreSQL接続先が「(postgresql)」形式で表示
    expect(options.some((opt) => opt.includes('分析DB') && opt.toLowerCase().includes('postgresql'))).toBeTruthy()
  })
})
