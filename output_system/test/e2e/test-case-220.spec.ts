/**
 * DataAgent E2Eテスト - テストケース #220
 * GraphQLクエリはQueryのみ許可されMutationは拒否される
 */
import { test, expect } from '@playwright/test'

/**
 * 【ユーザーストーリー】
 * データ分析ユーザーがGraphQL接続先でデータ変更を促す質問をしても、
 * Mutationクエリは生成・実行されず拒否される。
 * Queryのみが許可される（読み取り専用のSELECTのみ許可と同じセキュリティモデル）
 *
 * 【テストケースIssue】#220
 *
 * 【前提条件】
 * - GraphQL接続先が登録済み
 *
 * 【期待結果】
 * - Mutationを含むクエリは生成・実行されず、拒否される
 * - Queryのみが許可される
 */
test.describe('GraphQL Security - Mutation Rejection', () => {
  const setupGraphQLConn = () => ({
    id: 'graphql-conn-220',
    name: 'Mutation拒否テスト',
    dbType: 'graphql',
    endpointUrl: 'https://mutation-test.example.com/graphql',
    host: null,
    port: null,
    username: null,
    databaseName: null,
    isLastUsed: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })

  /**
   * UIでMutation拒否時にエラーメッセージが表示されること（モックSSEで確認）
   */
  test('should display error message when mutation is rejected in UI', async ({ page }) => {
    const graphqlConn = setupGraphQLConn()

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

    // MutationをSSEエラーとして返すモック
    await page.route('**/api/chat', async (route) => {
      if (route.request().method() === 'POST') {
        const sseData = `event: error\ndata: ${JSON.stringify({ message: 'Mutationは実行できません。データの読み取り（Query）のみが許可されています。質問を変えてみてください。' })}\n\n`
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

    // Mutation系の質問を入力して送信
    await chatInput.fill('ユーザーAの名前をBに変更して')
    await page.keyboard.press('Shift+Enter')

    // エラーメッセージがチャット画面に表示されること
    await expect(page.locator('.chat-messages-area')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.chat-messages-area')).toContainText('Mutation', { timeout: 5000 })
  })

  /**
   * Queryは正常に生成・実行されること（モックSSEで確認）
   */
  test('should allow query type GraphQL operations', async ({ page }) => {
    const graphqlConn = setupGraphQLConn()

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

    // Queryを正常に返すSSEモック
    await page.route('**/api/chat', async (route) => {
      if (route.request().method() === 'POST') {
        const generatedQuery = 'query { users { id name } }'
        const sseData = [
          `event: sql\ndata: ${JSON.stringify({ sql: generatedQuery })}\n\n`,
          `event: message\ndata: ${JSON.stringify({ chunk: 'ユーザー一覧を取得しました。' })}\n\n`,
          `event: done\ndata: ${JSON.stringify({ conversationId: 'conv-220q', messageId: 'msg-220q' })}\n\n`,
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

    // Query系の質問を送信
    await chatInput.fill('ユーザー一覧を表示して')
    await page.keyboard.press('Shift+Enter')

    // 正常なクエリが表示されること（エラーではないこと）
    await expect(page.locator('.chat-message__sql').first()).toBeVisible({ timeout: 10000 })
  })

  /**
   * チャットAPIへのリクエストにMutation拒否に必要なコンテキスト情報が含まれること
   */
  test('should send request with connection context to allow backend mutation validation', async ({ page }) => {
    const graphqlConn = setupGraphQLConn()

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

    let capturedBody: unknown = null
    await page.route('**/api/chat', async (route) => {
      if (route.request().method() === 'POST') {
        capturedBody = route.request().postDataJSON()
        const sseData = `event: done\ndata: ${JSON.stringify({ conversationId: 'conv-220v', messageId: 'msg-220v' })}\n\n`
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

    await chatInput.fill('データを更新して')
    const sendBtn = page.locator('.chat-input-send-btn')
    await sendBtn.click()

    // APIリクエストに接続情報が含まれること（バックエンドでMutation検証に必要）
    await page.waitForTimeout(2000)
    expect(capturedBody).toBeTruthy()
    const body = capturedBody as Record<string, unknown>
    expect(body.dbConnectionId).toBe(graphqlConn.id)
    expect(body.message).toBeTruthy()
  })
})
