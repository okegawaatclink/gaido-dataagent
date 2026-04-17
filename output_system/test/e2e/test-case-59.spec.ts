/**
 * DataAgent E2Eテスト - テストケース #59
 * Rechartsで棒・折れ線・円グラフが描画される
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
      headers: { 'Cache-Control': 'no-cache' },
      body: sseBody,
    })
  })
}

/**
 * グラフ用SSEレスポンスを作成するヘルパー
 */
function createChartSseResponse(
  chartType: string,
  columns: string[],
  rows: Array<Record<string, unknown>>,
): string {
  return createSseResponse([
    { event: 'message', data: { chunk: 'データを取得しました。' } },
    { event: 'sql', data: { sql: 'SELECT category, sales FROM data' } },
    { event: 'chart_type', data: { chartType } },
    { event: 'result', data: { columns, rows, chartType } },
    { event: 'done', data: {} },
  ])
}

/** 棒グラフ・折れ線グラフ用テストデータ */
const CHART_COLUMNS = ['month', 'sales']
const CHART_ROWS = [
  { month: 'Jan', sales: 100 },
  { month: 'Feb', sales: 200 },
  { month: 'Mar', sales: 150 },
]

/**
 * Rechartsグラフ描画テストスイート
 */
test.describe('Recharts - Bar, Line, Pie Chart Rendering', () => {
  /**
   * 【ユーザーストーリー】
   * DataAgent の利用者が棒グラフで結果を閲覧したい
   *
   * 【テストケースIssue】#59
   *
   * 【前提条件】
   * - バックエンドAPIが chart_type='bar' のSSEを返す（モック）
   *
   * 【期待結果】
   * - ChartRenderer が表示される
   * - 棒グラフタブがアクティブ（aria-selected=true）になる（受入条件 #1）
   */
  test('should render bar chart when chart_type is bar', async ({ page }) => {
    const sseBody = createChartSseResponse('bar', CHART_COLUMNS, CHART_ROWS)
    await mockChatApi(page, sseBody)
    await page.goto('/')

    await page.locator('.chat-input-textarea').fill('部門別の売上を教えて')
    await page.locator('.chat-input-send-btn').click()

    // ChartRenderer が表示されること
    await expect(page.locator('.chart-renderer')).toBeVisible({ timeout: 10000 })

    // 棒グラフタブがアクティブになること（受入条件 #1）
    await expect(page.locator('[role="tab"][id="chart-tab-bar"]')).toHaveAttribute(
      'aria-selected', 'true'
    )

    // スクリーンショット保存
    await page.screenshot({
      path: 'ai_generated/screenshots/test-case-59_bar_chart.png',
    })
  })

  /**
   * 【ユーザーストーリー】
   * DataAgent の利用者が折れ線グラフで結果を閲覧したい
   *
   * 【テストケースIssue】#59
   *
   * 【前提条件】
   * - バックエンドAPIが chart_type='line' のSSEを返す（モック）
   *
   * 【期待結果】
   * - 折れ線グラフタブがアクティブになる（受入条件 #2）
   */
  test('should render line chart when chart_type is line', async ({ page }) => {
    const sseBody = createChartSseResponse('line', CHART_COLUMNS, CHART_ROWS)
    await mockChatApi(page, sseBody)
    await page.goto('/')

    await page.locator('.chat-input-textarea').fill('月別の売上推移を教えて')
    await page.locator('.chat-input-send-btn').click()

    // ChartRenderer が表示されること
    await expect(page.locator('.chart-renderer')).toBeVisible({ timeout: 10000 })

    // 折れ線グラフタブがアクティブになること（受入条件 #2）
    await expect(page.locator('[role="tab"][id="chart-tab-line"]')).toHaveAttribute(
      'aria-selected', 'true'
    )
  })

  /**
   * 【ユーザーストーリー】
   * DataAgent の利用者が円グラフで結果を閲覧したい
   *
   * 【テストケースIssue】#59
   *
   * 【前提条件】
   * - バックエンドAPIが chart_type='pie' のSSEを返す（モック）
   *
   * 【期待結果】
   * - 円グラフタブがアクティブになる（受入条件 #3）
   */
  test('should render pie chart when chart_type is pie', async ({ page }) => {
    const sseBody = createChartSseResponse('pie', CHART_COLUMNS, CHART_ROWS)
    await mockChatApi(page, sseBody)
    await page.goto('/')

    await page.locator('.chat-input-textarea').fill('カテゴリ別の構成比を教えて')
    await page.locator('.chat-input-send-btn').click()

    // ChartRenderer が表示されること
    await expect(page.locator('.chart-renderer')).toBeVisible({ timeout: 10000 })

    // 円グラフタブがアクティブになること（受入条件 #3）
    await expect(page.locator('[role="tab"][id="chart-tab-pie"]')).toHaveAttribute(
      'aria-selected', 'true'
    )
  })

  /**
   * 【ユーザーストーリー】
   * タブをクリックするとグラフ種を手動で切り替えられる
   *
   * 【テストケースIssue】#59
   *
   * 【期待結果】
   * - タブクリックでグラフ種が切り替わる
   * - 4つのタブが全て表示される（棒グラフ、折れ線グラフ、円グラフ、テーブル）
   */
  test('should allow manual switching between chart tabs', async ({ page }) => {
    const sseBody = createChartSseResponse('bar', CHART_COLUMNS, CHART_ROWS)
    await mockChatApi(page, sseBody)
    await page.goto('/')

    await page.locator('.chat-input-textarea').fill('売上データを表示して')
    await page.locator('.chat-input-send-btn').click()

    // ChartRenderer が表示されるまで待機
    await expect(page.locator('.chart-renderer')).toBeVisible({ timeout: 10000 })

    // 4つのタブが表示されていること
    await expect(page.locator('[role="tab"]')).toHaveCount(4)

    // 折れ線グラフタブに切り替え
    await page.locator('[role="tab"][id="chart-tab-line"]').click()
    await expect(page.locator('[role="tab"][id="chart-tab-line"]')).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('[role="tab"][id="chart-tab-bar"]')).toHaveAttribute('aria-selected', 'false')

    // 円グラフタブに切り替え
    await page.locator('[role="tab"][id="chart-tab-pie"]').click()
    await expect(page.locator('[role="tab"][id="chart-tab-pie"]')).toHaveAttribute('aria-selected', 'true')

    // テーブルタブに切り替え
    await page.locator('[role="tab"][id="chart-tab-table"]').click()
    await expect(page.locator('[role="tab"][id="chart-tab-table"]')).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('.data-table')).toBeVisible()
  })

  /**
   * 【ユーザーストーリー】
   * 空データが返ってきた場合に「表示するデータがありません」と表示される
   *
   * 【テストケースIssue】#59
   *
   * 【期待結果】
   * - 空データ時はテーブルタブにフォールバックされること（受入条件 #5）
   * - 「結果がありません」等のメッセージが表示される
   */
  test('should display empty state message when result rows are empty', async ({ page }) => {
    // 空データのSSEレスポンス
    const sseBody = createChartSseResponse('bar', ['month', 'sales'], [])
    await mockChatApi(page, sseBody)
    await page.goto('/')

    await page.locator('.chat-input-textarea').fill('該当データなしの質問')
    await page.locator('.chat-input-send-btn').click()

    // ChartRenderer が表示されること
    await expect(page.locator('.chart-renderer')).toBeVisible({ timeout: 10000 })

    // 空データ時はテーブルタブにフォールバックされること（受入条件 #5）
    await expect(page.locator('[role="tab"][id="chart-tab-table"]')).toHaveAttribute('aria-selected', 'true')

    // 空データメッセージが表示されること
    await expect(page.locator('.data-table-empty')).toBeVisible()
  })

  /**
   * 【ユーザーストーリー】
   * グラフが Chrome で崩れずに表示される
   *
   * 【テストケースIssue】#59
   *
   * 【期待結果】
   * - 棒グラフ用データでChartRendererが表示される
   * - タブが4つ表示される（受入条件 #6）
   * - タブのラベルが正しい（棒グラフ、折れ線グラフ、円グラフ、テーブル）
   */
  test('should display 4 tabs with correct labels in Chrome', async ({ page }) => {
    const sseBody = createChartSseResponse('bar', CHART_COLUMNS, CHART_ROWS)
    await mockChatApi(page, sseBody)
    await page.goto('/')

    await page.locator('.chat-input-textarea').fill('売上を見せて')
    await page.locator('.chat-input-send-btn').click()

    await expect(page.locator('.chart-renderer')).toBeVisible({ timeout: 10000 })

    // 4つのタブが表示されること（受入条件 #6）
    await expect(page.locator('[role="tab"]')).toHaveCount(4)
    await expect(page.locator('[role="tab"]').nth(0)).toContainText('棒グラフ')
    await expect(page.locator('[role="tab"]').nth(1)).toContainText('折れ線グラフ')
    await expect(page.locator('[role="tab"]').nth(2)).toContainText('円グラフ')
    await expect(page.locator('[role="tab"]').nth(3)).toContainText('テーブル')
  })
})
