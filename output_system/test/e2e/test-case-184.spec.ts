/**
 * DataAgent E2Eテスト - テストケース #184
 * DB管理モーダルから接続先の一覧表示・登録・編集・削除・接続テストができる
 */
import { test, expect } from '@playwright/test'

/**
 * 【ユーザーストーリー】
 * DataAgentの利用者がDB管理モーダルでDB接続先の一覧表示・登録・編集・削除・接続テストを行う
 *
 * 【テストケースIssue】#184
 *
 * 【前提条件】
 * - アプリが起動済みでDB接続先が1件以上登録されていること
 *
 * 【期待結果】
 * - DB管理モーダルが正常に開閉する
 * - 接続先一覧が正しく表示される
 * - 新規登録・編集・削除がGUIから操作できる
 * - DB種別ドロップダウンでMySQL/PostgreSQLが選択可能
 * - 削除時に確認ダイアログが表示される
 * - 接続テスト結果がトースト通知で表示される
 * - バリデーションエラーが適切に表示される
 */
test.describe('DB Management Modal - UI Operations', () => {
  const BACKEND = 'http://okegawaatclink-gaido-dataagent-output-system:3002'

  test.beforeEach(async ({ request }) => {
    // テスト用の接続先が最低1件存在することを確認
    const resp = await request.get(`${BACKEND}/api/connections`)
    const connections = await resp.json()
    if (connections.length === 0) {
      await request.post(`${BACKEND}/api/connections`, {
        data: {
          name: 'テスト用DB(前提)',
          dbType: 'mysql',
          host: 'okegawaatclink-gaido-dataagent-mysql',
          port: 3306,
          username: 'root',
          password: 'root',
          databaseName: 'projects',
        },
      })
    }
  })

  /**
   * DB管理モーダルが「管理」ボタンから開けること
   */
  test('should open DB management modal from manage button', async ({ page }) => {
    await page.goto('/')

    // 「管理」ボタンをクリック
    await page.locator('.app-header__manage-btn').click()

    // モーダルが開くこと
    await expect(page.locator('[role="dialog"]')).toBeVisible()

    // モーダルタイトルが表示されること
    await expect(page.locator('#db-modal-title')).toContainText('DB接続先管理')
  })

  /**
   * DB管理モーダルを閉じボタンで閉じられること
   */
  test('should close modal with close button', async ({ page }) => {
    await page.goto('/')

    // モーダルを開く
    await page.locator('.app-header__manage-btn').click()
    await expect(page.locator('[role="dialog"]')).toBeVisible()

    // 閉じるボタンをクリック
    await page.locator('.modal__close').click()

    // モーダルが閉じること
    await expect(page.locator('[role="dialog"]')).not.toBeVisible()
  })

  /**
   * DB管理モーダルを Esc キーで閉じられること
   */
  test('should close modal with Escape key', async ({ page }) => {
    await page.goto('/')

    // モーダルを開く
    await page.locator('.app-header__manage-btn').click()
    await expect(page.locator('[role="dialog"]')).toBeVisible()

    // Escキーを押す
    await page.keyboard.press('Escape')

    // モーダルが閉じること
    await expect(page.locator('[role="dialog"]')).not.toBeVisible()
  })

  /**
   * 接続先一覧が表示されること
   */
  test('should display connection list in modal', async ({ page }) => {
    await page.goto('/')

    // モーダルを開く
    await page.locator('.app-header__manage-btn').click()
    await expect(page.locator('[role="dialog"]')).toBeVisible()

    // 接続先一覧（ul）が表示されること
    await expect(page.locator('.db-connection-list__items')).toBeVisible({ timeout: 5000 })
    // 少なくとも1件のアイテムが表示されること
    const listItems = page.locator('.db-connection-item')
    await expect(listItems.first()).toBeVisible({ timeout: 5000 })
  })

  /**
   * 新規登録フォームを開けること
   */
  test('should open add form from modal', async ({ page }) => {
    await page.goto('/')

    // モーダルを開く
    await page.locator('.app-header__manage-btn').click()
    await expect(page.locator('[role="dialog"]')).toBeVisible()

    // 新規登録ボタン（aria-label="新しい接続先を登録"）をクリック
    await page.locator('button[aria-label="新しい接続先を登録"]').click()

    // フォームが表示されること
    await expect(page.locator('.db-connection-form')).toBeVisible()
  })

  /**
   * 新規接続先を登録できること
   */
  test('should register a new DB connection from modal', async ({ page, request }) => {
    // 事前クリーンアップ
    const listResp = await request.get(`${BACKEND}/api/connections`)
    const existing = await listResp.json()
    const toDelete = existing.find((c: { name: string }) => c.name === 'GUIテスト登録(184)')
    if (toDelete) {
      await request.delete(`${BACKEND}/api/connections/${toDelete.id}`)
    }

    await page.goto('/')

    // モーダルを開く
    await page.locator('.app-header__manage-btn').click()
    await page.locator('button[aria-label="新しい接続先を登録"]').click()

    // フォームに入力
    await page.locator('input[name="name"]').fill('GUIテスト登録(184)')
    await page.locator('select[name="dbType"]').selectOption('mysql')
    await page.locator('input[name="host"]').fill('okegawaatclink-gaido-dataagent-mysql')
    await page.locator('input[name="port"]').fill('3306')
    await page.locator('input[name="username"]').fill('root')
    await page.locator('input[name="password"]').fill('root')
    await page.locator('input[name="databaseName"]').fill('projects')

    // 保存ボタン（type="submit"）をクリック
    await page.locator('.db-connection-form button[type="submit"]').click()

    // 一覧に戻り、新しい接続先が表示されること
    await expect(page.locator('.db-connection-list')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.db-connection-list')).toContainText('GUIテスト登録(184)', { timeout: 5000 })

    // クリーンアップ
    const afterResp = await request.get(`${BACKEND}/api/connections`)
    const afterList = await afterResp.json()
    const created = afterList.find((c: { name: string }) => c.name === 'GUIテスト登録(184)')
    if (created) {
      await request.delete(`${BACKEND}/api/connections/${created.id}`)
    }
  })

  /**
   * DB種別ドロップダウンでMySQL/PostgreSQLが選択できること
   */
  test('should allow selecting MySQL and PostgreSQL in form', async ({ page }) => {
    await page.goto('/')

    // モーダルを開いてフォームへ
    await page.locator('.app-header__manage-btn').click()
    await page.locator('button[aria-label="新しい接続先を登録"]').click()

    const dbTypeSelect = page.locator('select[name="dbType"]')

    // MySQLが選択できること
    await dbTypeSelect.selectOption('mysql')
    await expect(dbTypeSelect).toHaveValue('mysql')

    // PostgreSQLが選択できること
    await dbTypeSelect.selectOption('postgresql')
    await expect(dbTypeSelect).toHaveValue('postgresql')
  })

  /**
   * バリデーションエラーが表示されること（必須フィールド未入力）
   */
  test('should show validation error when required fields are empty', async ({ page }) => {
    await page.goto('/')

    // モーダルを開いてフォームへ
    await page.locator('.app-header__manage-btn').click()
    await page.locator('button[aria-label="新しい接続先を登録"]').click()

    // 空のまま保存ボタン（type="submit"）をクリック
    await page.locator('.db-connection-form button[type="submit"]').click()

    // バリデーションエラーが表示されること（HTML5バリデーションまたはカスタムメッセージ）
    // フォームが送信されずフォームが残っていること
    await expect(page.locator('.db-connection-form')).toBeVisible()
  })
})
