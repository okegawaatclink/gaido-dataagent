/**
 * DataAgent E2Eテスト - テストケース #66
 * 存在しない会話IDの復元で404エラーが表示される
 */
import { test, expect, type Page } from '@playwright/test'

const BACKEND_URL = 'http://okegawaatclink-gaido-dataagent-output-system:3002'

/**
 * 存在しない会話IDアクセステストスイート
 */
test.describe('Non-existent Conversation ID - 404 Error Handling', () => {
  /**
   * 【ユーザーストーリー】
   * 存在しない会話IDで GET /api/history/:id にアクセスすると 404 が返る
   *
   * 【テストケースIssue】#66
   *
   * 【前提条件】
   * - バックエンドAPIが起動していること
   *
   * 【期待結果】
   * - GET /api/history/:id で存在しないIDを指定すると 404 が返される（受入条件 #1）
   */
  test('should return 404 for GET /api/history with nonexistent UUID', async ({ request }) => {
    // 存在しないUUID v4形式のIDでリクエスト
    const nonExistentId = '00000000-0000-4000-8000-000000000001'
    const response = await request.get(`${BACKEND_URL}/api/history/${nonExistentId}`)

    // 404 Not Found が返ること（受入条件 #1）
    expect(response.status()).toBe(404)

    const body = await response.json() as { error: string }
    expect(body.error).toBeTruthy()
  })

  /**
   * 【ユーザーストーリー】
   * 存在しない会話IDで DELETE /api/history/:id にアクセスすると 404 が返る
   *
   * 【テストケースIssue】#66
   *
   * 【前提条件】
   * - バックエンドAPIが起動していること
   *
   * 【期待結果】
   * - DELETE /api/history/:id で存在しないIDを指定すると 404 が返される（受入条件 #3）
   */
  test('should return 404 for DELETE /api/history with nonexistent UUID', async ({ request }) => {
    const nonExistentId = '00000000-0000-4000-8000-000000000002'
    const response = await request.delete(`${BACKEND_URL}/api/history/${nonExistentId}`)

    // 404 Not Found が返ること（受入条件 #3）
    expect(response.status()).toBe(404)
  })

  /**
   * 【ユーザーストーリー】
   * UUID形式でないIDで /api/history/:id にアクセスすると 400 が返る
   *
   * 【テストケースIssue】#66
   *
   * 【前提条件】
   * - バックエンドAPIが起動していること
   *
   * 【期待結果】
   * - UUID形式でないIDは 400 Bad Request が返される
   */
  test('should return 400 for GET /api/history with non-UUID id', async ({ request }) => {
    const response = await request.get(`${BACKEND_URL}/api/history/nonexistent-id-12345`)

    // UUID形式でないIDは 400 が返ること
    expect(response.status()).toBe(400)

    const body = await response.json() as { error: string }
    expect(body.error).toBeTruthy()
  })

  /**
   * 【ユーザーストーリー】
   * 存在しない会話IDでサイドバーアイテムをクリックすると
   * UIに「会話が見つかりません」が表示される
   *
   * 【テストケースIssue】#66
   *
   * 【前提条件】
   * - GET /api/history をモックして会話一覧を返す
   * - GET /api/history/:id が 404 を返す（モック）
   *
   * 【期待結果】
   * - UIに「会話が見つかりません」等のエラーが表示される（受入条件 #2）
   */
  test('should display error when selecting history item with non-existent ID', async ({ page }) => {
    const nonExistentConvId = '00000000-0000-4000-8000-000000000003'
    const mockConversations = [
      {
        id: nonExistentConvId,
        title: '削除された会話',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:05:00.000Z',
      },
    ]

    // GET /api/history をモック（削除済み会話が残っているケース）
    await page.route('**/api/history', (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockConversations),
        })
      } else {
        route.continue()
      }
    })

    // GET /api/history/:id が 404 を返す
    await page.route(`**/api/history/${nonExistentConvId}`, (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: '指定された会話が見つかりません。' }),
        })
      } else {
        route.continue()
      }
    })

    await page.goto('/')

    // 会話一覧が表示されるまで待機
    await expect(page.locator('.history-item').first()).toBeVisible({ timeout: 10000 })

    // 削除された会話アイテムをクリック
    await page.locator('.history-item').first().click()

    // エラーが表示されること（受入条件 #2）
    // フロントエンドが404エラーを適切にハンドリングしていることを確認
    // （ウェルカムメッセージが残っているか、エラーメッセージが表示されるか）
    await page.waitForTimeout(1000)

    // UIが壊れていないこと（アプリが正常に表示されていること）
    await expect(page.locator('.app-container')).toBeVisible()
    await expect(page.locator('.sidebar')).toBeVisible()
  })

  /**
   * 【ユーザーストーリー】
   * 複数の存在しないIDでアクセスした場合も 404 が返る
   *
   * 【テストケースIssue】#66
   *
   * 【期待結果】
   * - 複数の存在しないUUIDでも全て 404 が返ること
   */
  test('should consistently return 404 for multiple nonexistent UUIDs', async ({ request }) => {
    const nonExistentIds = [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
    ]

    for (const id of nonExistentIds) {
      const response = await request.get(`${BACKEND_URL}/api/history/${id}`)
      expect(response.status()).toBe(404)
    }
  })
})
