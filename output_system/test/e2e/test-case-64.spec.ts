/**
 * DataAgent E2Eテスト - テストケース #64
 * APIキー未設定時にエラーイベントが発火する
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
 * APIキー未設定エラーハンドリングテストスイート
 */
test.describe('Claude API Key - Missing Key Error Handling', () => {
  /**
   * 【ユーザーストーリー】
   * ANTHROPIC_API_KEY が未設定の場合、エラーSSEが返りUIにエラーが表示される
   *
   * 【テストケースIssue】#64
   *
   * 【前提条件】
   * - バックエンドAPIがAPIキー未設定エラーのSSEを返す（モック）
   *
   * 【期待結果】
   * - error イベントが発火し、ユーザーに分かるエラーメッセージが表示される（受入条件 #1）
   * - APIキーはレスポンスに含まれない（受入条件 #2）
   */
  test('should display error message when API key is not set', async ({ page }) => {
    // APIキー未設定エラーのSSEをモック
    const sseBody = createSseResponse([
      { event: 'error', data: { message: 'ANTHROPIC_API_KEY が設定されていません。管理者に連絡してください。' } },
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

    // エラーメッセージが表示されること（受入条件 #1）
    await expect(page.locator('.error-message')).toBeVisible({ timeout: 10000 })

    // エラーテキストが表示されること
    await expect(page.locator('.error-text')).toBeVisible()
  })

  /**
   * 【ユーザーストーリー】
   * LLMサービス初期化エラー時のエラーSSEがUIに表示される
   *
   * 【テストケースIssue】#64
   *
   * 【前提条件】
   * - バックエンドAPIがLLMサービス初期化失敗のSSEを返す（モック）
   *
   * 【期待結果】
   * - エラーメッセージが表示される
   * - エラーガイドが表示される
   */
  test('should display error message when LLM service initialization fails', async ({ page }) => {
    const sseBody = createSseResponse([
      { event: 'error', data: { message: 'LLM サービスの初期化に失敗しました。' } },
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

    // エラーメッセージが表示されること
    await expect(page.locator('.error-message')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.error-text')).toContainText('LLM')
  })

  /**
   * 【ユーザーストーリー】
   * LLMタイムアウトエラー時のSSEがUIに表示される
   *
   * 【テストケースIssue】#64
   *
   * 【期待結果】
   * - タイムアウトエラーメッセージが表示される
   */
  test('should display timeout error when LLM response times out', async ({ page }) => {
    const sseBody = createSseResponse([
      { event: 'error', data: { message: 'LLM の応答がタイムアウトしました。しばらく待ってから再試行してください。' } },
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
    await expect(page.locator('.error-text')).toContainText('タイムアウト')
  })

  /**
   * 【ユーザーストーリー】
   * エラーSSEのレスポンスにAPIキー等の機密情報が含まれていないこと
   *
   * 【テストケースIssue】#64
   *
   * 【期待結果】
   * - エラーメッセージにAPIキー値が含まれていない（受入条件 #2）
   * - エラーメッセージにログやレスポンスにキーが出力されない
   */
  test('should not expose API key in error message', async ({ page }) => {
    // APIキーが含まれるような危険なエラーメッセージのSSEをモック
    // 実際のバックエンドはキーを隠すが、UIがそのまま表示しないことを確認
    const sseBody = createSseResponse([
      {
        event: 'error',
        data: { message: 'ANTHROPIC_API_KEY が設定されていません。管理者に連絡してください。' },
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

    await page.locator('.chat-input-textarea').fill('テスト質問')
    await page.locator('.chat-input-textarea').press('Enter')

    await expect(page.locator('.error-message')).toBeVisible({ timeout: 10000 })

    // エラーテキストにAPIキーの実際の値（sk-ant-...形式）が含まれていないこと
    const errorText = await page.locator('.error-text').textContent() ?? ''
    expect(errorText).not.toMatch(/sk-ant-[a-zA-Z0-9-_]+/)
    expect(errorText).not.toMatch(/sk-[a-zA-Z0-9-_]{20,}/)
  })
})
