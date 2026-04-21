/**
 * 【モジュール】backend/src/services/schema.ts
 * スキーマ情報取得サービスのユニットテスト
 *
 * PBI #149 改修後のテスト:
 *   - fetchSchema(): dbConnectionId を引数に取り、connectionManager 経由で動的接続
 *   - buildSchemaInfo(): 純粋関数のため直接テスト
 *   - invalidateSchemaCache(): キャッシュ無効化の動作確認
 *
 * テスト方針:
 *   - connectionManager.getById() をモックして実際のDB接続を行わない
 *   - knex をモックして実際のSQLを実行しない
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// connectionManager モジュールをモック（実DBへの接続を回避）
vi.mock('../../backend/src/services/connectionManager', () => ({
  getById: vi.fn(),
  ConnectionNotFoundError: class ConnectionNotFoundError extends Error {
    constructor(id: string) {
      super(`DB connection with id '${id}' not found.`)
      this.name = 'ConnectionNotFoundError'
    }
  },
}))

// knex モジュールをモック（実DB接続を回避）
vi.mock('knex', () => {
  return {
    default: vi.fn(() => ({
      raw: vi.fn(),
      destroy: vi.fn().mockResolvedValue(undefined),
    })),
  }
})

import {
  buildSchemaInfo,
  fetchSchema,
  invalidateSchemaCache,
  clearAllSchemaCache,
  type SchemaInfo,
} from '../../backend/src/services/schema'
import { getById } from '../../backend/src/services/connectionManager'
import Knex from 'knex'

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

/**
 * DB接続先モックオブジェクトを生成するヘルパー
 */
function createMockConnection(overrides: Partial<{
  id: string
  dbType: 'mysql' | 'postgresql'
  host: string
  port: number
  username: string
  password: string
  databaseName: string
}> = {}) {
  return {
    id: 'test-connection-id',
    name: 'テストDB',
    dbType: 'postgresql' as const,
    host: 'localhost',
    port: 5432,
    username: 'testuser',
    password: 'testpass',
    databaseName: 'testdb',
    isLastUsed: false,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

// -------------------------------------------------------------------
// buildSchemaInfo のユニットテスト
// -------------------------------------------------------------------

/**
 * 【モジュール】buildSchemaInfo
 * INFORMATION_SCHEMA 行データを SchemaInfo 形式に変換する純粋関数のテスト
 */
describe('buildSchemaInfo', () => {
  /**
   * 【テスト対象】buildSchemaInfo
   * 【テスト内容】複数テーブル・複数カラムの行データを渡した場合
   * 【期待結果】テーブル名でグループ化され、カラムが順番通りにまとめられること
   */
  it('should group columns by table name', () => {
    const rows = [
      { table_name: 'users', table_comment: null, column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_comment: null },
      { table_name: 'users', table_comment: null, column_name: 'email', data_type: 'character varying', is_nullable: 'NO', column_comment: null },
      { table_name: 'orders', table_comment: null, column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_comment: null },
      { table_name: 'orders', table_comment: null, column_name: 'user_id', data_type: 'integer', is_nullable: 'YES', column_comment: null },
    ]

    const result = buildSchemaInfo('testdb', rows)

    expect(result.database).toBe('testdb')
    expect(result.tables).toHaveLength(2)

    // テーブル名でソートされていること
    expect(result.tables[0].name).toBe('orders')
    expect(result.tables[1].name).toBe('users')

    // orders テーブルのカラム
    expect(result.tables[0].columns).toHaveLength(2)
    expect(result.tables[0].columns[0]).toEqual({ name: 'id', type: 'integer', nullable: false, comment: null })
    expect(result.tables[0].columns[1]).toEqual({ name: 'user_id', type: 'integer', nullable: true, comment: null })

    // users テーブルのカラム
    expect(result.tables[1].columns).toHaveLength(2)
    expect(result.tables[1].columns[0]).toEqual({ name: 'id', type: 'integer', nullable: false, comment: null })
    expect(result.tables[1].columns[1]).toEqual({ name: 'email', type: 'character varying', nullable: false, comment: null })
  })

  /**
   * 【テスト対象】buildSchemaInfo
   * 【テスト内容】is_nullable が 'YES' の場合
   * 【期待結果】nullable が true になること
   */
  it('should map is_nullable "YES" to true', () => {
    const rows = [
      { table_name: 'items', table_comment: null, column_name: 'description', data_type: 'text', is_nullable: 'YES', column_comment: null },
    ]

    const result = buildSchemaInfo('mydb', rows)

    expect(result.tables[0].columns[0].nullable).toBe(true)
  })

  /**
   * 【テスト対象】buildSchemaInfo
   * 【テスト内容】is_nullable が 'NO' の場合
   * 【期待結果】nullable が false になること
   */
  it('should map is_nullable "NO" to false', () => {
    const rows = [
      { table_name: 'items', table_comment: null, column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_comment: null },
    ]

    const result = buildSchemaInfo('mydb', rows)

    expect(result.tables[0].columns[0].nullable).toBe(false)
  })

  /**
   * 【テスト対象】buildSchemaInfo
   * 【テスト内容】行データが空の場合
   * 【期待結果】テーブル一覧が空の SchemaInfo を返すこと
   */
  it('should return empty tables when rows are empty', () => {
    const result = buildSchemaInfo('emptydb', [])

    expect(result.database).toBe('emptydb')
    expect(result.tables).toHaveLength(0)
  })

  /**
   * 【テスト対象】buildSchemaInfo
   * 【テスト内容】テーブル名でアルファベット順ソート
   * 【期待結果】テーブル名がアルファベット昇順でソートされること
   */
  it('should sort tables alphabetically', () => {
    const rows = [
      { table_name: 'zebra_table', table_comment: null, column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_comment: null },
      { table_name: 'alpha_table', table_comment: null, column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_comment: null },
      { table_name: 'middle_table', table_comment: null, column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_comment: null },
    ]

    const result = buildSchemaInfo('sortdb', rows)

    expect(result.tables.map(t => t.name)).toEqual(['alpha_table', 'middle_table', 'zebra_table'])
  })
})

// -------------------------------------------------------------------
// fetchSchema のユニットテスト（モックDB使用）
// -------------------------------------------------------------------

/**
 * 【モジュール】fetchSchema
 * dbConnectionId を受け取り、connectionManager 経由で動的接続してスキーマを取得する関数のテスト
 */
describe('fetchSchema', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 各テスト前にキャッシュをクリアしてテストを独立させる
    clearAllSchemaCache()
  })

  /**
   * 【テスト対象】fetchSchema（PostgreSQL向け）
   * 【テスト内容】dbType=postgresql のとき、current_schema() を使うクエリが実行されること
   * 【期待結果】INFORMATION_SCHEMA からテーブル・カラム情報が取得され、SchemaInfo形式で返ること
   */
  it('should fetch schema using current_schema() for PostgreSQL', async () => {
    const mockConnection = createMockConnection({ dbType: 'postgresql', databaseName: 'pgdb' })
    vi.mocked(getById).mockReturnValue(mockConnection)

    const mockRows = [
      { table_name: 'products', table_comment: null, column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_comment: null },
      { table_name: 'products', table_comment: null, column_name: 'name', data_type: 'text', is_nullable: 'YES', column_comment: null },
    ]

    const mockRaw = vi.fn().mockResolvedValue({ rows: mockRows })
    vi.mocked(Knex as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      raw: mockRaw,
      destroy: vi.fn().mockResolvedValue(undefined),
    })

    const result: SchemaInfo = await fetchSchema('test-connection-id')

    expect(result.database).toBe('pgdb')
    expect(result.tables).toHaveLength(1)
    expect(result.tables[0].name).toBe('products')
    expect(result.tables[0].columns).toHaveLength(2)

    // current_schema() を含むSQLが実行されていること
    expect(mockRaw).toHaveBeenCalledOnce()
    const sqlArg: string = mockRaw.mock.calls[0][0]
    expect(sqlArg).toContain('current_schema()')
    expect(sqlArg).toContain('information_schema.columns')
  })

  /**
   * 【テスト対象】fetchSchema（MySQL向け）
   * 【テスト内容】dbType=mysql のとき、DATABASE() を使うクエリが実行されること
   * 【期待結果】INFORMATION_SCHEMA からテーブル・カラム情報が取得され、SchemaInfo形式で返ること
   */
  it('should fetch schema using DATABASE() for MySQL', async () => {
    const mockConnection = createMockConnection({ dbType: 'mysql', databaseName: 'mysqldb' })
    vi.mocked(getById).mockReturnValue(mockConnection)

    const mockRows = [
      { table_name: 'customers', table_comment: null, column_name: 'customer_id', data_type: 'int', is_nullable: 'NO', column_comment: null },
      { table_name: 'customers', table_comment: null, column_name: 'first_name', data_type: 'varchar', is_nullable: 'YES', column_comment: null },
    ]

    // MySQL の knex.raw は [rows, fields] のタプルを返す
    const mockRaw = vi.fn().mockResolvedValue([mockRows, []])
    vi.mocked(Knex as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      raw: mockRaw,
      destroy: vi.fn().mockResolvedValue(undefined),
    })

    const result: SchemaInfo = await fetchSchema('test-connection-id')

    expect(result.database).toBe('mysqldb')
    expect(result.tables).toHaveLength(1)
    expect(result.tables[0].name).toBe('customers')
    expect(result.tables[0].columns[0]).toEqual({ name: 'customer_id', type: 'int', nullable: false, comment: null })
    expect(result.tables[0].columns[1]).toEqual({ name: 'first_name', type: 'varchar', nullable: true, comment: null })

    // DATABASE() を含むSQLが実行されていること
    expect(mockRaw).toHaveBeenCalledOnce()
    const sqlArg: string = mockRaw.mock.calls[0][0]
    expect(sqlArg).toContain('DATABASE()')
    expect(sqlArg).toContain('information_schema.COLUMNS')
  })

  /**
   * 【テスト対象】fetchSchema
   * 【テスト内容】dbType が不正な値の場合
   * 【期待結果】サポート外エラーがスローされること
   */
  it('should throw error when dbType is unsupported', async () => {
    const mockConnection = createMockConnection({ dbType: 'postgresql' })
    // dbType を上書きするために any キャスト
    const connWithInvalidType = { ...mockConnection, dbType: 'oracle' }
    vi.mocked(getById).mockReturnValue(connWithInvalidType as any)

    const mockRaw = vi.fn()
    vi.mocked(Knex as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      raw: mockRaw,
      destroy: vi.fn().mockResolvedValue(undefined),
    })

    await expect(fetchSchema('test-connection-id')).rejects.toThrow('oracle')
  })

  /**
   * 【テスト対象】fetchSchema
   * 【テスト内容】DBクエリ実行中にエラーが発生した場合
   * 【期待結果】エラーが呼び出し元に伝播されること
   */
  it('should propagate DB errors to the caller', async () => {
    const mockConnection = createMockConnection({ dbType: 'postgresql' })
    vi.mocked(getById).mockReturnValue(mockConnection)

    const mockRaw = vi.fn().mockRejectedValue(new Error('Connection refused'))
    vi.mocked(Knex as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      raw: mockRaw,
      destroy: vi.fn().mockResolvedValue(undefined),
    })

    await expect(fetchSchema('test-connection-id')).rejects.toThrow('Connection refused')
  })
})

// -------------------------------------------------------------------
// invalidateSchemaCache のユニットテスト
// -------------------------------------------------------------------

/**
 * 【モジュール】invalidateSchemaCache
 * スキーマキャッシュ無効化関数のテスト
 */
describe('invalidateSchemaCache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearAllSchemaCache()
  })

  /**
   * 【テスト対象】invalidateSchemaCache
   * 【テスト内容】存在しないキーを無効化しようとした場合
   * 【期待結果】エラーなく完了すること（べき等）
   */
  it('should complete without error for non-existent cache key', () => {
    expect(() => invalidateSchemaCache('non-existent-id')).not.toThrow()
  })

  /**
   * 【テスト対象】invalidateSchemaCache
   * 【テスト内容】キャッシュ無効化後にfetchSchemaを呼んだ場合
   * 【期待結果】キャッシュではなくDBから再取得されること（getById が再度呼ばれること）
   */
  it('should cause re-fetch after cache invalidation', async () => {
    const mockConnection = createMockConnection({ dbType: 'postgresql', databaseName: 'pgdb' })
    vi.mocked(getById).mockReturnValue(mockConnection)

    const mockRows = [
      { table_name: 'test', table_comment: null, column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_comment: null },
    ]
    const mockRaw = vi.fn().mockResolvedValue({ rows: mockRows })
    vi.mocked(Knex as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      raw: mockRaw,
      destroy: vi.fn().mockResolvedValue(undefined),
    })

    // 1回目のfetchSchema（キャッシュされる）
    await fetchSchema('test-connection-id')
    expect(mockRaw).toHaveBeenCalledTimes(1)

    // キャッシュ無効化
    invalidateSchemaCache('test-connection-id')

    // 2回目のfetchSchema（キャッシュが無効化されているのでDBから再取得）
    await fetchSchema('test-connection-id')
    expect(mockRaw).toHaveBeenCalledTimes(2)
  })
})
