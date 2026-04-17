/**
 * DataAgent E2Eテスト - テストケース #58
 * チャット画面から質問を送信し結果を受け取れる
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
 * POST /api/chat をSSEレスポンスでモックする
 */
async function mockChatApi(page: Page, sseBody: string): Promise<void> {
  await page.route('**/api/chat', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: {
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
      body: sseBody,
    })
  })
}

/**
 * チャット画面 質問送信・結果受信テストスイート
 */
test.describe('Chat UI - Send Question and Receive Result', () => {
  /**
   * 【ユーザーストーリー】
   * DataAgent の利用者がチャット入力欄に自然言語で質問を投げ、
   * Enterキーで送信すると生成SQL・実行結果が画面に表示される
   *
   * 【テストケースIssue】#58
   *
   * 【前提条件】
   * - バックエンドAPIがSSEレスポンスを返す（モック）
   *
   * 【期待結果】
   * - 入力欄にテキストを入力しEnterで送信できる（受入条件 #1）
   * - ストリーミングでアシスタント応答が逐次表示される（受入条件 #2）
   * - 生成SQLがコードブロックで表示される（受入条件 #3）
   * - 実行結果がテーブル形式で表示される（受入条件 #4）
   */
  test('should send question via Enter key and display streamed response with SQL', async ({ page }) => {
    // Arrange: SSEレスポンスをモック
    const sseBody = createSseResponse([
      { event: 'message', data: { chunk: '売上の合計を' } },
      { event: 'message', data: { chunk: 'SQLで取得します。' } },
      { event: 'sql', data: { sql: 'SELECT SUM(amount) as total_sales FROM sales' } },
      { event: 'chart_type', data: { chartType: 'table' } },
      {
        event: 'result',
        data: {
          columns: ['total_sales'],
          rows: [{ total_sales: 1500000 }],
          chartType: 'table',
        },
      },
      { event: 'done', data: {} },
    ])

    await mockChatApi(page, sseBody)
    await page.goto('/')

    // Act: 入力欄にテキストを入力してEnterで送信（受入条件 #1）
    const textarea = page.locator('.chat-input-textarea')
    await textarea.fill('売上の合計を教えて')
    await textarea.press('Enter')

    // Assert: ユーザーメッセージが表示されること
    await expect(page.locator('.chat-message--user').first()).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.chat-message--user .chat-message__text')).toContainText('売上の合計を教えて')

    // Assert: アシスタントのテキスト応答が逐次表示されること（受入条件 #2）
    await expect(page.locator('.chat-message--assistant').first()).toBeVisible({ timeout: 10000 })

    // Assert: 生成SQLがコードブロックで表示されること（受入条件 #3）
    await expect(page.locator('.sql-display')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.sql-code')).toContainText('SELECT SUM(amount)')

    // Assert: 実行結果がテーブル形式で表示されること（受入条件 #4）
    await expect(page.locator('.data-table')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('th').filter({ hasText: 'total_sales' })).toBeVisible()
    await expect(page.locator('td').filter({ hasText: '1500000' })).toBeVisible()
  })

  /**
   * 【ユーザーストーリー】
   * 送信ボタンをクリックしても質問を送信できる
   *
   * 【テストケースIssue】#58
   *
   * 【期待結果】
   * - 送信ボタンクリックでメッセージが送信される
   */
  test('should send question via send button click', async ({ page }) => {
    const sseBody = createSseResponse([
      { event: 'message', data: { chunk: '結果を表示します。' } },
      { event: 'sql', data: { sql: 'SELECT * FROM products' } },
      { event: 'done', data: {} },
    ])

    await mockChatApi(page, sseBody)
    await page.goto('/')

    // 入力して送信ボタンをクリック
    await page.locator('.chat-input-textarea').fill('商品一覧を教えて')
    await page.locator('.chat-input-send-btn').click()

    // ユーザーメッセージが表示されること
    await expect(page.locator('.chat-message--user').first()).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.chat-message--user .chat-message__text')).toContainText('商品一覧を教えて')
  })

  /**
   * 【ユーザーストーリー】
   * Shift+Enter で改行できること（Enter 送信との違い）
   *
   * 【テストケースIssue】#58
   *
   * 【期待結果】
   * - Shift+Enter を押したときにメッセージが送信されずに改行されること（受入条件 #5）
   */
  test('should add newline on Shift+Enter instead of sending', async ({ page }) => {
    await page.goto('/')
    const textarea = page.locator('.chat-input-textarea')

    // Shift+Enter で改行を入力
    await textarea.fill('1行目')
    await textarea.press('Shift+Enter')
    await textarea.type('2行目')

    // テキストエリアに改行が含まれること（送信されていないこと）
    const value = await textarea.inputValue()
    expect(value).toContain('\n')
    expect(value).toContain('1行目')
    expect(value).toContain('2行目')

    // メッセージはまだ送信されていないこと
    await expect(page.locator('.chat-message--user')).not.toBeVisible()
  })

  /**
   * 【ユーザーストーリー】
   * 入力欄が空の場合は送信できない
   *
   * 【テストケースIssue】#58
   *
   * 【期待結果】
   * - 空メッセージは送信されない（ボタン無効化）
   */
  test('should not send empty message', async ({ page }) => {
    await page.goto('/')

    // 空の状態でEnterを押す
    const textarea = page.locator('.chat-input-textarea')
    await textarea.press('Enter')

    // メッセージが送信されていないこと
    await expect(page.locator('.chat-message--user')).not.toBeVisible()

    // 送信ボタンが無効状態であること（aria-disabled or disabled）
    const sendBtn = page.locator('.chat-input-send-btn')
    const isDisabled = await sendBtn.evaluate((el) => {
      return el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true'
    })
    expect(isDisabled).toBe(true)
  })

  /**
   * 【ユーザーストーリー】
   * チャット画面のUIが正しく表示される
   *
   * 【テストケースIssue】#58
   *
   * 【期待結果】
   * - ウェルカムメッセージが表示されること
   * - 入力フィールドが表示されること
   */
  test('should display chat UI correctly on page load', async ({ page }) => {
    await page.goto('/')

    // ウェルカムメッセージが表示されること
    await expect(page.locator('.chat-welcome')).toBeVisible()

    // 入力フィールドが表示されること
    await expect(page.locator('.chat-input-textarea')).toBeVisible()

    // 送信ボタンが表示されること
    await expect(page.locator('.chat-input-send-btn')).toBeVisible()
  })
})
