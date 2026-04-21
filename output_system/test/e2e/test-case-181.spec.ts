/**
 * DataAgent E2Eテスト - テストケース #181
 * Docker Composeで全コンテナが一括起動しフロント画面・バックエンドHealthが確認できる
 */
import { test, expect } from '@playwright/test'

/**
 * 【ユーザーストーリー】
 * 開発チームが `docker compose up -d` を実行したとき、
 * フロントエンド（ポート3001）とバックエンド（ポート3002）が起動し、
 * フロントエンドの画面が表示され、バックエンドのヘルスチェックが200を返す
 *
 * 【テストケースIssue】#181
 *
 * 【前提条件】
 * - docker compose up -d でコンテナが起動済み
 *
 * 【期待結果】
 * - フロントエンドのHTML/CSSが正常にレンダリングされる
 * - /api/health が200 OKを返す
 * - TypeScriptのビルドエラーがない
 */
test.describe('Docker Compose - Container Startup', () => {
  /**
   * フロントエンドの画面が正常にレンダリングされること
   */
  test('should render frontend successfully', async ({ page }) => {
    await page.goto('/')

    // ページタイトルが表示されること
    await expect(page).toHaveTitle(/DataAgent/)

    // DataAgent の見出しが表示されること
    await expect(page.locator('h1')).toContainText('DataAgent')
  })

  /**
   * バックエンドのヘルスチェックエンドポイントが200を返すこと
   */
  test('should return 200 from backend health endpoint', async ({ request }) => {
    const response = await request.get('http://okegawaatclink-gaido-dataagent-output-system:3002/api/health')

    expect(response.status()).toBe(200)

    const body = await response.json()
    expect(body).toHaveProperty('status', 'ok')
    expect(body).toHaveProperty('timestamp')
    expect(body).toHaveProperty('version')
  })

  /**
   * フロントエンドのDOMが正しく構成されていること
   */
  test('should have correct DOM structure', async ({ page }) => {
    await page.goto('/')

    // アプリコンテナが存在すること
    await expect(page.locator('.app-container')).toBeVisible()

    // ヘッダーが表示されること
    await expect(page.locator('.app-header')).toBeVisible()
  })
})
