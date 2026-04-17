/**
 * DataAgent E2Eテスト - テストケース #55
 * DB接続とスキーマ情報取得ができる
 */
import { test, expect } from '@playwright/test'

const BACKEND_URL = 'http://okegawaatclink-gaido-dataagent-output-system:3002'

/**
 * DB接続・スキーマ情報取得テストスイート
 */
test.describe('DB Connection and Schema - GET /api/schema', () => {
  /**
   * 【ユーザーストーリー】
   * DataAgent を運用する開発者が .env の接続情報で MySQL に接続すると
   * GET /api/schema が 200 OK を返し、テーブル名・カラム名・型を含む
   * レスポンスが得られる
   *
   * 【テストケースIssue】#55
   *
   * 【前提条件】
   * - .env に DB_TYPE=mysql と有効な接続情報が設定されていること
   * - MySQL コンテナが起動していること
   *
   * 【期待結果】
   * - GET /api/schema が 200 OK を返す
   * - レスポンスに database, tables フィールドが含まれる
   * - tables が配列であること
   */
  test('should return 200 with schema containing database and tables fields', async ({ request }) => {
    const response = await request.get(`${BACKEND_URL}/api/schema`)

    // HTTP 200 レスポンスの確認
    expect(response.status()).toBe(200)

    // レスポンスボディの確認
    const body = await response.json() as {
      database: string
      tables: Array<{
        name: string
        comment?: string
        columns: Array<{
          name: string
          type: string
          nullable: boolean
          comment?: string
        }>
      }>
    }

    // database フィールドが含まれること
    expect(body.database).toBeTruthy()
    expect(typeof body.database).toBe('string')

    // tables フィールドが配列であること
    expect(Array.isArray(body.tables)).toBe(true)
  })

  /**
   * 【ユーザーストーリー】
   * スキーマ情報のテーブルに、name・comment・columns フィールドが含まれる
   *
   * 【テストケースIssue】#55
   *
   * 【前提条件】
   * - DB接続済みで、少なくとも1つのテーブルが存在すること
   *
   * 【期待結果】
   * - 各テーブルに name, comment, columns が含まれる
   * - 各カラムに name, type, nullable が含まれる
   */
  test('should include table name, comment, and columns in schema response', async ({ request }) => {
    const response = await request.get(`${BACKEND_URL}/api/schema`)
    expect(response.status()).toBe(200)

    const body = await response.json() as {
      database: string
      tables: Array<{
        name: string
        comment?: string | null
        columns: Array<{
          name: string
          type: string
          nullable: boolean
          comment?: string | null
        }>
      }>
    }

    // テーブルが1件以上あること
    expect(body.tables.length).toBeGreaterThan(0)

    // 最初のテーブルの構造を確認
    const firstTable = body.tables[0]
    expect(typeof firstTable.name).toBe('string')
    expect(firstTable.name).toBeTruthy()
    expect('comment' in firstTable).toBe(true)  // comment フィールドが存在すること（null可）
    expect(Array.isArray(firstTable.columns)).toBe(true)

    // カラム情報の確認
    if (firstTable.columns.length > 0) {
      const firstColumn = firstTable.columns[0]
      expect(typeof firstColumn.name).toBe('string')
      expect(typeof firstColumn.type).toBe('string')
      expect(typeof firstColumn.nullable).toBe('boolean')
    }
  })

  /**
   * 【ユーザーストーリー】
   * 複数テーブルのスキーマが取得でき、各テーブルの列情報が正確に返される
   *
   * 【テストケースIssue】#55
   *
   * 【前提条件】
   * - DBに複数のテーブルが存在すること
   *
   * 【期待結果】
   * - テーブル一覧が取得できること
   * - 各テーブルの columns 配列にカラム情報が含まれること
   */
  test('should return multiple tables with column details', async ({ request }) => {
    const response = await request.get(`${BACKEND_URL}/api/schema`)
    expect(response.status()).toBe(200)

    const body = await response.json() as {
      database: string
      tables: Array<{
        name: string
        columns: Array<{ name: string; type: string; nullable: boolean }>
      }>
    }

    // テーブルが存在すること
    expect(body.tables.length).toBeGreaterThan(0)

    // 各テーブルにカラム情報が含まれること
    for (const table of body.tables) {
      expect(typeof table.name).toBe('string')
      expect(Array.isArray(table.columns)).toBe(true)
      // カラムが1件以上あるテーブルで詳細確認
      if (table.columns.length > 0) {
        for (const col of table.columns) {
          expect(typeof col.name).toBe('string')
          expect(typeof col.type).toBe('string')
          expect(typeof col.nullable).toBe('boolean')
        }
      }
    }
  })
})
