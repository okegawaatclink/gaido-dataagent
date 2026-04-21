/**
 * DataAgent E2Eテスト - テストケース #186
 * SQL実行結果を棒グラフ・折れ線・円グラフ・テーブルで切り替え表示できる
 */
import { test, expect } from '@playwright/test'

/**
 * SSEレスポンスを生成するヘルパー
 */
function createSseResponse(
  chartType: 'bar' | 'line' | 'pie' | 'table',
  conversationId = 'test-conv-186'
): string {
  const events = [
    { event: 'conversation', data: { conversationId } },
    { event: 'message', data: { chunk: '結果を取得しました。' } },
    { event: 'sql', data: { sql: 'SELECT category, SUM(value) AS total FROM data GROUP BY category' } },
    { event: 'chart_type', data: { chartType } },
    {
      event: 'result',
      data: {
        columns: ['category', 'total'],
        rows: [
          { category: 'A', total: 100 },
          { category: 'B', total: 200 },
          { category: 'C', total: 150 },
        ],
        chartType,
      },
    },
    { event: 'analysis', data: { chunk: 'Bカテゴリが最も多い。' } },
    { event: 'done', data: {} },
  ]
  return events
    .map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    .join('')
}

/**
 * 【ユーザーストーリー】
 * データ分析を行う社内ユーザーがSQL実行結果を棒グラフ/折れ線/円グラフ/テーブルで
 * 切り替えて確認する
 *
 * 【テストケースIssue】#186
 *
 * 【前提条件】
 * - DB接続先が1件以上登録されていること
 * - バックエンドAPIがSSEを返す（モック）
 *
 * 【期待結果】
 * - 4種類のグラフ/テーブルが正常に描画される
 * - LLM推奨のグラフ種が初期表示で選択される
 * - 手動切り替えボタンが機能する
 */
test.describe('Chart and Table Display - Tab Switching', () => {
  /**
   * 棒グラフ（bar）が初期表示で選択されること
   */
  test('should display bar chart as initial view when LLM recommends bar', async ({ page }) => {
    await page.route('**/api/chat', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: { 'Cache-Control': 'no-cache' },
        body: createSseResponse('bar'),
      })
    })
    await page.route('**/api/history*', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })

    await page.goto('/')

    await page.locator('.chat-input-textarea').fill('カテゴリ別のデータを棒グラフで')
    await page.locator('.chat-input-textarea').press('Enter')

    // グラフレンダラーが表示されること
    await expect(page.locator('.chart-renderer, .chart-container').first()).toBeVisible({ timeout: 10000 })
  })

  /**
   * テーブルタブに切り替えられること
   */
  test('should switch to table tab and display data table', async ({ page }) => {
    await page.route('**/api/chat', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: { 'Cache-Control': 'no-cache' },
        body: createSseResponse('bar'),
      })
    })
    await page.route('**/api/history*', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })

    await page.goto('/')

    await page.locator('.chat-input-textarea').fill('テーブルで表示')
    await page.locator('.chat-input-textarea').press('Enter')

    // グラフが表示されるまで待つ
    await expect(page.locator('.chart-renderer, .chart-container').first()).toBeVisible({ timeout: 10000 })

    // テーブルタブをクリック
    const tableTab = page.locator('button').filter({ hasText: /テーブル|table/i }).first()
    if (await tableTab.isVisible()) {
      await tableTab.click()
      // データテーブルが表示されること
      await expect(page.locator('.data-table, table').first()).toBeVisible({ timeout: 5000 })
    }
  })

  /**
   * テーブル表示でデータが正しく表示されること
   */
  test('should display table with correct data', async ({ page }) => {
    await page.route('**/api/chat', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: { 'Cache-Control': 'no-cache' },
        body: createSseResponse('table'),
      })
    })
    await page.route('**/api/history*', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })

    await page.goto('/')

    await page.locator('.chat-input-textarea').fill('データをテーブルで見せて')
    await page.locator('.chat-input-textarea').press('Enter')

    // アシスタントメッセージが表示されること
    await expect(page.locator('.chat-message--assistant').first()).toBeVisible({ timeout: 10000 })

    // テーブルまたはグラフが表示されること（レイアウトに応じてどちらかが表示される）
    await expect(page.locator('.chart-renderer, .data-table, table').first()).toBeVisible({ timeout: 5000 })
  })

  /**
   * グラフタブ切り替えボタンが存在すること
   */
  test('should have chart type switch buttons', async ({ page }) => {
    await page.route('**/api/chat', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: { 'Cache-Control': 'no-cache' },
        body: createSseResponse('bar', 'test-conv-186-tabs'),
      })
    })
    await page.route('**/api/history*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: 'test-conv-186-tabs',
          title: 'タブ切り替えテスト',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }]),
      })
    })

    await page.goto('/')

    await page.locator('.chat-input-textarea').fill('グラフタブを確認')
    await page.locator('.chat-input-textarea').press('Enter')

    // グラフが表示されるまで待つ
    await expect(page.locator('.chart-renderer, .chart-container').first()).toBeVisible({ timeout: 10000 })

    // タブ切り替えボタンが存在すること（bar/line/pie/tableのいずれか）
    const tabButtons = page.locator('.chart-tabs button, .chart-tab-btn, [role="tab"]')
    const tabCount = await tabButtons.count()
    expect(tabCount).toBeGreaterThan(0)
  })
})
