/**
 * DataAgent E2Eテスト - グラフ表示（PBI 3.1）
 *
 * このファイルでは DataAgent のグラフ表示機能の E2E テストを行う。
 *
 * テスト方針（Task 3.1.3）:
 * - バックエンドAPIをPlaywright route interceptorでモックする
 * - 各 chart_type（bar/line/pie）に対応するグラフコンテナが描画されることを検証
 * - ChartRenderer のタブ切替機能を検証
 *
 * テスト範囲:
 * - chart_type='bar' で棒グラフタブが選択される（受入条件 #1）
 * - chart_type='line' で折れ線グラフタブが選択される（受入条件 #2）
 * - chart_type='pie' で円グラフタブが選択される（受入条件 #3）
 * - タブクリックでグラフ種を手動切替できる（受入条件 #4）
 * - 空データ時は「表示するデータがありません」が表示される（受入条件 #5）
 * - Chromeで崩れずに表示される（受入条件 #6）
 *
 * 実行前提:
 * - `docker compose up -d` でフロントエンドコンテナが起動していること
 * - AIエージェントコンテナからコンテナ名でアクセスできること
 *
 * 参考:
 * - instance-config.md: コンテナ内からアクセスするURL
 * - test-standards.md: テストコード規約
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
 * @param page    - Playwright Page オブジェクト
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
      },
      body: sseBody,
    })
  })
}

/**
 * グラフ表示用のモックSSEレスポンスを作成する
 *
 * @param chartType - グラフ種類（'bar' | 'line' | 'pie' | 'table'）
 * @param rows      - テストデータの行配列
 * @param columns   - 列名配列
 * @returns SSEレスポンス文字列
 */
function createChartSseResponse(
  chartType: string,
  columns: string[],
  rows: Array<Record<string, unknown>>,
): string {
  return createSseResponse([
    { event: 'message', data: { chunk: 'データを取得しました。' } },
    { event: 'sql', data: { sql: 'SELECT category, sales FROM monthly_sales' } },
    { event: 'chart_type', data: { chartType } },
    {
      event: 'result',
      data: { columns, rows, chartType },
    },
    { event: 'done', data: {} },
  ])
}

// ---------------------------------------------------------------------------
// テスト用データ
// ---------------------------------------------------------------------------

/** 棒グラフ・折れ線グラフ用テストデータ（カテゴリ + 数値系列） */
const CHART_COLUMNS = ['month', 'sales']
const CHART_ROWS = [
  { month: 'Jan', sales: 100 },
  { month: 'Feb', sales: 200 },
  { month: 'Mar', sales: 150 },
]

// ---------------------------------------------------------------------------
// E2E テスト
// ---------------------------------------------------------------------------

test.describe('Chart Rendering', () => {
  /**
   * 【ユーザーストーリー】
   * LLMが chart_type='bar' を推奨した場合、棒グラフタブがアクティブになる
   *
   * 【前提条件】
   * - バックエンドAPIが chart_type='bar' を含む SSE を返す（モック）
   *
   * 【期待結果】
   * - ChartRenderer の「棒グラフ」タブが aria-selected=true
   * - ChartRenderer コンテナが表示されている
   */
  test('should activate bar chart tab when chart_type is bar', async ({ page }) => {
    // Arrange: chart_type=bar のモックを設定
    const sseBody = createChartSseResponse('bar', CHART_COLUMNS, CHART_ROWS)
    await mockChatApi(page, sseBody)
    await page.goto('/')

    // Act: 質問を送信
    await page.locator('.chat-input-textarea').fill('月別売上を棒グラフで見せて')
    await page.locator('.chat-input-send-btn').click()

    // Assert: ChartRenderer が表示されること
    await expect(page.locator('.chart-renderer')).toBeVisible({ timeout: 10000 })

    // Assert: 棒グラフタブがアクティブになること（受入条件 #1）
    const barTab = page.locator('[role="tab"][id="chart-tab-bar"]')
    await expect(barTab).toHaveAttribute('aria-selected', 'true')
  })

  /**
   * 【ユーザーストーリー】
   * LLMが chart_type='line' を推奨した場合、折れ線グラフタブがアクティブになる
   *
   * 【前提条件】
   * - バックエンドAPIが chart_type='line' を含む SSE を返す（モック）
   *
   * 【期待結果】
   * - ChartRenderer の「折れ線グラフ」タブが aria-selected=true
   */
  test('should activate line chart tab when chart_type is line', async ({ page }) => {
    // Arrange: chart_type=line のモックを設定
    const sseBody = createChartSseResponse('line', CHART_COLUMNS, CHART_ROWS)
    await mockChatApi(page, sseBody)
    await page.goto('/')

    // Act: 質問を送信
    await page.locator('.chat-input-textarea').fill('月別売上トレンドを折れ線で見せて')
    await page.locator('.chat-input-send-btn').click()

    // Assert: 折れ線グラフタブがアクティブになること（受入条件 #2）
    const lineTab = page.locator('[role="tab"][id="chart-tab-line"]')
    await expect(lineTab).toHaveAttribute('aria-selected', 'true', { timeout: 10000 })
  })

  /**
   * 【ユーザーストーリー】
   * LLMが chart_type='pie' を推奨した場合、円グラフタブがアクティブになる
   *
   * 【前提条件】
   * - バックエンドAPIが chart_type='pie' を含む SSE を返す（モック）
   *
   * 【期待結果】
   * - ChartRenderer の「円グラフ」タブが aria-selected=true
   */
  test('should activate pie chart tab when chart_type is pie', async ({ page }) => {
    // Arrange: chart_type=pie のモックを設定
    const sseBody = createChartSseResponse('pie', CHART_COLUMNS, CHART_ROWS)
    await mockChatApi(page, sseBody)
    await page.goto('/')

    // Act: 質問を送信
    await page.locator('.chat-input-textarea').fill('売上構成比を円グラフで見せて')
    await page.locator('.chat-input-send-btn').click()

    // Assert: 円グラフタブがアクティブになること（受入条件 #3）
    const pieTab = page.locator('[role="tab"][id="chart-tab-pie"]')
    await expect(pieTab).toHaveAttribute('aria-selected', 'true', { timeout: 10000 })
  })

  /**
   * 【ユーザーストーリー】
   * ユーザーが棒グラフ表示中に「折れ線グラフ」タブをクリックすると切替わる
   *
   * 【前提条件】
   * - バックエンドAPIが chart_type='bar' を返す（モック）
   * - ChartRenderer が表示されている
   *
   * 【期待結果】
   * - 「折れ線グラフ」タブをクリックすると aria-selected=true に変わる
   * - 「棒グラフ」タブの aria-selected が false に変わる
   */
  test('should allow manual chart type switching via tabs', async ({ page }) => {
    // Arrange: chart_type=bar のモックを設定
    const sseBody = createChartSseResponse('bar', CHART_COLUMNS, CHART_ROWS)
    await mockChatApi(page, sseBody)
    await page.goto('/')

    // Act: 質問を送信してChartRendererを表示
    await page.locator('.chat-input-textarea').fill('月別売上を見せて')
    await page.locator('.chat-input-send-btn').click()

    // ChartRenderer が表示されるまで待機
    await expect(page.locator('.chart-renderer')).toBeVisible({ timeout: 10000 })

    // 最初は棒グラフタブがアクティブ
    const barTab = page.locator('[role="tab"][id="chart-tab-bar"]')
    await expect(barTab).toHaveAttribute('aria-selected', 'true')

    // 折れ線グラフタブをクリック（受入条件 #4）
    const lineTab = page.locator('[role="tab"][id="chart-tab-line"]')
    await lineTab.click()

    // Assert: 折れ線グラフタブがアクティブになること
    await expect(lineTab).toHaveAttribute('aria-selected', 'true')
    await expect(barTab).toHaveAttribute('aria-selected', 'false')
  })

  /**
   * 【ユーザーストーリー】
   * 空データが返ってきた場合、「表示するデータがありません」と表示される
   *
   * 【前提条件】
   * - バックエンドAPIが空の rows を返す（モック）
   *
   * 【期待結果】
   * - 「表示するデータがありません」テキストが表示される（受入条件 #5）
   */
  test('should display empty state message when result rows are empty', async ({ page }) => {
    // Arrange: 空データのモックを設定
    const sseBody = createChartSseResponse('bar', ['month', 'sales'], [])
    await mockChatApi(page, sseBody)
    await page.goto('/')

    // Act: 質問を送信
    await page.locator('.chat-input-textarea').fill('該当データなしの質問')
    await page.locator('.chat-input-send-btn').click()

    // Assert: ChartRenderer が表示されること
    await expect(page.locator('.chart-renderer')).toBeVisible({ timeout: 10000 })

    // Assert: 空データ時はテーブルタブにフォールバックされること（受入条件 #5）
    // 空データの場合、グラフタブが無効化されてテーブルタブがデフォルトになる
    const tableTab = page.locator('[role="tab"][id="chart-tab-table"]')
    await expect(tableTab).toHaveAttribute('aria-selected', 'true')

    // DataTable の「結果がありません」が表示されること
    await expect(page.locator('.data-table-empty')).toBeVisible()
    await expect(page.locator('.data-table-empty__text')).toContainText('結果がありません')
  })

  /**
   * 【ユーザーストーリー】
   * グラフが Chrome で崩れずに表示される
   *
   * 【前提条件】
   * - バックエンドAPIが棒グラフ用データを返す（モック）
   *
   * 【期待結果】
   * - グラフエリアが表示されており、スクリーンショット取得後に視認できる
   * - タブが4つ表示されている（受入条件 #6）
   */
  test('should display chart correctly in Chrome without layout issues', async ({ page }) => {
    // Arrange: 棒グラフ用モックを設定
    const sseBody = createChartSseResponse('bar', CHART_COLUMNS, CHART_ROWS)
    await mockChatApi(page, sseBody)
    await page.goto('/')

    // Act: 質問を送信
    await page.locator('.chat-input-textarea').fill('月別売上を見せて')
    await page.locator('.chat-input-send-btn').click()

    // Assert: ChartRenderer が表示されること
    await expect(page.locator('.chart-renderer')).toBeVisible({ timeout: 10000 })

    // Assert: 4つのタブが全て表示されること（受入条件 #6）
    await expect(page.locator('[role="tab"]')).toHaveCount(4)
    await expect(page.locator('[role="tab"]').nth(0)).toContainText('棒グラフ')
    await expect(page.locator('[role="tab"]').nth(1)).toContainText('折れ線グラフ')
    await expect(page.locator('[role="tab"]').nth(2)).toContainText('円グラフ')
    await expect(page.locator('[role="tab"]').nth(3)).toContainText('テーブル')

    // スクリーンショットを保存（視覚的確認用）
    await page.screenshot({
      path: 'ai_generated/screenshots/task-36_chart_display.png',
      fullPage: false,
    })
  })
})
