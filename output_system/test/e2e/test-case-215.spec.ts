/**
 * DataAgent E2Eテスト - テストケース #215
 * GraphQL接続テストでIntrospection成功/失敗がトースト通知される
 */
import { test, expect } from '@playwright/test'

/**
 * 【ユーザーストーリー】
 * データ分析ユーザーがGraphQL接続先の「接続テスト」ボタンをクリックしたとき、
 * Introspection Queryが実行され、成功・失敗に応じてトースト通知が表示される
 *
 * 【テストケースIssue】#215
 *
 * 【前提条件】
 * - アプリが起動済み
 * - DB管理モーダルにアクセスできる状態
 *
 * 【期待結果】
 * - 有効なエンドポイントに対してIntrospection Queryが成功し、成功メッセージがトースト通知で表示される
 * - 無効なエンドポイントに対して接続テストが失敗し、失敗メッセージがトースト通知で表示される
 */
test.describe('GraphQL Connection - Test Connection with Toast', () => {
  test.beforeEach(async ({ page }) => {
    const mockConnection = {
      id: 'mock-conn-215',
      name: 'モックDB(215)',
      dbType: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'user',
      databaseName: 'db',
      isLastUsed: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await page.route('**/api/connections', async (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([mockConnection]),
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

    // GraphQLを選択
    await page.locator('select[name="dbType"]').selectOption('graphql')
    await page.locator('input[name="name"]').fill('テスト接続GraphQL')
  })

  /**
   * 接続テスト成功時にトースト通知が表示されること
   */
  test('should show success toast when GraphQL connection test succeeds', async ({ page }) => {
    // 接続テストAPIを成功でモック
    await page.route('**/api/connections/test', async (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: '接続テスト成功' }),
      })
    })

    // 有効なURLを入力
    await page.locator('input[name="endpointUrl"]').fill('https://api.example.com/graphql')

    // 接続テストボタンをクリック
    await page.locator('button[type="button"]').filter({ hasText: '接続テスト' }).click()

    // 成功トースト通知が表示されること
    const toast = page.locator('.toast, [role="alert"], .notification')
    await expect(toast).toBeVisible({ timeout: 5000 })
  })

  /**
   * 接続テスト失敗時にトースト通知が表示されること
   */
  test('should show failure toast when GraphQL connection test fails', async ({ page }) => {
    // 接続テストAPIを失敗でモック
    await page.route('**/api/connections/test', async (route) => {
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'GraphQL接続テストに失敗しました' }),
      })
    })

    // 無効なURLを入力
    await page.locator('input[name="endpointUrl"]').fill('https://invalid.example.com/graphql')

    // 接続テストボタンをクリック
    await page.locator('button[type="button"]').filter({ hasText: '接続テスト' }).click()

    // 失敗トースト通知が表示されること
    const toast = page.locator('.toast, [role="alert"], .notification')
    await expect(toast).toBeVisible({ timeout: 5000 })
  })

  /**
   * APIリクエストにGraphQLエンドポイントURLが含まれること
   */
  test('should send endpoint URL in connection test request', async ({ page }) => {
    let capturedBody: unknown = null
    await page.route('**/api/connections/test', async (route) => {
      capturedBody = route.request().postDataJSON()
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: '接続テスト成功' }),
      })
    })

    const testUrl = 'https://myapi.example.com/graphql'
    await page.locator('input[name="endpointUrl"]').fill(testUrl)
    await page.locator('button[type="button"]').filter({ hasText: '接続テスト' }).click()

    // APIリクエストにGraphQL情報が含まれること
    await page.waitForTimeout(1000)
    expect(capturedBody).toBeTruthy()
    const body = capturedBody as Record<string, unknown>
    expect(body.dbType).toBe('graphql')
    expect(body.endpointUrl).toBe(testUrl)
  })
})
