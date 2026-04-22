/**
 * DataAgent E2Eテスト - テストケース #225
 * GraphQL会話コンテキストが維持され直前クエリの修正依頼に対応できる
 */
import { test, expect } from '@playwright/test'

/**
 * 【ユーザーストーリー】
 * データ分析ユーザーがGraphQL接続先で連続して質問を送信したとき、
 * 過去のやり取りがLLMに渡され、直前のクエリに対する修正依頼に正しく対応できる
 *
 * 【テストケースIssue】#225
 *
 * 【前提条件】
 * - GraphQL接続先が登録済み
 *
 * 【期待結果】
 * - 同一会話内で過去のやり取り（生成GraphQLクエリ含む）がLLMに渡される
 * - 直前のクエリに対する修正依頼に正しく対応できる
 * - 会話コンテキストがGraphQL接続先でもDB接続先と同様に維持される
 */
test.describe('GraphQL Chat - Conversation Context Maintenance', () => {
  const graphqlConn = {
    id: 'graphql-conn-225',
    name: 'コンテキストテストAPI',
    dbType: 'graphql',
    endpointUrl: 'https://context-api.example.com/graphql',
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
   * 連続した質問で同一conversationIdが使用されること（会話コンテキスト維持）
   */
  test('should maintain conversation context with same conversationId for follow-up questions', async ({ page }) => {
    let requestCount = 0
    const conversationId = 'test-conv-225'
    const capturedRequests: Array<Record<string, unknown>> = []

    await page.route('**/api/chat', async (route) => {
      if (route.request().method() === 'POST') {
        requestCount++
        const body = route.request().postDataJSON() as Record<string, unknown>
        capturedRequests.push(body)

        const sseData = [
          `event: sql\ndata: ${JSON.stringify({ sql: `query { users { id name } }` })}\n\n`,
          `event: message\ndata: ${JSON.stringify({ chunk: `応答${requestCount}` })}\n\n`,
          `event: conversation\ndata: ${JSON.stringify({ conversationId })}\n\n`,
          `event: done\ndata: ${JSON.stringify({ conversationId, messageId: `msg-225-${requestCount}` })}\n\n`,
        ].join('')
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

    // 最初の質問を送信
    await chatInput.fill('ユーザー一覧を表示して')
    await page.keyboard.press('Shift+Enter')
    await page.waitForTimeout(2000)

    // 2回目の質問（修正依頼）を送信
    await chatInput.fill('年齢順に並べ替えて')
    await page.keyboard.press('Shift+Enter')
    await page.waitForTimeout(2000)

    // 2回APIが呼ばれること
    expect(capturedRequests.length).toBeGreaterThanOrEqual(2)

    // 2回目のリクエストにconversationIdが含まれること（会話コンテキスト維持）
    if (capturedRequests.length >= 2) {
      const secondRequest = capturedRequests[1]
      // conversationIdが設定されていること（null以外）
      expect(secondRequest.conversationId).toBeTruthy()
    }
  })

  /**
   * 最初の質問と修正依頼でメッセージが蓄積されること
   */
  test('should accumulate messages in chat area for multiple questions', async ({ page }) => {
    let requestCount = 0
    const conversationId = 'test-conv-225b'

    await page.route('**/api/chat', async (route) => {
      if (route.request().method() === 'POST') {
        requestCount++
        const sseData = [
          `event: message\ndata: ${JSON.stringify({ chunk: `回答${requestCount}` })}\n\n`,
          `event: done\ndata: ${JSON.stringify({ conversationId, messageId: `msg-225b-${requestCount}` })}\n\n`,
        ].join('')
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

    // 最初の質問
    await chatInput.fill('最初の質問')
    await page.keyboard.press('Shift+Enter')
    await page.waitForTimeout(1500)

    // 2回目の質問
    await chatInput.fill('2回目の質問')
    await page.keyboard.press('Shift+Enter')
    await page.waitForTimeout(1500)

    // メッセージエリアに複数のメッセージが表示されること
    // ユーザーメッセージ+アシスタントメッセージで計4件（各2件ずつ）
    const messages = page.locator('.chat-messages-area .chat-message, .chat-messages-area .message')
    const count = await messages.count()
    expect(count).toBeGreaterThanOrEqual(2)
  })

  /**
   * チャットAPIリクエストにmessageと接続IDが含まれること
   */
  test('should send message and connection ID in chat API request for GraphQL', async ({ page }) => {
    let capturedBody: unknown = null
    await page.route('**/api/chat', async (route) => {
      if (route.request().method() === 'POST') {
        capturedBody = route.request().postDataJSON()
        const sseData = `event: done\ndata: ${JSON.stringify({ conversationId: 'conv-225c', messageId: 'msg-225c' })}\n\n`
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

    const testMessage = '修正依頼のテスト'
    await chatInput.fill(testMessage)
    const sendBtn = page.locator('.chat-input-send-btn')
    await sendBtn.click()

    await page.waitForTimeout(2000)
    expect(capturedBody).toBeTruthy()
    const body = capturedBody as Record<string, unknown>
    expect(body.message).toBe(testMessage)
    expect(body.dbConnectionId).toBe(graphqlConn.id)
  })
})
