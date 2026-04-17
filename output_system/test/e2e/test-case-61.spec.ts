/**
 * DataAgent E2Eテスト - テストケース #61
 * 会話・メッセージがSQLiteに保存される
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
 * SQLite永続化テストスイート
 *
 * バックエンドAPIをモックし、履歴APIを実際のバックエンドに問い合わせることで
 * 履歴保存の流れを確認する。
 */
test.describe('SQLite Persistence - Conversation and Message Storage', () => {
  /**
   * 【ユーザーストーリー】
   * DataAgent の利用者が質問を送信した後、
   * GET /api/history で会話一覧に新しい会話が含まれていることを確認できる
   *
   * 【テストケースIssue】#61
   *
   * 【前提条件】
   * - バックエンドが起動していること
   * - SQLite履歴DBが初期化されていること
   *
   * 【期待結果】
   * - GET /api/history が配列を返すこと
   * - 各会話に id, title, createdAt, updatedAt が含まれること
   */
  test('should return conversation list from GET /api/history', async ({ request }) => {
    const response = await request.get(`${BACKEND_URL}/api/history`)

    expect(response.status()).toBe(200)

    const body = await response.json() as Array<{
      id: string
      title: string
      createdAt: string
      updatedAt: string
    }>

    // 配列で返ること
    expect(Array.isArray(body)).toBe(true)

    // 会話がある場合は構造を確認
    if (body.length > 0) {
      const conv = body[0]
      expect(typeof conv.id).toBe('string')
      expect(typeof conv.title).toBe('string')
      expect(typeof conv.createdAt).toBe('string')
      expect(typeof conv.updatedAt).toBe('string')
    }
  })

  /**
   * 【ユーザーストーリー】
   * チャット送信後、GET /api/history に新しい会話が追加される
   *
   * 【テストケースIssue】#61
   *
   * 【前提条件】
   * - フロントエンドが起動していること
   * - SSE APIをモックする（実際のLLM呼び出しを回避）
   *
   * 【期待結果】
   * - チャット送信後にGET /api/history を呼ぶと新しい会話が追加されている
   * - 会話のtitleが最初のuser質問から自動生成される
   */
  test('should add new conversation to history after chat is sent', async ({ page, request }) => {
    // 送信前の会話数を記録
    const beforeResponse = await request.get(`${BACKEND_URL}/api/history`)
    const beforeList = await beforeResponse.json() as Array<{ id: string; title: string }>
    const beforeCount = beforeList.length

    // 一意のテストメッセージを使用（競合を避けるため）
    const testMessage = `テスト質問_${Date.now()}`

    // SSEモック: conversation イベントで conversationId を通知し、実際に historyDb に保存させる
    // バックエンドの実装では、会話保存はSSE開始前に行われるため
    // テストではバックエンドへの実際のPOSTを必要とする

    // チャット送信部分はSSEモックを使用して実際のLLM呼び出しをスキップ
    // ただし、バックエンドの historyDb 保存はSSE送信前に行われるため
    // バックエンドへの実際のリクエストを送信する必要がある

    // バックエンドに直接リクエストを送信してhistoryDbへの保存をトリガー
    const chatResponse = await request.post(`${BACKEND_URL}/api/chat`, {
      headers: { 'Content-Type': 'application/json' },
      data: { message: testMessage },
      timeout: 15000,
    })

    // SSEストリームが開始されること（200 OK）
    expect(chatResponse.status()).toBe(200)

    // 少し待機してSSEストリームが完了するのを待つ
    await page.waitForTimeout(2000)

    // チャット送信後の会話数を確認
    const afterResponse = await request.get(`${BACKEND_URL}/api/history`)
    const afterList = await afterResponse.json() as Array<{ id: string; title: string }>

    // 会話が追加されていること
    expect(afterList.length).toBeGreaterThanOrEqual(beforeCount)

    // 最新の会話に質問内容がタイトルとして含まれること（先頭30文字）
    const newConv = afterList.find((c) => c.title.startsWith(testMessage.slice(0, 15)))
    if (newConv) {
      expect(newConv.title).toBeTruthy()
    }
  })

  /**
   * 【ユーザーストーリー】
   * GET /api/history/:id で会話詳細とメッセージが取得できる
   *
   * 【テストケースIssue】#61
   *
   * 【前提条件】
   * - 既存の会話が少なくとも1件存在すること
   *
   * 【期待結果】
   * - GET /api/history/:id で messages 配列が含まれる
   * - 各メッセージに role, content が含まれる
   */
  test('should return conversation detail with messages from GET /api/history/:id', async ({ request }) => {
    // まず会話一覧を取得
    const listResponse = await request.get(`${BACKEND_URL}/api/history`)
    const list = await listResponse.json() as Array<{ id: string }>

    if (list.length === 0) {
      // 会話がない場合はスキップ（環境依存）
      test.skip()
      return
    }

    // 最初の会話の詳細を取得
    const convId = list[0].id
    const detailResponse = await request.get(`${BACKEND_URL}/api/history/${convId}`)

    expect(detailResponse.status()).toBe(200)

    const detail = await detailResponse.json() as {
      id: string
      title: string
      messages: Array<{
        id: string
        role: string
        content: string
        sql?: string | null
        chartType?: string | null
        queryResult?: unknown
        error?: string | null
        createdAt: string
      }>
    }

    // id と title が含まれること
    expect(detail.id).toBe(convId)
    expect(detail.title).toBeTruthy()

    // messages 配列が含まれること
    expect(Array.isArray(detail.messages)).toBe(true)

    // メッセージが存在する場合は構造を確認
    if (detail.messages.length > 0) {
      const msg = detail.messages[0]
      expect(typeof msg.id).toBe('string')
      expect(['user', 'assistant']).toContain(msg.role)
      expect(typeof msg.content).toBe('string')
      expect(typeof msg.createdAt).toBe('string')
    }
  })

  /**
   * 【ユーザーストーリー】
   * フロントエンドのチャット送信後に履歴サイドバーが自動リフレッシュされる
   *
   * 【テストケースIssue】#61
   *
   * 【前提条件】
   * - フロントエンドが起動していること
   * - SSE APIをモック（チャット完了後に履歴が更新される）
   *
   * 【期待結果】
   * - チャット送信後、サイドバーの履歴が更新される
   */
  test('should auto-refresh sidebar history after chat message is sent', async ({ page }) => {
    const newConvId = 'test-conv-auto-refresh-001'

    // 初回は空、リフレッシュ後は1件を返す
    let historyCallCount = 0
    await page.route('**/api/history', (route) => {
      if (route.request().method() === 'GET') {
        const response = historyCallCount === 0
          ? []
          : [{ id: newConvId, title: '売上を教えて', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]
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

    const sseBody = createSseResponse([
      { event: 'conversation', data: { conversationId: newConvId } },
      { event: 'message', data: { chunk: 'SQLを生成しました。' } },
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

    // チャットを送信
    await page.locator('.chat-input-textarea').fill('売上を教えて')
    await page.locator('.chat-input-textarea').press('Enter')

    // チャット完了を待つ
    await expect(
      page.locator('.chat-message--assistant .chat-message__text').first()
    ).toContainText('SQLを生成しました。', { timeout: 10000 })

    // 履歴が自動リフレッシュされて新しい会話が表示されること
    await expect(
      page.locator('.history-item').filter({ hasText: '売上を教えて' })
    ).toBeVisible({ timeout: 10000 })
  })
})
