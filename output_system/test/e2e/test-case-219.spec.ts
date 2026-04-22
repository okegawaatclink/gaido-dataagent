/**
 * DataAgent E2Eテスト - テストケース #219
 * GraphQL接続先で自然言語質問からGraphQLクエリが自動生成・表示される
 */
import { test, expect } from '@playwright/test'

/**
 * 【ユーザーストーリー】
 * データ分析ユーザーがGraphQL接続先を選択し自然言語で質問を送信したとき、
 * LLMがGraphQLクエリを自動生成し、チャット画面にコードブロックで表示される
 *
 * 【テストケースIssue】#219
 *
 * 【前提条件】
 * - GraphQL接続先が登録済み
 * - チャット画面でGraphQL接続先が選択済み
 *
 * 【期待結果】
 * - 自然言語の質問に対してGraphQLクエリが自動生成される
 * - 生成されたGraphQLクエリがチャット画面にコードブロックで表示される（SQL表示と同様の透明性）
 */
test.describe('GraphQL Chat - Auto Query Generation and Display', () => {
  const setupGraphQLMock = async (page: import('@playwright/test').Page) => {
    const graphqlConn = {
      id: 'graphql-conn-219',
      name: 'チャットAPI',
      dbType: 'graphql',
      endpointUrl: 'https://chat-api.example.com/graphql',
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

    return graphqlConn
  }

  /**
   * GraphQLクエリが自動生成されてチャット画面に表示されること
   * SSEレスポンスをモックして確認する
   */
  test('should display generated GraphQL query in chat after sending natural language question', async ({ page }) => {
    const graphqlConn = await setupGraphQLMock(page)

    // SSEレスポンスをモック（/api/chatへのPOST）
    const generatedQuery = `query { users { id name email } }`
    await page.route('**/api/chat', async (route) => {
      if (route.request().method() === 'POST') {
        // SSEフォーマットのレスポンス
        const sseData = [
          `event: sql\ndata: ${JSON.stringify({ sql: generatedQuery })}\n\n`,
          `event: message\ndata: ${JSON.stringify({ chunk: 'ユーザー一覧を取得するGraphQLクエリです。' })}\n\n`,
          `event: done\ndata: ${JSON.stringify({ conversationId: 'conv-219', messageId: 'msg-219' })}\n\n`,
        ].join('')

        route.fulfill({
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
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

    // 接続先が選択されていること
    const dbSelect = page.locator('.app-header__db-select, select')
    await expect(dbSelect).toHaveValue(graphqlConn.id)

    // 自然言語の質問を入力して送信（Shift+Enterで送信）
    await chatInput.fill('ユーザー一覧を表示して')
    await page.keyboard.press('Shift+Enter')

    // GraphQLクエリが表示されること（SQLDisplayコンポーネントが使用される）
    await expect(page.locator('.chat-message__sql').first()).toBeVisible({ timeout: 10000 })
  })

  /**
   * チャットAPIリクエストにdbConnectionIdが含まれること
   */
  test('should include dbConnectionId in chat API request for GraphQL connection', async ({ page }) => {
    const graphqlConn = await setupGraphQLMock(page)

    let capturedRequestBody: unknown = null
    await page.route('**/api/chat', async (route) => {
      if (route.request().method() === 'POST') {
        capturedRequestBody = route.request().postDataJSON()
        const sseData = `event: done\ndata: ${JSON.stringify({ conversationId: 'conv-219b', messageId: 'msg-219b' })}\n\n`
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

    // 質問を送信（Shift+Enterで送信）
    await chatInput.fill('テスト質問')
    await page.keyboard.press('Shift+Enter')

    // APIリクエストにdbConnectionIdが含まれること
    await page.waitForTimeout(2000)
    expect(capturedRequestBody).toBeTruthy()
    const body = capturedRequestBody as Record<string, unknown>
    expect(body.dbConnectionId).toBe(graphqlConn.id)
  })

  /**
   * チャットAPIリクエストがGraphQL接続先で送信されること
   */
  test('should send chat request with correct connection when GraphQL is selected', async ({ page }) => {
    const graphqlConn = await setupGraphQLMock(page)

    const chatRequests: unknown[] = []
    await page.route('**/api/chat', async (route) => {
      if (route.request().method() === 'POST') {
        chatRequests.push(route.request().postDataJSON())
        const sseData = `event: done\ndata: ${JSON.stringify({ conversationId: 'conv-219c', messageId: 'msg-219c' })}\n\n`
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

    // ドロップダウンにGraphQL接続先が選択されていること
    const dbSelect = page.locator('.app-header__db-select, select')
    await expect(dbSelect).toBeVisible({ timeout: 5000 })
    await expect(dbSelect).toHaveValue(graphqlConn.id)

    const chatInput = page.locator('.chat-input-textarea, textarea')
    await expect(chatInput).toBeVisible({ timeout: 5000 })

    // 質問を送信
    await chatInput.fill('データを取得して')
    const sendBtn = page.locator('.chat-input-send-btn')
    await sendBtn.click()

    // APIリクエストが送信されること
    await page.waitForTimeout(2000)
    expect(chatRequests.length).toBeGreaterThanOrEqual(1)
    const reqBody = chatRequests[0] as Record<string, unknown>
    expect(reqBody.dbConnectionId).toBe(graphqlConn.id)
  })
})
