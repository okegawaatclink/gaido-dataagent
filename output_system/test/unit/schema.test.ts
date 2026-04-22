/**
 * 【モジュール】backend/src/services/schema.ts
 * スキーマ情報取得サービスのユニットテスト
 *
 * PBI #149 改修後のテスト:
 *   - fetchSchema(): dbConnectionId を引数に取り、connectionManager 経由で動的接続
 *   - buildSchemaInfo(): 純粋関数のため直接テスト
 *   - invalidateSchemaCache(): キャッシュ無効化の動作確認
 *
 * PBI #200 追加:
 *   - GraphQL接続先のスキーマ取得テスト（Introspection Query）
 *   - MySQL テストの修正（SET NAMES utf8mb4 が raw を1回余分に呼ぶ）
 *
 * テスト方針:
 *   - connectionManager.getById() をモックして実際のDB接続を行わない
 *   - knex をモックして実際のSQLを実行しない
 *   - GraphQL Introspection は globalThis.fetch をモックして実際のHTTPリクエストを行わない
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
 *
 * PBI #200: GraphQL接続先にも対応（dbType='graphql', endpointUrl を追加）
 */
function createMockConnection(overrides: Partial<{
  id: string
  dbType: 'mysql' | 'postgresql' | 'graphql'
  host: string | null
  port: number | null
  username: string | null
  password: string
  databaseName: string | null
  endpointUrl: string | null
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
    endpointUrl: null,
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
    // SET NAMES utf8mb4 も raw を呼ぶため、最初の呼び出しは undefined を返すモック
    const mockRaw = vi.fn()
      .mockResolvedValueOnce(undefined) // SET NAMES utf8mb4
      .mockResolvedValueOnce([mockRows, []]) // INFORMATION_SCHEMA クエリ
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

    // raw が2回呼ばれること（1回目: SET NAMES utf8mb4, 2回目: INFORMATION_SCHEMA クエリ）
    expect(mockRaw).toHaveBeenCalledTimes(2)
    // 1回目: SET NAMES utf8mb4
    expect(mockRaw.mock.calls[0][0]).toBe('SET NAMES utf8mb4')
    // 2回目: INFORMATION_SCHEMA クエリ（DATABASE() を含む）
    const sqlArg: string = mockRaw.mock.calls[1][0]
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

// -------------------------------------------------------------------
// GraphQL Introspection スキーマ取得のユニットテスト（PBI #200 追加）
// -------------------------------------------------------------------

/**
 * 【モジュール】fetchSchema（GraphQL向け）
 * GraphQL接続先のスキーマ取得（Introspection Query）のテスト
 *
 * globalThis.fetch をモックして実際のHTTPリクエストを行わない。
 */
describe('fetchSchema (GraphQL)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearAllSchemaCache()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /**
   * 【テスト対象】fetchSchema（GraphQL向け）
   * 【テスト内容】dbType='graphql' のとき、Introspection Query が実行され SchemaInfo が返ること
   * 【期待結果】OBJECT型のフィールドが tables として返り、ビルトイン型（__で始まる）は除外されること
   */
  it('should fetch GraphQL schema via Introspection Query', async () => {
    // GraphQL接続先のモック設定
    const mockConnection = createMockConnection({
      dbType: 'graphql',
      host: null,
      port: null,
      username: null,
      databaseName: null,
      endpointUrl: 'https://api.example.com/graphql',
    })
    vi.mocked(getById).mockReturnValue(mockConnection as any)

    // Introspection レスポンスのモック
    const mockIntrospectionResponse = {
      data: {
        __schema: {
          types: [
            {
              name: 'User',
              kind: 'OBJECT',
              fields: [
                {
                  name: 'id',
                  type: { name: null, kind: 'NON_NULL', ofType: { name: 'ID', kind: 'SCALAR' } },
                },
                {
                  name: 'name',
                  type: { name: 'String', kind: 'SCALAR', ofType: null },
                },
              ],
            },
            {
              name: 'Query',
              kind: 'OBJECT',
              fields: [
                {
                  name: 'users',
                  type: { name: null, kind: 'LIST', ofType: { name: 'User', kind: 'OBJECT' } },
                },
              ],
            },
            // ビルトイン型（除外されること）
            {
              name: '__Schema',
              kind: 'OBJECT',
              fields: [],
            },
            // SCALAR型（除外されること）
            {
              name: 'String',
              kind: 'SCALAR',
              fields: null,
            },
          ],
        },
      },
    }

    // fetch をモック
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockIntrospectionResponse,
    } as Response)

    const result: SchemaInfo = await fetchSchema('test-graphql-connection-id')

    // GraphQL接続先のスキーマが正しく取得されること
    expect(result.dbType).toBe('graphql')
    expect(result.database).toBe('https://api.example.com/graphql')

    // OBJECT型のみが返り、ビルトイン型とSCALAR型は除外されること
    expect(result.tables).toHaveLength(2) // User と Query のみ
    const userType = result.tables.find((t) => t.name === 'User')
    expect(userType).toBeDefined()
    expect(userType?.columns).toHaveLength(2)
    // id フィールドは NON_NULL(ID) → 'ID!'
    expect(userType?.columns[0]).toEqual({ name: 'id', type: 'ID!', nullable: false, comment: null })
    // name フィールドは String（nullable）
    expect(userType?.columns[1]).toEqual({ name: 'name', type: 'String', nullable: true, comment: null })

    // ビルトイン型（__Schema）が除外されていること
    const builtinType = result.tables.find((t) => t.name === '__Schema')
    expect(builtinType).toBeUndefined()

    // SCALAR型（String）が除外されていること
    const scalarType = result.tables.find((t) => t.name === 'String')
    expect(scalarType).toBeUndefined()
  })

  /**
   * 【テスト対象】fetchSchema（GraphQL向け）
   * 【テスト内容】HTTPエラーが返った場合
   * 【期待結果】エラーがスローされること
   */
  it('should throw error when HTTP response is not ok', async () => {
    const mockConnection = createMockConnection({
      dbType: 'graphql',
      host: null,
      port: null,
      username: null,
      databaseName: null,
      endpointUrl: 'https://api.example.com/graphql',
    })
    vi.mocked(getById).mockReturnValue(mockConnection as any)

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: async () => ({ errors: [] }),
    } as Response)

    await expect(fetchSchema('test-graphql-connection-id')).rejects.toThrow('HTTP 403')
  })

  /**
   * 【テスト対象】fetchSchema（GraphQL向け）
   * 【テスト内容】GraphQL Introspection が無効になっている場合
   * 【期待結果】エラーがスローされること
   */
  it('should throw error when Introspection returns GraphQL errors', async () => {
    const mockConnection = createMockConnection({
      dbType: 'graphql',
      host: null,
      port: null,
      username: null,
      databaseName: null,
      endpointUrl: 'https://api.example.com/graphql',
    })
    vi.mocked(getById).mockReturnValue(mockConnection as any)

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        errors: [{ message: 'Introspection is not allowed' }],
      }),
    } as Response)

    await expect(fetchSchema('test-graphql-connection-id')).rejects.toThrow('Introspection')
  })
})
