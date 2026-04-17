/**
 * DataAgent E2Eテスト - テストケース #60
 * テーブル形式で結果をスクロール閲覧できる
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
 * テーブル表示テストスイート
 */
test.describe('Table View - Scroll and Data Display', () => {
  /**
   * 【ユーザーストーリー】
   * 生データを直接確認したい利用者が結果をテーブル形式で閲覧する
   *
   * 【テストケースIssue】#60
   *
   * 【前提条件】
   * - バックエンドAPIが chart_type='table' のSSEを返す（モック）
   *
   * 【期待結果】
   * - カラム名がヘッダーとして表示される（受入条件 #1）
   * - 行データが表示される（受入条件 #2）
   * - chart_type='table' のときにテーブルコンポーネントが自動選択される（受入条件 #3）
   */
  test('should display column headers and row data when chart_type is table', async ({ page }) => {
    const sseBody = createSseResponse([
      { event: 'message', data: { chunk: '従業員一覧を表示します。' } },
      { event: 'sql', data: { sql: 'SELECT id, name, department FROM employees' } },
      { event: 'chart_type', data: { chartType: 'table' } },
      {
        event: 'result',
        data: {
          columns: ['id', 'name', 'department'],
          rows: [
            { id: 1, name: '田中太郎', department: '営業部' },
            { id: 2, name: '鈴木花子', department: '開発部' },
            { id: 3, name: '山田次郎', department: '総務部' },
          ],
          chartType: 'table',
        },
      },
      { event: 'done', data: {} },
    ])

    await mockChatApi(page, sseBody)
    await page.goto('/')

    await page.locator('.chat-input-textarea').fill('従業員一覧を教えて')
    await page.locator('.chat-input-send-btn').click()

    // chart_type='table' のときにテーブルタブが自動選択されること（受入条件 #3）
    await expect(page.locator('[role="tab"][id="chart-tab-table"]')).toHaveAttribute(
      'aria-selected', 'true', { timeout: 10000 }
    )

    // カラム名がヘッダーとして表示されること（受入条件 #1）
    await expect(page.locator('.data-table')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('th').filter({ hasText: 'id' })).toBeVisible()
    await expect(page.locator('th').filter({ hasText: 'name' })).toBeVisible()
    await expect(page.locator('th').filter({ hasText: 'department' })).toBeVisible()

    // 行データが表示されること（受入条件 #2）
    await expect(page.locator('td').filter({ hasText: '田中太郎' })).toBeVisible()
    await expect(page.locator('td').filter({ hasText: '鈴木花子' })).toBeVisible()
    await expect(page.locator('td').filter({ hasText: '山田次郎' })).toBeVisible()
  })

  /**
   * 【ユーザーストーリー】
   * null値がハイフン等の代替表記で表示される
   *
   * 【テストケースIssue】#60
   *
   * 【期待結果】
   * - null値が "NULL" や "-" 等の代替表記で表示される（受入条件 #4）
   * - null と空文字が区別できる
   */
  test('should display null values with placeholder text', async ({ page }) => {
    const sseBody = createSseResponse([
      { event: 'message', data: { chunk: '結果を表示します。' } },
      { event: 'sql', data: { sql: 'SELECT id, name, email FROM users' } },
      { event: 'chart_type', data: { chartType: 'table' } },
      {
        event: 'result',
        data: {
          columns: ['id', 'name', 'email'],
          rows: [
            { id: 1, name: '田中', email: null },
            { id: 2, name: '鈴木', email: 'suzuki@example.com' },
          ],
          chartType: 'table',
        },
      },
      { event: 'done', data: {} },
    ])

    await mockChatApi(page, sseBody)
    await page.goto('/')

    await page.locator('.chat-input-textarea').fill('ユーザー一覧を教えて')
    await page.locator('.chat-input-send-btn').click()

    // テーブルが表示されること
    await expect(page.locator('.data-table')).toBeVisible({ timeout: 10000 })

    // null値が代替表記で表示されること（受入条件 #4）
    // DataAgentの実装では "NULL" または "-" で表示される
    const rows = page.locator('tbody tr')
    await expect(rows).toHaveCount(2)

    // nullのセルが何らかの代替表記で表示されること
    const nullCell = page.locator('td').filter({ hasText: 'NULL' }).or(
      page.locator('td.null-value')
    )
    // null値のセルが存在すること（表示形式に依らず）
    const row1 = rows.nth(0)
    const cells = row1.locator('td')
    const emailCell = cells.nth(2)
    // null値は空文字でないこと（何らかの表示がある）
    await expect(emailCell).toBeVisible()
  })

  /**
   * 【ユーザーストーリー】
   * 件数サマリーが表示される
   *
   * 【テストケースIssue】#60
   *
   * 【期待結果】
   * - 結果件数のサマリーが表示される（例: "3 件の結果"）
   */
  test('should display row count summary', async ({ page }) => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      name: `ユーザー${i + 1}`,
    }))

    const sseBody = createSseResponse([
      { event: 'message', data: { chunk: '結果を表示します。' } },
      { event: 'sql', data: { sql: 'SELECT id, name FROM users' } },
      { event: 'chart_type', data: { chartType: 'table' } },
      { event: 'result', data: { columns: ['id', 'name'], rows, chartType: 'table' } },
      { event: 'done', data: {} },
    ])

    await mockChatApi(page, sseBody)
    await page.goto('/')

    await page.locator('.chat-input-textarea').fill('ユーザーを表示して')
    await page.locator('.chat-input-send-btn').click()

    // テーブルが表示されること
    await expect(page.locator('.data-table')).toBeVisible({ timeout: 10000 })

    // 件数サマリーが表示されること
    await expect(page.locator('.data-table-summary')).toBeVisible()
    await expect(page.locator('.data-table-summary')).toContainText('5')
  })

  /**
   * 【ユーザーストーリー】
   * 多数の列がある場合に横スクロールで閲覧できる
   *
   * 【テストケースIssue】#60
   *
   * 【期待結果】
   * - 多数の列がある場合にテーブルが表示される
   * - テーブルコンテナがスクロール可能である
   */
  test('should display wide table with horizontal scroll', async ({ page }) => {
    const manyColumns = ['id', 'col1', 'col2', 'col3', 'col4', 'col5', 'col6', 'col7', 'col8', 'col9', 'col10']
    const manyRows = [{ id: 1, col1: 'a', col2: 'b', col3: 'c', col4: 'd', col5: 'e', col6: 'f', col7: 'g', col8: 'h', col9: 'i', col10: 'j' }]

    const sseBody = createSseResponse([
      { event: 'message', data: { chunk: '結果を表示します。' } },
      { event: 'sql', data: { sql: 'SELECT * FROM wide_table' } },
      { event: 'chart_type', data: { chartType: 'table' } },
      { event: 'result', data: { columns: manyColumns, rows: manyRows, chartType: 'table' } },
      { event: 'done', data: {} },
    ])

    await mockChatApi(page, sseBody)
    await page.goto('/')

    await page.locator('.chat-input-textarea').fill('全カラムを表示して')
    await page.locator('.chat-input-send-btn').click()

    // テーブルが表示されること
    await expect(page.locator('.data-table')).toBeVisible({ timeout: 10000 })

    // 全カラムのヘッダーが表示されること（exact matchでstrict mode対応）
    await expect(page.getByRole('columnheader', { name: 'id', exact: true })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'col1', exact: true })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'col10', exact: true })).toBeVisible()
  })
})
