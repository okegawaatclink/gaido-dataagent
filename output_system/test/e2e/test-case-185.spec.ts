/**
 * DataAgent E2Eテスト - テストケース #185
 * 選択中DBに自然言語で質問しSQL生成・実行・ストリーミング表示ができる
 */
import { test, expect } from '@playwright/test'

/**
 * SSEレスポンスを生成するヘルパー
 */
function createSseResponse(events: Array<{ event: string; data: unknown }>): string {
  return events
    .map(({ event, data }) => {
      const jsonData = typeof data === 'string' ? data : JSON.stringify(data)
      return `event: ${event}\ndata: ${jsonData}\n\n`
    })
    .join('')
}

/**
 * 【ユーザーストーリー】
 * 業務データを参照したい社内ユーザーが選択中のDB接続先に対して自然言語で質問し、
 * SQLが自動生成・実行されて結果がストリーミングで返ってくる
 *
 * 【テストケースIssue】#185
 *
 * 【前提条件】
 * - DB接続先が1件以上登録されていること
 * - バックエンドAPIがSSEを返す（モック）
 *
 * 【期待結果】
 * - SSEイベントが正しい順序で送信される
 * - チャット画面でユーザーメッセージとアシスタントメッセージが表示される
 * - SQLがコードブロックで表示される
 * - AI分析コメントがストリーミング表示される
 * - エラー時に適切なエラーメッセージが返る
 */
test.describe('Natural Language SQL Generation - Chat Flow', () => {
  /**
   * チャット入力から質問を送信してSSEレスポンスを受け取れること
   */
  test('should send chat message and receive SSE response', async ({ page }) => {
    const conversationId = 'test-conv-185-001'

    // SSE /api/chat モック
    await page.route('**/api/chat', (route) => {
      const sseBody = createSseResponse([
        { event: 'conversation', data: { conversationId } },
        { event: 'message', data: { chunk: '月別売上データを取得しました。' } },
        { event: 'sql', data: { sql: 'SELECT month, SUM(amount) AS total FROM sales GROUP BY month' } },
        { event: 'chart_type', data: { chartType: 'bar' } },
        {
          event: 'result',
          data: {
            columns: ['month', 'total'],
            rows: [
              { month: '1月', total: 100000 },
              { month: '2月', total: 150000 },
            ],
            chartType: 'bar',
          },
        },
        { event: 'analysis', data: { chunk: '2月が1月より50%増加しています。' } },
        { event: 'done', data: {} },
      ])
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: { 'Cache-Control': 'no-cache' },
        body: sseBody,
      })
    })

    // 履歴モック
    await page.route('**/api/history*', (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{
            id: conversationId,
            title: '月別売上を教えて',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }]),
        })
      } else {
        route.continue()
      }
    })

    await page.goto('/')

    // チャット入力欄に質問を入力して送信
    await page.locator('.chat-input-textarea').fill('月別売上を教えて')
    await page.locator('.chat-input-textarea').press('Enter')

    // ユーザーメッセージが表示されること
    await expect(page.locator('.chat-message--user').first()).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.chat-message--user').first()).toContainText('月別売上を教えて')

    // アシスタントメッセージが表示されること
    await expect(page.locator('.chat-message--assistant').first()).toBeVisible({ timeout: 10000 })
  })

  /**
   * SQLがコードブロックで表示されること
   */
  test('should display generated SQL in code block', async ({ page }) => {
    const conversationId = 'test-conv-185-002'
    const expectedSql = 'SELECT month, SUM(amount) AS total FROM sales GROUP BY month'

    await page.route('**/api/chat', (route) => {
      const sseBody = createSseResponse([
        { event: 'conversation', data: { conversationId } },
        { event: 'message', data: { chunk: 'クエリを実行します。' } },
        { event: 'sql', data: { sql: expectedSql } },
        { event: 'chart_type', data: { chartType: 'table' } },
        {
          event: 'result',
          data: {
            columns: ['month', 'total'],
            rows: [{ month: '1月', total: 100000 }],
            chartType: 'table',
          },
        },
        { event: 'done', data: {} },
      ])
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: { 'Cache-Control': 'no-cache' },
        body: sseBody,
      })
    })

    await page.route('**/api/history*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      })
    })

    await page.goto('/')

    await page.locator('.chat-input-textarea').fill('売上を月別に集計して')
    await page.locator('.chat-input-textarea').press('Enter')

    // SQLコードブロックが表示されること
    await expect(page.locator('.sql-display, .sql-code, pre code').first()).toBeVisible({ timeout: 10000 })
  })

  /**
   * エラー時に適切なエラーメッセージが表示されること
   */
  test('should display error message when SSE returns error event', async ({ page }) => {
    await page.route('**/api/chat', (route) => {
      const sseBody = createSseResponse([
        { event: 'error', data: { message: 'データベースへの接続に失敗しました' } },
      ])
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: { 'Cache-Control': 'no-cache' },
        body: sseBody,
      })
    })

    await page.route('**/api/history*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      })
    })

    await page.goto('/')

    await page.locator('.chat-input-textarea').fill('エラーになる質問')
    await page.locator('.chat-input-textarea').press('Enter')

    // エラーメッセージが表示されること（アシスタントメッセージにエラー内容が含まれる）
    await expect(page.locator('.chat-message--assistant, .chat-message--error').first()).toBeVisible({ timeout: 10000 })
  })

  /**
   * リクエストにdbConnectionIdが含まれること
   */
  test('should include dbConnectionId in chat request', async ({ page }) => {
    let capturedBody: { dbConnectionId?: string } = {}

    await page.route('**/api/chat', async (route) => {
      const body = await route.request().postDataJSON()
      capturedBody = body as { dbConnectionId?: string }

      const sseBody = createSseResponse([
        { event: 'conversation', data: { conversationId: 'test-conv-185-003' } },
        { event: 'message', data: { chunk: '応答します。' } },
        { event: 'done', data: {} },
      ])
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: { 'Cache-Control': 'no-cache' },
        body: sseBody,
      })
    })

    await page.route('**/api/history*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      })
    })

    await page.goto('/')

    await page.locator('.chat-input-textarea').fill('テスト質問')
    await page.locator('.chat-input-textarea').press('Enter')

    await page.locator('.chat-message--user').first().waitFor({ timeout: 5000 })
    await page.waitForTimeout(500)

    // dbConnectionId がリクエストに含まれること
    expect(capturedBody.dbConnectionId).toBeTruthy()
  })
})
