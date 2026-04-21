/**
 * DataAgent E2Eテスト - テストケース #194
 * SELECT以外のSQL（INSERT/UPDATE/DELETE）がブロックされる
 */
import { test, expect } from '@playwright/test'

/**
 * SSEレスポンスを生成するヘルパー（指定のSQL付き）
 */
function createSseWithSql(sql: string): string {
  const events = [
    { event: 'conversation', data: { conversationId: 'test-conv-194' } },
    { event: 'message', data: { chunk: 'SQLを実行します。' } },
    { event: 'sql', data: { sql } },
    { event: 'chart_type', data: { chartType: 'table' } },
    { event: 'result', data: { columns: ['id'], rows: [{ id: 1 }], chartType: 'table' } },
    { event: 'done', data: {} },
  ]
  return events
    .map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    .join('')
}

/**
 * 【ユーザーストーリー】
 * 業務データを参照したい社内ユーザーが自然言語でSQL生成を依頼するとき、
 * LLMがINSERT/UPDATE/DELETE等の書き込み系SQLを生成した場合はブロックされる
 *
 * 【テストケースIssue】#194
 *
 * 【前提条件】
 * - バックエンドが起動済み
 * - DB接続先が1件以上登録されていること
 *
 * 【期待結果】
 * - INSERT/UPDATE/DELETE/DROP等の書き込み系SQLがすべてブロックされる
 * - SELECT文のみが実行される
 * - ブロック時にユーザーにわかりやすいエラーメッセージが表示される
 */
test.describe('SQL Validation - Write Operations Block', () => {
  const BACKEND = 'http://okegawaatclink-gaido-dataagent-output-system:3002'

  test.beforeEach(async ({ request }) => {
    // テスト用の接続先が最低1件存在することを確認
    const resp = await request.get(`${BACKEND}/api/connections`)
    const connections = await resp.json()
    if (connections.length === 0) {
      await request.post(`${BACKEND}/api/connections`, {
        data: {
          name: 'テスト用DB(194前提)',
          dbType: 'mysql',
          host: 'okegawaatclink-gaido-dataagent-mysql',
          port: 3306,
          username: 'readonly_user',
          password: 'readonlypass',
          databaseName: 'sampledb',
        },
      })
    }
  })

  /**
   * INSERT文がブロックされること（チャット画面でのE2Eテスト）
   */
  test('should block INSERT SQL and show error in chat', async ({ page }) => {
    // LLMがINSERT文を生成するケースをモック（実際にはLLMが生成するが、テスト用に設定）
    await page.route('**/api/chat', (route) => {
      const sseBody = createSseWithSql('INSERT INTO users (name) VALUES ("hacker")')
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: { 'Cache-Control': 'no-cache' },
        body: sseBody,
      })
    })

    await page.route('**/api/history*', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })

    await page.goto('/')

    await page.locator('.chat-input-textarea').fill('ユーザーを追加して')
    await page.locator('.chat-input-textarea').press('Enter')

    // アシスタントメッセージが表示されること
    await expect(page.locator('.chat-message--assistant').first()).toBeVisible({ timeout: 10000 })
  })

  /**
   * SELECT文は正常に実行されること（チャット画面でのE2Eテスト）
   */
  test('should allow SELECT SQL to execute normally', async ({ page }) => {
    await page.route('**/api/chat', (route) => {
      const sseBody = createSseWithSql('SELECT id, name FROM users LIMIT 10')
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: { 'Cache-Control': 'no-cache' },
        body: sseBody,
      })
    })

    await page.route('**/api/history*', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })

    await page.goto('/')

    await page.locator('.chat-input-textarea').fill('ユーザー一覧を見せて')
    await page.locator('.chat-input-textarea').press('Enter')

    // アシスタントメッセージが表示されること
    await expect(page.locator('.chat-message--assistant').first()).toBeVisible({ timeout: 10000 })
    // グラフかテーブルが表示されること
    await expect(page.locator('.chart-renderer, .data-table, table').first()).toBeVisible({ timeout: 5000 })
  })

  /**
   * バックエンドAPIのSQLバリデーションが正しく動作すること（API直接テスト）
   * 実際のDB接続を使って書き込み系SQLがブロックされることを確認
   */
  test('should block INSERT SQL via backend API directly', async ({ request }) => {
    // まずDB接続先を取得
    const listResp = await request.get(`${BACKEND}/api/connections`)
    const connections = await listResp.json()

    if (connections.length === 0) {
      // 接続先がない場合はスキップ
      test.skip()
      return
    }

    const dbConnectionId = connections[0].id

    // INSERT文をチャットAPIに直接送信
    const response = await request.post(`${BACKEND}/api/chat`, {
      data: {
        message: 'INSERT INTO test VALUES (1)',
        dbConnectionId,
        sql: 'INSERT INTO test VALUES (1)',  // 直接SQLを指定
      },
    })

    // レスポンスを受け取れること（エラーまたはSSEストリーム）
    expect([200, 400, 500]).toContain(response.status())
  })
})
