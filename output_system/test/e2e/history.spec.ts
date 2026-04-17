/**
 * DataAgent E2Eテスト - 履歴機能（一覧→選択→削除）
 *
 * このファイルでは PBI #13 の会話履歴機能の E2E テストを行う。
 *
 * テスト方針（Task 4.2.3）:
 * - バックエンドの /api/chat / /api/history / DELETE /api/history/:id を
 *   Playwright の route interceptor でモックする
 * - これにより再現性が高く、DBの事前データ準備が不要なテストを実現する
 *
 * テスト範囲（PBI #13 受入条件）:
 * 1. サイドバーに会話一覧が更新日時降順で表示されること（受入条件 #1）
 * 2. 履歴アイテムをクリックすると会話がチャットエリアに復元されること（受入条件 #2）
 * 3. 削除操作で DELETE /api/history/:id が呼ばれ一覧から消えること（受入条件 #3）
 * 4. 新規会話ボタンで空のチャットエリアに遷移できること（受入条件 #4）
 * 5. 検索ボックスで履歴タイトルを部分一致フィルタできること
 *
 * 実行前提:
 * - `docker compose up -d` でフロントエンドコンテナが起動していること
 * - AIエージェントコンテナからコンテナ名でアクセスできること
 */
import { test, expect, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// テスト用定数・フィクスチャ
// ---------------------------------------------------------------------------

/**
 * テスト用の会話サマリーデータ（GET /api/history のレスポンス）
 */
const MOCK_CONVERSATIONS = [
  {
    id: '550e8400-e29b-41d4-a716-000000000001',
    title: '今月の売上データを教えて',
    createdAt: '2024-01-02T10:00:00.000Z',
    updatedAt: '2024-01-02T10:05:00.000Z',
  },
  {
    id: '550e8400-e29b-41d4-a716-000000000002',
    title: '部門別の従業員数は？',
    createdAt: '2024-01-01T09:00:00.000Z',
    updatedAt: '2024-01-01T09:02:00.000Z',
  },
]

/**
 * テスト用の会話詳細データ（GET /api/history/:id のレスポンス）
 */
const MOCK_CONVERSATION_DETAIL = {
  id: '550e8400-e29b-41d4-a716-000000000001',
  title: '今月の売上データを教えて',
  createdAt: '2024-01-02T10:00:00.000Z',
  updatedAt: '2024-01-02T10:05:00.000Z',
  messages: [
    {
      id: 'msg-001',
      role: 'user',
      content: '今月の売上データを教えて',
      sql: null,
      chartType: null,
      queryResult: null,
      error: null,
      createdAt: '2024-01-02T10:00:00.000Z',
    },
    {
      id: 'msg-002',
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

// ---------------------------------------------------------------------------
// テスト用ヘルパー
// ---------------------------------------------------------------------------

/**
 * SSEレスポンスを生成するヘルパー
 * バックエンドの sendSseEvent フォーマットに準拠する
 *
 * @param events - {event, data} 形式のイベント配列
 * @returns SSEレスポンス文字列
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
 * GET /api/history を指定した会話一覧でモックする
 *
 * @param page - Playwright Page オブジェクト
 * @param conversations - モックするレスポンスデータ
 */
async function mockHistoryList(
  page: Page,
  conversations: typeof MOCK_CONVERSATIONS,
): Promise<void> {
  await page.route('**/api/history', (route) => {
    // DELETE メソッドはパスさせる（削除用のルートは別途設定）
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(conversations),
      })
    } else {
      // GET 以外（この段階では発生しないはず）はパス
      route.continue()
    }
  }, { times: 1 })  // 1回だけ適用（以降のリフレッシュリクエストは別途設定）
}

/**
 * 複数回のGET /api/history リクエストを制御するモックを設定する
 *
 * @param page - Playwright Page オブジェクト
 * @param responsesList - 順番に返すレスポンスのリスト
 */
async function mockHistoryListSequence(
  page: Page,
  responsesList: Array<typeof MOCK_CONVERSATIONS>,
): Promise<void> {
  let callCount = 0
  await page.route('**/api/history', (route) => {
    if (route.request().method() === 'GET') {
      const index = Math.min(callCount, responsesList.length - 1)
      callCount++
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(responsesList[index]),
      })
    } else {
      route.continue()
    }
  })
}

/**
 * GET /api/history/:id を指定した会話詳細でモックする
 *
 * @param page - Playwright Page オブジェクト
 * @param detail - モックするレスポンスデータ
 */
async function mockHistoryDetail(
  page: Page,
  detail: typeof MOCK_CONVERSATION_DETAIL,
): Promise<void> {
  await page.route(`**/api/history/${detail.id}`, (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(detail),
      })
    } else if (route.request().method() === 'DELETE') {
      route.fulfill({ status: 204, body: '' })
    } else {
      route.continue()
    }
  })
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

/**
 * 履歴機能 E2E テストスイート
 */
test.describe('履歴機能 - 一覧・選択・削除', () => {
  /**
   * 【ユーザーストーリー】
   * サイドバーにバックエンドから取得した会話一覧が表示される
   *
   * 【前提条件】
   * - GET /api/history をモックして会話データを返す
   *
   * 【期待結果】
   * - サイドバーの基本要素（新しい会話ボタン、検索ボックス）が表示されること
   * - 会話一覧が表示されること（受入条件 #1）
   * - 会話タイトルが表示されること
   */
  test('should display sidebar with history list from API', async ({ page }) => {
    // Arrange: GET /api/history をモック
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

    // Assert: サイドバーの基本要素が表示されること
    await expect(page.locator('.sidebar-new-chat-btn')).toBeVisible()
    await expect(page.locator('.sidebar-search-input')).toBeVisible()

    // Assert: 会話一覧が表示されること（受入条件 #1）
    await expect(page.locator('.history-item')).toHaveCount(2, { timeout: 10000 })
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
   * 【前提条件】
   * - GET /api/history をモックして会話一覧を返す
   * - GET /api/history/:id をモックして会話詳細を返す
   *
   * 【期待結果】
   * - 履歴アイテムクリック後、チャットエリアに過去のメッセージが表示されること（受入条件 #2）
   * - ユーザーメッセージが表示されること
   * - アシスタントメッセージが表示されること
   * - 選択したアイテムがアクティブ状態でハイライトされること
   */
  test('should restore conversation in chat area when history item is clicked', async ({ page }) => {
    // Arrange: GET /api/history と GET /api/history/:id をモック
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
    await mockHistoryDetail(page, MOCK_CONVERSATION_DETAIL)

    await page.goto('/')

    // 会話一覧が表示されるまで待機
    await expect(page.locator('.history-item').first()).toBeVisible({ timeout: 10000 })

    // Act: 最初の会話アイテムをクリック（受入条件 #2）
    await page.locator('.history-item').first().click()

    // Assert: チャットエリアにユーザーメッセージが復元されること
    await expect(page.locator('.chat-message--user').first()).toBeVisible({ timeout: 10000 })
    await expect(
      page.locator('.chat-message--user .chat-message__text').first()
    ).toContainText('今月の売上データを教えて')

    // Assert: アシスタントメッセージが表示されること
    await expect(page.locator('.chat-message--assistant').first()).toBeVisible()
    await expect(
      page.locator('.chat-message--assistant .chat-message__text').first()
    ).toContainText('以下のSQLを生成しました。')

    // Assert: 選択したアイテムがアクティブ状態になること
    await expect(page.locator('.history-item').first()).toHaveClass(/history-item--active/)
  })

  /**
   * 【ユーザーストーリー】
   * 削除ボタンをクリックして確認後、会話が一覧から消える
   *
   * 【前提条件】
   * - GET /api/history をモックして会話一覧を返す
   * - DELETE /api/history/:id をモックして 204 を返す
   * - 削除後の GET /api/history は1件少ない一覧を返す
   *
   * 【期待結果】
   * - 削除後に一覧から該当会話が消えること（受入条件 #3）
   */
  test('should remove conversation from list after delete', async ({ page }) => {
    // Arrange: 削除後のレスポンスは1件少ない
    const afterDeleteConversations = [MOCK_CONVERSATIONS[1]]  // 2件目のみ残す
    let historyCallCount = 0

    await page.route('**/api/history', (route) => {
      if (route.request().method() === 'GET') {
        // 初回は2件、リフレッシュ後は1件を返す
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

    // DELETE /api/history/:id をモック
    await page.route(`**/api/history/${MOCK_CONVERSATIONS[0].id}`, (route) => {
      if (route.request().method() === 'DELETE') {
        route.fulfill({ status: 204, body: '' })
      } else {
        route.continue()
      }
    })

    await page.goto('/')

    // 会話一覧が表示されるまで待機
    await expect(page.locator('.history-item')).toHaveCount(2, { timeout: 10000 })

    // 確認ダイアログを自動的に承認するリスナーを設定
    page.once('dialog', (dialog) => dialog.accept())

    // Act: 最初の会話アイテムの削除ボタンをクリック（ホバーして表示させる）
    const firstItem = page.locator('.history-item').first()
    await firstItem.hover()
    await firstItem.locator('.history-item__delete-btn').click()

    // Assert: 削除後に一覧から消えること（受入条件 #3）
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
   * 【前提条件】
   * - GET /api/history をモックして会話一覧を返す
   * - GET /api/history/:id をモックして会話詳細を返す（会話復元後にクリアする）
   *
   * 【期待結果】
   * - 新しい会話ボタンクリック後、ウェルカムメッセージが表示されること（受入条件 #4）
   * - チャットメッセージが消えること
   * - 履歴は削除されず残っていること
   */
  test('should clear chat area when new chat button is clicked', async ({ page }) => {
    // Arrange
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
    await mockHistoryDetail(page, MOCK_CONVERSATION_DETAIL)

    await page.goto('/')

    // 履歴から会話を選択して復元
    await expect(page.locator('.history-item').first()).toBeVisible({ timeout: 10000 })
    await page.locator('.history-item').first().click()

    // メッセージが表示されていることを確認
    await expect(page.locator('.chat-message--user').first()).toBeVisible({ timeout: 10000 })

    // Act: 新しい会話ボタンをクリック（受入条件 #4）
    await page.locator('.sidebar-new-chat-btn').click()

    // Assert: ウェルカムメッセージが表示されること
    await expect(page.locator('.chat-welcome')).toBeVisible({ timeout: 5000 })

    // Assert: 以前のメッセージが消えていること
    await expect(page.locator('.chat-message--user')).not.toBeVisible()

    // Assert: サイドバーの履歴は残っていること（受入条件 #4: 「履歴は残す」）
    await expect(page.locator('.history-item')).toHaveCount(2)
  })

  /**
   * 【ユーザーストーリー】
   * 検索ボックスで履歴タイトルを部分一致フィルタできる
   *
   * 【前提条件】
   * - GET /api/history をモックして2件の会話一覧を返す
   *
   * 【期待結果】
   * - 検索クエリに一致する会話のみ表示されること
   * - 一致しない会話は非表示になること
   * - 検索クエリをクリアすると全件表示に戻ること
   */
  test('should filter history items by search query', async ({ page }) => {
    // Arrange
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

    // Act: 検索ボックスに「売上」を入力
    const searchInput = page.locator('.sidebar-search-input')
    await searchInput.fill('売上')

    // Assert: 「売上」を含む会話のみ表示されること
    await expect(
      page.locator('.history-item').filter({ hasText: '今月の売上データを教えて' })
    ).toBeVisible()

    // 「部門別の従業員数は？」は表示されないこと
    await expect(
      page.locator('.history-item').filter({ hasText: '部門別の従業員数は？' })
    ).not.toBeVisible()

    // Act: 検索クリア
    await searchInput.fill('')

    // Assert: 全件表示に戻ること
    await expect(page.locator('.history-item')).toHaveCount(2)
    await expect(
      page.locator('.history-item').filter({ hasText: '今月の売上データを教えて' })
    ).toBeVisible()
    await expect(
      page.locator('.history-item').filter({ hasText: '部門別の従業員数は？' })
    ).toBeVisible()
  })

  /**
   * 【ユーザーストーリー】
   * API エラー発生時はサイドバーにエラーメッセージが表示される
   *
   * 【前提条件】
   * - GET /api/history が 500 エラーを返す（モック）
   *
   * 【期待結果】
   * - エラーメッセージが表示されること
   * - サイドバーの基本要素は表示されたままであること
   */
  test('should display error message when history API fails', async ({ page }) => {
    // Arrange: GET /api/history が 500 エラーを返す
    await page.route('**/api/history', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
      })
    })

    await page.goto('/')

    // Assert: エラーメッセージが表示されること
    await expect(page.locator('.sidebar-history-error')).toBeVisible({ timeout: 10000 })

    // Assert: 新しい会話ボタンはまだ表示されていること
    await expect(page.locator('.sidebar-new-chat-btn')).toBeVisible()
  })

  /**
   * 【ユーザーストーリー】
   * チャット送信完了後に履歴が自動リフレッシュされる
   *
   * 【前提条件】
   * - GET /api/history をモック（初回は0件、リフレッシュ後は1件を返す）
   * - POST /api/chat をモック（SSEレスポンス）
   *
   * 【期待結果】
   * - チャット送信後、サイドバーに新しい会話が追加されること
   */
  test('should auto-refresh history sidebar after chat message is sent', async ({ page }) => {
    // Arrange: 1回目は空、2回目以降は1件を返す
    let historyCallCount = 0
    const newConversation = {
      id: '550e8400-e29b-41d4-a716-000000000099',
      title: '今月の売上を教えて',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    await page.route('**/api/history', (route) => {
      if (route.request().method() === 'GET') {
        const response = historyCallCount === 0 ? [] : [newConversation]
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

    // チャット API をモック
    const sseBody = createSseResponse([
      { event: 'conversation', data: { conversationId: newConversation.id } },
      { event: 'message', data: { chunk: 'SQL を生成しました。' } },
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

    // 初期状態: 履歴が0件
    await page.waitForTimeout(500)
    await expect(page.locator('.sidebar-history-empty')).toBeVisible()

    // Act: チャットを送信
    await page.locator('.chat-input-textarea').fill('今月の売上を教えて')
    await page.locator('.chat-input-textarea').press('Enter')

    // チャット完了を待つ
    await expect(
      page.locator('.chat-message--assistant .chat-message__text').first()
    ).toContainText('SQL を生成しました。', { timeout: 10000 })

    // Assert: 履歴が自動リフレッシュされて新しい会話が表示されること
    await expect(
      page.locator('.history-item').filter({ hasText: '今月の売上を教えて' })
    ).toBeVisible({ timeout: 10000 })
  })
})
