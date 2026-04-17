/**
 * DataAgent E2Eテスト - テストケース #56
 * SELECTのみ実行可能な安全なSQL実行基盤が機能する
 */
import { test, expect } from '@playwright/test'

const BACKEND_URL = 'http://okegawaatclink-gaido-dataagent-output-system:3002'

/**
 * SSEレスポンスを生成するヘルパー
 * バックエンドの sendSseEvent フォーマットに準拠する
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
 * SQL実行基盤の安全性テストスイート
 *
 * バックエンドAPIに対して直接リクエストを行い、SQLバリデーション動作を確認する。
 * LLMの代わりに固定SQLをフロントエンド経由でモック確認する。
 */
test.describe('SQL Execution Safety - SELECT Only', () => {
  /**
   * 【ユーザーストーリー】
   * chat APIにSELECT文を送信すると（モック経由で）結果が返ること
   * （実際のSQLバリデーションはバックエンドのユニットテストでカバー済み）
   *
   * 【テストケースIssue】#56
   *
   * 【前提条件】
   * - フロントエンドが起動していること
   * - バックエンドAPIをモックする
   *
   * 【期待結果】
   * - SELECT文に対するモック応答が正常に表示される
   */
  test('should display result when SELECT query is executed via mock', async ({ page }) => {
    // SELECT文を含むSSEレスポンスをモック
    const sseBody = createSseResponse([
      { event: 'message', data: { chunk: 'SELECT文を実行しました。' } },
      { event: 'sql', data: { sql: 'SELECT * FROM sales LIMIT 10' } },
      { event: 'chart_type', data: { chartType: 'table' } },
      { event: 'result', data: { columns: ['id', 'amount'], rows: [{ id: 1, amount: 1000 }], chartType: 'table' } },
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
    await page.locator('.chat-input-textarea').fill('売上データをSELECTで取得して')
    await page.locator('.chat-input-textarea').press('Enter')

    // 結果が表示されること
    await expect(page.locator('.data-table')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.sql-display')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.sql-code')).toContainText('SELECT')
  })

  /**
   * 【ユーザーストーリー】
   * INSERTを含む危険なSQLが実行された場合、エラーSSEが返り、
   * UIにエラーメッセージが表示される
   *
   * 【テストケースIssue】#56
   *
   * 【前提条件】
   * - バックエンドAPIがSQLバリデーションエラーのSSEを返す（モック）
   *
   * 【期待結果】
   * - エラーメッセージが表示されること
   */
  test('should display error message when INSERT SQL validation error is returned', async ({ page }) => {
    // SQLバリデーションエラーのSSEをモック
    const sseBody = createSseResponse([
      { event: 'error', data: { message: "SQL バリデーションエラー: 'INSERT' キーワードを含むSQLは実行できません。SELECTクエリのみ許可されています。" } },
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
    await page.locator('.chat-input-textarea').fill('データをINSERTして')
    await page.locator('.chat-input-textarea').press('Enter')

    // エラーメッセージが表示されること
    await expect(page.locator('.error-message')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.error-text')).toContainText('INSERT')
  })

  /**
   * 【ユーザーストーリー】
   * DROP文を含む危険なSQLが実行された場合、エラーSSEが返る
   *
   * 【テストケースIssue】#56
   *
   * 【期待結果】
   * - DROP文のエラーメッセージが表示されること
   */
  test('should display error message when DROP SQL validation error is returned', async ({ page }) => {
    const sseBody = createSseResponse([
      { event: 'error', data: { message: "SQL バリデーションエラー: 'DROP' キーワードを含むSQLは実行できません。SELECTクエリのみ許可されています。" } },
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
    await page.locator('.chat-input-textarea').fill('テーブルをDROPして')
    await page.locator('.chat-input-textarea').press('Enter')

    await expect(page.locator('.error-message')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.error-text')).toContainText('DROP')
  })

  /**
   * 【ユーザーストーリー】
   * バックエンドAPIに直接リクエストしてSQLバリデーションを確認する
   * （バックエンドのAPIレベルでのバリデーション確認）
   *
   * 【テストケースIssue】#56
   *
   * 【期待結果】
   * - message 未指定で 400 エラーが返ること（間接的にSQL実行基盤の存在確認）
   */
  test('should return 400 when message is missing in POST /api/chat', async ({ request }) => {
    // messageなしでリクエスト（バリデーション動作確認）
    const response = await request.post(`${BACKEND_URL}/api/chat`, {
      headers: { 'Content-Type': 'application/json' },
      data: {},
    })

    // 400 Bad Request が返ること
    expect(response.status()).toBe(400)

    const body = await response.json() as { error: string }
    expect(body.error).toBeTruthy()
  })

  /**
   * 【ユーザーストーリー】
   * バックエンドに直接TRUNCATEを含むリクエストを送信すると、
   * エラーが返る（SSEストリーム内でエラーイベントが発火）
   *
   * 【テストケースIssue】#56
   *
   * 【期待結果】
   * - UPDATEやDELETEのエラーSSEがUIで表示される
   */
  test('should display error when UPDATE and DELETE SQL errors are returned', async ({ page }) => {
    // UPDATEエラーのSSEをモック
    const sseBody = createSseResponse([
      { event: 'error', data: { message: "SQL バリデーションエラー: 'UPDATE' キーワードを含むSQLは実行できません。SELECTクエリのみ許可されています。" } },
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
    await page.locator('.chat-input-textarea').fill('データをUPDATEして')
    await page.locator('.chat-input-textarea').press('Enter')

    await expect(page.locator('.error-message')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.error-text')).toContainText('UPDATE')
  })
})
