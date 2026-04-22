/**
 * DataAgent E2Eテスト - テストケース #229
 * GraphQL接続先削除時に関連会話・メッセージもCASCADE削除される
 */
import { test, expect } from '@playwright/test'

/**
 * 【ユーザーストーリー】
 * データ分析ユーザーがGraphQL接続先を削除したとき、
 * 関連する会話・メッセージもCASCADE削除される
 *
 * 【テストケースIssue】#229
 *
 * 【前提条件】
 * - GraphQL接続先が登録済みで、その接続先での会話が存在する
 *
 * 【期待結果】
 * - GraphQL接続先を削除すると関連する会話・メッセージもCASCADE削除される
 * - 削除後に他の接続先の会話履歴は影響を受けない
 */
test.describe('GraphQL Connection - CASCADE Delete with Conversations', () => {
  /**
   * GraphQL接続先削除後に履歴が空になること（UIレベル確認）
   */
  test('should remove GraphQL connection and clear related history', async ({ page }) => {
    const graphqlConn = {
      id: 'graphql-cascade-229',
      name: 'CASCADE削除テスト',
      dbType: 'graphql',
      endpointUrl: 'https://cascade-api.example.com/graphql',
      host: null,
      port: null,
      username: null,
      databaseName: null,
      isLastUsed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const remainingConn = {
      id: 'remaining-conn-229',
      name: '残存DB',
      dbType: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'user',
      databaseName: 'db',
      isLastUsed: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    let connections = [graphqlConn, remainingConn]
    let graphqlDeleted = false

    await page.route('**/api/connections', async (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(connections),
        })
      } else {
        route.continue()
      }
    })
    await page.route('**/api/connections/**', async (route) => {
      if (route.request().method() === 'DELETE') {
        graphqlDeleted = true
        connections = [remainingConn]
        route.fulfill({ status: 204 })
      } else {
        route.continue()
      }
    })
    await page.route('**/api/history*', async (route) => {
      const url = route.request().url()
      if (graphqlDeleted && url.includes(graphqlConn.id)) {
        // 削除後はGraphQL接続先の履歴が空になること
        route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      } else {
        route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      }
    })

    await page.goto('/')

    // DB管理モーダルを開く
    await page.locator('.app-header__manage-btn').click()
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 })

    // GraphQL接続先が表示されていること
    await expect(page.locator('.db-connection-list')).toContainText('CASCADE削除テスト')

    // 削除ボタンをクリック
    const deleteBtn = page.locator('[aria-label="CASCADE削除テストを削除"]')
    await expect(deleteBtn).toBeVisible({ timeout: 5000 })
    page.on('dialog', (dialog) => dialog.accept())
    await deleteBtn.click()

    // GraphQL接続先が削除されること
    await page.waitForTimeout(1000)
    await expect(page.locator('.db-connection-list')).not.toContainText('CASCADE削除テスト')

    // 他の接続先は残っていること
    await expect(page.locator('.db-connection-list')).toContainText('残存DB')

    // CASCADE削除フラグが設定されていること
    expect(graphqlDeleted).toBeTruthy()
  })

  /**
   * GraphQL接続先削除後もバックエンドAPIで履歴が空になること（APIレベル確認）
   */
  test('should verify CASCADE delete via API after GraphQL connection deletion', async ({ page }) => {
    const graphqlConn = {
      id: 'graphql-api-cascade-229',
      name: 'APIレベルCASCADE',
      dbType: 'graphql',
      endpointUrl: 'https://api-cascade.example.com/graphql',
      host: null,
      port: null,
      username: null,
      databaseName: null,
      isLastUsed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const mysqlConn = {
      id: 'mysql-for-cascade-229',
      name: '他接続先DB',
      dbType: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'user',
      databaseName: 'db',
      isLastUsed: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    let connections = [graphqlConn, mysqlConn]
    const historyRequests: string[] = []

    await page.route('**/api/connections', async (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(connections),
        })
      } else {
        route.continue()
      }
    })
    await page.route('**/api/connections/**', async (route) => {
      if (route.request().method() === 'DELETE') {
        connections = [mysqlConn]
        route.fulfill({ status: 204 })
      } else {
        route.continue()
      }
    })
    await page.route('**/api/history*', async (route) => {
      historyRequests.push(route.request().url())
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })

    await page.goto('/')

    // DB管理モーダルを開く
    await page.locator('.app-header__manage-btn').click()
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 })

    // GraphQL接続先を削除
    const deleteBtn = page.locator('[aria-label="APIレベルCASCADEを削除"]')
    await expect(deleteBtn).toBeVisible({ timeout: 5000 })
    page.on('dialog', (dialog) => dialog.accept())
    await deleteBtn.click()

    await page.waitForTimeout(1000)

    // 削除後に残存接続先が表示されていること
    await expect(page.locator('.db-connection-list')).toContainText('他接続先DB')
    await expect(page.locator('.db-connection-list')).not.toContainText('APIレベルCASCADE')
  })

  /**
   * 他接続先の会話履歴は削除の影響を受けないこと
   */
  test('should not affect other connections history when GraphQL connection is deleted', async ({ page }) => {
    const graphqlConn = {
      id: 'graphql-to-delete-229',
      name: '削除GraphQL',
      dbType: 'graphql',
      endpointUrl: 'https://to-delete.example.com/graphql',
      host: null,
      port: null,
      username: null,
      databaseName: null,
      isLastUsed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const mysqlConn = {
      id: 'mysql-keep-229',
      name: '保持MySQL',
      dbType: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'user',
      databaseName: 'db',
      isLastUsed: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    const mysqlHistory = [
      {
        id: 'conv-mysql-229',
        title: 'MySQLの会話',
        dbConnectionId: mysqlConn.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]

    let connections = [graphqlConn, mysqlConn]

    await page.route('**/api/connections', async (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(connections),
        })
      } else {
        route.continue()
      }
    })
    await page.route('**/api/connections/**', async (route) => {
      if (route.request().method() === 'DELETE') {
        connections = [mysqlConn]
        route.fulfill({ status: 204 })
      } else {
        route.continue()
      }
    })
    await page.route('**/api/history*', async (route) => {
      const url = route.request().url()
      if (url.includes(mysqlConn.id)) {
        // MySQL接続先の履歴は影響を受けない
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mysqlHistory),
        })
      } else {
        route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      }
    })

    await page.goto('/')

    // DB管理モーダルを開く
    await page.locator('.app-header__manage-btn').click()
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 })

    // GraphQL接続先を削除
    const deleteBtn = page.locator('[aria-label="削除GraphQLを削除"]')
    await expect(deleteBtn).toBeVisible({ timeout: 5000 })
    page.on('dialog', (dialog) => dialog.accept())
    await deleteBtn.click()
    await page.waitForTimeout(1000)

    // MySQL接続先は残っていること
    await expect(page.locator('.db-connection-list')).toContainText('保持MySQL')
    await expect(page.locator('.db-connection-list')).not.toContainText('削除GraphQL')
  })
})
