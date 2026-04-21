/**
 * 【モジュール】backend/src/services/schema.ts
 * スキーマ情報取得サービスのユニットテスト
 *
 * モックDBを使用して以下を検証する:
 * - PostgreSQL/MySQL 両DBで適切なSQLが実行されること
 * - buildSchemaInfo() が正しく INFORMATION_SCHEMA 行を変換すること
 * - fetchSchema() が DB_TYPE に応じて適切なロジックを呼び出すこと
 * - エラー時に例外が伝播すること
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// services/schema から必要なものをインポート
// buildSchemaInfo は純粋関数のため直接テスト可能
import {
  buildSchemaInfo,
  fetchSchema,
  type SchemaInfo,
} from '../../backend/src/services/schema'

// services/database モジュールをモック
vi.mock('../../backend/src/services/database', () => ({
  getDb: vi.fn(),
}))

import { getDb } from '../../backend/src/services/database'

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
 * DB_TYPE に応じてPostgreSQL/MySQLのSQL実行と結果変換を行う関数のテスト
 */
describe('fetchSchema', () => {
  const originalEnv = process.env

  beforeEach(() => {
    // 環境変数のリセット
    process.env = { ...originalEnv }
    vi.clearAllMocks()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  /**
   * 【テスト対象】fetchSchema（PostgreSQL向け）
   * 【テスト内容】DB_TYPE=postgresql のとき、current_schema() を使うクエリが実行されること
   * 【期待結果】INFORMATION_SCHEMA からテーブル・カラム情報が取得され、SchemaInfo形式で返ること
   */
  it('should fetch schema using current_schema() for PostgreSQL', async () => {
    // Arrange
    process.env.DB_TYPE = 'postgresql'
    process.env.DB_NAME = 'pgdb'

    const mockRows = [
      { table_name: 'products', table_comment: null, column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_comment: null },
      { table_name: 'products', table_comment: null, column_name: 'name', data_type: 'text', is_nullable: 'YES', column_comment: null },
    ]

    const mockRaw = vi.fn().mockResolvedValue({ rows: mockRows })
    const mockDb = { raw: mockRaw } as any

    vi.mocked(getDb).mockReturnValue(mockDb)

    // Act
    const result: SchemaInfo = await fetchSchema()

    // Assert
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
   * 【テスト内容】DB_TYPE=mysql のとき、DATABASE() を使うクエリが実行されること
   * 【期待結果】INFORMATION_SCHEMA からテーブル・カラム情報が取得され、SchemaInfo形式で返ること
   */
  it('should fetch schema using DATABASE() for MySQL', async () => {
    // Arrange
    process.env.DB_TYPE = 'mysql'
    process.env.DB_NAME = 'mysqldb'

    const mockRows = [
      { table_name: 'customers', table_comment: null, column_name: 'customer_id', data_type: 'int', is_nullable: 'NO', column_comment: null },
      { table_name: 'customers', table_comment: null, column_name: 'first_name', data_type: 'varchar', is_nullable: 'YES', column_comment: null },
    ]

    // MySQL の knex.raw は [rows, fields] のタプルを返す
    const mockRaw = vi.fn().mockResolvedValue([mockRows, []])
    const mockDb = { raw: mockRaw } as any

    vi.mocked(getDb).mockReturnValue(mockDb)

    // Act
    const result: SchemaInfo = await fetchSchema()

    // Assert
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
   * 【テスト内容】DB_TYPE が不正な値の場合
   * 【期待結果】サポート外エラーがスローされること
   */
  it('should throw error when DB_TYPE is unsupported', async () => {
    // Arrange
    process.env.DB_TYPE = 'oracle'
    process.env.DB_NAME = 'oracledb'

    const mockDb = { raw: vi.fn() } as any
    vi.mocked(getDb).mockReturnValue(mockDb)

    // Act & Assert
    await expect(fetchSchema()).rejects.toThrow('oracle')
  })

  /**
   * 【テスト対象】fetchSchema
   * 【テスト内容】DB_TYPE が未設定の場合
   * 【期待結果】サポート外エラーがスローされること
   */
  it('should throw error when DB_TYPE is not set', async () => {
    // Arrange
    delete process.env.DB_TYPE
    process.env.DB_NAME = 'somedb'

    const mockDb = { raw: vi.fn() } as any
    vi.mocked(getDb).mockReturnValue(mockDb)

    // Act & Assert
    await expect(fetchSchema()).rejects.toThrow()
  })

  /**
   * 【テスト対象】fetchSchema
   * 【テスト内容】引数でknexインスタンスを渡した場合
   * 【期待結果】getDb() を呼ばずに、渡されたインスタンスを使用すること
   */
  it('should use provided db instance instead of getDb()', async () => {
    // Arrange
    process.env.DB_TYPE = 'postgresql'
    process.env.DB_NAME = 'injecteddb'

    const mockRows = [
      { table_name: 'test_table', table_comment: null, column_name: 'col1', data_type: 'integer', is_nullable: 'NO', column_comment: null },
    ]
    const mockRaw = vi.fn().mockResolvedValue({ rows: mockRows })
    const injectedDb = { raw: mockRaw } as any

    // Act
    const result = await fetchSchema(injectedDb)

    // Assert
    expect(result.database).toBe('injecteddb')
    expect(getDb).not.toHaveBeenCalled()
  })

  /**
   * 【テスト対象】fetchSchema
   * 【テスト内容】DBクエリ実行中にエラーが発生した場合
   * 【期待結果】エラーが呼び出し元に伝播されること
   */
  it('should propagate DB errors to the caller', async () => {
    // Arrange
    process.env.DB_TYPE = 'postgresql'
    process.env.DB_NAME = 'errordb'

    const mockRaw = vi.fn().mockRejectedValue(new Error('Connection refused'))
    const mockDb = { raw: mockRaw } as any

    vi.mocked(getDb).mockReturnValue(mockDb)

    // Act & Assert
    await expect(fetchSchema()).rejects.toThrow('Connection refused')
  })
})
