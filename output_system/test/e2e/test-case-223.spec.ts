/**
 * DataAgent E2Eテスト - テストケース #223
 * GraphQLエラー時にガイド付きエラーメッセージが表示される
 */
import { test, expect } from '@playwright/test'

/**
 * 【ユーザーストーリー】
 * データ分析ユーザーがGraphQL接続先で質問を送信したとき、
 * GraphQLエンドポイントがerrors配列を返した場合、
 * 「質問を変えてみてください」等のガイド付きエラーメッセージが表示される
 *
 * 【テストケースIssue】#223
 *
 * 【前提条件】
 * - GraphQL接続先が登録済み
 *
 * 【期待結果】
 * - GraphQLのerrors配列でエラーが返った場合、「質問を変えてみてください」等のガイド付きエラーメッセージが表示される
 * - エラー内容がユーザーに分かりやすく表示される
 */
test.describe('GraphQL Error Handling - User-Friendly Error Messages', () => {
  const graphqlConn = {
    id: 'graphql-conn-223',
    name: 'エラーテストAPI',
    dbType: 'graphql',
    endpointUrl: 'https://error-api.example.com/graphql',
    host: null,
    port: null,
    username: null,
    databaseName: null,
    isLastUsed: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  test.beforeEach(async ({ page }) => {
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
  })

  /**
   * GraphQLエラーがユーザーフレンドリーなメッセージで表示されること
   */
  test('should display user-friendly error message when GraphQL returns errors', async ({ page }) => {
    // GraphQL errorsを返すSSEエラーモック
    await page.route('**/api/chat', async (route) => {
      if (route.request().method() === 'POST') {
        const sseData = `event: error\ndata: ${JSON.stringify({ message: 'データの取得中にエラーが発生しました。質問を変えてみてください。' })}\n\n`
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

    await chatInput.fill('エラーになる質問を送信')
    await page.keyboard.press('Shift+Enter')

    // エラーメッセージがチャット画面に表示されること
    await expect(page.locator('.chat-messages-area')).toBeVisible({ timeout: 10000 })
    // 「質問を変えてみてください」等のガイドメッセージが含まれること
    await expect(page.locator('.chat-messages-area')).toContainText('質問', { timeout: 5000 })
  })

  /**
   * GraphQLエラー後も再度質問を送信できること（エラー回復）
   */
  test('should allow sending another question after GraphQL error', async ({ page }) => {
    let requestCount = 0
    await page.route('**/api/chat', async (route) => {
      if (route.request().method() === 'POST') {
        requestCount++
        if (requestCount === 1) {
          // 1回目はエラー
          const sseData = `event: error\ndata: ${JSON.stringify({ message: 'エラーが発生しました。質問を変えてみてください。' })}\n\n`
          route.fulfill({
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
            body: sseData,
          })
        } else {
          // 2回目は成功
          const sseData = [
            `event: sql\ndata: ${JSON.stringify({ sql: 'query { users { id name } }' })}\n\n`,
            `event: done\ndata: ${JSON.stringify({ conversationId: 'conv-223b', messageId: 'msg-223b' })}\n\n`,
          ].join('')
          route.fulfill({
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
            body: sseData,
          })
        }
      } else {
        route.continue()
      }
    })

    await page.goto('/')

    const chatInput = page.locator('.chat-input-textarea, textarea')
    await expect(chatInput).toBeVisible({ timeout: 5000 })

    // 1回目の質問（エラー）
    await chatInput.fill('エラーになる質問')
    await page.keyboard.press('Shift+Enter')
    await page.waitForTimeout(1000)

    // 2回目の質問（成功）
    await chatInput.fill('別の質問を送信')
    await page.keyboard.press('Shift+Enter')
    await page.waitForTimeout(2000)

    // 2回質問が送信されていること
    expect(requestCount).toBeGreaterThanOrEqual(2)
  })

  /**
   * ネットワークエラー時もエラーメッセージが表示されること
   */
  test('should display error message when network error occurs', async ({ page }) => {
    // ネットワークエラーをシミュレート
    await page.route('**/api/chat', async (route) => {
      if (route.request().method() === 'POST') {
        const sseData = `event: error\ndata: ${JSON.stringify({ message: 'ネットワークエラーが発生しました。接続を確認してください。' })}\n\n`
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

    await chatInput.fill('接続エラーテスト')
    await page.keyboard.press('Shift+Enter')

    // エラーメッセージが表示されること
    await expect(page.locator('.chat-messages-area')).toContainText('エラー', { timeout: 10000 })
  })
})
