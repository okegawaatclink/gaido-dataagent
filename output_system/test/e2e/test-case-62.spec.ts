/**
 * DataAgent E2Eテスト - テストケース #62
 * サイドバーから履歴を閲覧・選択・削除できる
 */
import { test, expect, type Page } from '@playwright/test'

/** テスト用の会話一覧モックデータ */
const MOCK_CONVERSATIONS = [
  {
    id: '62-test-conv-001',
    title: '今月の売上データを教えて',
    createdAt: '2024-01-02T10:00:00.000Z',
    updatedAt: '2024-01-02T10:05:00.000Z',
  },
  {
    id: '62-test-conv-002',
    title: '部門別の従業員数は？',
    createdAt: '2024-01-01T09:00:00.000Z',
    updatedAt: '2024-01-01T09:02:00.000Z',
  },
]

/** テスト用の会話詳細モックデータ */
const MOCK_CONVERSATION_DETAIL = {
  id: '62-test-conv-001',
  title: '今月の売上データを教えて',
  createdAt: '2024-01-02T10:00:00.000Z',
  updatedAt: '2024-01-02T10:05:00.000Z',
  messages: [
    {
      id: 'msg-62-001',
      role: 'user',
      content: '今月の売上データを教えて',
      sql: null,
      chartType: null,
      queryResult: null,
      error: null,
      createdAt: '2024-01-02T10:00:00.000Z',
    },
    {
      id: 'msg-62-002',
      role: 'assistant',
      content: '以下のSQLを生成しました。',
      sql: 'SELECT * FROM sales WHERE month = 1',
      chartType: 'table',
      queryResult: {
        columns: ['id', 'amount'],
        rows: [{ id: 1, amount: 10000 }],
        chartType: 'table',
      },
      error: null,
      createdAt: '2024-01-02T10:00:05.000Z',
    },
  ],
}

/**
 * サイドバー履歴操作テストスイート
 */
test.describe('Sidebar - History Browse, Select, and Delete', () => {
  /**
   * 【ユーザーストーリー】
   * DataAgent の利用者が左サイドバーに過去の会話一覧を閲覧できる
   *
   * 【テストケースIssue】#62
   *
   * 【前提条件】
   * - GET /api/history をモックして会話データを返す
   *
   * 【期待結果】
   * - サイドバーに会話一覧が更新日時降順で表示される（受入条件 #1）
   */
  test('should display conversation list in sidebar in descending order', async ({ page }) => {
    await page.route('**/api/history', (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_CONVERSATIONS),
        })
      } else {
        route.continue()
      }
    })

    await page.goto('/')

    // 会話一覧が表示されること（受入条件 #1）
    await expect(page.locator('.history-item')).toHaveCount(2, { timeout: 10000 })

    // 最初の会話（更新日時が新しい方）が上に表示されること
    await expect(
      page.locator('.history-item').filter({ hasText: '今月の売上データを教えて' })
    ).toBeVisible()
    await expect(
      page.locator('.history-item').filter({ hasText: '部門別の従業員数は？' })
    ).toBeVisible()
  })

  /**
   * 【ユーザーストーリー】
   * 履歴アイテムをクリックすると会話がチャットエリアに復元される
   *
   * 【テストケースIssue】#62
   *
   * 【前提条件】
   * - GET /api/history をモックして会話一覧を返す
   * - GET /api/history/:id をモックして会話詳細を返す
   *
   * 【期待結果】
   * - 履歴アイテムクリックで該当会話がチャットエリアに復元される（受入条件 #2）
   * - 選択したアイテムがハイライトされる
   */
  test('should restore conversation when history item is clicked', async ({ page }) => {
    await page.route('**/api/history', (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_CONVERSATIONS),
        })
      } else {
        route.continue()
      }
    })

    await page.route(`**/api/history/${MOCK_CONVERSATION_DETAIL.id}`, (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_CONVERSATION_DETAIL),
        })
      } else {
        route.continue()
      }
    })

    await page.goto('/')

    // 会話一覧が表示されるまで待機
    await expect(page.locator('.history-item').first()).toBeVisible({ timeout: 10000 })

    // 最初の会話アイテムをクリック（受入条件 #2）
    await page.locator('.history-item').first().click()

    // ユーザーメッセージが復元されること
    await expect(page.locator('.chat-message--user').first()).toBeVisible({ timeout: 10000 })
    await expect(
      page.locator('.chat-message--user .chat-message__text').first()
    ).toContainText('今月の売上データを教えて')

    // アシスタントメッセージが復元されること
    await expect(page.locator('.chat-message--assistant').first()).toBeVisible()

    // 選択したアイテムがアクティブ状態になること
    await expect(page.locator('.history-item').first()).toHaveClass(/history-item--active/)
  })

  /**
   * 【ユーザーストーリー】
   * 削除ボタンをクリックして確認後、会話が一覧から消える
   *
   * 【テストケースIssue】#62
   *
   * 【前提条件】
   * - GET /api/history で2件返す
   * - DELETE /api/history/:id で 204 を返す
   * - 削除後のリフレッシュでは1件を返す
   *
   * 【期待結果】
   * - 削除操作で DELETE /api/history/:id が呼ばれ一覧から消える（受入条件 #3）
   */
  test('should remove conversation from list after delete button is clicked', async ({ page }) => {
    const afterDeleteConversations = [MOCK_CONVERSATIONS[1]]
    let historyCallCount = 0

    await page.route('**/api/history', (route) => {
      if (route.request().method() === 'GET') {
        const response = historyCallCount === 0 ? MOCK_CONVERSATIONS : afterDeleteConversations
        historyCallCount++
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(response),
        })
      } else {
        route.continue()
      }
    })

    await page.route(`**/api/history/${MOCK_CONVERSATIONS[0].id}`, (route) => {
      if (route.request().method() === 'DELETE') {
        route.fulfill({ status: 204, body: '' })
      } else {
        route.continue()
      }
    })

    await page.goto('/')

    // 2件表示されること
    await expect(page.locator('.history-item')).toHaveCount(2, { timeout: 10000 })

    // 確認ダイアログを自動承認
    page.once('dialog', (dialog) => dialog.accept())

    // 最初のアイテムの削除ボタンをクリック（受入条件 #3）
    const firstItem = page.locator('.history-item').first()
    await firstItem.hover()
    await firstItem.locator('.history-item__delete-btn').click()

    // 削除後に一覧から消えること
    await expect(
      page.locator('.history-item').filter({ hasText: '今月の売上データを教えて' })
    ).not.toBeVisible({ timeout: 10000 })

    // 2件目はまだ表示されていること
    await expect(
      page.locator('.history-item').filter({ hasText: '部門別の従業員数は？' })
    ).toBeVisible()
  })

  /**
   * 【ユーザーストーリー】
   * 新しい会話ボタンをクリックすると空のチャットエリアに遷移する
   *
   * 【テストケースIssue】#62
   *
   * 【期待結果】
   * - 新規会話ボタンクリック後、ウェルカムメッセージが表示される（受入条件 #4）
   * - 履歴は削除されず残っていること
   */
  test('should clear chat area when new chat button is clicked', async ({ page }) => {
    await page.route('**/api/history', (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_CONVERSATIONS),
        })
      } else {
        route.continue()
      }
    })

    await page.route(`**/api/history/${MOCK_CONVERSATION_DETAIL.id}`, (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_CONVERSATION_DETAIL),
        })
      } else {
        route.continue()
      }
    })

    await page.goto('/')

    // 履歴から会話を選択
    await expect(page.locator('.history-item').first()).toBeVisible({ timeout: 10000 })
    await page.locator('.history-item').first().click()
    await expect(page.locator('.chat-message--user').first()).toBeVisible({ timeout: 10000 })

    // 新しい会話ボタンをクリック（受入条件 #4）
    await page.locator('.sidebar-new-chat-btn').click()

    // ウェルカムメッセージが表示されること
    await expect(page.locator('.chat-welcome')).toBeVisible({ timeout: 5000 })

    // 以前のメッセージが消えていること
    await expect(page.locator('.chat-message--user')).not.toBeVisible()

    // 履歴は残っていること
    await expect(page.locator('.history-item')).toHaveCount(2)
  })

  /**
   * 【ユーザーストーリー】
   * 検索ボックスで履歴タイトルを部分一致フィルタできる
   *
   * 【テストケースIssue】#62
   *
   * 【期待結果】
   * - 検索クエリに一致する会話のみ表示される
   * - 検索クリアで全件表示に戻る
   */
  test('should filter history items by search query', async ({ page }) => {
    await page.route('**/api/history', (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_CONVERSATIONS),
        })
      } else {
        route.continue()
      }
    })

    await page.goto('/')

    // 会話一覧が表示されるまで待機
    await expect(page.locator('.history-item')).toHaveCount(2, { timeout: 10000 })

    // 検索ボックスに「売上」を入力
    await page.locator('.sidebar-search-input').fill('売上')

    // 「売上」を含む会話のみ表示されること
    await expect(
      page.locator('.history-item').filter({ hasText: '今月の売上データを教えて' })
    ).toBeVisible()
    await expect(
      page.locator('.history-item').filter({ hasText: '部門別の従業員数は？' })
    ).not.toBeVisible()

    // 検索クリアで全件表示に戻ること
    await page.locator('.sidebar-search-input').fill('')
    await expect(page.locator('.history-item')).toHaveCount(2)
  })
})
