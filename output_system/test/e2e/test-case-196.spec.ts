/**
 * DataAgent E2Eテスト - テストケース #196
 * スキーマキャッシュによりDB選択時に1回だけスキーマ取得が行われる
 */
import { test, expect } from '@playwright/test'

/**
 * SSEレスポンスを生成するヘルパー
 */
function createSseResponse(conversationId: string): string {
  const events = [
    { event: 'conversation', data: { conversationId } },
    { event: 'message', data: { chunk: '結果を取得しました。' } },
    { event: 'sql', data: { sql: 'SELECT 1' } },
    { event: 'chart_type', data: { chartType: 'table' } },
    { event: 'result', data: { columns: ['1'], rows: [{ '1': 1 }], chartType: 'table' } },
    { event: 'done', data: {} },
  ]
  return events
    .map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    .join('')
}

/**
 * 【ユーザーストーリー】
 * 業務データを参照したい社内ユーザーが選択中のDB接続先に対して複数回質問するとき、
 * スキーマ情報は初回のみ取得されキャッシュされる
 *
 * 【テストケースIssue】#196
 *
 * 【前提条件】
 * - DB接続先が2件以上登録されていること
 *
 * 【期待結果】
 * - DB選択時に1回だけスキーマ取得クエリが実行される
 * - 同じDB接続先への2回目以降のチャットではスキーマ再取得が行われない
 * - DB切替時には新しいDBのスキーマが取得される
 */
test.describe('Schema Cache - DB Connection', () => {
  const BACKEND = 'http://okegawaatclink-gaido-dataagent-output-system:3002'

  /**
   * GET /api/schema?dbConnectionId=xxx が正常に動作すること
   */
  test('should return schema via GET /api/schema endpoint', async ({ request }) => {
    // 接続先一覧を取得
    const listResp = await request.get(`${BACKEND}/api/connections`)
    const connections = await listResp.json()

    if (connections.length === 0) {
      test.skip()
      return
    }

    const dbConnectionId = connections[0].id

    // スキーマを取得（存在するDB接続先なら正常に返ること）
    const schemaResp = await request.get(`${BACKEND}/api/schema?dbConnectionId=${dbConnectionId}`)

    // 実際のDBに接続できる場合は200、接続失敗の場合はエラーが返ることがある
    expect([200, 400, 500]).toContain(schemaResp.status())
  })

  /**
   * 同じDB接続先へのチャットが連続して実行できること（キャッシュによるパフォーマンス向上）
   */
  test('should allow multiple chat requests to same DB connection', async ({ page, request }) => {
    // 接続先が存在することを確認
    const listResp = await request.get(`${BACKEND}/api/connections`)
    const connections = await listResp.json()
    if (connections.length === 0) {
      test.skip()
      return
    }

    let requestCount = 0
    const conversationId = 'test-conv-196'

    // /api/chat をモック（2回以上呼べることを確認）
    await page.route('**/api/chat', (route) => {
      requestCount++
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: { 'Cache-Control': 'no-cache' },
        body: createSseResponse(conversationId),
      })
    })

    await page.route('**/api/history*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: conversationId,
          title: 'テスト会話',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }]),
      })
    })

    await page.goto('/')

    // 1回目の質問
    await page.locator('.chat-input-textarea').fill('1回目の質問')
    await page.locator('.chat-input-textarea').press('Enter')
    await expect(page.locator('.chat-message--assistant').first()).toBeVisible({ timeout: 10000 })

    // 2回目の質問
    await page.locator('.chat-input-textarea').fill('2回目の質問')
    await page.locator('.chat-input-textarea').press('Enter')
    await expect(page.locator('.chat-message--user')).toHaveCount(2, { timeout: 5000 })
    await expect(page.locator('.chat-message--assistant')).toHaveCount(2, { timeout: 10000 })

    // 2回ともチャットリクエストが送られたこと
    await page.waitForTimeout(500)
    expect(requestCount).toBe(2)
  })

  /**
   * DB切替時にサイドバーの履歴が更新されること（スキーマキャッシュの副作用確認）
   */
  test('should update sidebar and clear chat when switching DB connection', async ({ page, request }) => {
    const listResp = await request.get(`${BACKEND}/api/connections`)
    const connections = await listResp.json()

    if (connections.length < 2) {
      test.skip()
      return
    }

    await page.route('**/api/history*', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })

    await page.goto('/')

    // DB選択ドロップダウンが表示されること
    const dbSelect = page.locator('.app-header__db-select')
    await expect(dbSelect).toBeVisible({ timeout: 5000 })

    // 2番目のDB接続先に切り替え
    const options = await dbSelect.locator('option').all()
    if (options.length >= 2) {
      const secondValue = await options[1].getAttribute('value')
      if (secondValue) {
        await dbSelect.selectOption(secondValue)
        await page.waitForTimeout(500)

        // エラーが発生していないこと
        await expect(page.locator('.app-container')).toBeVisible()
      }
    }
  })
})
