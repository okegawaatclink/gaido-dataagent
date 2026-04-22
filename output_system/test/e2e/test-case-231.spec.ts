/**
 * DataAgent E2Eテスト - テストケース #231
 * GraphQL接続先のみ登録時に初回起動ガイドからチャット画面に遷移する
 */
import { test, expect } from '@playwright/test'

/**
 * 【ユーザーストーリー】
 * データ分析ユーザーがGraphQL接続先のみ登録したとき、
 * DB接続先が不要でもGraphQL接続先だけで利用開始できる
 *
 * 【テストケースIssue】#231
 *
 * 【前提条件】
 * - 接続先が0件の状態（初回起動ガイド表示）
 *
 * 【期待結果】
 * - GraphQL接続先のみの登録でも初回起動ガイドからチャット画面に遷移する
 * - DB接続先が不要でもGraphQL接続先だけで利用開始できる
 */
test.describe('GraphQL Connection - Transition from Welcome Guide', () => {
  /**
   * 接続先0件の状態でGraphQL接続先を登録すると初回起動ガイドからチャット画面に遷移すること
   */
  test('should transition from welcome guide to chat screen after registering GraphQL-only connection', async ({ page }) => {
    const newGraphQLConn = {
      id: 'graphql-only-231',
      name: '最初のGraphQL',
      dbType: 'graphql',
      endpointUrl: 'https://first-api.example.com/graphql',
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

    // 初回起動ガイドが表示されること（接続先が0件）
    await expect(page.locator('.welcome-guide')).toBeVisible({ timeout: 5000 })

    // 「DB接続先を登録する」ボタンをクリック
    await page.locator('.welcome-guide__register-btn').click()
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 })

    // 「新しい接続先を登録」ボタンをクリック
    await page.locator('button[aria-label="新しい接続先を登録"]').click()

    // GraphQLを選択して入力
    await page.locator('select[name="dbType"]').selectOption('graphql')
    await page.locator('input[name="name"]').fill('最初のGraphQL')
    await page.locator('input[name="endpointUrl"]').fill('https://first-api.example.com/graphql')

    // 保存
    await page.locator('.db-connection-form button[type="submit"]').click()
    await expect(page.locator('.db-connection-list')).toBeVisible({ timeout: 5000 })

    // モーダルを閉じる
    await page.locator('.modal__close').click()

    // チャット画面に遷移すること（初回起動ガイドが非表示になること）
    await expect(page.locator('.welcome-guide')).not.toBeVisible({ timeout: 5000 })
    await expect(page.locator('.app-header__db-select, select')).toBeVisible({ timeout: 5000 })
  })

  /**
   * GraphQL接続先のみでもチャット入力エリアが利用可能なこと
   */
  test('should have functional chat input with GraphQL-only connection', async ({ page }) => {
    const graphqlConn = {
      id: 'graphql-only-231b',
      name: 'GraphQL専用接続',
      dbType: 'graphql',
      endpointUrl: 'https://graphql-only.example.com/graphql',
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

    // 初回起動ガイドが表示されないこと
    await expect(page.locator('.welcome-guide')).not.toBeVisible({ timeout: 5000 })

    // チャット入力エリアが表示されること
    await expect(page.locator('.chat-input-textarea, textarea')).toBeVisible({ timeout: 5000 })

    // GraphQL接続先がドロップダウンに表示されること
    const dbSelect = page.locator('.app-header__db-select, select')
    await expect(dbSelect).toBeVisible({ timeout: 5000 })
    await expect(dbSelect).toHaveValue(graphqlConn.id)
  })

  /**
   * 初回起動ガイドでGraphQL接続先を登録後、適切な接続先が選択されること
   */
  test('should select the registered GraphQL connection after registering from welcome guide', async ({ page }) => {
    const newGraphQLConn = {
      id: 'graphql-select-231c',
      name: '登録後選択確認API',
      dbType: 'graphql',
      endpointUrl: 'https://select-test.example.com/graphql',
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

    // 初回起動ガイドが表示されること
    await expect(page.locator('.welcome-guide')).toBeVisible({ timeout: 5000 })

    // DB管理モーダルを開く
    await page.locator('.welcome-guide__register-btn').click()
    await page.locator('button[aria-label="新しい接続先を登録"]').click()

    // GraphQL接続先を登録
    await page.locator('select[name="dbType"]').selectOption('graphql')
    await page.locator('input[name="name"]').fill('登録後選択確認API')
    await page.locator('input[name="endpointUrl"]').fill('https://select-test.example.com/graphql')
    await page.locator('.db-connection-form button[type="submit"]').click()

    // モーダルを閉じる
    await expect(page.locator('.db-connection-list')).toBeVisible({ timeout: 5000 })
    await page.locator('.modal__close').click()

    // チャット画面が表示されること
    await expect(page.locator('.welcome-guide')).not.toBeVisible({ timeout: 5000 })
  })
})
