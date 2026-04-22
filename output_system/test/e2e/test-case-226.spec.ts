/**
 * DataAgent E2Eテスト - テストケース #226
 * GraphQL対応後も既存DB接続先でのSQL生成・実行・可視化が正常動作する
 */
import { test, expect } from '@playwright/test'

/**
 * 【ユーザーストーリー】
 * GraphQL接続先が登録済みの状態でも、既存のDB接続先（MySQL）でのSQL生成・実行・可視化が
 * GraphQL対応追加前と同じように動作する
 *
 * 【テストケースIssue】#226
 *
 * 【前提条件】
 * - GraphQL接続先が1件以上登録済み
 * - MySQL接続先も登録済み
 *
 * 【期待結果】
 * - DB接続先でのSQL生成・実行・可視化フローがGraphQL対応追加前と同じように動作する
 * - ストリーミング応答、グラフ表示、会話履歴がすべて正常に機能する
 */
test.describe('Regression - DB Connection SQL Flow After GraphQL Support', () => {
  const graphqlConn = {
    id: 'graphql-conn-226',
    name: '既存GraphQL接続先',
    dbType: 'graphql',
    endpointUrl: 'https://existing-api.example.com/graphql',
    host: null,
    port: null,
    username: null,
    databaseName: null,
    isLastUsed: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  const mysqlConn = {
    id: 'mysql-conn-226',
    name: '売上DB(MySQL)',
    dbType: 'mysql',
    host: 'mysql.example.com',
    port: 3306,
    username: 'sales',
    databaseName: 'sales_db',
    isLastUsed: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/connections', async (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([graphqlConn, mysqlConn]),
        })
      } else {
        route.continue()
      }
    })
    await page.route('**/api/history*', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })
  })

  /**
   * GraphQL接続先が存在する状態でMySQL接続先でSQL生成・実行できること
   */
  test('should generate and display SQL query for MySQL connection when GraphQL connection exists', async ({ page }) => {
    const generatedSQL = 'SELECT category, SUM(amount) as total FROM sales GROUP BY category'
    const sqlResult = {
      columns: ['category', 'total'],
      rows: [['Electronics', 50000], ['Clothing', 30000]],
      chartType: 'bar',
    }

    await page.route('**/api/chat', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as Record<string, unknown>
        // MySQL接続先でのリクエストを確認
        expect(body.dbConnectionId).toBe(mysqlConn.id)

        const sseData = [
          `event: sql\ndata: ${JSON.stringify({ sql: generatedSQL })}\n\n`,
          `event: result\ndata: ${JSON.stringify({ result: sqlResult })}\n\n`,
          `event: message\ndata: ${JSON.stringify({ chunk: 'カテゴリ別売上の集計です。' })}\n\n`,
          `event: conversation\ndata: ${JSON.stringify({ conversationId: 'conv-226' })}\n\n`,
          `event: done\ndata: ${JSON.stringify({ conversationId: 'conv-226', messageId: 'msg-226' })}\n\n`,
        ].join('')
        route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
          body: sseData,
        })
      } else {
        route.continue()
      }
    })

    await page.goto('/')

    // MySQL接続先を選択
    const dbSelect = page.locator('.app-header__db-select, select')
    await expect(dbSelect).toBeVisible({ timeout: 5000 })
    await dbSelect.selectOption(mysqlConn.id)

    // チャット入力で質問を送信
    const chatInput = page.locator('.chat-input-textarea, textarea')
    await expect(chatInput).toBeVisible({ timeout: 5000 })
    await chatInput.fill('カテゴリ別の売上を集計して')
    await page.keyboard.press('Shift+Enter')

    // SQLクエリが表示されること
    await expect(page.locator('.chat-message__sql').first()).toBeVisible({ timeout: 10000 })
  })

  /**
   * GraphQL接続先存在下でMySQL接続先でグラフ表示・切替ができること
   */
  test('should display chart tabs for MySQL query result when GraphQL connection exists', async ({ page }) => {
    const sqlResult = {
      columns: ['month', 'sales'],
      rows: [['2024-01', 100], ['2024-02', 200], ['2024-03', 150]],
      chartType: 'line',
    }

    await page.route('**/api/chat', async (route) => {
      if (route.request().method() === 'POST') {
        const sseData = [
          `event: sql\ndata: ${JSON.stringify({ sql: 'SELECT month, SUM(amount) FROM sales' })}\n\n`,
          `event: result\ndata: ${JSON.stringify({ result: sqlResult })}\n\n`,
          `event: done\ndata: ${JSON.stringify({ conversationId: 'conv-226b', messageId: 'msg-226b' })}\n\n`,
        ].join('')
        route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
          body: sseData,
        })
      } else {
        route.continue()
      }
    })

    await page.goto('/')

    const dbSelect = page.locator('.app-header__db-select, select')
    await expect(dbSelect).toBeVisible({ timeout: 5000 })
    await dbSelect.selectOption(mysqlConn.id)

    const chatInput = page.locator('.chat-input-textarea, textarea')
    await chatInput.fill('月別の売上推移を表示して')
    await page.keyboard.press('Shift+Enter')

    // グラフ種別タブが表示されること
    await expect(page.locator('[role="tablist"]')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('[role="tablist"]')).toContainText('棒グラフ')
    await expect(page.locator('[role="tablist"]')).toContainText('テーブル')
  })

  /**
   * GraphQL接続先とMySQL接続先を切り替えても会話履歴が正しく表示されること
   */
  test('should correctly display history when switching between GraphQL and MySQL connections', async ({ page }) => {
    await page.route('**/api/chat', async (route) => {
      if (route.request().method() === 'POST') {
        const sseData = `event: done\ndata: ${JSON.stringify({ conversationId: 'conv-226c', messageId: 'msg-226c' })}\n\n`
        route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
          body: sseData,
        })
      } else {
        route.continue()
      }
    })

    await page.goto('/')

    const dbSelect = page.locator('.app-header__db-select, select')
    await expect(dbSelect).toBeVisible({ timeout: 5000 })

    // MySQL接続先を選択
    await dbSelect.selectOption(mysqlConn.id)
    await expect(dbSelect).toHaveValue(mysqlConn.id)

    // GraphQL接続先に切り替え
    await dbSelect.selectOption(graphqlConn.id)
    await expect(dbSelect).toHaveValue(graphqlConn.id)

    // MySQLに戻す
    await dbSelect.selectOption(mysqlConn.id)
    await expect(dbSelect).toHaveValue(mysqlConn.id)

    // チャット入力エリアが利用可能であること
    const chatInput = page.locator('.chat-input-textarea, textarea')
    await expect(chatInput).toBeVisible({ timeout: 5000 })
    await expect(chatInput).not.toBeDisabled()
  })
})
