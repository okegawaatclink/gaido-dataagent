/**
 * DataAgent E2Eテスト - テストケース #188
 * DB接続先未登録時に初回起動ガイドが表示されDB登録後にチャット画面に遷移する
 */
import { test, expect } from '@playwright/test'

/**
 * 【ユーザーストーリー】
 * DataAgentを初めて使う社内ユーザーがDB接続先が未登録の場合にウェルカム画面で案内を受け、
 * DB登録を促される
 *
 * 【テストケースIssue】#188
 *
 * 【前提条件】
 * - DB接続先が0件の状態
 *
 * 【期待結果】
 * - DB 0件時に初回起動ガイドが表示される
 * - ウェルカムメッセージが正しく表示される
 * - 「DB接続先を登録する」ボタンでDB管理モーダルが開く
 * - DB登録後にチャット画面に自動遷移する
 * - DB 1件以上の場合は初回起動ガイドが表示されない
 */
test.describe('Welcome Guide - First Launch', () => {
  /**
   * DB接続先が0件の状態で初回起動ガイドが表示されること
   * APIをモックして接続先0件の状態を作る
   */
  test('should display welcome guide when no DB connections exist', async ({ page }) => {
    // 接続先一覧が空を返すモック
    await page.route('**/api/connections', (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        })
      } else {
        route.continue()
      }
    })

    await page.goto('/')

    // 初回起動ガイドが表示されること
    await expect(page.locator('.welcome-guide')).toBeVisible({ timeout: 5000 })

    // ウェルカムメッセージが表示されること
    await expect(page.locator('.welcome-guide__title')).toContainText('DataAgent へようこそ')
    await expect(page.locator('.welcome-guide__message')).toContainText('まずDB接続先を登録してください')
  })

  /**
   * 「DB接続先を登録する」ボタンでDB管理モーダルが開くこと
   */
  test('should open DB management modal from welcome guide register button', async ({ page }) => {
    // 接続先一覧が空を返すモック
    await page.route('**/api/connections', (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        })
      } else {
        route.continue()
      }
    })

    await page.goto('/')

    // 初回起動ガイドが表示されること
    await expect(page.locator('.welcome-guide')).toBeVisible({ timeout: 5000 })

    // 「DB接続先を登録する」ボタンをクリック
    await page.locator('.welcome-guide__register-btn').click()

    // DB管理モーダルが開くこと
    await expect(page.locator('[role="dialog"]')).toBeVisible()
    await expect(page.locator('#db-modal-title')).toContainText('DB接続先管理')
  })

  /**
   * DB接続先が1件以上ある場合に初回起動ガイドが表示されないこと
   */
  test('should not display welcome guide when DB connections exist', async ({ page }) => {
    // 接続先が1件ある状態をモック
    await page.route('**/api/connections', (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'mock-conn-id',
              name: 'テストDB',
              dbType: 'mysql',
              host: 'localhost',
              port: 3306,
              username: 'user',
              databaseName: 'db',
              isLastUsed: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ]),
        })
      } else {
        route.continue()
      }
    })

    await page.route('**/api/history*', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })

    await page.goto('/')

    // 初回起動ガイドが表示されないこと
    await expect(page.locator('.welcome-guide')).not.toBeVisible({ timeout: 5000 })

    // チャット画面が表示されること
    await expect(page.locator('.app-header')).toBeVisible()
    // ドロップダウンまたはサイドバーが表示されること
    await expect(page.locator('.app-header__db-select, .sidebar').first()).toBeVisible()
  })

  /**
   * DB登録後にモーダルを閉じるとチャット画面に自動遷移すること
   * WelcomeGuide から管理モーダルを開いてDB登録後、チャット画面に遷移することを検証
   */
  test('should transition to chat screen after DB registration and modal close', async ({ page, request }) => {
    const BACKEND = 'http://okegawaatclink-gaido-dataagent-output-system:3002'

    // テスト用DB接続先を事前にすべて削除してDB 0件の状態を作る
    const listResp = await request.get(`${BACKEND}/api/connections`)
    const existing = await listResp.json()
    for (const conn of existing) {
      await request.delete(`${BACKEND}/api/connections/${conn.id}`)
    }

    await page.route('**/api/history*', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })

    await page.goto('/')

    // 初回起動ガイドが表示されること（接続先が0件のため）
    await expect(page.locator('.welcome-guide')).toBeVisible({ timeout: 5000 })

    // 「DB接続先を登録する」ボタンをクリック
    await page.locator('.welcome-guide__register-btn').click()

    // DB管理モーダルが開くこと
    await expect(page.locator('[role="dialog"]')).toBeVisible()

    // フォームを開いてDB接続先を登録（実際のAPIに登録）
    await page.locator('button[aria-label="新しい接続先を登録"]').click()
    await page.locator('input[name="name"]').fill('GUIテスト登録(188遷移確認)')
    await page.locator('select[name="dbType"]').selectOption('mysql')
    await page.locator('input[name="host"]').fill('okegawaatclink-gaido-dataagent-mysql')
    await page.locator('input[name="port"]').fill('3306')
    await page.locator('input[name="username"]').fill('root')
    await page.locator('input[name="password"]').fill('root')
    await page.locator('input[name="databaseName"]').fill('projects')
    await page.locator('.db-connection-form button[type="submit"]').click()

    // 一覧に戻り、新しい接続先が表示されること
    await expect(page.locator('.db-connection-list')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.db-connection-list')).toContainText('GUIテスト登録(188遷移確認)', { timeout: 5000 })

    // モーダルを閉じる
    await page.locator('.modal__close').click()

    // 初回起動ガイドが消えてチャット画面に遷移すること
    await expect(page.locator('.welcome-guide')).not.toBeVisible({ timeout: 5000 })
    // ドロップダウンが表示されること
    await expect(page.locator('.app-header__db-select')).toBeVisible({ timeout: 5000 })

    // クリーンアップ（作成した接続先を削除）
    const afterResp = await request.get(`${BACKEND}/api/connections`)
    const afterList = await afterResp.json()
    for (const conn of afterList) {
      await request.delete(`${BACKEND}/api/connections/${conn.id}`)
    }
  })
})
