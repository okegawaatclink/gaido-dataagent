/**
 * DataAgent E2Eテスト - テストケース #218
 * 既存DB接続先のCRUD・接続テストがGraphQL追加後も正常動作する
 */
import { test, expect } from '@playwright/test'

/**
 * 【ユーザーストーリー】
 * GraphQL接続先が追加された状態でも、既存のMySQL/PostgreSQL接続先の
 * 登録・編集・削除・接続テストがGraphQL対応追加前と同じように動作する
 *
 * 【テストケースIssue】#218
 *
 * 【前提条件】
 * - GraphQL接続先が1件以上登録済み
 *
 * 【期待結果】
 * - MySQL/PostgreSQL接続先の登録・編集・削除・接続テストがGraphQL対応追加前と同じように動作する
 * - GraphQL接続先の存在が既存のDB接続先操作に影響を与えない
 */
test.describe('Regression - Existing DB Connection Operations After GraphQL Support', () => {
  /**
   * GraphQL接続先が存在する状態でMySQL接続先を登録できること
   */
  test('should register MySQL connection when GraphQL connection exists', async ({ page }) => {
    const graphqlConn = {
      id: 'graphql-conn-218',
      name: '既存GraphQL',
      dbType: 'graphql',
      endpointUrl: 'https://api.example.com/graphql',
      host: null,
      port: null,
      username: null,
      databaseName: null,
      isLastUsed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const newMysqlConn = {
      id: 'new-mysql-218',
      name: '新規MySQL',
      dbType: 'mysql',
      host: 'mysql.example.com',
      port: 3306,
      username: 'dbuser',
      databaseName: 'mydb',
      isLastUsed: true,
      createdAt: new Date().toISOString(),
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
      } else if (route.request().method() === 'POST') {
        connections = [...connections, newMysqlConn]
        route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(newMysqlConn),
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

    // 既存GraphQL接続先が表示されていること
    await expect(page.locator('.db-connection-list')).toContainText('既存GraphQL')

    // 「新しい接続先を登録」ボタンをクリック
    await page.locator('button[aria-label="新しい接続先を登録"]').click()

    // MySQL接続先を登録（デフォルトのmysqlを使用）
    await page.locator('input[name="name"]').fill('新規MySQL')
    await page.locator('input[name="host"]').fill('mysql.example.com')
    await page.locator('input[name="port"]').fill('3306')
    await page.locator('input[name="username"]').fill('dbuser')
    await page.locator('input[name="password"]').fill('password')
    await page.locator('input[name="databaseName"]').fill('mydb')
    await page.locator('.db-connection-form button[type="submit"]').click()

    // 一覧にMySQL接続先が追加されること
    await expect(page.locator('.db-connection-list')).toContainText('新規MySQL')
    // GraphQL接続先も引き続き表示されること
    await expect(page.locator('.db-connection-list')).toContainText('既存GraphQL')
  })

  /**
   * GraphQL接続先が存在する状態でMySQL接続先の接続テストができること
   */
  test('should test MySQL connection when GraphQL connection exists', async ({ page }) => {
    const graphqlConn = {
      id: 'graphql-conn-218b',
      name: '既存GraphQL',
      dbType: 'graphql',
      endpointUrl: 'https://api.example.com/graphql',
      host: null,
      port: null,
      username: null,
      databaseName: null,
      isLastUsed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const mysqlConn = {
      id: 'mysql-conn-218b',
      name: '既存MySQL',
      dbType: 'mysql',
      host: 'mysql.example.com',
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
          body: JSON.stringify([graphqlConn, mysqlConn]),
        })
      } else {
        route.continue()
      }
    })
    let testRequestBody: unknown = null
    await page.route('**/api/connections/test', async (route) => {
      testRequestBody = route.request().postDataJSON()
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: '接続テスト成功' }),
      })
    })
    await page.route('**/api/history*', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })
    await page.goto('/')

    // DB管理モーダルを開く
    await page.locator('.app-header__manage-btn').click()
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 })

    // MySQL接続先の編集ボタンをクリック
    await page.locator('[aria-label="既存MySQLを編集"]').click()

    // 接続テストボタンをクリック
    await page.locator('button[type="button"]').filter({ hasText: '接続テスト' }).click()

    // 接続テストAPIが呼ばれること
    await page.waitForTimeout(1000)
    expect(testRequestBody).toBeTruthy()
    const body = testRequestBody as Record<string, unknown>
    expect(body.dbType).toBe('mysql')
  })

  /**
   * GraphQL接続先が存在する状態でMySQL接続先を削除できること
   */
  test('should delete MySQL connection when GraphQL connection exists', async ({ page }) => {
    const graphqlConn = {
      id: 'graphql-conn-218c',
      name: '残存GraphQL',
      dbType: 'graphql',
      endpointUrl: 'https://api.example.com/graphql',
      host: null,
      port: null,
      username: null,
      databaseName: null,
      isLastUsed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const mysqlConn = {
      id: 'mysql-del-218c',
      name: '削除対象MySQL',
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
        connections = [graphqlConn]
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

    // MySQL接続先が表示されていること
    await expect(page.locator('.db-connection-list')).toContainText('削除対象MySQL')

    // 削除ボタンをクリック
    const deleteBtn = page.locator('[aria-label="削除対象MySQLを削除"]')
    await expect(deleteBtn).toBeVisible({ timeout: 5000 })
    page.on('dialog', (dialog) => dialog.accept())
    await deleteBtn.click()

    // MySQL接続先が削除されること
    await page.waitForTimeout(1000)
    await expect(page.locator('.db-connection-list')).not.toContainText('削除対象MySQL')
    // GraphQL接続先は引き続き表示されること
    await expect(page.locator('.db-connection-list')).toContainText('残存GraphQL')
  })
})
