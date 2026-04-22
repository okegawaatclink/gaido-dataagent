/**
 * DataAgent E2Eテスト - テストケース #233
 * 無効なGraphQLエンドポイントURL形式でバリデーションエラーが返る
 */
import { test, expect } from '@playwright/test'

/**
 * 【ユーザーストーリー】
 * データ分析ユーザーがGraphQL接続先にURLを入力する際、
 * HTTP/HTTPSでない無効なURL形式を入力するとバリデーションエラーが表示される
 *
 * 【テストケースIssue】#233
 *
 * 【前提条件】
 * - DB管理モーダルでGraphQLが選択済み
 *
 * 【期待結果】
 * - 無効なURL形式に対してバリデーションエラーが表示される
 * - HTTP/HTTPSのURL形式のみ受け付けられる
 */
test.describe('GraphQL Connection - URL Format Validation', () => {
  test.beforeEach(async ({ page }) => {
    const mockConnection = {
      id: 'mock-conn-233',
      name: 'モックDB(233)',
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
    await page.locator('input[name="name"]').fill('URLバリデーションテスト')
  })

  /**
   * URL形式でない文字列はバリデーションエラーになること
   */
  test('should show validation error for non-URL string input', async ({ page }) => {
    // URL形式でない文字列を入力
    await page.locator('input[name="endpointUrl"]').fill('not-a-url')
    await page.locator('.db-connection-form button[type="submit"]').click()

    // バリデーションエラーが表示されること
    await expect(page.locator('.form-field__error, [role="alert"]').first()).toBeVisible({ timeout: 5000 })
  })

  /**
   * ftpスキーマのURLはバリデーションエラーになること
   */
  test('should show validation error for ftp URL input', async ({ page }) => {
    // ftpスキーマのURLを入力
    await page.locator('input[name="endpointUrl"]').fill('ftp://invalid.example.com/graphql')
    await page.locator('.db-connection-form button[type="submit"]').click()

    // バリデーションエラーが表示されること
    await expect(page.locator('.form-field__error, [role="alert"]').first()).toBeVisible({ timeout: 5000 })
  })

  /**
   * HTTPSのURLは正常に受け付けられること
   */
  test('should accept valid HTTPS URL', async ({ page }) => {
    const newConn = {
      id: 'valid-https-233',
      name: 'URLバリデーションテスト',
      dbType: 'graphql',
      endpointUrl: 'https://valid-api.example.com/graphql',
      host: null,
      port: null,
      username: null,
      databaseName: null,
      isLastUsed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await page.route('**/api/connections', async (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{
            id: 'mock-conn-233b',
            name: 'モックDB',
            dbType: 'mysql',
            host: 'localhost',
            port: 3306,
            username: 'user',
            databaseName: 'db',
            isLastUsed: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }, newConn]),
        })
      } else if (route.request().method() === 'POST') {
        route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(newConn),
        })
      } else {
        route.continue()
      }
    })

    // 有効なHTTPS URLを入力
    await page.locator('input[name="endpointUrl"]').fill('https://valid-api.example.com/graphql')
    await page.locator('.db-connection-form button[type="submit"]').click()

    // 正常に保存されること（一覧に戻ること）
    await expect(page.locator('.db-connection-list')).toBeVisible({ timeout: 5000 })
  })

  /**
   * HTTPのURLも受け付けられること
   */
  test('should accept valid HTTP URL', async ({ page }) => {
    const newConn = {
      id: 'valid-http-233',
      name: 'URLバリデーションテスト',
      dbType: 'graphql',
      endpointUrl: 'http://internal-api.example.com/graphql',
      host: null,
      port: null,
      username: null,
      databaseName: null,
      isLastUsed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await page.route('**/api/connections', async (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{
            id: 'mock-conn-233c',
            name: 'モックDB',
            dbType: 'mysql',
            host: 'localhost',
            port: 3306,
            username: 'user',
            databaseName: 'db',
            isLastUsed: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }, newConn]),
        })
      } else if (route.request().method() === 'POST') {
        route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(newConn),
        })
      } else {
        route.continue()
      }
    })

    // 有効なHTTP URLを入力（社内API等）
    await page.locator('input[name="endpointUrl"]').fill('http://internal-api.example.com/graphql')
    await page.locator('.db-connection-form button[type="submit"]').click()

    // 正常に保存されること
    await expect(page.locator('.db-connection-list')).toBeVisible({ timeout: 5000 })
  })
})
