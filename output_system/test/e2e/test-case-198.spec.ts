/**
 * DataAgent E2Eテスト - テストケース #198
 * DB管理モーダルで全DB接続先を削除すると初回起動ガイドに戻る
 */
import { test, expect } from '@playwright/test'

/**
 * 【ユーザーストーリー】
 * DataAgentを初めて使う社内ユーザーが全DB接続先を削除したとき、
 * チャット画面の代わりに初回起動ガイドが表示される
 *
 * 【テストケースIssue】#198
 *
 * 【前提条件】
 * - DB接続先が1件登録された状態でチャット画面が表示されていること
 *
 * 【期待結果】
 * - 全DB接続先を削除すると初回起動ガイドに遷移する
 * - 再度DB接続先を登録するとチャット画面に復帰する
 */
test.describe('Welcome Guide - Return After Deleting All Connections', () => {
  /**
   * 全DB接続先を削除すると初回起動ガイドが表示されること
   * モックで接続先1件→削除後0件を制御する
   */
  test('should show welcome guide when all DB connections are deleted via modal', async ({ page }) => {
    const mockConnection = {
      id: 'mock-conn-198',
      name: 'モックDB(198)',
      dbType: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'user',
      databaseName: 'db',
      isLastUsed: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    let connectionDeleted = false

    // 接続先一覧APIをモック（GET /api/connections）
    await page.route('**/api/connections', async (route) => {
      if (route.request().method() === 'GET') {
        if (!connectionDeleted) {
          // 削除前: 1件
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([mockConnection]),
          })
        } else {
          // 削除後: 0件
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([]),
          })
        }
      } else {
        route.continue()
      }
    })

    // 削除APIをモック（DELETE /api/connections/:id）
    await page.route('**/api/connections/**', async (route) => {
      if (route.request().method() === 'DELETE') {
        connectionDeleted = true
        route.fulfill({ status: 204 })
      } else {
        route.continue()
      }
    })

    await page.route('**/api/history*', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })

    await page.goto('/')

    // チャット画面が表示されること（接続先が1件ある状態）
    await expect(page.locator('.app-header__db-select')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.welcome-guide')).not.toBeVisible()

    // DB管理モーダルを開く
    await page.locator('.app-header__manage-btn').click()
    await expect(page.locator('[role="dialog"]')).toBeVisible()

    // 削除ボタンをクリック（window.confirmをモック）
    page.once('dialog', dialog => dialog.accept())

    const deleteBtn = page.locator('.btn--danger').first()
    await expect(deleteBtn).toBeVisible({ timeout: 5000 })
    await deleteBtn.click()

    // 削除確認ダイアログが処理されるまで待つ
    await page.waitForTimeout(1000)

    // モーダルを閉じる
    await page.locator('.modal__close').click()
    await expect(page.locator('[role="dialog"]')).not.toBeVisible()

    // 初回起動ガイドが表示されること（接続先が0件になったため）
    await expect(page.locator('.welcome-guide')).toBeVisible({ timeout: 5000 })
  })

  /**
   * 全DB削除後にDB登録するとチャット画面に復帰すること
   */
  test('should return to chat screen after re-registering DB connection', async ({ page }) => {
    let connectionRegistered = false

    const restoredConnection = {
      id: 'restored-conn-id',
      name: '復元DB',
      dbType: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'user',
      databaseName: 'db',
      isLastUsed: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    // 登録前は0件、登録後は1件を返すモック（GET /api/connections）
    await page.route('**/api/connections', async (route) => {
      if (route.request().method() === 'GET') {
        if (!connectionRegistered) {
          // 登録前: 0件（ウェルカムガイド表示）
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([]),
          })
        } else {
          // 登録後: 1件（チャット画面表示）
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([restoredConnection]),
          })
        }
      } else if (route.request().method() === 'POST') {
        connectionRegistered = true
        route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(restoredConnection),
        })
      } else {
        route.continue()
      }
    })

    await page.route('**/api/history*', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })

    await page.goto('/')

    // 初回起動ガイドが表示されること
    await expect(page.locator('.welcome-guide')).toBeVisible({ timeout: 5000 })

    // 「DB接続先を登録する」ボタンをクリック
    await page.locator('.welcome-guide__register-btn').click()
    await expect(page.locator('[role="dialog"]')).toBeVisible()

    // フォームで接続先を登録
    await page.locator('button[aria-label="新しい接続先を登録"]').click()
    await page.locator('input[name="name"]').fill('復元DB')
    await page.locator('select[name="dbType"]').selectOption('mysql')
    await page.locator('input[name="host"]').fill('localhost')
    await page.locator('input[name="port"]').fill('3306')
    await page.locator('input[name="username"]').fill('user')
    await page.locator('input[name="password"]').fill('pass')
    await page.locator('input[name="databaseName"]').fill('db')
    await page.locator('.db-connection-form button[type="submit"]').click()

    // 一覧に戻ること
    await expect(page.locator('.db-connection-list')).toBeVisible({ timeout: 5000 })

    // モーダルを閉じる
    await page.locator('.modal__close').click()

    // チャット画面に遷移すること（ドロップダウンが表示されること）
    await expect(page.locator('.welcome-guide')).not.toBeVisible({ timeout: 5000 })
    await expect(page.locator('.app-header__db-select')).toBeVisible({ timeout: 5000 })
  })
})
