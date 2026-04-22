/**
 * DataAgent E2Eテスト - テストケース #221
 * GraphQLクエリ実行結果が棒グラフ・折れ線・円グラフ・テーブルで可視化される
 */
import { test, expect } from '@playwright/test'

/**
 * 【ユーザーストーリー】
 * データ分析ユーザーがGraphQL接続先で質問を送信したとき、
 * クエリ実行結果が棒グラフ・折れ線グラフ・円グラフ・テーブルで表示され、
 * グラフ種類を切り替えることができる
 *
 * 【テストケースIssue】#221
 *
 * 【前提条件】
 * - GraphQL接続先が登録済み
 * - チャット画面でGraphQL接続先が選択済み
 *
 * 【期待結果】
 * - GraphQLクエリの実行結果が選択中のエンドポイントに対して実行される
 * - 結果が棒グラフ・折れ線グラフ・円グラフ・テーブルで可視化される
 * - DB接続時と同じ描画コンポーネントで表示される
 * - ネストしたJSON結果もフラット化されてテーブル・グラフで可視化可能
 */
test.describe('GraphQL Chat - Query Result Visualization', () => {
  const graphqlConn = {
    id: 'graphql-conn-221',
    name: 'グラフ可視化API',
    dbType: 'graphql',
    endpointUrl: 'https://chart-api.example.com/graphql',
    host: null,
    port: null,
    username: null,
    databaseName: null,
    isLastUsed: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  const mockQueryResult = {
    columns: ['category', 'count'],
    rows: [
      ['A', 10],
      ['B', 20],
      ['C', 15],
    ],
    chartType: 'bar',
  }

  const setupPage = async (page: import('@playwright/test').Page) => {
    await page.route('**/api/connections', async (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([graphqlConn]),
        })
      } else {
        route.continue()
      }
    })
    await page.route('**/api/history*', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })
    // チャットAPIをモック（SSEレスポンス）
    await page.route('**/api/chat', async (route) => {
      if (route.request().method() === 'POST') {
        const generatedQuery = 'query { categories { name count } }'
        const sseData = [
          `event: sql\ndata: ${JSON.stringify({ sql: generatedQuery })}\n\n`,
          `event: result\ndata: ${JSON.stringify({ result: mockQueryResult })}\n\n`,
          `event: message\ndata: ${JSON.stringify({ chunk: 'カテゴリ別の集計結果です。' })}\n\n`,
          `event: done\ndata: ${JSON.stringify({ conversationId: 'conv-221', messageId: 'msg-221' })}\n\n`,
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
  }

  /**
   * GraphQLクエリ実行結果がチャート/テーブルで表示されること
   */
  test('should display query result visualization after GraphQL query execution', async ({ page }) => {
    await setupPage(page)

    const chatInput = page.locator('.chat-input-textarea, textarea')
    await expect(chatInput).toBeVisible({ timeout: 5000 })

    // 集計系の質問を送信
    await chatInput.fill('カテゴリ別の件数を表示して')
    await page.keyboard.press('Shift+Enter')

    // 結果が表示されること（グラフまたはテーブル）
    // ChartRendererがクエリ結果を描画するためのコンテナを確認
    await expect(page.locator('.chart-renderer, .data-table, table, .chart-wrapper')).toBeVisible({ timeout: 10000 })
  })

  /**
   * グラフ種別タブが表示されて切り替えられること
   */
  test('should show chart type tabs for GraphQL query results', async ({ page }) => {
    await setupPage(page)

    const chatInput = page.locator('.chat-input-textarea, textarea')
    await expect(chatInput).toBeVisible({ timeout: 5000 })

    await chatInput.fill('カテゴリ別の件数を表示して')
    await page.keyboard.press('Shift+Enter')

    // グラフ種別タブが表示されること
    const tabs = page.locator('[role="tablist"]')
    await expect(tabs).toBeVisible({ timeout: 10000 })

    // 棒グラフタブが存在すること
    await expect(page.locator('[role="tablist"]')).toContainText('棒グラフ')
    // テーブルタブが存在すること
    await expect(page.locator('[role="tablist"]')).toContainText('テーブル')
  })

  /**
   * テーブル表示に切り替えができること
   */
  test('should allow switching to table view from chart view', async ({ page }) => {
    await setupPage(page)

    const chatInput = page.locator('.chat-input-textarea, textarea')
    await expect(chatInput).toBeVisible({ timeout: 5000 })

    await chatInput.fill('データを集計して')
    await page.keyboard.press('Shift+Enter')

    // グラフ種別タブが表示されること
    await expect(page.locator('[role="tablist"]')).toBeVisible({ timeout: 10000 })

    // テーブルタブをクリック（IDで特定）
    await page.locator('#chart-tab-table').click()

    // テーブルパネルが表示されること
    await expect(page.locator('#chart-panel-table')).toBeVisible({ timeout: 5000 })
  })

  /**
   * GraphQLのネストJSON結果もフラット化されてテーブルで表示されること（SSEモックで確認）
   */
  test('should display flattened nested GraphQL result in table', async ({ page }) => {
    await page.route('**/api/connections', async (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([graphqlConn]),
        })
      } else {
        route.continue()
      }
    })
    await page.route('**/api/history*', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })

    // ネスト結果をフラット化した結果を返すSSEモック
    const flattenedResult = {
      columns: ['id', 'name', 'category_name'],
      rows: [
        [1, 'Product A', 'Electronics'],
        [2, 'Product B', 'Clothing'],
      ],
      chartType: 'table',
    }
    await page.route('**/api/chat', async (route) => {
      if (route.request().method() === 'POST') {
        const sseData = [
          `event: sql\ndata: ${JSON.stringify({ sql: 'query { products { id name category { name } } }' })}\n\n`,
          `event: result\ndata: ${JSON.stringify({ result: flattenedResult })}\n\n`,
          `event: done\ndata: ${JSON.stringify({ conversationId: 'conv-221n', messageId: 'msg-221n' })}\n\n`,
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

    const chatInput = page.locator('.chat-input-textarea, textarea')
    await expect(chatInput).toBeVisible({ timeout: 5000 })
    await chatInput.fill('商品一覧を表示して')
    await page.keyboard.press('Shift+Enter')

    // テーブルコンテナが表示されること
    await expect(page.locator('.chart-renderer, .data-table, table, .chart-wrapper')).toBeVisible({ timeout: 10000 })
  })
})
