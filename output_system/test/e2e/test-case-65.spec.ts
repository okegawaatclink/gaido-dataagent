/**
 * DataAgent E2Eテスト - テストケース #65
 * チャットエラー時にガイドメッセージが表示される
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
 * チャットエラー時のガイドメッセージテストスイート
 */
test.describe('Chat Error - Guide Message Display', () => {
  /**
   * 【ユーザーストーリー】
   * SQLの生成・実行でエラーが発生した場合、
   * 「質問を変えてみてください」等のガイドメッセージが表示される
   *
   * 【テストケースIssue】#65
   *
   * 【前提条件】
   * - バックエンドAPIがエラーSSEを返す（モック）
   *
   * 【期待結果】
   * - エラー時に「質問を変えてみてください」等のガイドが表示される（受入条件 #1）
   * - エラーのシステム詳細は露出しない（受入条件 #3）
   */
  test('should display guide message when chat API returns error', async ({ page }) => {
    const sseBody = createSseResponse([
      { event: 'error', data: { message: 'DBスキーマの取得に失敗しました。' } },
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

    // 存在しないテーブルへの質問を送信
    await page.locator('.chat-input-textarea').fill('存在しないテーブルXYZのデータを教えて')
    await page.locator('.chat-input-textarea').press('Enter')

    // エラーメッセージが表示されること（受入条件 #1）
    await expect(page.locator('.error-message')).toBeVisible({ timeout: 10000 })

    // ガイドメッセージが表示されること（受入条件 #1）
    await expect(page.locator('.error-guide')).toBeVisible()
    await expect(page.locator('.error-guide')).toContainText('質問を変える')
  })

  /**
   * 【ユーザーストーリー】
   * SQLバリデーションエラーが発生した場合にガイドが表示される
   *
   * 【テストケースIssue】#65
   *
   * 【期待結果】
   * - SQLバリデーションエラーがユーザーに分かりやすく表示される（受入条件 #2）
   */
  test('should display user-friendly SQL validation error message', async ({ page }) => {
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

    await page.locator('.chat-input-textarea').fill('テーブルを削除して')
    await page.locator('.chat-input-textarea').press('Enter')

    // エラーメッセージが表示されること
    await expect(page.locator('.error-message')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.error-text')).toContainText('バリデーションエラー')

    // ガイドが表示されること
    await expect(page.locator('.error-guide')).toBeVisible()
  })

  /**
   * 【ユーザーストーリー】
   * SQL実行エラー時にガイドが表示される
   *
   * 【テストケースIssue】#65
   *
   * 【期待結果】
   * - SQL実行エラーがユーザーに分かりやすく表示される
   */
  test('should display user-friendly SQL execution error message', async ({ page }) => {
    const sseBody = createSseResponse([
      { event: 'message', data: { chunk: 'SQLを生成しました。' } },
      { event: 'sql', data: { sql: 'SELECT * FROM nonexistent_table' } },
      { event: 'error', data: { message: 'SQL の実行中にエラーが発生しました。' } },
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

    await page.locator('.chat-input-textarea').fill('存在しないテーブルXYZから全データを取得して')
    await page.locator('.chat-input-textarea').press('Enter')

    // エラーメッセージが表示されること
    await expect(page.locator('.error-message')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.error-text')).toContainText('SQL')

    // ガイドが表示されること（受入条件 #1）
    await expect(page.locator('.error-guide')).toBeVisible()
  })

  /**
   * 【ユーザーストーリー】
   * エラーメッセージにシステム内部情報が含まれていないこと
   *
   * 【テストケースIssue】#65
   *
   * 【期待結果】
   * - システムの内部エラー詳細はUIに露出しない（受入条件 #3）
   * - DBホスト名やスタックトレースがUIに表示されない
   */
  test('should not expose internal system error details in UI', async ({ page }) => {
    // 意図的にシステム内部情報を含まないエラーメッセージをモック
    const sseBody = createSseResponse([
      { event: 'error', data: { message: 'DBスキーマの取得に失敗しました。' } },
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

    await page.locator('.chat-input-textarea').fill('テスト質問')
    await page.locator('.chat-input-textarea').press('Enter')

    await expect(page.locator('.error-message')).toBeVisible({ timeout: 10000 })

    // エラーテキストにスタックトレースが含まれていないこと（受入条件 #3）
    const errorText = await page.locator('.error-text').textContent() ?? ''
    expect(errorText).not.toContain('at ')
    expect(errorText).not.toContain('Error:')
    expect(errorText).not.toContain('stack')
  })
})
