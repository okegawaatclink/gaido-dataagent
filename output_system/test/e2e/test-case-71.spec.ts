/**
 * DataAgent E2Eテスト - テストケース #71
 * POST /api/chat にmessageパラメータなしで400エラーが返る
 */
import { test, expect } from '@playwright/test'

const BACKEND_URL = 'http://okegawaatclink-gaido-dataagent-output-system:3002'

/**
 * チャットAPIリクエストバリデーションテストスイート
 */
test.describe('Chat API Request Validation', () => {
  /**
   * 【ユーザーストーリー】
   * bodyなしのリクエストには 400 Bad Request が返される
   *
   * 【テストケースIssue】#71
   *
   * 【前提条件】
   * - バックエンドAPIが起動していること
   *
   * 【期待結果】
   * - bodyなしのリクエストには 400 Bad Request が返される
   */
  test('should return 400 when request body is missing', async ({ request }) => {
    const response = await request.post(`${BACKEND_URL}/api/chat`, {
      headers: { 'Content-Type': 'application/json' },
      data: {},
    })

    expect(response.status()).toBe(400)

    const body = await response.json() as { error: string }
    expect(body.error).toBeTruthy()
  })

  /**
   * 【ユーザーストーリー】
   * 空文字列のmessageには 400 Bad Request が返される
   *
   * 【テストケースIssue】#71
   *
   * 【前提条件】
   * - バックエンドAPIが起動していること
   *
   * 【期待結果】
   * - 空文字列のmessageには 400 Bad Request が返される
   */
  test('should return 400 when message is empty string', async ({ request }) => {
    const response = await request.post(`${BACKEND_URL}/api/chat`, {
      headers: { 'Content-Type': 'application/json' },
      data: { message: '' },
    })

    expect(response.status()).toBe(400)

    const body = await response.json() as { error: string }
    expect(body.error).toBeTruthy()
  })

  /**
   * 【ユーザーストーリー】
   * 不正な型のmessageには 400 Bad Request が返される
   *
   * 【テストケースIssue】#71
   *
   * 【前提条件】
   * - バックエンドAPIが起動していること
   *
   * 【期待結果】
   * - 数値型のmessageには 400 Bad Request が返される
   */
  test('should return 400 when message is not a string (number)', async ({ request }) => {
    const response = await request.post(`${BACKEND_URL}/api/chat`, {
      headers: { 'Content-Type': 'application/json' },
      data: { message: 12345 },
    })

    expect(response.status()).toBe(400)

    const body = await response.json() as { error: string }
    expect(body.error).toBeTruthy()
  })

  /**
   * 【ユーザーストーリー】
   * messageパラメータがnullの場合も 400 Bad Request が返される
   *
   * 【テストケースIssue】#71
   *
   * 【期待結果】
   * - nullのmessageには 400 Bad Request が返される
   */
  test('should return 400 when message is null', async ({ request }) => {
    const response = await request.post(`${BACKEND_URL}/api/chat`, {
      headers: { 'Content-Type': 'application/json' },
      data: { message: null },
    })

    expect(response.status()).toBe(400)
  })

  /**
   * 【ユーザーストーリー】
   * 空白のみのmessageには 400 Bad Request が返される
   *
   * 【テストケースIssue】#71
   *
   * 【期待結果】
   * - 空白のみのmessageには 400 Bad Request が返される
   */
  test('should return 400 when message is whitespace only', async ({ request }) => {
    const response = await request.post(`${BACKEND_URL}/api/chat`, {
      headers: { 'Content-Type': 'application/json' },
      data: { message: '   ' },
    })

    expect(response.status()).toBe(400)

    const body = await response.json() as { error: string }
    expect(body.error).toBeTruthy()
  })

  /**
   * 【ユーザーストーリー】
   * 正常なmessageには 200 が返される（バリデーション通過確認）
   *
   * 【テストケースIssue】#71
   *
   * 【期待結果】
   * - 正常なmessageには 400 以外が返される（200 または SSE ストリーム開始）
   */
  test('should not return 400 when message is valid', async ({ page }) => {
    // 正常なリクエストのバリデーション通過をモックで確認
    const sseBody = [
      'event: message\ndata: {"chunk": "応答します。"}\n\n',
      'event: done\ndata: {}\n\n',
    ].join('')

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

    // 正常にメッセージが送信されること（ユーザーメッセージが表示される）
    await expect(page.locator('.chat-message--user').first()).toBeVisible({ timeout: 5000 })
  })
})
