/**
 * DataAgent E2Eテスト - テストケース #57
 * 自然言語からSQL・グラフ種がClaude APIで生成される
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
 * Claude API SQL/グラフ種自動生成テストスイート
 */
test.describe('Claude API - SQL and Chart Type Generation', () => {
  /**
   * 【ユーザーストーリー】
   * DataAgent の利用者が自然言語の質問を入力すると、Claude API が
   * SQL と推奨グラフ種を生成し、SSE ストリームで順次送信される
   *
   * 【テストケースIssue】#57
   *
   * 【前提条件】
   * - バックエンドAPIが SSE ストリームを返す（モック）
   *
   * 【期待結果】
   * - conversation イベント（会話ID通知）が受信される
   * - message イベント（テキスト応答チャンク）が表示される
   * - sql イベント（生成されたSQL）がUIに表示される
   * - chart_type イベント（推奨グラフ種）が反映される
   * - result イベント（クエリ結果JSON）がテーブルに表示される
   * - done イベントでストリームが終了する
   */
  test('should display SQL and chart type from SSE stream events', async ({ page }) => {
    // Arrange: すべてのSSEイベントを含むモックレスポンス
    const conversationId = 'test-conv-id-001'
    const generatedSql = 'SELECT product_name, SUM(amount) as total FROM sales WHERE month = MONTH(CURDATE()) GROUP BY product_name ORDER BY total DESC LIMIT 10'

    const sseBody = createSseResponse([
      { event: 'message', data: { chunk: '今月の売上トップ10を' } },
      { event: 'message', data: { chunk: 'SQLで取得します。' } },
      { event: 'sql', data: { sql: generatedSql } },
      { event: 'chart_type', data: { chartType: 'bar' } },
      {
        event: 'result',
        data: {
          columns: ['product_name', 'total'],
          rows: [
            { product_name: '商品A', total: 50000 },
            { product_name: '商品B', total: 30000 },
          ],
          chartType: 'bar',
        },
      },
      { event: 'analysis', data: { chunk: '商品Aが最も売上が高い。' } },
      { event: 'done', data: {} },
    ])

    await mockChatApi(page, sseBody)
    await page.goto('/')

    // Act: 自然言語で質問を送信
    await page.locator('.chat-input-textarea').fill('今月の売上トップ10を教えて')
    await page.locator('.chat-input-textarea').press('Enter')

    // Assert: ユーザーメッセージが表示されること
    await expect(page.locator('.chat-message--user').first()).toBeVisible({ timeout: 10000 })

    // Assert: アシスタントのテキスト応答が表示されること（message イベント）
    // 2つのchunkが連結されて表示される
    await expect(page.locator('.chat-message--assistant').first()).toBeVisible({ timeout: 10000 })

    // Assert: 生成SQLがコードブロックで表示されること（sql イベント）
    await expect(page.locator('.sql-display')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.sql-code')).toContainText('SELECT')

    // Assert: ChartRenderer が表示されること（result イベント）
    await expect(page.locator('.chart-renderer')).toBeVisible({ timeout: 10000 })

    // テーブルタブに切り替えてデータを確認する（chart_type='bar' なので棒グラフがデフォルト）
    const tableTab = page.locator('[role="tab"][id="chart-tab-table"]')
    await tableTab.click()
    await expect(page.locator('.data-table')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('th').filter({ hasText: 'product_name' })).toBeVisible()
    await expect(page.locator('td').filter({ hasText: '商品A' })).toBeVisible()
  })

  /**
   * 【ユーザーストーリー】
   * chart_type='bar' を返すSSEに対して棒グラフタブが選択される
   *
   * 【テストケースIssue】#57
   *
   * 【期待結果】
   * - bar chart_type に対応する棒グラフタブがアクティブになる
   */
  test('should activate bar chart tab when chart_type bar is returned', async ({ page }) => {
    const sseBody = createSseResponse([
      { event: 'message', data: { chunk: 'データを表示します。' } },
      { event: 'sql', data: { sql: 'SELECT category, sales FROM data' } },
      { event: 'chart_type', data: { chartType: 'bar' } },
      {
        event: 'result',
        data: { columns: ['category', 'sales'], rows: [{ category: 'A', sales: 100 }], chartType: 'bar' },
      },
      { event: 'done', data: {} },
    ])

    await mockChatApi(page, sseBody)
    await page.goto('/')

    await page.locator('.chat-input-textarea').fill('部門別売上を棒グラフで')
    await page.locator('.chat-input-send-btn').click()

    // 棒グラフタブがアクティブになること
    await expect(page.locator('[role="tab"][id="chart-tab-bar"]')).toHaveAttribute(
      'aria-selected', 'true', { timeout: 10000 }
    )
  })

  /**
   * 【ユーザーストーリー】
   * chart_type='line' を返すSSEに対して折れ線グラフタブが選択される
   *
   * 【テストケースIssue】#57
   *
   * 【期待結果】
   * - line chart_type に対応する折れ線グラフタブがアクティブになる
   */
  test('should activate line chart tab when chart_type line is returned', async ({ page }) => {
    const sseBody = createSseResponse([
      { event: 'message', data: { chunk: 'データを表示します。' } },
      { event: 'sql', data: { sql: 'SELECT month, sales FROM monthly_data' } },
      { event: 'chart_type', data: { chartType: 'line' } },
      {
        event: 'result',
        data: { columns: ['month', 'sales'], rows: [{ month: 'Jan', sales: 100 }], chartType: 'line' },
      },
      { event: 'done', data: {} },
    ])

    await mockChatApi(page, sseBody)
    await page.goto('/')

    await page.locator('.chat-input-textarea').fill('月別売上推移を折れ線グラフで')
    await page.locator('.chat-input-send-btn').click()

    // 折れ線グラフタブがアクティブになること
    await expect(page.locator('[role="tab"][id="chart-tab-line"]')).toHaveAttribute(
      'aria-selected', 'true', { timeout: 10000 }
    )
  })

  /**
   * 【ユーザーストーリー】
   * chart_type='pie' を返すSSEに対して円グラフタブが選択される
   *
   * 【テストケースIssue】#57
   *
   * 【期待結果】
   * - pie chart_type に対応する円グラフタブがアクティブになる
   */
  test('should activate pie chart tab when chart_type pie is returned', async ({ page }) => {
    const sseBody = createSseResponse([
      { event: 'message', data: { chunk: 'データを表示します。' } },
      { event: 'sql', data: { sql: 'SELECT category, ratio FROM categories' } },
      { event: 'chart_type', data: { chartType: 'pie' } },
      {
        event: 'result',
        data: { columns: ['category', 'ratio'], rows: [{ category: 'A', ratio: 60 }], chartType: 'pie' },
      },
      { event: 'done', data: {} },
    ])

    await mockChatApi(page, sseBody)
    await page.goto('/')

    await page.locator('.chat-input-textarea').fill('カテゴリ別構成比を円グラフで')
    await page.locator('.chat-input-send-btn').click()

    // 円グラフタブがアクティブになること
    await expect(page.locator('[role="tab"][id="chart-tab-pie"]')).toHaveAttribute(
      'aria-selected', 'true', { timeout: 10000 }
    )
  })

  /**
   * 【ユーザーストーリー】
   * chart_type='table' を返すSSEに対してテーブルタブが選択される
   *
   * 【テストケースIssue】#57
   *
   * 【期待結果】
   * - table chart_type に対応するテーブルタブがアクティブになる
   */
  test('should activate table tab when chart_type table is returned', async ({ page }) => {
    const sseBody = createSseResponse([
      { event: 'message', data: { chunk: 'データを表示します。' } },
      { event: 'sql', data: { sql: 'SELECT * FROM employees' } },
      { event: 'chart_type', data: { chartType: 'table' } },
      {
        event: 'result',
        data: { columns: ['id', 'name'], rows: [{ id: 1, name: '田中' }], chartType: 'table' },
      },
      { event: 'done', data: {} },
    ])

    await mockChatApi(page, sseBody)
    await page.goto('/')

    await page.locator('.chat-input-textarea').fill('従業員一覧をテーブルで')
    await page.locator('.chat-input-send-btn').click()

    // テーブルタブがアクティブになること
    await expect(page.locator('[role="tab"][id="chart-tab-table"]')).toHaveAttribute(
      'aria-selected', 'true', { timeout: 10000 }
    )
  })
})
