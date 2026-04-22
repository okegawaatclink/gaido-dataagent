/**
 * DataAgent E2Eテスト - テストケース #213
 * GraphQL選択時にフォームがエンドポイントURL入力に切り替わる
 */
import { test, expect } from '@playwright/test'

/**
 * 【ユーザーストーリー】
 * データ分析ユーザーがDB管理モーダルでDB種別「GraphQL」を選択したとき、
 * DB固有のフィールド（ホスト/ポート/ユーザー名/パスワード/DB名）が非表示になり、
 * GraphQL用のエンドポイントURL入力フィールドが表示される
 *
 * 【テストケースIssue】#213
 *
 * 【前提条件】
 * - アプリが起動済み
 * - DB管理モーダルにアクセスできる状態
 *
 * 【期待結果】
 * - ホスト名、ポート番号、ユーザー名、パスワード、データベース名のフィールドが非表示になる
 * - エンドポイントURL入力フィールドが表示される
 * - 接続名フィールドは引き続き表示される
 */
test.describe('DB Management Modal - Form Switch for GraphQL', () => {
  test.beforeEach(async ({ page }) => {
    const mockConnection = {
      id: 'mock-conn-213',
      name: 'モックDB(213)',
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

    // 「新しい接続先を登録」ボタンをクリック
    await page.locator('button[aria-label="新しい接続先を登録"]').click()
  })

  /**
   * GraphQL選択時にDB固有フィールドが非表示になること
   */
  test('should hide DB-specific fields when GraphQL is selected', async ({ page }) => {
    // デフォルト（MySQL）ではDB固有フィールドが表示されていること
    await expect(page.locator('input[name="host"]')).toBeVisible()
    await expect(page.locator('input[name="port"]')).toBeVisible()
    await expect(page.locator('input[name="username"]')).toBeVisible()
    await expect(page.locator('input[name="databaseName"]')).toBeVisible()

    // GraphQLを選択
    await page.locator('select[name="dbType"]').selectOption('graphql')

    // DB固有フィールドが非表示になること
    await expect(page.locator('input[name="host"]')).not.toBeVisible()
    await expect(page.locator('input[name="port"]')).not.toBeVisible()
    await expect(page.locator('input[name="username"]')).not.toBeVisible()
    await expect(page.locator('input[name="databaseName"]')).not.toBeVisible()
  })

  /**
   * GraphQL選択時にエンドポイントURL入力フィールドが表示されること
   */
  test('should show endpoint URL field when GraphQL is selected', async ({ page }) => {
    // デフォルト（MySQL）ではエンドポイントURLが非表示
    await expect(page.locator('input[name="endpointUrl"]')).not.toBeVisible()

    // GraphQLを選択
    await page.locator('select[name="dbType"]').selectOption('graphql')

    // エンドポイントURLフィールドが表示されること
    await expect(page.locator('input[name="endpointUrl"]')).toBeVisible()
  })

  /**
   * GraphQL選択後も接続名フィールドが表示され続けること
   */
  test('should keep connection name field visible when GraphQL is selected', async ({ page }) => {
    // 接続名フィールドはデフォルトで表示
    await expect(page.locator('input[name="name"]')).toBeVisible()

    // GraphQLを選択
    await page.locator('select[name="dbType"]').selectOption('graphql')

    // 接続名フィールドが引き続き表示されること
    await expect(page.locator('input[name="name"]')).toBeVisible()
  })

  /**
   * MySQL/PostgreSQL に切り替えると元のフィールドに戻ること
   */
  test('should restore DB fields when switching back from GraphQL to MySQL', async ({ page }) => {
    // GraphQLを選択
    await page.locator('select[name="dbType"]').selectOption('graphql')
    await expect(page.locator('input[name="endpointUrl"]')).toBeVisible()
    await expect(page.locator('input[name="host"]')).not.toBeVisible()

    // MySQLに戻す
    await page.locator('select[name="dbType"]').selectOption('mysql')

    // DB固有フィールドが再表示されること
    await expect(page.locator('input[name="host"]')).toBeVisible()
    await expect(page.locator('input[name="port"]')).toBeVisible()
    await expect(page.locator('input[name="username"]')).toBeVisible()
    await expect(page.locator('input[name="databaseName"]')).toBeVisible()

    // エンドポイントURLが非表示になること
    await expect(page.locator('input[name="endpointUrl"]')).not.toBeVisible()
  })
})
