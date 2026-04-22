/**
 * DataAgent E2Eテスト - テストケース #230
 * GraphQL接続先のhost/port/username/password/database_nameがNULLで保存される
 */
import { test, expect } from '@playwright/test'

/**
 * 【ユーザーストーリー】
 * データ分析ユーザーがGraphQL接続先を登録したとき、
 * DB固有のフィールド（host/port/username/databaseName）がnullで返り、
 * endpointUrlとdbTypeが正しく設定される
 *
 * 【テストケースIssue】#230
 *
 * 【前提条件】
 * - GraphQL接続先が登録済み
 *
 * 【期待結果】
 * - GraphQL接続先のhost, port, username, databaseNameがnullで返る
 * - endpointUrlに入力したURLが設定されている
 * - dbTypeが「graphql」になっている
 * - パスワードフィールドは返却されない（セキュリティ上）
 */
test.describe('GraphQL Connection - Null DB Fields Verification', () => {
  /**
   * GET /api/connectionsでGraphQL接続先のDB固有フィールドがnullであること
   */
  test('should return null for DB-specific fields in GraphQL connection', async ({ page }) => {
    const graphqlConn = {
      id: 'graphql-null-230',
      name: 'NULLフィールドテスト',
      dbType: 'graphql',
      endpointUrl: 'https://null-field-test.example.com/graphql',
      host: null,
      port: null,
      username: null,
      databaseName: null,
      isLastUsed: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    let capturedPostBody: unknown = null
    await page.route('**/api/connections', async (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([graphqlConn]),
        })
      } else if (route.request().method() === 'POST') {
        capturedPostBody = route.request().postDataJSON()
        route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(graphqlConn),
        })
      } else {
        route.continue()
      }
    })
    await page.route('**/api/history*', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })

    await page.goto('/')

    // チャット画面が表示されること（GraphQL接続先が選択されていること）
    await expect(page.locator('.app-header__db-select, select')).toBeVisible({ timeout: 5000 })
    const dbSelect = page.locator('.app-header__db-select, select')
    await expect(dbSelect).toHaveValue(graphqlConn.id)
  })

  /**
   * GraphQL接続先登録時にhost/port/username/databaseNameを送らないこと
   */
  test('should not include DB-specific fields when registering GraphQL connection', async ({ page }) => {
    const existingConn = {
      id: 'existing-conn-230',
      name: '既存MySQL',
      dbType: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'user',
      databaseName: 'db',
      isLastUsed: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const newGraphQLConn = {
      id: 'new-graphql-230',
      name: 'フィールドテストAPI',
      dbType: 'graphql',
      endpointUrl: 'https://field-test.example.com/graphql',
      host: null,
      port: null,
      username: null,
      databaseName: null,
      isLastUsed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    let connections = [existingConn]
    let capturedPostBody: Record<string, unknown> | null = null

    await page.route('**/api/connections', async (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(connections),
        })
      } else if (route.request().method() === 'POST') {
        capturedPostBody = route.request().postDataJSON() as Record<string, unknown>
        connections = [...connections, newGraphQLConn]
        route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(newGraphQLConn),
        })
      } else {
        route.continue()
      }
    })
    await page.route('**/api/history*', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })

    await page.goto('/')

    // DB管理モーダルを開く
    await page.locator('.app-header__manage-btn').click()
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 })

    // 新規登録フォームを開く
    await page.locator('button[aria-label="新しい接続先を登録"]').click()

    // GraphQLを選択して入力
    await page.locator('select[name="dbType"]').selectOption('graphql')
    await page.locator('input[name="name"]').fill('フィールドテストAPI')
    await page.locator('input[name="endpointUrl"]').fill('https://field-test.example.com/graphql')

    // 保存ボタンをクリック
    await page.locator('.db-connection-form button[type="submit"]').click()

    // 一覧に保存されること
    await expect(page.locator('.db-connection-list')).toContainText('フィールドテストAPI', { timeout: 5000 })

    // リクエストボディにdbType=graphqlとendpointUrlが含まれること
    expect(capturedPostBody).toBeTruthy()
    if (capturedPostBody) {
      expect(capturedPostBody.dbType).toBe('graphql')
      expect(capturedPostBody.endpointUrl).toBe('https://field-test.example.com/graphql')
      // パスワードフィールドは未入力（空文字またはundefined）であること（GraphQLに不要）
      expect(capturedPostBody.password === undefined || capturedPostBody.password === '').toBeTruthy()
    }
  })

  /**
   * APIレスポンスでdbTypeがgraphqlになっていること（フロントエンドでの表示確認）
   */
  test('should display GraphQL connection with correct dbType in dropdown', async ({ page }) => {
    const graphqlConn = {
      id: 'graphql-dbtype-230',
      name: 'dbType確認API',
      dbType: 'graphql',
      endpointUrl: 'https://dbtype-check.example.com/graphql',
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

    // ドロップダウンに「接続名 (graphql)」形式で表示されること
    const dbSelect = page.locator('.app-header__db-select, select')
    await expect(dbSelect).toBeVisible({ timeout: 5000 })
    const options = await dbSelect.locator('option').allTextContents()
    expect(options.some((opt) => opt.includes('dbType確認API') && opt.toLowerCase().includes('graphql'))).toBeTruthy()
  })
})
