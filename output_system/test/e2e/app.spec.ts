/**
 * DataAgent E2Eテスト - アプリケーション疎通確認
 *
 * このファイルでは DataAgent フロントエンドの基本的な起動確認テストを行う。
 * Docker Compose で起動したコンテナに対して実行する。
 *
 * 実行前提:
 * - `docker compose up -d` でコンテナが起動していること
 * - AI Agent container からコンテナ名でアクセスできること
 *   （baseURL: http://okegawaatclink-gaido-dataagent-output-system:3001）
 */
import { test, expect } from '@playwright/test'

/**
 * DataAgent フロントエンド起動確認テストスイート
 */
test.describe('DataAgent Frontend - 疎通確認', () => {
  /**
   * 【ユーザーストーリー】
   * Docker Compose で起動した DataAgent にブラウザでアクセスすると
   * 「DataAgent」という見出しが表示されること
   *
   * 【前提条件】
   * - docker compose up -d でコンテナが起動していること
   * - フロントエンドが http://okegawaatclink-gaido-dataagent-output-system:3001 でアクセス可能なこと
   *
   * 【期待結果】
   * - ページタイトルが "DataAgent" であること
   * - h1要素に "DataAgent" テキストが表示されること
   */
  test('should display DataAgent heading on the home page', async ({ page }) => {
    // トップページに遷移（baseURL はplaywright.config.tsで設定済み）
    await page.goto('/')

    // ページタイトルの確認
    await expect(page).toHaveTitle('DataAgent')

    // 「DataAgent」見出しが表示されていることを確認（PBI 1.1 受入条件 #4）
    const heading = page.locator('h1')
    await expect(heading).toBeVisible()
    await expect(heading).toHaveText('DataAgent')
  })

  /**
   * 【ユーザーストーリー】
   * Docker Compose で起動した DataAgent のバックエンドヘルスチェックAPIが
   * 正常応答を返すこと
   *
   * 【前提条件】
   * - docker compose up -d でコンテナが起動していること
   * - バックエンドが http://okegawaatclink-gaido-dataagent-output-system-backend:3002 または
   *   同一コンテナ内の localhost:3002 でアクセス可能なこと
   *
   * 【期待結果】
   * - GET /api/health が HTTP 200 を返すこと
   * - レスポンスボディに { status: "ok" } が含まれること
   */
  test('should return health check response from backend API', async ({ request }) => {
    // バックエンドのヘルスチェックエンドポイントにリクエスト（PBI 1.1 受入条件 #5）
    // instance-config.md の「コンテナ内からアクセスする時のバックエンドURL」を使用
    const response = await request.get('http://okegawaatclink-gaido-dataagent-output-system:3002/api/health')

    // HTTP 200 レスポンスの確認
    expect(response.status()).toBe(200)

    // レスポンスボディの確認
    const body = await response.json() as { status: string }
    expect(body.status).toBe('ok')
  })

  /**
   * 【ユーザーストーリー】
   * DataAgent ページのメインコンテンツが表示されること
   *
   * 【前提条件】
   * - フロントエンドが起動していること
   *
   * 【期待結果】
   * - app-container クラスのdivが表示されること
   * - ヘッダーが表示されること
   */
  test('should render the application layout correctly', async ({ page }) => {
    await page.goto('/')

    // アプリケーションコンテナの確認
    const appContainer = page.locator('.app-container')
    await expect(appContainer).toBeVisible()

    // ヘッダーの確認
    const header = page.locator('.app-header')
    await expect(header).toBeVisible()

    // メインコンテンツの確認
    const main = page.locator('.app-main')
    await expect(main).toBeVisible()
  })
})
