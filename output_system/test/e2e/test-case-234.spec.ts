/**
 * DataAgent E2Eテスト - テストケース #234
 * GraphQL接続先でエンドポイント到達不能時にタイムアウトエラーが返る
 */
import { test, expect } from '@playwright/test'

/**
 * 【ユーザーストーリー】
 * データ分析ユーザーが到達不能なGraphQLエンドポイントで接続テストや質問を送信したとき、
 * タイムアウトエラーが適切に処理されてガイド付きエラーメッセージが表示される
 *
 * 【テストケースIssue】#234
 *
 * 【前提条件】
 * - 到達不能なエンドポイントURL（例：http://192.0.2.1:9999/graphql）でGraphQL接続先を登録済み
 *
 * 【期待結果】
 * - 接続テストでタイムアウトエラーが返り、失敗のトースト通知が表示される
 * - チャットで質問した場合もタイムアウトエラーが適切に処理され、ガイド付きエラーメッセージが表示される
 */
test.describe('GraphQL Connection - Timeout Error Handling', () => {
  const unreachableConn = {
    id: 'graphql-timeout-234',
    name: 'タイムアウトテストAPI',
    dbType: 'graphql',
    endpointUrl: 'http://192.0.2.1:9999/graphql',
    host: null,
    port: null,
    username: null,
    databaseName: null,
    isLastUsed: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  /**
   * 接続テストでタイムアウトエラー時にトースト通知が表示されること
   */
  test('should show timeout error toast when connection test times out', async ({ page }) => {
    const existingConn = {
      id: 'existing-conn-234',
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

    await page.route('**/api/connections', async (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([existingConn]),
        })
      } else {
        route.continue()
      }
    })
    // 接続テストでタイムアウトエラーを返すモック
    await page.route('**/api/connections/test', async (route) => {
      route.fulfill({
        status: 408,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'タイムアウト: GraphQLエンドポイントへの接続がタイムアウトしました' }),
      })
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

    // 到達不能なURLで接続先を入力
    await page.locator('select[name="dbType"]').selectOption('graphql')
    await page.locator('input[name="name"]').fill('タイムアウトテストAPI')
    await page.locator('input[name="endpointUrl"]').fill('http://192.0.2.1:9999/graphql')

    // 接続テストをクリック
    await page.locator('button[type="button"]').filter({ hasText: '接続テスト' }).click()

    // トースト通知が表示されること（タイムアウトエラー）
    const toast = page.locator('.toast, [role="alert"], .notification')
    await expect(toast).toBeVisible({ timeout: 5000 })
  })

  /**
   * チャットで質問送信時にタイムアウトエラーがガイド付きメッセージで表示されること
   */
  test('should display guided error message when chat request times out for unreachable GraphQL', async ({ page }) => {
    await page.route('**/api/connections', async (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([unreachableConn]),
        })
      } else {
        route.continue()
      }
    })
    await page.route('**/api/history*', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })

    // チャットAPIでタイムアウトエラーを返すモック
    await page.route('**/api/chat', async (route) => {
      if (route.request().method() === 'POST') {
        const sseData = `event: error\ndata: ${JSON.stringify({ message: 'GraphQLエンドポイントへの接続がタイムアウトしました。接続先の設定を確認してください。' })}\n\n`
        route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
          body: sseData,
        })
      } else {
        route.continue()
      }
    })

    await page.goto('/')

    // チャット入力エリアが表示されること
    const chatInput = page.locator('.chat-input-textarea, textarea')
    await expect(chatInput).toBeVisible({ timeout: 5000 })

    // 質問を送信
    await chatInput.fill('データを表示して')
    await page.keyboard.press('Shift+Enter')

    // タイムアウトエラーメッセージが表示されること
    await expect(page.locator('.chat-messages-area')).toContainText('タイムアウト', { timeout: 10000 })
  })

  /**
   * タイムアウトエラー後も再送信できること（エラー回復）
   */
  test('should allow retry after timeout error for GraphQL connection', async ({ page }) => {
    await page.route('**/api/connections', async (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([unreachableConn]),
        })
      } else {
        route.continue()
      }
    })
    await page.route('**/api/history*', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })

    let requestCount = 0
    await page.route('**/api/chat', async (route) => {
      if (route.request().method() === 'POST') {
        requestCount++
        const sseData = `event: error\ndata: ${JSON.stringify({ message: 'タイムアウトエラーが発生しました。' })}\n\n`
        route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
          body: sseData,
        })
      } else {
        route.continue()
      }
    })

    await page.goto('/')

    const chatInput = page.locator('.chat-input-textarea, textarea')
    await expect(chatInput).toBeVisible({ timeout: 5000 })

    // 1回目の送信
    await chatInput.fill('最初の質問')
    await page.keyboard.press('Shift+Enter')
    await page.waitForTimeout(1500)

    // 2回目の送信（リトライ）
    await chatInput.fill('2回目の質問')
    await page.keyboard.press('Shift+Enter')
    await page.waitForTimeout(1500)

    // 2回送信できること（エラー後も入力可能）
    expect(requestCount).toBeGreaterThanOrEqual(2)
  })
})
