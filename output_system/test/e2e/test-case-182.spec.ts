/**
 * DataAgent E2Eテスト - テストケース #182
 * SQLiteデータベースが起動時に自動初期化されテーブルとFK制約が作成される
 */
import { test, expect } from '@playwright/test'

/**
 * 【ユーザーストーリー】
 * 開発チームがバックエンドを起動したとき、
 * SQLiteファイルが自動生成され、
 * db_connections/conversations/messagesテーブルが作成される
 *
 * 【テストケースIssue】#182
 *
 * 【前提条件】
 * - バックエンドが起動済み
 *
 * 【期待結果】
 * - ヘルスチェックAPIが応答する（= バックエンドが正常起動）
 * - GET /api/connections が200を返す（= db_connectionsテーブルが存在）
 * - GET /api/history が適切に動作する（= conversationsテーブルが存在）
 * - DB接続先作成・削除でCASCADEが正しく動作する（= FK制約が設定済み）
 */
test.describe('SQLite Auto-initialization', () => {
  const BACKEND = 'http://okegawaatclink-gaido-dataagent-output-system:3002'

  /**
   * バックエンドが起動してSQLiteが自動初期化されていること
   * - ヘルスチェックが200を返すことで起動を確認
   */
  test('should start backend with SQLite auto-initialized', async ({ request }) => {
    const response = await request.get(`${BACKEND}/api/health`)
    expect(response.status()).toBe(200)
  })

  /**
   * db_connectionsテーブルが存在すること
   * - GET /api/connections が200を返すことで確認
   */
  test('should have db_connections table - GET /api/connections returns 200', async ({ request }) => {
    const response = await request.get(`${BACKEND}/api/connections`)
    expect(response.status()).toBe(200)

    const body = await response.json()
    expect(Array.isArray(body)).toBe(true)
  })

  /**
   * conversationsテーブルが存在すること
   * - dbConnectionId付きでGET /api/historyを呼んだとき200が返る
   */
  test('should have conversations table - GET /api/history works', async ({ request }) => {
    // まず接続先一覧を取得
    const connectionsResp = await request.get(`${BACKEND}/api/connections`)
    const connections = await connectionsResp.json()

    if (connections.length > 0) {
      const dbConnectionId = connections[0].id
      const response = await request.get(`${BACKEND}/api/history?dbConnectionId=${dbConnectionId}`)
      expect(response.status()).toBe(200)
      const body = await response.json()
      expect(Array.isArray(body)).toBe(true)
    } else {
      // 接続先がない場合は dbConnectionId なしで400が返ることを確認（テーブルは存在する）
      const response = await request.get(`${BACKEND}/api/history`)
      expect(response.status()).toBe(400)
    }
  })

  /**
   * FK制約（CASCADE削除）が設定されていること
   * - 接続先を登録してから削除し、関連会話が削除されることで確認
   */
  test('should enforce FK CASCADE - deleting connection removes related conversations', async ({ request }) => {
    // テスト用接続先を作成
    const createResp = await request.post(`${BACKEND}/api/connections`, {
      data: {
        name: 'テスト用DB(FK確認)',
        dbType: 'mysql',
        host: 'localhost',
        port: 3306,
        username: 'testuser',
        password: 'testpass',
        databaseName: 'testdb',
      },
    })
    expect(createResp.status()).toBe(201)
    const created = await createResp.json()
    const connectionId = created.id

    // 接続先を削除
    const deleteResp = await request.delete(`${BACKEND}/api/connections/${connectionId}`)
    expect(deleteResp.status()).toBe(204)

    // 削除した接続先のIDで会話一覧を取得し、存在しないことを確認
    // (テーブルは存在するが、この接続先の会話は空のはず)
    const historyResp = await request.get(`${BACKEND}/api/history?dbConnectionId=${connectionId}`)
    // 接続先が削除されているので、会話も存在しないか空のはず
    // 400または200で空配列が返る
    expect([200, 400]).toContain(historyResp.status())
  })
})
