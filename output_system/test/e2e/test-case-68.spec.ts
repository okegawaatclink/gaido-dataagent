/**
 * DataAgent E2Eテスト - テストケース #68
 * 空メッセージ・長大メッセージの送信時の境界値確認
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
 * メッセージ入力の境界値テストスイート
 */
test.describe('Message Input - Boundary Value Testing', () => {
  /**
   * 【ユーザーストーリー】
   * 空のメッセージは送信されない
   *
   * 【テストケースIssue】#68
   *
   * 【期待結果】
   * - 空のメッセージは送信されない（ボタン無効化またはバリデーション）（受入条件 #1）
   */
  test('should not send empty message', async ({ page }) => {
    await page.goto('/')

    const textarea = page.locator('.chat-input-textarea')
    const sendBtn = page.locator('.chat-input-send-btn')

    // 空の状態でEnterを押す
    await textarea.press('Enter')

    // メッセージが送信されていないこと
    await expect(page.locator('.chat-message--user')).not.toBeVisible()

    // 送信ボタンが無効状態であること
    const isDisabled = await sendBtn.evaluate((el) => {
      return el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true'
    })
    expect(isDisabled).toBe(true)
  })

  /**
   * 【ユーザーストーリー】
   * 空白のみのメッセージは送信されないか、適切にハンドリングされる
   *
   * 【テストケースIssue】#68
   *
   * 【期待結果】
   * - 空白のみのメッセージは送信されないか、適切にハンドリングされる（受入条件 #2）
   */
  test('should not send whitespace-only message', async ({ page }) => {
    await page.goto('/')

    const textarea = page.locator('.chat-input-textarea')

    // 空白のみを入力してEnterを押す
    await textarea.fill('   ')
    await textarea.press('Enter')

    // メッセージが送信されていないこと（空白はtrimされるため）
    // または 400 エラーが返ること
    await page.waitForTimeout(500)
    await expect(page.locator('.chat-message--user')).not.toBeVisible()
  })

  /**
   * 【ユーザーストーリー】
   * 長大メッセージ（2000文字超）はバックエンドで 400 エラーが返る
   *
   * 【テストケースIssue】#68
   *
   * 【前提条件】
   * - バックエンドAPIが起動していること
   * - MESSAGE_MAX_LENGTH = 2000
   *
   * 【期待結果】
   * - 2000文字を超えるメッセージには 400 Bad Request が返る（受入条件 #3）
   */
  test('should return 400 for message exceeding 2000 characters', async ({ request }) => {
    // 2001文字のメッセージ
    const longMessage = 'あ'.repeat(2001)

    const response = await request.post(`${BACKEND_URL}/api/chat`, {
      headers: { 'Content-Type': 'application/json' },
      data: { message: longMessage },
    })

    // 400 Bad Request が返ること
    expect(response.status()).toBe(400)

    const body = await response.json() as { error: string }
    expect(body.error).toContain('2000')
  })

  /**
   * 【ユーザーストーリー】
   * ちょうど2000文字のメッセージはフロントエンドから送信できる
   *
   * 【テストケースIssue】#68
   *
   * 【期待結果】
   * - 2000文字のメッセージは送信できる（400エラーにならない）
   */
  test('should accept message at exactly 2000 characters limit', async ({ page }) => {
    // 2000文字のメッセージをモックを使ってテスト
    const exactMessage = 'あ'.repeat(2000)

    const sseBody = createSseResponse([
      { event: 'message', data: { chunk: '長いメッセージを受け付けました。' } },
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

    // 2000文字のメッセージを入力して送信
    await page.locator('.chat-input-textarea').fill(exactMessage)
    await page.locator('.chat-input-textarea').press('Enter')

    // メッセージが送信されること（400エラーにならないこと）
    await expect(page.locator('.chat-message--user').first()).toBeVisible({ timeout: 5000 })
  })

  /**
   * 【ユーザーストーリー】
   * 特殊文字（HTML/JavaScript）を含むメッセージがXSS攻撃を防ぐ
   *
   * 【テストケースIssue】#68
   *
   * 【期待結果】
   * - 特殊文字はエスケープされ、XSS攻撃が成立しない（受入条件 #4）
   */
  test('should escape special characters to prevent XSS', async ({ page }) => {
    // XSSペイロードを含むSSEレスポンスをモック（レスポンスはそのまま返す）
    const xssPayload = '<script>alert("XSS")</script>'
    const sseBody = createSseResponse([
      { event: 'message', data: { chunk: '質問を受け付けました。' } },
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

    // XSSペイロードを入力して送信
    await page.locator('.chat-input-textarea').fill(xssPayload)
    await page.locator('.chat-input-textarea').press('Enter')

    // ユーザーメッセージが表示されること
    await expect(page.locator('.chat-message--user').first()).toBeVisible({ timeout: 5000 })

    // XSSが実行されていないこと（alertが表示されていないこと）
    // Playwrightはダイアログを自動で閉じないので、ダイアログが出れば検出できる
    let dialogShown = false
    page.once('dialog', () => {
      dialogShown = true
    })

    await page.waitForTimeout(500)
    expect(dialogShown).toBe(false)

    // XSSペイロードが表示テキストではなくエスケープされていること
    const userMessageText = await page.locator('.chat-message--user .chat-message__text').textContent()
    // テキストがそのまま表示される（scriptタグが実行されない）
    expect(userMessageText).toContain('<script>')  // エスケープされてテキストとして表示
  })

  /**
   * 【ユーザーストーリー】
   * 1文字のメッセージは正常に送信される
   *
   * 【テストケースIssue】#68
   *
   * 【期待結果】
   * - 1文字のメッセージは送信される
   */
  test('should send single character message', async ({ page }) => {
    const sseBody = createSseResponse([
      { event: 'message', data: { chunk: '応答します。' } },
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

    await page.locator('.chat-input-textarea').fill('あ')
    await page.locator('.chat-input-textarea').press('Enter')

    // 1文字でもメッセージが送信されること
    await expect(page.locator('.chat-message--user').first()).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.chat-message--user .chat-message__text')).toContainText('あ')
  })
})
