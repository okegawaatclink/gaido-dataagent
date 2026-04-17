/**
 * DataAgent E2Eテスト - テストケース #70
 * 会話コンテキスト維持で直前のSQL修正依頼ができる
 */
import { test, expect, type Page } from '@playwright/test'

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
 * 会話コンテキスト維持テストスイート
 */
test.describe('Conversation Context - SQL Modification Request', () => {
  /**
   * 【ユーザーストーリー】
   * 同一会話内で2回目のメッセージを送信すると、conversationIdが引き継がれる
   *
   * 【テストケースIssue】#70
   *
   * 【前提条件】
   * - バックエンドAPIがSSEを返す（モック）
   * - 1回目のレスポンスで conversationId が返される
   *
   * 【期待結果】
   * - 2回目のリクエストに conversationId が含まれる
   * - コンテキストを引き継いだSQL修正が可能
   */
  test('should pass conversationId in second message to maintain context', async ({ page }) => {
    const conversationId = 'test-conv-context-001'
    let requestCount = 0
    let capturedConversationIdInSecond: string | undefined = undefined

    // /api/history をモック: conversationId を含む会話一覧を返す
    // （送信完了後の履歴リフレッシュ時に conversationId が一覧に存在しないとクリアされるため）
    await page.route('**/api/history', (route) => {
      if (route.request().method() === 'GET' && !route.request().url().includes('/api/history/')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: conversationId,
              title: '月別売上の推移',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ]),
        })
      } else {
        route.continue()
      }
    })

    // 1回目: conversationId を返す
    // 2回目: conversationId が含まれているかを記録してレスポンスを返す
    await page.route('**/api/chat', (route) => {
      requestCount++
      const postData = route.request().postData() ?? ''
      let parsedBody: { message?: string; conversationId?: string } = {}
      try {
        parsedBody = JSON.parse(postData)
      } catch { /* ignore */ }

      if (requestCount === 1) {
        const sseBody = createSseResponse([
          { event: 'message', data: { chunk: '月別売上を取得しました。' } },
          { event: 'sql', data: { sql: 'SELECT month, SUM(amount) FROM sales GROUP BY month' } },
          { event: 'chart_type', data: { chartType: 'bar' } },
          {
            event: 'result',
            data: {
              columns: ['month', 'sum_amount'],
              rows: [{ month: '1月', sum_amount: 100000 }],
              chartType: 'bar',
            },
          },
          { event: 'conversation', data: { conversationId } },
          { event: 'done', data: {} },
        ])
        route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          headers: { 'Cache-Control': 'no-cache' },
          body: sseBody,
        })
      } else {
        capturedConversationIdInSecond = parsedBody.conversationId
        const sseBody = createSseResponse([
          { event: 'message', data: { chunk: '折れ線グラフに変更しました。' } },
          { event: 'sql', data: { sql: 'SELECT month, SUM(amount) FROM sales GROUP BY month' } },
          { event: 'chart_type', data: { chartType: 'line' } },
          {
            event: 'result',
            data: {
              columns: ['month', 'sum_amount'],
              rows: [{ month: '1月', sum_amount: 100000 }],
              chartType: 'line',
            },
          },
          { event: 'conversation', data: { conversationId } },
          { event: 'done', data: {} },
        ])
        route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          headers: { 'Cache-Control': 'no-cache' },
          body: sseBody,
        })
      }
    })

    await page.goto('/')

    // 1回目: 最初の質問を送信
    await page.locator('.chat-input-textarea').fill('売上の月別推移を教えて')
    await page.locator('.chat-input-textarea').press('Enter')

    // 1回目の応答を待つ（アシスタントメッセージが表示されるまで待つ）
    await expect(page.locator('.chat-message--assistant').first()).toBeVisible({ timeout: 10000 })

    // 2回目: 同じ会話で修正依頼
    await page.locator('.chat-input-textarea').fill('今度は折れ線グラフで表示して')
    await page.locator('.chat-input-textarea').press('Enter')

    // 2回目の応答を待つ
    await expect(page.locator('.chat-message--user')).toHaveCount(2, { timeout: 10000 })

    // 2回目のリクエストに conversationId が含まれていること
    await page.waitForTimeout(500)
    expect(capturedConversationIdInSecond).toBe(conversationId)
  })

  /**
   * 【ユーザーストーリー】
   * 同一会話内で複数の質問を送信すると全て表示される
   *
   * 【テストケースIssue】#70
   *
   * 【前提条件】
   * - バックエンドAPIがSSEを返す（モック）
   *
   * 【期待結果】
   * - 複数のやり取りがチャットエリアに表示される
   * - ユーザーとアシスタントのメッセージが交互に表示される
   */
  test('should display multiple messages in conversation thread', async ({ page }) => {
    let callCount = 0

    await page.route('**/api/chat', (route) => {
      callCount++
      const chartType = callCount === 1 ? 'bar' : 'line'
      const sseBody = createSseResponse([
        { event: 'message', data: { chunk: `${callCount}回目の応答です。` } },
        { event: 'sql', data: { sql: `SELECT * FROM table${callCount}` } },
        { event: 'chart_type', data: { chartType } },
        {
          event: 'result',
          data: {
            columns: ['id', 'value'],
            rows: [{ id: callCount, value: callCount * 100 }],
            chartType,
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

    await page.goto('/')

    // 1回目の質問
    await page.locator('.chat-input-textarea').fill('最初の質問')
    await page.locator('.chat-input-textarea').press('Enter')
    await expect(page.locator('.chat-message--user')).toHaveCount(1, { timeout: 5000 })
    await expect(page.locator('.chat-message--assistant')).toHaveCount(1, { timeout: 10000 })

    // 2回目の質問
    await page.locator('.chat-input-textarea').fill('修正依頼')
    await page.locator('.chat-input-textarea').press('Enter')
    await expect(page.locator('.chat-message--user')).toHaveCount(2, { timeout: 5000 })
    await expect(page.locator('.chat-message--assistant')).toHaveCount(2, { timeout: 10000 })
  })

  /**
   * 【ユーザーストーリー】
   * 新しい会話ボタンを押すと conversationId がリセットされる
   *
   * 【テストケースIssue】#70
   *
   * 【期待結果】
   * - 新しい会話では conversationId が新規発行される
   */
  test('should reset conversationId when new chat is started', async ({ page }) => {
    const firstConvId = 'test-conv-first-001'
    let requestBodyList: Array<{ message?: string; conversationId?: string }> = []

    await page.route('**/api/chat', async (route) => {
      const body = await route.request().postDataJSON() as { message?: string; conversationId?: string }
      requestBodyList.push(body)

      const sseBody = createSseResponse([
        { event: 'conversation', data: { conversationId: firstConvId } },
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

    await page.route('**/api/history', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      })
    })

    await page.goto('/')

    // 1回目: 最初の質問
    await page.locator('.chat-input-textarea').fill('最初の質問')
    await page.locator('.chat-input-textarea').press('Enter')
    await expect(page.locator('.chat-message--user').first()).toBeVisible({ timeout: 5000 })

    // 新しい会話ボタンをクリック
    await page.locator('.sidebar-new-chat-btn').click()

    // ウェルカムメッセージが表示されること
    await expect(page.locator('.chat-welcome')).toBeVisible({ timeout: 5000 })

    // 新しい会話で質問を送信
    await page.locator('.chat-input-textarea').fill('新しい会話の質問')
    await page.locator('.chat-input-textarea').press('Enter')
    await expect(page.locator('.chat-message--user').first()).toBeVisible({ timeout: 5000 })

    // 新しい会話のリクエストには conversationId が含まれていないこと
    await page.waitForTimeout(500)
    if (requestBodyList.length >= 2) {
      const newConvRequest = requestBodyList[requestBodyList.length - 1]
      // 新規会話ではconversationIdがundefinedまたは空
      expect(newConvRequest.conversationId).toBeFalsy()
    }
  })
})
