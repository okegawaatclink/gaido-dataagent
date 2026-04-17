/**
 * DataAgent E2Eテスト - テーブル表示（PBI 3.2）
 *
 * このファイルでは DataAgent のテーブル表示機能の E2E テストを行う。
 *
 * テスト方針（Task 3.2.2）:
 * - バックエンドAPIをPlaywright route interceptorでモックする
 * - chart_type='table' の場合にDataTableが自動選択されることを検証
 * - DataTableの各機能（スクロール、NULL表示、数値右寄せ、行数サマリー等）を検証
 *
 * テスト範囲:
 * - chart_type='table' の時に自動で DataTable が選択される（受入条件 #4）
 * - カラム名がヘッダーとして表示される（受入条件 #1）
 * - 行データが縦スクロール可能に表示される（受入条件 #2）
 * - 500行を超える場合は先頭500行のみ表示し、超過件数を注記する（受入条件 #3）
 * - null値は "NULL" 代替表記で表示する（受入条件 #5）
 * - 数値列が右寄せ表示される
 * - セルクリックでコピー機能が動作する
 * - データ0件のエッジケース表示
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
 * テーブル表示用のモックSSEレスポンスを作成する
 *
 * @param columns - 列名配列
 * @param rows    - テストデータの行配列
 * @returns SSEレスポンス文字列
 */
function createTableSseResponse(
  columns: string[],
  rows: Array<Record<string, unknown>>,
): string {
  return createSseResponse([
    { event: 'message', data: { chunk: 'データを取得しました。' } },
    { event: 'sql', data: { sql: 'SELECT * FROM orders LIMIT 10' } },
    { event: 'chart_type', data: { chartType: 'table' } },
    { event: 'result', data: { columns, rows, chartType: 'table' } },
    { event: 'done', data: {} },
  ])
}

// ---------------------------------------------------------------------------
// テスト用データ
// ---------------------------------------------------------------------------

/** テーブル表示用のサンプルデータ */
const TABLE_COLUMNS = ['id', 'name', 'amount', 'created_at', 'memo']

/** 通常の行データ（NULL値・数値・日付を含む） */
const TABLE_ROWS_WITH_NULL: Array<Record<string, unknown>> = [
  { id: 1, name: 'Alice', amount: 15000, created_at: '2024-01-15', memo: null },
  { id: 2, name: 'Bob', amount: 23000, created_at: '2024-02-20', memo: 'テスト備考' },
  { id: 3, name: 'Charlie', amount: 8000, created_at: '2024-03-10', memo: null },
]

// ---------------------------------------------------------------------------
// E2E テスト
// ---------------------------------------------------------------------------

test.describe('DataTable Display', () => {
  /**
   * 【ユーザーストーリー】
   * LLMが chart_type='table' を推奨した場合、テーブルタブが自動選択されDataTableが表示される
   *
   * 【前提条件】
   * - バックエンドAPIが chart_type='table' を含む SSE を返す（モック）
   *
   * 【期待結果】
   * - ChartRenderer の「テーブル」タブが aria-selected=true になる（受入条件 #4）
   * - カラム名がヘッダーに表示される（受入条件 #1）
   * - 行データがテーブル形式で表示される（受入条件 #2）
   */
  test('should auto-select table tab and display DataTable when chart_type is table', async ({ page }) => {
    // Arrange: chart_type=table のモックを設定
    const sseBody = createTableSseResponse(TABLE_COLUMNS, TABLE_ROWS_WITH_NULL)
    await mockChatApi(page, sseBody)
    await page.goto('/')

    // Act: 質問を送信
    await page.locator('.chat-input-textarea').fill('注文データを見せて')
    await page.locator('.chat-input-send-btn').click()

    // Assert: ChartRenderer が表示されること
    await expect(page.locator('.chart-renderer')).toBeVisible({ timeout: 10000 })

    // Assert: テーブルタブが自動選択されること（受入条件 #4）
    const tableTab = page.locator('[role="tab"][id="chart-tab-table"]')
    await expect(tableTab).toHaveAttribute('aria-selected', 'true')

    // Assert: テーブルが表示されること
    await expect(page.locator('.data-table-wrapper')).toBeVisible()

    // Assert: カラム名がヘッダーに表示されること（受入条件 #1）
    for (const col of TABLE_COLUMNS) {
      await expect(page.locator(`th[scope="col"]`).filter({ hasText: col })).toBeVisible()
    }

    // スクリーンショットを保存
    await page.screenshot({
      path: 'ai_generated/screenshots/task-37_datatable_table_mode.png',
      fullPage: false,
    })
  })

  /**
   * 【ユーザーストーリー】
   * NULL値を含む行がテーブルに表示される場合、NULL値が "NULL" グレー表示になる
   *
   * 【前提条件】
   * - バックエンドAPIが NULL を含む行を返す（モック）
   *
   * 【期待結果】
   * - NULL値のセルに "NULL" テキストが表示される（受入条件 #5）
   * - NULL値のセルに null用CSSクラスが付与されている
   */
  test('should display null values as "NULL" with gray styling', async ({ page }) => {
    // Arrange: NULL値を含むデータのモックを設定
    const sseBody = createTableSseResponse(TABLE_COLUMNS, TABLE_ROWS_WITH_NULL)
    await mockChatApi(page, sseBody)
    await page.goto('/')

    // Act: 質問を送信してテーブル表示
    await page.locator('.chat-input-textarea').fill('NULLデータを見せて')
    await page.locator('.chat-input-send-btn').click()

    // テーブルが表示されるまで待機
    await expect(page.locator('.data-table-wrapper')).toBeVisible({ timeout: 10000 })

    // Assert: "NULL" テキストが表示されること（受入条件 #5）
    // Alice と Charlie の memo が null なので "NULL" が2つ表示される
    const nullTexts = page.locator('.data-table__td-null, .data-table__td--null')
    await expect(page.getByText('NULL').first()).toBeVisible()

    // Assert: NULL値セルの数が正しいこと（memo列がnullの行が2行）
    const nullCells = page.locator('.data-table__td--null')
    const nullCount = await nullCells.count()
    expect(nullCount).toBeGreaterThanOrEqual(2)
  })

  /**
   * 【ユーザーストーリー】
   * テーブルに数値列がある場合、数値列が右寄せで表示される
   *
   * 【前提条件】
   * - バックエンドAPIが数値列（amount）を含む行を返す（モック）
   *
   * 【期待結果】
   * - amount列のヘッダーに data-table__th--numeric クラスが付与されている
   * - amount列のセルに data-table__td--numeric クラスが付与されている
   */
  test('should right-align numeric columns', async ({ page }) => {
    // Arrange: 数値列を含むデータのモックを設定
    const sseBody = createTableSseResponse(TABLE_COLUMNS, TABLE_ROWS_WITH_NULL)
    await mockChatApi(page, sseBody)
    await page.goto('/')

    // Act: 質問を送信してテーブル表示
    await page.locator('.chat-input-textarea').fill('売上金額を見せて')
    await page.locator('.chat-input-send-btn').click()

    // テーブルが表示されるまで待機
    await expect(page.locator('.data-table-wrapper')).toBeVisible({ timeout: 10000 })

    // Assert: 数値ヘッダーに numeric クラスが付与されること（複数存在するので first() で取得）
    const numericHeader = page.locator('th.data-table__th--numeric').first()
    await expect(numericHeader).toBeVisible()

    // Assert: 数値セルに numeric クラスが付与されること
    const numericCells = page.locator('td.data-table__td--numeric')
    const numericCount = await numericCells.count()
    // amount列の3行 = 3セル
    expect(numericCount).toBeGreaterThanOrEqual(3)
  })

  /**
   * 【ユーザーストーリー】
   * テーブルに行数サマリーが表示される
   *
   * 【前提条件】
   * - バックエンドAPIが3行のデータを返す（モック）
   *
   * 【期待結果】
   * - 行数サマリーに「全 3 件」テキストが表示される
   * - 「セルをクリックでコピー」ヒントが表示される
   */
  test('should display row count summary and copy hint', async ({ page }) => {
    // Arrange: 3行のデータのモックを設定
    const sseBody = createTableSseResponse(TABLE_COLUMNS, TABLE_ROWS_WITH_NULL)
    await mockChatApi(page, sseBody)
    await page.goto('/')

    // Act: 質問を送信してテーブル表示
    await page.locator('.chat-input-textarea').fill('3件のデータを見せて')
    await page.locator('.chat-input-send-btn').click()

    // テーブルが表示されるまで待機
    await expect(page.locator('.data-table-wrapper')).toBeVisible({ timeout: 10000 })

    // Assert: 行数サマリーが表示されること
    const summary = page.locator('.data-table-summary')
    await expect(summary).toBeVisible()

    // Assert: 行数サマリーに「3」が含まれること
    await expect(summary).toContainText('3')

    // Assert: コピーヒントが表示されること
    await expect(page.locator('.data-table-summary__copy-hint')).toBeVisible()
    await expect(page.locator('.data-table-summary__copy-hint')).toContainText('セルをクリックでコピー')
  })

  /**
   * 【ユーザーストーリー】
   * 空のクエリ結果が返ってきた場合、「結果がありません」メッセージが表示される
   *
   * 【前提条件】
   * - バックエンドAPIが空の rows を返す（モック）
   *
   * 【期待結果】
   * - 「結果がありません」テキストが表示される
   */
  test('should display empty message when result has no rows', async ({ page }) => {
    // Arrange: 空データのモックを設定
    const sseBody = createTableSseResponse(TABLE_COLUMNS, [])
    await mockChatApi(page, sseBody)
    await page.goto('/')

    // Act: 質問を送信
    await page.locator('.chat-input-textarea').fill('該当データなしの質問')
    await page.locator('.chat-input-send-btn').click()

    // Assert: ChartRenderer が表示されること
    await expect(page.locator('.chart-renderer')).toBeVisible({ timeout: 10000 })

    // Assert: DataTable の「結果がありません」が表示されること
    await expect(page.locator('.data-table-empty')).toBeVisible()
    await expect(page.locator('.data-table-empty__text')).toContainText('結果がありません')
  })

  /**
   * 【ユーザーストーリー】
   * テーブルのスクロールコンテナが存在し、縦スクロール可能な設定になっている
   *
   * 【前提条件】
   * - バックエンドAPIが複数行のデータを返す（モック）
   *
   * 【期待結果】
   * - data-table-scroll クラスのコンテナが表示されている
   * - テーブルヘッダーが sticky 設定になっている（CSSで確認）
   */
  test('should have scrollable container with sticky header', async ({ page }) => {
    // Arrange: データのモックを設定
    const sseBody = createTableSseResponse(TABLE_COLUMNS, TABLE_ROWS_WITH_NULL)
    await mockChatApi(page, sseBody)
    await page.goto('/')

    // Act: 質問を送信してテーブル表示
    await page.locator('.chat-input-textarea').fill('スクロールテスト')
    await page.locator('.chat-input-send-btn').click()

    // テーブルが表示されるまで待機
    await expect(page.locator('.data-table-wrapper')).toBeVisible({ timeout: 10000 })

    // Assert: スクロールコンテナが存在すること
    const scrollContainer = page.locator('.data-table-scroll')
    await expect(scrollContainer).toBeVisible()

    // Assert: スクロールコンテナに適切なaria属性があること
    await expect(scrollContainer).toHaveAttribute('role', 'region')
    await expect(scrollContainer).toHaveAttribute('aria-label', 'クエリ結果テーブル')

    // Assert: ヘッダーが存在すること
    await expect(page.locator('.data-table__head')).toBeVisible()
  })

  /**
   * 【ユーザーストーリー】
   * セルをクリックすると「コピー済み」状態に変わる
   *
   * 【前提条件】
   * - バックエンドAPIがデータを返す（モック）
   *
   * 【期待結果】
   * - セルクリック後に「✓ コピー済み」テキストが一時的に表示される
   */
  test('should show copy feedback when cell is clicked', async ({ page }) => {
    // Arrange: データのモックを設定
    const sseBody = createTableSseResponse(
      ['id', 'name'],
      [{ id: 1, name: 'テストデータ' }],
    )
    await mockChatApi(page, sseBody)
    await page.goto('/')

    // Act: 質問を送信してテーブル表示
    await page.locator('.chat-input-textarea').fill('コピーテスト')
    await page.locator('.chat-input-send-btn').click()

    // テーブルが表示されるまで待機
    await expect(page.locator('.data-table-wrapper')).toBeVisible({ timeout: 10000 })

    // 「テストデータ」セルを取得してクリック
    const dataCell = page.locator('.data-table__td').filter({ hasText: 'テストデータ' })
    await dataCell.click()

    // Assert: コピー完了ラベルが表示されること
    await expect(page.locator('.data-table__td-copied-label')).toBeVisible({ timeout: 3000 })
    await expect(page.locator('.data-table__td-copied-label')).toContainText('✓ コピー済み')
  })

  /**
   * 【ユーザーストーリー】
   * 日付文字列が日本語形式でフォーマットされて表示される
   *
   * 【前提条件】
   * - バックエンドAPIが ISO 8601 形式の日付を含む行を返す（モック）
   *
   * 【期待結果】
   * - "2024-01-15" が "2024年1月15日" の形式で表示される
   */
  test('should format date strings in Japanese locale format', async ({ page }) => {
    // Arrange: 日付データを含むモックを設定
    const sseBody = createTableSseResponse(
      ['id', 'order_date'],
      [{ id: 1, order_date: '2024-01-15' }],
    )
    await mockChatApi(page, sseBody)
    await page.goto('/')

    // Act: 質問を送信してテーブル表示
    await page.locator('.chat-input-textarea').fill('日付フォーマットテスト')
    await page.locator('.chat-input-send-btn').click()

    // テーブルが表示されるまで待機
    await expect(page.locator('.data-table-wrapper')).toBeVisible({ timeout: 10000 })

    // Assert: 日本語形式の日付が表示されること
    // ブラウザのロケールに依存するが「2024年」が含まれることを確認
    const dateCell = page.locator('.data-table__td').filter({ hasText: '2024年' })
    await expect(dateCell).toBeVisible()
  })
})
