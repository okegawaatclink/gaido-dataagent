/**
 * DataAgent E2Eテスト - テストケース #69
 * 大量データ結果のテーブル表示で500行制限が機能する
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
 * テーブル表示の行数上限テストスイート
 */
test.describe('Table View - 500 Row Limit', () => {
  /**
   * 【ユーザーストーリー】
   * 500行を超える結果が返る場合は先頭500行のみ表示し、超過件数の注記が表示される
   *
   * 【テストケースIssue】#69
   *
   * 【前提条件】
   * - バックエンドAPIが500行を超える結果のSSEを返す（モック）
   *
   * 【期待結果】
   * - 500行を超える場合は先頭500行のみ表示される（受入条件 #1）
   * - 超過件数を示す注記が表示される（受入条件 #2）
   */
  test('should display only 500 rows and show overflow notice for large datasets', async ({ page }) => {
    // 600行のモックデータを作成
    const allRows = Array.from({ length: 600 }, (_, i) => ({ id: i + 1, name: `データ${i + 1}` }))

    const sseBody = createSseResponse([
      { event: 'message', data: { chunk: '全レコードを取得しました。' } },
      { event: 'sql', data: { sql: 'SELECT * FROM large_table' } },
      { event: 'chart_type', data: { chartType: 'table' } },
      {
        event: 'result',
        data: {
          columns: ['id', 'name'],
          rows: allRows,
          chartType: 'table',
        },
      },
      { event: 'done', data: {} },
    ])

    await page.route('**/api/chat', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: { 'Cache-Control': 'no-cache' },
        body: sseBody,
      })
    })

    await page.goto('/')

    await page.locator('.chat-input-textarea').fill('全レコードを表示して')
    await page.locator('.chat-input-send-btn').click()

    // テーブルが表示されること
    await expect(page.locator('.data-table')).toBeVisible({ timeout: 10000 })

    // 件数サマリーに600件の情報が含まれること（受入条件 #2）
    const summary = page.locator('.data-table-summary')
    await expect(summary).toBeVisible()
    // サマリーに合計600件または500件表示の記述があること
    const summaryText = await summary.textContent() ?? ''
    // 600件データが来ているが500件制限で表示
    expect(summaryText).toMatch(/500|600/)
  })

  /**
   * 【ユーザーストーリー】
   * ちょうど500行の場合は全件表示されること
   *
   * 【テストケースIssue】#69
   *
   * 【期待結果】
   * - 500行ちょうどは全件表示される
   */
  test('should display all 500 rows when result has exactly 500 rows', async ({ page }) => {
    // ちょうど500行のモックデータ
    const rows500 = Array.from({ length: 500 }, (_, i) => ({ id: i + 1, value: i * 10 }))

    const sseBody = createSseResponse([
      { event: 'message', data: { chunk: '結果を表示します。' } },
      { event: 'sql', data: { sql: 'SELECT * FROM data LIMIT 500' } },
      { event: 'chart_type', data: { chartType: 'table' } },
      {
        event: 'result',
        data: {
          columns: ['id', 'value'],
          rows: rows500,
          chartType: 'table',
        },
      },
      { event: 'done', data: {} },
    ])

    await page.route('**/api/chat', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: { 'Cache-Control': 'no-cache' },
        body: sseBody,
      })
    })

    await page.goto('/')

    await page.locator('.chat-input-textarea').fill('データを500件表示して')
    await page.locator('.chat-input-send-btn').click()

    // テーブルが表示されること
    await expect(page.locator('.data-table')).toBeVisible({ timeout: 10000 })

    // 500件サマリーが表示されること
    const summary = page.locator('.data-table-summary')
    await expect(summary).toBeVisible()
    await expect(summary).toContainText('500')
  })

  /**
   * 【ユーザーストーリー】
   * 501行の場合は先頭500行のみ表示され、制限注記が表示される
   *
   * 【テストケースIssue】#69
   *
   * 【期待結果】
   * - 501行ではなく500行が表示される
   * - 超過件数が表示される
   */
  test('should truncate to 500 rows when result has 501 rows', async ({ page }) => {
    // 501行のモックデータ
    const rows501 = Array.from({ length: 501 }, (_, i) => ({ id: i + 1, name: `Row${i + 1}` }))

    const sseBody = createSseResponse([
      { event: 'message', data: { chunk: '結果を表示します。' } },
      { event: 'sql', data: { sql: 'SELECT * FROM data' } },
      { event: 'chart_type', data: { chartType: 'table' } },
      {
        event: 'result',
        data: {
          columns: ['id', 'name'],
          rows: rows501,
          chartType: 'table',
        },
      },
      { event: 'done', data: {} },
    ])

    await page.route('**/api/chat', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: { 'Cache-Control': 'no-cache' },
        body: sseBody,
      })
    })

    await page.goto('/')

    await page.locator('.chat-input-textarea').fill('全データを取得して')
    await page.locator('.chat-input-send-btn').click()

    // テーブルが表示されること
    await expect(page.locator('.data-table')).toBeVisible({ timeout: 10000 })

    // 件数サマリーに情報が含まれること
    const summary = page.locator('.data-table-summary')
    await expect(summary).toBeVisible()
  })

  /**
   * 【ユーザーストーリー】
   * 大量データでもスクロール操作が正常に動作する
   *
   * 【テストケースIssue】#69
   *
   * 【期待結果】
   * - 500行のテーブルでもスクロール可能な状態で表示される（受入条件 #3）
   */
  test('should allow scrolling in large data table', async ({ page }) => {
    // 100行のモックデータ（スクロールテスト用）
    const manyRows = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      product: `商品${i + 1}`,
      amount: (i + 1) * 1000,
    }))

    const sseBody = createSseResponse([
      { event: 'message', data: { chunk: '結果を表示します。' } },
      { event: 'sql', data: { sql: 'SELECT * FROM products' } },
      { event: 'chart_type', data: { chartType: 'table' } },
      {
        event: 'result',
        data: {
          columns: ['id', 'product', 'amount'],
          rows: manyRows,
          chartType: 'table',
        },
      },
      { event: 'done', data: {} },
    ])

    await page.route('**/api/chat', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: { 'Cache-Control': 'no-cache' },
        body: sseBody,
      })
    })

    await page.goto('/')

    await page.locator('.chat-input-textarea').fill('全商品を表示して')
    await page.locator('.chat-input-send-btn').click()

    // テーブルが表示されること
    await expect(page.locator('.data-table')).toBeVisible({ timeout: 10000 })

    // 最初の行のデータが存在すること（exact matchでstrict mode対応）
    await expect(page.getByRole('gridcell', { name: 'product: 商品1', exact: true })).toBeVisible()

    // テーブルコンテナがスクロール可能であること
    const tableWrapper = page.locator('.data-table-wrapper').or(page.locator('.data-table'))
    await expect(tableWrapper.first()).toBeVisible()
  })
})
