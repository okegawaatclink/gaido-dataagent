/**
 * DataAgent E2Eテスト - テストケース #212
 * DB管理モーダルのDB種別に「GraphQL」が選択肢として表示される
 */
import { test, expect } from '@playwright/test'

/**
 * 【ユーザーストーリー】
 * データ分析ユーザーがDB管理モーダルを開いたとき、
 * DB種別ドロップダウンに「GraphQL」が選択肢として含まれており、
 * MySQL・PostgreSQLと並んで選択できる
 *
 * 【テストケースIssue】#212
 *
 * 【前提条件】
 * - アプリが起動済み
 * - DB管理モーダルにアクセスできる状態
 *
 * 【期待結果】
 * - DB種別ドロップダウンに「MySQL」「PostgreSQL」「GraphQL」の3つが表示される
 * - 「GraphQL」を選択できる
 */
test.describe('DB Management Modal - GraphQL Option in DB Type Dropdown', () => {
  test.beforeEach(async ({ page }) => {
    // 接続先一覧APIをモック（1件返してチャット画面を表示）
    const mockConnection = {
      id: 'mock-conn-212',
      name: 'モックDB(212)',
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
  })

  /**
   * DB種別ドロップダウンにGraphQLが含まれること
   */
  test('should show GraphQL as an option in DB type dropdown', async ({ page }) => {
    // DB管理モーダルを開く
    await page.locator('.app-header__manage-btn').click()
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 })

    // 「新しい接続先を登録」ボタンをクリックしてフォームを表示
    await page.locator('button[aria-label="新しい接続先を登録"]').click()

    // DB種別ドロップダウンが表示されていること
    const dbTypeSelect = page.locator('select[name="dbType"]')
    await expect(dbTypeSelect).toBeVisible({ timeout: 5000 })

    // 選択肢を確認
    const options = await dbTypeSelect.locator('option').allTextContents()
    expect(options.some((opt) => opt.toLowerCase().includes('mysql'))).toBeTruthy()
    expect(options.some((opt) => opt.toLowerCase().includes('postgresql'))).toBeTruthy()
    expect(options.some((opt) => opt.toLowerCase().includes('graphql') || opt.toLowerCase().includes('GraphQL'))).toBeTruthy()
  })

  /**
   * GraphQLオプションを選択できること
   */
  test('should be able to select GraphQL option', async ({ page }) => {
    // DB管理モーダルを開く
    await page.locator('.app-header__manage-btn').click()
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 })

    // 「新しい接続先を登録」ボタンをクリック
    await page.locator('button[aria-label="新しい接続先を登録"]').click()

    // DB種別ドロップダウンでGraphQLを選択
    const dbTypeSelect = page.locator('select[name="dbType"]')
    await dbTypeSelect.selectOption('graphql')

    // GraphQLが選択されていること
    await expect(dbTypeSelect).toHaveValue('graphql')
  })

  /**
   * 3種類すべてのDB種別が選択肢に存在すること
   */
  test('should have exactly MySQL, PostgreSQL, and GraphQL as options', async ({ page }) => {
    // DB管理モーダルを開く
    await page.locator('.app-header__manage-btn').click()
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 })

    // 「新しい接続先を登録」ボタンをクリック
    await page.locator('button[aria-label="新しい接続先を登録"]').click()

    // DB種別ドロップダウンの選択肢を確認
    const dbTypeSelect = page.locator('select[name="dbType"]')
    await expect(dbTypeSelect).toBeVisible()

    // MySQL選択確認
    await dbTypeSelect.selectOption('mysql')
    await expect(dbTypeSelect).toHaveValue('mysql')

    // PostgreSQL選択確認
    await dbTypeSelect.selectOption('postgresql')
    await expect(dbTypeSelect).toHaveValue('postgresql')

    // GraphQL選択確認
    await dbTypeSelect.selectOption('graphql')
    await expect(dbTypeSelect).toHaveValue('graphql')
  })
})
