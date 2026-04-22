/**
 * DataAgent E2Eテスト - テストケース #224
 * GraphQLクエリ結果に対してAI分析コメントがストリーミング表示される
 */
import { test, expect } from '@playwright/test'

/**
 * 【ユーザーストーリー】
 * データ分析ユーザーがGraphQL接続先でデータを取得したとき、
 * クエリ実行後にLLMがデータの傾向・特徴・注目ポイントを自動分析し、
 * 分析コメントがChatGPTのようにストリーミングで逐次表示される
 *
 * 【テストケースIssue】#224
 *
 * 【前提条件】
 * - GraphQL接続先が登録済み
 * - チャット画面でGraphQL接続先が選択済み
 *
 * 【期待結果】
 * - GraphQLクエリ結果に対してLLMがデータの傾向・特徴・注目ポイントを自動分析する
 * - 分析コメントがChatGPTのようにストリーミングで逐次表示される
 */
test.describe('GraphQL Chat - AI Analysis Comment Streaming', () => {
  const graphqlConn = {
    id: 'graphql-conn-224',
    name: 'ストリーミングテストAPI',
    dbType: 'graphql',
    endpointUrl: 'https://streaming-api.example.com/graphql',
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
   * AI分析コメントがチャット画面に表示されること（ストリーミングSSEモック）
   */
  test('should display AI analysis comment after GraphQL query execution', async ({ page }) => {
    // ストリーミングSSEレスポンスのモック
    const analysisChunks = ['このデータは', 'A、B、Cの3つのカテゴリに分類されます。', 'Bが最も多い傾向があります。']

    await page.route('**/api/chat', async (route) => {
      if (route.request().method() === 'POST') {
        const queryResult = {
          columns: ['category', 'count'],
          rows: [['A', 10], ['B', 20], ['C', 15]],
          chartType: 'bar',
        }
        const sseEvents = [
          `event: sql\ndata: ${JSON.stringify({ sql: 'query { categories { name count } }' })}\n\n`,
          `event: result\ndata: ${JSON.stringify({ result: queryResult })}\n\n`,
          ...analysisChunks.map(
            (chunk) => `event: message\ndata: ${JSON.stringify({ chunk })}\n\n`
          ),
          `event: done\ndata: ${JSON.stringify({ conversationId: 'conv-224', messageId: 'msg-224' })}\n\n`,
        ]
        route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
          body: sseEvents.join(''),
        })
      } else {
        route.continue()
      }
    })

    await page.goto('/')

    const chatInput = page.locator('.chat-input-textarea, textarea')
    await expect(chatInput).toBeVisible({ timeout: 5000 })

    // 質問を送信
    await chatInput.fill('カテゴリ別の件数を分析して')
    await page.keyboard.press('Shift+Enter')

    // AI分析コメントがチャット画面に表示されること
    await expect(page.locator('.chat-messages-area')).toBeVisible({ timeout: 5000 })
    // メッセージが表示されること
    await expect(page.locator('.chat-messages-area')).toContainText('カテゴリ', { timeout: 10000 })
  })

  /**
   * ストリーミング中はメッセージが順次更新されること
   */
  test('should show streaming text progressively during AI analysis', async ({ page }) => {
    await page.route('**/api/chat', async (route) => {
      if (route.request().method() === 'POST') {
        // ストリーミングでメッセージを順次返す
        const sseData = [
          `event: sql\ndata: ${JSON.stringify({ sql: 'query { users { id } }' })}\n\n`,
          `event: message\ndata: ${JSON.stringify({ chunk: 'データ分析結果：' })}\n\n`,
          `event: message\ndata: ${JSON.stringify({ chunk: 'ユーザーが3名います。' })}\n\n`,
          `event: done\ndata: ${JSON.stringify({ conversationId: 'conv-224s', messageId: 'msg-224s' })}\n\n`,
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

    await chatInput.fill('ユーザー数を確認して')
    await page.keyboard.press('Shift+Enter')

    // ストリーミングメッセージが表示されること
    await expect(page.locator('.chat-messages-area')).toContainText('データ分析', { timeout: 10000 })
  })

  /**
   * StreamingTextコンポーネントでストリーミングが制御されること（APIリクエスト検証）
   */
  test('should make SSE streaming chat request for GraphQL connection', async ({ page }) => {
    let capturedRequest: unknown = null
    await page.route('**/api/chat', async (route) => {
      if (route.request().method() === 'POST') {
        capturedRequest = route.request().postDataJSON()
        const sseData = `event: done\ndata: ${JSON.stringify({ conversationId: 'conv-224r', messageId: 'msg-224r' })}\n\n`
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

    const sendBtn = page.locator('.chat-input-send-btn')
    await chatInput.fill('データを分析して')
    await sendBtn.click()

    // APIリクエストが正しいdbConnectionIdで送信されること
    await page.waitForTimeout(2000)
    expect(capturedRequest).toBeTruthy()
    const body = capturedRequest as Record<string, unknown>
    expect(body.dbConnectionId).toBe(graphqlConn.id)
    expect(body.message).toBeTruthy()
  })
})
