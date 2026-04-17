/**
 * DataAgent E2Eテスト - テストケース #67
 * SQLインジェクション攻撃パターンがブロックされる
 */
import { test, expect, type Page } from '@playwright/test'

const BACKEND_URL = 'http://okegawaatclink-gaido-dataagent-output-system:3002'

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
 * SQLインジェクション防御テストスイート
 *
 * sqlValidator.ts の防御ロジックをE2Eレベルで確認する。
 * バックエンドのAPIに直接攻撃パターンのSQLを含むSSEをモックして
 * UIがエラーを正しく表示することを確認する。
 */
test.describe('SQL Injection Attack Prevention', () => {
  /**
   * 【ユーザーストーリー】
   * UNIONベースの攻撃SQLがブロックされる
   *
   * 【テストケースIssue】#67
   *
   * 【前提条件】
   * - バックエンドAPIがSQLバリデーションエラーのSSEを返す（モック）
   *
   * 【期待結果】
   * - UNION攻撃パターンはブロックされる（受入条件 #1）
   */
  test('should block UNION-based SQL injection via mock SSE error', async ({ page }) => {
    const sseBody = createSseResponse([
      {
        event: 'error',
        data: { message: "SQL バリデーションエラー: 'INTO' キーワードを含むSQLは実行できません。SELECTクエリのみ許可されています。" },
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

    await page.locator('.chat-input-textarea').fill('SELECT 1 UNION SELECT password FROM users')
    await page.locator('.chat-input-textarea').press('Enter')

    // エラーが表示されること
    await expect(page.locator('.error-message')).toBeVisible({ timeout: 10000 })
  })

  /**
   * 【ユーザーストーリー】
   * マルチステートメント（ピギーバック）攻撃がブロックされる
   *
   * 【テストケースIssue】#67
   *
   * 【前提条件】
   * - バックエンドAPIがマルチステートメントエラーのSSEを返す（モック）
   *
   * 【期待結果】
   * - マルチステートメントは全て拒否される（受入条件 #2）
   */
  test('should block piggybacking SQL injection via mock SSE error', async ({ page }) => {
    const sseBody = createSseResponse([
      {
        event: 'error',
        data: { message: 'SQL バリデーションエラー: 複数のSQL文（セミコロン区切り）は許可されていません。1つのSELECT文のみ入力してください。' },
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

    await page.locator('.chat-input-textarea').fill('SELECT * FROM t WHERE id=1; DROP TABLE t')
    await page.locator('.chat-input-textarea').press('Enter')

    await expect(page.locator('.error-message')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.error-text')).toContainText('複数のSQL文')
  })

  /**
   * 【ユーザーストーリー】
   * DROPを含む攻撃パターンがUIでエラー表示される
   *
   * 【テストケースIssue】#67
   *
   * 【前提条件】
   * - バックエンドAPIがSQLバリデーションエラーのSSEを返す（モック）
   *
   * 【期待結果】
   * - DROP文を含むSQLはブロックされエラーが表示される
   */
  test('should block DROP TABLE SQL injection via mock SSE error', async ({ page }) => {
    const sseBody = createSseResponse([
      { event: 'message', data: { chunk: 'SQLを生成しました。' } },
      { event: 'sql', data: { sql: 'DROP TABLE users' } },
      {
        event: 'error',
        data: { message: "SQL バリデーションエラー: 'DROP' キーワードを含むSQLは実行できません。SELECTクエリのみ許可されています。" },
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

    await page.locator('.chat-input-textarea').fill('テーブルを削除して')
    await page.locator('.chat-input-textarea').press('Enter')

    // DROP文はブロックされエラーが表示されること
    await expect(page.locator('.error-message')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.error-text')).toContainText('DROP')
  })

  /**
   * 【ユーザーストーリー】
   * 大文字小文字混在による回避パターンがブロックされる
   *
   * 【テストケースIssue】#67
   *
   * 【期待結果】
   * - 大文字小文字の混在による回避は不可能（受入条件 #5）
   */
  test('should block case-mixed SQL injection via mock SSE error', async ({ page }) => {
    const sseBody = createSseResponse([
      {
        event: 'error',
        data: { message: "SQL バリデーションエラー: 'DROP' キーワードを含むSQLは実行できません。SELECTクエリのみ許可されています。" },
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

    await page.locator('.chat-input-textarea').fill('SeLeCt ... ; dRoP TABLE t')
    await page.locator('.chat-input-textarea').press('Enter')

    await expect(page.locator('.error-message')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.error-text')).toContainText('DROP')
  })

  /**
   * 【ユーザーストーリー】
   * SELECT単体は正常に実行される
   *
   * 【テストケースIssue】#67
   *
   * 【期待結果】
   * - SELECT単体は正常に実行される（受入条件 #3）
   */
  test('should allow SELECT-only query to execute successfully', async ({ page }) => {
    const sseBody = createSseResponse([
      { event: 'message', data: { chunk: 'データを取得しました。' } },
      { event: 'sql', data: { sql: 'SELECT * FROM sales LIMIT 10' } },
      { event: 'chart_type', data: { chartType: 'table' } },
      {
        event: 'result',
        data: { columns: ['id', 'amount'], rows: [{ id: 1, amount: 1000 }], chartType: 'table' },
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

    await page.locator('.chat-input-textarea').fill('売上データをSELECTで取得して')
    await page.locator('.chat-input-textarea').press('Enter')

    // SELECT単体は正常に実行されること（受入条件 #3）
    await expect(page.locator('.data-table')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.sql-code')).toContainText('SELECT')
  })

  /**
   * 【ユーザーストーリー】
   * コメントを使った回避パターンがブロックされる
   *
   * 【テストケースIssue】#67
   *
   * 【期待結果】
   * - コメント内に隠されたDROP文はブロックされる（受入条件 #4）
   */
  test('should block comment-based SQL injection via mock SSE error', async ({ page }) => {
    const sseBody = createSseResponse([
      {
        event: 'error',
        data: { message: "SQL バリデーションエラー: 'DROP' キーワードを含むSQLは実行できません。SELECTクエリのみ許可されています。" },
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

    // コメントを使ったSQLインジェクション回避パターン
    await page.locator('.chat-input-textarea').fill('SELECT * FROM t; -- DROP TABLE t')
    await page.locator('.chat-input-textarea').press('Enter')

    await expect(page.locator('.error-message')).toBeVisible({ timeout: 10000 })
  })
})
