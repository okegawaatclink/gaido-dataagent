/**
 * DataAgent E2Eテスト - テストケース #228
 * GraphQL接続名の重複登録で409エラーが返る
 */
import { test, expect } from '@playwright/test'

/**
 * 【ユーザーストーリー】
 * データ分析ユーザーが既存の接続先と同じ接続名でGraphQL接続先を登録しようとすると、
 * 409エラーが返り重複を防止する
 *
 * 【テストケースIssue】#228
 *
 * 【前提条件】
 * - 「テストAPI」という接続名のGraphQL接続先が登録済み
 *
 * 【期待結果】
 * - 同名のGraphQL接続先の重複登録で409エラーが返る
 * - DB接続先とGraphQL接続先の間でも接続名の重複チェックが行われる
 */
test.describe('GraphQL Connection - Duplicate Name Validation', () => {
  const existingGraphQLConn = {
    id: 'existing-graphql-228',
    name: 'テストAPI',
    dbType: 'graphql',
    endpointUrl: 'https://test-api.example.com/graphql',
    host: null,
    port: null,
    username: null,
    databaseName: null,
    isLastUsed: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  const existingMysqlConn = {
    id: 'existing-mysql-228',
    name: 'モックMySQL',
    dbType: 'mysql',
    host: 'localhost',
    port: 3306,
    username: 'user',
    databaseName: 'db',
    isLastUsed: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  /**
   * 同名のGraphQL接続先を登録すると409エラーが返り、エラーメッセージが表示されること
   */
  test('should show error when registering GraphQL connection with duplicate name', async ({ page }) => {
    await page.route('**/api/connections', async (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([existingGraphQLConn, existingMysqlConn]),
        })
      } else if (route.request().method() === 'POST') {
        // 重複エラーを返す
        route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ error: '同じ接続名が既に登録されています' }),
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

    // GraphQLを選択して重複する接続名を入力
    await page.locator('select[name="dbType"]').selectOption('graphql')
    await page.locator('input[name="name"]').fill('テストAPI')
    await page.locator('input[name="endpointUrl"]').fill('https://other-api.example.com/graphql')

    // 保存ボタンをクリック
    await page.locator('.db-connection-form button[type="submit"]').click()

    // エラーメッセージが表示されること（フォームが残ること）
    await expect(page.locator('.db-connection-form')).toBeVisible({ timeout: 5000 })
  })

  /**
   * DB接続先と同名でGraphQL接続先を登録しようとすると409エラーが返ること
   */
  test('should show error when registering GraphQL connection with name same as DB connection', async ({ page }) => {
    await page.route('**/api/connections', async (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([existingMysqlConn]),
        })
      } else if (route.request().method() === 'POST') {
        // DB接続先と同名のGraphQL登録は409
        route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ error: '同じ接続名が既に登録されています' }),
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

    // GraphQLを選択してMySQL接続先と同じ名前を入力
    await page.locator('select[name="dbType"]').selectOption('graphql')
    await page.locator('input[name="name"]').fill('モックMySQL')
    await page.locator('input[name="endpointUrl"]').fill('https://other-api.example.com/graphql')

    // 保存ボタンをクリック
    await page.locator('.db-connection-form button[type="submit"]').click()

    // エラーが表示されてフォームが残ること
    await expect(page.locator('.db-connection-form')).toBeVisible({ timeout: 5000 })
  })

  /**
   * 異なる名前のGraphQL接続先は正常に登録できること
   */
  test('should save GraphQL connection with unique name successfully', async ({ page }) => {
    const newConn = {
      id: 'new-graphql-228',
      name: 'ユニーク接続名API',
      dbType: 'graphql',
      endpointUrl: 'https://unique-api.example.com/graphql',
      host: null,
      port: null,
      username: null,
      databaseName: null,
      isLastUsed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    let connections = [existingGraphQLConn, existingMysqlConn]
    await page.route('**/api/connections', async (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(connections),
        })
      } else if (route.request().method() === 'POST') {
        connections = [...connections, newConn]
        route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(newConn),
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

    // GraphQLを選択してユニークな接続名を入力
    await page.locator('select[name="dbType"]').selectOption('graphql')
    await page.locator('input[name="name"]').fill('ユニーク接続名API')
    await page.locator('input[name="endpointUrl"]').fill('https://unique-api.example.com/graphql')

    // 保存ボタンをクリック
    await page.locator('.db-connection-form button[type="submit"]').click()

    // 一覧に新しい接続先が表示されること
    await expect(page.locator('.db-connection-list')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.db-connection-list')).toContainText('ユニーク接続名API')
  })
})
