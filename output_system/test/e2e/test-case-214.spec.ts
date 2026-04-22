/**
 * DataAgent E2Eテスト - テストケース #214
 * GraphQL接続先を登録・編集・削除できる
 */
import { test, expect } from '@playwright/test'

/**
 * 【ユーザーストーリー】
 * データ分析ユーザーがGraphQL接続先を接続名とエンドポイントURLで登録・編集・削除できる。
 * 各操作後に接続先一覧が更新される。
 *
 * 【テストケースIssue】#214
 *
 * 【前提条件】
 * - アプリが起動済み
 * - DB管理モーダルにアクセスできる状態
 *
 * 【期待結果】
 * - GraphQL接続先を接続名とエンドポイントURLで登録できる
 * - 登録した接続先を編集して接続名やURLを変更できる
 * - 登録した接続先を削除できる
 * - 各操作後に接続先一覧が更新される
 */
test.describe('GraphQL Connection - CRUD Operations', () => {
  /**
   * GraphQL接続先の登録テスト（APIモックを使用）
   */
  test('should register a new GraphQL connection', async ({ page }) => {
    const mockExistingConn = {
      id: 'existing-conn',
      name: '既存DB',
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
      id: 'graphql-conn-214',
      name: 'テストGraphQL',
      dbType: 'graphql',
      endpointUrl: 'https://example.com/graphql',
      host: null,
      port: null,
      username: null,
      databaseName: null,
      isLastUsed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    let connections = [mockExistingConn]

    await page.route('**/api/connections', async (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(connections),
        })
      } else if (route.request().method() === 'POST') {
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

    // 「新しい接続先を登録」ボタンをクリック
    await page.locator('button[aria-label="新しい接続先を登録"]').click()

    // GraphQLを選択してフォームを入力
    await page.locator('select[name="dbType"]').selectOption('graphql')
    await page.locator('input[name="name"]').fill('テストGraphQL')
    await page.locator('input[name="endpointUrl"]').fill('https://example.com/graphql')

    // 保存
    await page.locator('.db-connection-form button[type="submit"]').click()

    // 一覧に新しい接続先が表示されること
    await expect(page.locator('.db-connection-list')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.db-connection-list')).toContainText('テストGraphQL')
  })

  /**
   * GraphQL接続先の編集テスト
   */
  test('should edit a GraphQL connection', async ({ page }) => {
    const graphqlConn = {
      id: 'graphql-edit-conn',
      name: 'テストGraphQL',
      dbType: 'graphql',
      endpointUrl: 'https://example.com/graphql',
      host: null,
      port: null,
      username: null,
      databaseName: null,
      isLastUsed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const updatedConn = {
      ...graphqlConn,
      name: 'テストGraphQL改',
      updatedAt: new Date().toISOString(),
    }
    let connections = [graphqlConn]

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
    await page.route('**/api/connections/**', async (route) => {
      if (route.request().method() === 'PUT') {
        connections = [updatedConn]
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(updatedConn),
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

    // 一覧にGraphQL接続先が表示されていること
    await expect(page.locator('.db-connection-list')).toContainText('テストGraphQL')

    // 編集ボタンをクリック（aria-labelで特定）
    await page.locator(`[aria-label="テストGraphQLを編集"]`).click()

    // 接続名を変更
    await page.locator('input[name="name"]').fill('テストGraphQL改')
    await page.locator('.db-connection-form button[type="submit"]').click()

    // 一覧に更新後の接続先が表示されること
    await expect(page.locator('.db-connection-list')).toContainText('テストGraphQL改')
  })

  /**
   * GraphQL接続先の削除テスト
   */
  test('should delete a GraphQL connection', async ({ page }) => {
    const graphqlConn = {
      id: 'graphql-del-conn',
      name: 'テストGraphQL改',
      dbType: 'graphql',
      endpointUrl: 'https://example.com/graphql',
      host: null,
      port: null,
      username: null,
      databaseName: null,
      isLastUsed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    // 他に接続先がないと初回起動ガイドになるため、既存DBも追加
    const existingConn = {
      id: 'existing-for-del',
      name: '残存DB',
      dbType: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'user',
      databaseName: 'db',
      isLastUsed: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    let connections = [graphqlConn, existingConn]

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
    await page.route(`**/api/connections/${graphqlConn.id}`, async (route) => {
      if (route.request().method() === 'DELETE') {
        connections = [existingConn]
        route.fulfill({ status: 204 })
      } else {
        route.continue()
      }
    })
    await page.route('**/api/connections/**', async (route) => {
      if (route.request().method() === 'DELETE') {
        connections = [existingConn]
        route.fulfill({ status: 204 })
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

    // GraphQL接続先が表示されていること
    await expect(page.locator('.db-connection-list')).toContainText('テストGraphQL改')

    // 削除ボタンをクリック（aria-labelで特定）
    const deleteBtn = page.locator(`[aria-label="テストGraphQL改を削除"]`)
    await expect(deleteBtn).toBeVisible({ timeout: 5000 })

    // window.confirm ダイアログを自動承認
    page.on('dialog', (dialog) => dialog.accept())
    await deleteBtn.click()

    // 削除確認後、一覧から消えること
    await page.waitForTimeout(1500)
    await expect(page.locator('.db-connection-list')).not.toContainText('テストGraphQL改')
  })
})
