/**
 * DataAgent E2Eテスト - テストケース #232
 * GraphQL全接続先削除時に初回起動ガイドに戻る
 */
import { test, expect } from '@playwright/test'

/**
 * 【ユーザーストーリー】
 * データ分析ユーザーがGraphQL接続先のみ登録している状態ですべて削除すると、
 * 接続先が0件になり初回起動ガイドに戻る
 *
 * 【テストケースIssue】#232
 *
 * 【前提条件】
 * - GraphQL接続先のみが登録されている状態
 *
 * 【期待結果】
 * - 全接続先（GraphQL含む）が削除されると初回起動ガイドに戻る
 * - DB接続先が残っている場合はチャット画面が維持される
 */
test.describe('GraphQL Connection - Return to Welcome Guide After Deleting All', () => {
  /**
   * GraphQL接続先のみ登録している状態で全削除すると初回起動ガイドに戻ること
   */
  test('should return to welcome guide when all GraphQL connections are deleted', async ({ page }) => {
    const graphqlConn = {
      id: 'graphql-only-232',
      name: '全削除テストGraphQL',
      dbType: 'graphql',
      endpointUrl: 'https://delete-all.example.com/graphql',
      host: null,
      port: null,
      username: null,
      databaseName: null,
      isLastUsed: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    let connections = [graphqlConn]
    let deleted = false

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
      if (route.request().method() === 'DELETE') {
        deleted = true
        connections = []
        route.fulfill({ status: 204 })
      } else {
        route.continue()
      }
    })
    await page.route('**/api/history*', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })

    await page.goto('/')

    // チャット画面が表示されること（GraphQL接続先あり）
    await expect(page.locator('.welcome-guide')).not.toBeVisible({ timeout: 5000 })

    // DB管理モーダルを開く
    await page.locator('.app-header__manage-btn').click()
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 })

    // GraphQL接続先が表示されていること
    await expect(page.locator('.db-connection-list')).toContainText('全削除テストGraphQL')

    // 削除ボタンをクリック
    const deleteBtn = page.locator('[aria-label="全削除テストGraphQLを削除"]')
    await expect(deleteBtn).toBeVisible({ timeout: 5000 })
    page.on('dialog', (dialog) => dialog.accept())
    await deleteBtn.click()

    await page.waitForTimeout(1000)
    expect(deleted).toBeTruthy()

    // モーダルを閉じる
    await page.locator('.modal__close').click()

    // 初回起動ガイドが表示されること
    await expect(page.locator('.welcome-guide')).toBeVisible({ timeout: 5000 })
  })

  /**
   * DB接続先が残っている場合はGraphQL削除後もチャット画面が維持されること
   */
  test('should maintain chat screen when MySQL connection remains after GraphQL deletion', async ({ page }) => {
    const graphqlConn = {
      id: 'graphql-partial-232',
      name: '一部削除GraphQL',
      dbType: 'graphql',
      endpointUrl: 'https://partial-delete.example.com/graphql',
      host: null,
      port: null,
      username: null,
      databaseName: null,
      isLastUsed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const mysqlConn = {
      id: 'mysql-remain-232',
      name: '残存MySQL',
      dbType: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'user',
      databaseName: 'db',
      isLastUsed: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    let connections = [graphqlConn, mysqlConn]

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
      if (route.request().method() === 'DELETE') {
        connections = [mysqlConn]
        route.fulfill({ status: 204 })
      } else {
        route.continue()
      }
    })
    await page.route('**/api/history*', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })

    await page.goto('/')

    // チャット画面が表示されること
    await expect(page.locator('.welcome-guide')).not.toBeVisible({ timeout: 5000 })

    // DB管理モーダルを開く
    await page.locator('.app-header__manage-btn').click()
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 })

    // GraphQL接続先を削除
    const deleteBtn = page.locator('[aria-label="一部削除GraphQLを削除"]')
    await expect(deleteBtn).toBeVisible({ timeout: 5000 })
    page.on('dialog', (dialog) => dialog.accept())
    await deleteBtn.click()

    await page.waitForTimeout(1000)

    // MySQL接続先が残っていること
    await expect(page.locator('.db-connection-list')).toContainText('残存MySQL')
    await expect(page.locator('.db-connection-list')).not.toContainText('一部削除GraphQL')

    // モーダルを閉じる
    await page.locator('.modal__close').click()

    // チャット画面が維持されること（初回起動ガイドは表示されない）
    await expect(page.locator('.welcome-guide')).not.toBeVisible({ timeout: 5000 })
  })

  /**
   * GraphQL接続先を再登録するとチャット画面に復帰すること
   */
  test('should return to chat screen after re-registering GraphQL connection', async ({ page }) => {
    const newGraphQLConn = {
      id: 'graphql-restore-232',
      name: '再登録GraphQL',
      dbType: 'graphql',
      endpointUrl: 'https://restore.example.com/graphql',
      host: null,
      port: null,
      username: null,
      databaseName: null,
      isLastUsed: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    let connections: unknown[] = []

    await page.route('**/api/connections', async (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(connections),
        })
      } else if (route.request().method() === 'POST') {
        connections = [newGraphQLConn]
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

    // 接続先0件なので初回起動ガイドが表示されること
    await expect(page.locator('.welcome-guide')).toBeVisible({ timeout: 5000 })

    // 「DB接続先を登録する」ボタンをクリック
    await page.locator('.welcome-guide__register-btn').click()
    await page.locator('button[aria-label="新しい接続先を登録"]').click()

    // GraphQL接続先を登録
    await page.locator('select[name="dbType"]').selectOption('graphql')
    await page.locator('input[name="name"]').fill('再登録GraphQL')
    await page.locator('input[name="endpointUrl"]').fill('https://restore.example.com/graphql')
    await page.locator('.db-connection-form button[type="submit"]').click()

    // 一覧に保存
    await expect(page.locator('.db-connection-list')).toContainText('再登録GraphQL', { timeout: 5000 })

    // モーダルを閉じる
    await page.locator('.modal__close').click()

    // チャット画面に復帰すること
    await expect(page.locator('.welcome-guide')).not.toBeVisible({ timeout: 5000 })
    await expect(page.locator('.app-header__db-select, select')).toBeVisible({ timeout: 5000 })
  })
})
