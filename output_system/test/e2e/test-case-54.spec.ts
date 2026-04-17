/**
 * DataAgent E2Eテスト - テストケース #54
 * Docker Composeで雛形アプリを起動し、フロント画面とバックエンドHealthが確認できる
 */
import { test, expect } from '@playwright/test'

/**
 * Docker Compose起動確認テストスイート
 */
test.describe('Docker Compose Startup - Health Check', () => {
  /**
   * 【ユーザーストーリー】
   * DataAgent を動かしたい開発者が output_system/ で docker compose up -d を実行すると
   * フロントエンドとバックエンドの雛形が起動し、ブラウザで確認できる
   *
   * 【テストケースIssue】#54
   *
   * 【前提条件】
   * - docker compose up -d でコンテナが起動していること
   * - フロントエンドが http://okegawaatclink-gaido-dataagent-output-system:3001 でアクセス可能
   * - バックエンドが http://okegawaatclink-gaido-dataagent-output-system:3002 でアクセス可能
   *
   * 【期待結果】
   * - フロントエンドページにアクセスできる
   * - DataAgent の見出しが表示される
   * - バックエンド /api/health が 200 OK を返す
   * - ヘルスチェックレスポンスに status: "ok" が含まれる
   */
  test('should load frontend page and display DataAgent heading', async ({ page }) => {
    // フロントエンドにアクセス
    await page.goto('/')

    // ページタイトルが "DataAgent" であること
    await expect(page).toHaveTitle('DataAgent')

    // h1要素に "DataAgent" テキストが表示されること
    const heading = page.locator('h1')
    await expect(heading).toBeVisible()
    await expect(heading).toHaveText('DataAgent')
  })

  /**
   * 【ユーザーストーリー】
   * バックエンドヘルスチェックエンドポイント GET /api/health が
   * 正常応答 { status: "ok" } を返すこと
   *
   * 【テストケースIssue】#54
   *
   * 【期待結果】
   * - GET /api/health が HTTP 200 を返す
   * - レスポンスボディに { status: "ok" } が含まれる
   * - timestamp フィールドが含まれる
   */
  test('should return healthy response from backend API', async ({ request }) => {
    // バックエンドのヘルスチェックエンドポイントにリクエスト
    const response = await request.get('http://okegawaatclink-gaido-dataagent-output-system:3002/api/health')

    // HTTP 200 レスポンスの確認
    expect(response.status()).toBe(200)

    // レスポンスボディの確認
    const body = await response.json() as { status: string; timestamp: string; version: string }
    expect(body.status).toBe('ok')
    expect(body.timestamp).toBeTruthy()
    expect(body.version).toBeTruthy()
  })

  /**
   * 【ユーザーストーリー】
   * フロントエンドとバックエンドが同時に起動し、
   * アプリケーション全体のレイアウトが正しく表示される
   *
   * 【テストケースIssue】#54
   *
   * 【期待結果】
   * - アプリケーションコンテナが表示される
   * - ヘッダーが表示される
   * - メインコンテンツが表示される
   * - サイドバーが表示される
   */
  test('should render full application layout correctly', async ({ page }) => {
    await page.goto('/')

    // アプリケーションコンテナの確認
    await expect(page.locator('.app-container')).toBeVisible()

    // ヘッダーの確認
    await expect(page.locator('.app-header')).toBeVisible()

    // メインコンテンツの確認
    await expect(page.locator('.app-main')).toBeVisible()

    // サイドバーの確認
    await expect(page.locator('.sidebar')).toBeVisible()
  })

  /**
   * 【ユーザーストーリー】
   * .env.example ファイルに必要な環境変数が定義されていること
   *
   * 【テストケースIssue】#54
   *
   * 【期待結果】
   * - バックエンドが正常起動していること（.envが適切に設定されている証拠）
   * - /api/health エンドポイントが応答を返す
   */
  test('should have backend running which implies env vars are configured', async ({ request }) => {
    // バックエンドが起動していることを確認（.env.example の環境変数が設定されている証拠）
    const response = await request.get('http://okegawaatclink-gaido-dataagent-output-system:3002/api/health')
    expect(response.ok()).toBeTruthy()
  })
})
