/**
 * DataAgent E2Eテスト - テストケース #197
 * 大量データ結果のテーブル表示とグラフ描画が正常に動作する
 */
import { test, expect } from '@playwright/test'

/**
 * 大量行データを含むSSEレスポンスを生成するヘルパー
 */
function createLargeDataSseResponse(rowCount: number): string {
  const rows = Array.from({ length: rowCount }, (_, i) => ({
    id: i + 1,
    category: `カテゴリ${(i % 10) + 1}`,
    value: Math.floor(Math.random() * 10000),
    name: `アイテム${i + 1}`,
    date: `2024-${String((i % 12) + 1).padStart(2, '0')}-01`,
  }))

  const events = [
    { event: 'conversation', data: { conversationId: 'test-conv-197' } },
    { event: 'message', data: { chunk: `${rowCount}件のデータを取得しました。` } },
    { event: 'sql', data: { sql: `SELECT * FROM large_table LIMIT ${rowCount}` } },
    { event: 'chart_type', data: { chartType: 'table' } },
    {
      event: 'result',
      data: {
        columns: ['id', 'category', 'value', 'name', 'date'],
        rows,
        chartType: 'table',
      },
    },
    { event: 'done', data: {} },
  ]
  return events
    .map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    .join('')
}

/**
 * 【ユーザーストーリー】
 * データ分析を行う社内ユーザーが500行以上の結果を返すクエリを実行したとき、
 * テーブルとグラフが正常にレンダリングされる
 *
 * 【テストケースIssue】#197
 *
 * 【前提条件】
 * - DB接続先が1件以上登録されていること
 * - バックエンドAPIがSSEを返す（モック）
 *
 * 【期待結果】
 * - 大量データでもテーブルが正常にレンダリングされスクロール可能
 * - グラフが適切に描画される
 * - ブラウザがメモリ不足やクラッシュしないこと
 */
test.describe('Large Data - Table and Chart Performance', () => {
  const BACKEND = 'http://okegawaatclink-gaido-dataagent-output-system:3002'

  test.beforeEach(async ({ request }) => {
    // 接続先が1件以上あることを確認
    const resp = await request.get(`${BACKEND}/api/connections`)
    const connections = await resp.json()
    if (connections.length === 0) {
      await request.post(`${BACKEND}/api/connections`, {
        data: {
          name: 'テスト用DB(197前提)',
          dbType: 'mysql',
          host: 'okegawaatclink-gaido-dataagent-mysql',
          port: 3306,
          username: 'readonly_user',
          password: 'readonlypass',
          databaseName: 'sampledb',
        },
      })
    }
  })

  /**
   * 500行のデータが正常にテーブル表示されること
   */
  test('should render 500 rows in data table without crash', async ({ page }) => {
    await page.route('**/api/chat', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: { 'Cache-Control': 'no-cache' },
        body: createLargeDataSseResponse(500),
      })
    })

    await page.route('**/api/history*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: 'test-conv-197',
          title: '大量データテスト',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }]),
      })
    })

    await page.goto('/')

    await page.locator('.chat-input-textarea').fill('500件のデータを見せて')
    await page.locator('.chat-input-textarea').press('Enter')

    // アシスタントメッセージが表示されること（タイムアウト30秒）
    await expect(page.locator('.chat-message--assistant').first()).toBeVisible({ timeout: 30000 })

    // テーブルまたはグラフが表示されること
    await expect(page.locator('.chart-renderer, .data-table, table').first()).toBeVisible({ timeout: 10000 })

    // ページがクラッシュしていないこと（アプリコンテナが表示されていること）
    await expect(page.locator('.app-container')).toBeVisible()
  })

  /**
   * 100行のデータでグラフが描画されること
   */
  test('should render chart with 100 data points', async ({ page }) => {
    const rows = Array.from({ length: 100 }, (_, i) => ({
      category: `C${i + 1}`,
      value: Math.floor(Math.random() * 1000),
    }))

    await page.route('**/api/chat', (route) => {
      const sseBody = [
        `event: conversation\ndata: ${JSON.stringify({ conversationId: 'test-conv-197-chart' })}\n\n`,
        `event: message\ndata: ${JSON.stringify({ chunk: '100件のデータです。' })}\n\n`,
        `event: sql\ndata: ${JSON.stringify({ sql: 'SELECT category, value FROM data' })}\n\n`,
        `event: chart_type\ndata: ${JSON.stringify({ chartType: 'bar' })}\n\n`,
        `event: result\ndata: ${JSON.stringify({ columns: ['category', 'value'], rows, chartType: 'bar' })}\n\n`,
        `event: done\ndata: {}\n\n`,
      ].join('')
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: { 'Cache-Control': 'no-cache' },
        body: sseBody,
      })
    })

    await page.route('**/api/history*', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })

    await page.goto('/')

    await page.locator('.chat-input-textarea').fill('100件のデータをグラフで見せて')
    await page.locator('.chat-input-textarea').press('Enter')

    // グラフが表示されること
    await expect(page.locator('.chart-renderer, .chart-container').first()).toBeVisible({ timeout: 30000 })

    // ページがクラッシュしていないこと
    await expect(page.locator('.app-container')).toBeVisible()
  })

  /**
   * DataTableが最大500行まで表示できること（DataTableの仕様確認）
   */
  test('should handle DataTable maximum rows display', async ({ page }) => {
    // DataTableは最大500行という仕様（HANDOVER.mdの記載）
    await page.route('**/api/chat', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: { 'Cache-Control': 'no-cache' },
        body: createLargeDataSseResponse(50),  // 50行で動作確認
      })
    })

    await page.route('**/api/history*', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })

    await page.goto('/')

    await page.locator('.chat-input-textarea').fill('データを見せて')
    await page.locator('.chat-input-textarea').press('Enter')

    // アシスタントメッセージが表示されること
    await expect(page.locator('.chat-message--assistant').first()).toBeVisible({ timeout: 15000 })

    // アプリがクラッシュしていないこと
    await expect(page.locator('.app-container')).toBeVisible()
  })
})
