/**
 * DataAgent E2Eテスト - チャット機能（1往復）
 *
 * このファイルでは DataAgent チャット機能の E2E テストを行う。
 *
 * テスト方針（Task 2.3.4）:
 * - バックエンドAPIをPlaywright route interceptorでモックする
 * - 実APIは呼ばない（コスト・再現性のため）
 * - フロントエンドのSSE受信・メッセージ表示ロジックを検証する
 *
 * テスト範囲:
 * - 入力欄に質問を入力してEnterで送信できること（受入条件 #1）
 * - ストリーミングでアシスタント応答が逐次表示されること（受入条件 #2）
 * - 生成SQLがコードブロックで表示されること（受入条件 #3）
 * - 実行結果がテーブル形式で表示されること（受入条件 #4）
 * - エラー時は「質問を変えてみてください」等のガイドが出ること（受入条件 #5）
 *
 * 実行前提:
 * - `docker compose up -d` でフロントエンドコンテナが起動していること
 * - AIエージェントコンテナからコンテナ名でアクセスできること
 */
import { test, expect, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// SSEモック用ヘルパー
// ---------------------------------------------------------------------------

/**
 * SSEレスポンスを生成するヘルパー
 * バックエンドの sendSseEvent フォーマットに準拠する
 *
 * @param events - {event, data} 形式のイベント配列
 * @returns SSEレスポンス文字列
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
 *
 * Playwright の route.fulfill でSSEレスポンスを返す。
 * Content-Type: text/event-stream を設定してSSEとして認識させる。
 *
 * @param page - Playwright Page オブジェクト
 * @param sseBody - モックするSSEレスポンス本文
 */
async function mockChatApi(page: Page, sseBody: string): Promise<void> {
  await page.route('**/api/chat', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: {
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
      body: sseBody,
    })
  })
}

/**
 * エラーSSEレスポンスでモックする
 *
 * @param page - Playwright Page オブジェクト
 * @param errorMessage - エラーメッセージ
 */
async function mockChatApiError(page: Page, errorMessage: string): Promise<void> {
  const sseBody = createSseResponse([
    { event: 'error', data: { message: errorMessage } },
    { event: 'done', data: {} },
  ])
  await mockChatApi(page, sseBody)
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

/**
 * チャット機能 E2E テストスイート
 */
test.describe('チャット機能 - 1往復テスト', () => {
  /**
   * 【ユーザーストーリー】
   * チャット画面が正しく表示されること
   *
   * 【前提条件】
   * - フロントエンドが起動していること
   *
   * 【期待結果】
   * - ウェルカムメッセージが表示されること
   * - 入力フィールドが表示されること
   * - サイドバーが表示されること
   */
  test('should display chat UI correctly on page load', async ({ page }) => {
    // Arrange & Act
    await page.goto('/')

    // Assert: ウェルカムメッセージが表示されること
    await expect(page.locator('.chat-welcome')).toBeVisible()
    await expect(page.locator('.chat-welcome__title')).toHaveText('DataAgent へようこそ')

    // Assert: 入力フィールドが表示されること
    await expect(page.locator('.chat-input-textarea')).toBeVisible()

    // Assert: 送信ボタンが表示されること
    await expect(page.locator('.chat-input-send-btn')).toBeVisible()

    // Assert: サイドバーが表示されること
    await expect(page.locator('.sidebar')).toBeVisible()
  })

  /**
   * 【ユーザーストーリー】
   * ユーザーが入力欄に質問を入力してEnterを押すと、
   * ユーザーメッセージとアシスタントメッセージが表示される
   *
   * 【前提条件】
   * - バックエンドAPIがSSEレスポンスを返す（モック）
   *
   * 【期待結果】
   * - ユーザーメッセージが画面に表示されること（受入条件 #1）
   * - アシスタントのテキスト応答が表示されること（受入条件 #2）
   */
  test('should display user message and assistant response when question is submitted', async ({ page }) => {
    // Arrange: バックエンドAPIをモック
    const sseBody = createSseResponse([
      { event: 'message', data: { chunk: '以下のSQLを' } },
      { event: 'message', data: { chunk: '生成しました。' } },
      { event: 'sql', data: { sql: 'SELECT * FROM sales LIMIT 10' } },
      { event: 'chart_type', data: { chartType: 'table' } },
      { event: 'result', data: { columns: ['id', 'amount'], rows: [{ id: 1, amount: 1000 }], chartType: 'table' } },
      { event: 'done', data: {} },
    ])
    await mockChatApi(page, sseBody)
    await page.goto('/')

    // Act: 質問を入力してEnterで送信
    const textarea = page.locator('.chat-input-textarea')
    await textarea.fill('今月の売上トップ10を教えて')
    await textarea.press('Enter')

    // Assert: ユーザーメッセージが表示されること
    await expect(page.locator('.chat-message--user').first()).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.chat-message--user .chat-message__text')).toContainText(
      '今月の売上トップ10を教えて',
    )

    // Assert: アシスタントメッセージが表示されること
    await expect(page.locator('.chat-message--assistant').first()).toBeVisible({ timeout: 10000 })

    // Assert: ストリーミングで受信したテキストが表示されること（受入条件 #2）
    await expect(
      page.locator('.chat-message--assistant .chat-message__text'),
    ).toContainText('以下のSQLを生成しました。', { timeout: 10000 })
  })

  /**
   * 【ユーザーストーリー】
   * アシスタントの応答に生成SQLがコードブロックで表示される
   *
   * 【前提条件】
   * - バックエンドAPIがSQL付きのSSEレスポンスを返す（モック）
   *
   * 【期待結果】
   * - 生成SQLがコードブロックで表示されること（受入条件 #3）
   */
  test('should display generated SQL in code block', async ({ page }) => {
    // Arrange: SQLを含むSSEレスポンスをモック
    const testSql = 'SELECT id, amount FROM sales ORDER BY amount DESC LIMIT 10'
    const sseBody = createSseResponse([
      { event: 'message', data: { chunk: 'SQLを生成しました。' } },
      { event: 'sql', data: { sql: testSql } },
      { event: 'done', data: {} },
    ])
    await mockChatApi(page, sseBody)
    await page.goto('/')

    // Act: 質問を送信
    await page.locator('.chat-input-textarea').fill('今月の売上を教えて')
    await page.locator('.chat-input-textarea').press('Enter')

    // Assert: SQLがコードブロックで表示されること（受入条件 #3）
    await expect(page.locator('.sql-display')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.sql-code')).toContainText(testSql, { timeout: 10000 })

    // Assert: 「生成されたSQL」ラベルが表示されること
    await expect(page.locator('.sql-label')).toHaveText('生成されたSQL')
  })

  /**
   * 【ユーザーストーリー】
   * クエリ実行結果がテーブル形式で表示される
   *
   * 【前提条件】
   * - バックエンドAPIが結果データを含むSSEレスポンスを返す（モック）
   *
   * 【期待結果】
   * - クエリ結果が表形式で表示されること（受入条件 #4）
   * - 列名と行データが正しく表示されること
   */
  test('should display query result as table', async ({ page }) => {
    // Arrange: 結果データを含むSSEレスポンスをモック
    const resultData = {
      columns: ['id', 'product', 'amount'],
      rows: [
        { id: 1, product: '商品A', amount: 5000 },
        { id: 2, product: '商品B', amount: 3000 },
      ],
      chartType: 'table',
    }
    const sseBody = createSseResponse([
      { event: 'message', data: { chunk: '結果を表示します。' } },
      { event: 'sql', data: { sql: 'SELECT id, product, amount FROM sales' } },
      { event: 'result', data: resultData },
      { event: 'done', data: {} },
    ])
    await mockChatApi(page, sseBody)
    await page.goto('/')

    // Act: 質問を送信
    await page.locator('.chat-input-textarea').fill('売上データを教えて')
    await page.locator('.chat-input-send-btn').click()

    // Assert: テーブルが表示されること（受入条件 #4）
    await expect(page.locator('.data-table')).toBeVisible({ timeout: 10000 })

    // Assert: 列名が表示されること
    await expect(page.locator('th').filter({ hasText: 'product' })).toBeVisible()
    await expect(page.locator('th').filter({ hasText: 'amount' })).toBeVisible()

    // Assert: 行データが表示されること
    await expect(page.locator('td').filter({ hasText: '商品A' })).toBeVisible()
    await expect(page.locator('td').filter({ hasText: '商品B' })).toBeVisible()

    // Assert: 件数サマリーが表示されること
    await expect(page.locator('.data-table-summary')).toContainText('2 件の結果')
  })

  /**
   * 【ユーザーストーリー】
   * エラー発生時に「質問を変えてみてください」等のガイドが表示される
   *
   * 【前提条件】
   * - バックエンドAPIがエラーレスポンスを返す（モック）
   *
   * 【期待結果】
   * - エラーメッセージが表示されること（受入条件 #5）
   * - ユーザー向けガイドが表示されること
   */
  test('should display error message with guide when API returns error', async ({ page }) => {
    // Arrange: エラーレスポンスをモック
    await mockChatApiError(page, 'DBスキーマの取得に失敗しました。')
    await page.goto('/')

    // Act: 質問を送信
    await page.locator('.chat-input-textarea').fill('エラーになる質問')
    await page.locator('.chat-input-textarea').press('Enter')

    // Assert: エラーメッセージが表示されること（受入条件 #5）
    await expect(page.locator('.error-message')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.error-text')).toContainText('DBスキーマの取得に失敗しました。')

    // Assert: ガイドメッセージが表示されること
    await expect(page.locator('.error-guide')).toBeVisible()
    await expect(page.locator('.error-guide')).toContainText('質問を変えるか')
  })

  /**
   * 【ユーザーストーリー】
   * Shift+Enter で改行できること（Enter 送信との違い）
   *
   * 【期待結果】
   * - Shift+Enter を押したときにメッセージが送信されずに改行されること
   */
  test('should add newline on Shift+Enter instead of sending', async ({ page }) => {
    // Arrange
    await page.goto('/')
    const textarea = page.locator('.chat-input-textarea')

    // Act: Shift+Enter で改行を入力
    await textarea.fill('1行目')
    await textarea.press('Shift+Enter')
    await textarea.type('2行目')

    // Assert: テキストエリアに改行が含まれること（送信されていないこと）
    const value = await textarea.inputValue()
    expect(value).toContain('\n')
    expect(value).toContain('1行目')
    expect(value).toContain('2行目')

    // Assert: メッセージはまだ送信されていないこと
    await expect(page.locator('.chat-message--user')).not.toBeVisible()
  })
})
