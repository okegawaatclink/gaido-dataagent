/**
 * 【モジュール】backend/src/services/database.ts
 * DB接続ファクトリ・クエリ実行サービスのユニットテスト
 *
 * テスト対象:
 *   - resolveKnexClient(): DB_TYPE → knex クライアント名変換
 *   - buildKnexConfig(): 環境変数から knex 設定を構築
 *   - getDb(): シングルトンインスタンスの取得
 *   - resetDbInstance(): テスト用リセット
 *   - executeQuery(): SQL実行と結果の正規化
 *   - SqlValidationError: カスタムエラークラス
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// sqlValidator モジュールをモック
vi.mock('../../backend/src/services/sqlValidator', () => ({
  validate: vi.fn(),
}))

import {
  resolveKnexClient,
  buildKnexConfig,
  getDb,
  resetDbInstance,
  closeDb,
  executeQuery,
  SqlValidationError,
} from '../../backend/src/services/database'
import { validate } from '../../backend/src/services/sqlValidator'

// ---------------------------------------------------------------------------
// resolveKnexClient のテスト
// ---------------------------------------------------------------------------

describe('resolveKnexClient', () => {
  /**
   * 【テスト対象】resolveKnexClient
   * 【テスト内容】'postgresql' を渡した場合
   * 【期待結果】'pg' が返ること
   */
  it('should return "pg" for "postgresql"', () => {
    expect(resolveKnexClient('postgresql')).toBe('pg')
  })

  /**
   * 【テスト対象】resolveKnexClient
   * 【テスト内容】'mysql' を渡した場合
   * 【期待結果】'mysql2' が返ること
   */
  it('should return "mysql2" for "mysql"', () => {
    expect(resolveKnexClient('mysql')).toBe('mysql2')
  })

  /**
   * 【テスト対象】resolveKnexClient
   * 【テスト内容】サポート外の値を渡した場合
   * 【期待結果】エラーがスローされること
   */
  it('should throw error for unsupported DB type', () => {
    expect(() => resolveKnexClient('oracle')).toThrow('oracle')
  })
})

// ---------------------------------------------------------------------------
// buildKnexConfig のテスト
// ---------------------------------------------------------------------------

describe('buildKnexConfig', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  /**
   * 【テスト対象】buildKnexConfig
   * 【テスト内容】必須環境変数がすべて設定されている場合
   * 【期待結果】正しい knex 設定オブジェクトが返ること
   */
  it('should build config from environment variables', () => {
    process.env.DB_TYPE = 'postgresql'
    process.env.DB_HOST = 'localhost'
    process.env.DB_PORT = '5432'
    process.env.DB_USER = 'testuser'
    process.env.DB_PASSWORD = 'testpass'
    process.env.DB_NAME = 'testdb'

    const config = buildKnexConfig()

    expect(config.client).toBe('pg')
    expect((config.connection as Record<string, unknown>).host).toBe('localhost')
    expect((config.connection as Record<string, unknown>).port).toBe(5432)
    expect((config.connection as Record<string, unknown>).user).toBe('testuser')
    expect((config.connection as Record<string, unknown>).password).toBe('testpass')
    expect((config.connection as Record<string, unknown>).database).toBe('testdb')
  })

  /**
   * 【テスト対象】buildKnexConfig
   * 【テスト内容】DB_PORT が未設定の場合にデフォルトポートが使われること
   * 【期待結果】PostgreSQLの場合は5432が使われること
   */
  it('should use default port 5432 for postgresql when DB_PORT is not set', () => {
    process.env.DB_TYPE = 'postgresql'
    process.env.DB_HOST = 'localhost'
    delete process.env.DB_PORT
    process.env.DB_USER = 'testuser'
    process.env.DB_NAME = 'testdb'

    const config = buildKnexConfig()
    expect((config.connection as Record<string, unknown>).port).toBe(5432)
  })

  /**
   * 【テスト対象】buildKnexConfig
   * 【テスト内容】MySQLでDB_PORT未設定の場合にデフォルトポート3306が使われること
   * 【期待結果】ポート3306が返ること
   */
  it('should use default port 3306 for mysql when DB_PORT is not set', () => {
    process.env.DB_TYPE = 'mysql'
    process.env.DB_HOST = 'localhost'
    delete process.env.DB_PORT
    process.env.DB_USER = 'testuser'
    process.env.DB_NAME = 'testdb'

    const config = buildKnexConfig()
    expect((config.connection as Record<string, unknown>).port).toBe(3306)
  })

  /**
   * 【テスト対象】buildKnexConfig
   * 【テスト内容】DB_PASSWORD が未設定の場合に空文字が使われること
   * 【期待結果】password が空文字列であること
   */
  it('should use empty string for password when DB_PASSWORD is not set', () => {
    process.env.DB_TYPE = 'postgresql'
    process.env.DB_HOST = 'localhost'
    process.env.DB_USER = 'testuser'
    process.env.DB_NAME = 'testdb'
    delete process.env.DB_PASSWORD

    const config = buildKnexConfig()
    expect((config.connection as Record<string, unknown>).password).toBe('')
  })

  /**
   * 【テスト対象】buildKnexConfig
   * 【テスト内容】必須環境変数が欠落している場合
   * 【期待結果】エラーがスローされること
   */
  it('should throw error when required env variables are missing', () => {
    delete process.env.DB_TYPE
    delete process.env.DB_HOST
    delete process.env.DB_USER
    delete process.env.DB_NAME

    expect(() => buildKnexConfig()).toThrow('DB_TYPE')
  })

  /**
   * 【テスト対象】buildKnexConfig
   * 【テスト内容】DB_HOST のみ欠落している場合
   * 【期待結果】エラーメッセージに DB_HOST が含まれること
   */
  it('should include missing variable name in error message', () => {
    process.env.DB_TYPE = 'postgresql'
    delete process.env.DB_HOST
    process.env.DB_USER = 'testuser'
    process.env.DB_NAME = 'testdb'

    expect(() => buildKnexConfig()).toThrow('DB_HOST')
  })
})

// ---------------------------------------------------------------------------
// getDb / resetDbInstance / closeDb のテスト
// ---------------------------------------------------------------------------

describe('getDb / resetDbInstance / closeDb', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    resetDbInstance(null)
  })

  afterEach(() => {
    resetDbInstance(null)
    process.env = originalEnv
  })

  /**
   * 【テスト対象】resetDbInstance
   * 【テスト内容】モックインスタンスを注入した場合にそれが返ること
   * 【期待結果】注入したインスタンスが getDb() から返ること
   */
  it('should return injected instance after resetDbInstance', () => {
    const mockInstance = { mock: true } as any
    resetDbInstance(mockInstance)
    expect(getDb()).toBe(mockInstance)
  })

  /**
   * 【テスト対象】closeDb
   * 【テスト内容】インスタンスが null の場合にエラーなく完了すること
   * 【期待結果】エラーがスローされないこと
   */
  it('should not throw when closing with no instance', async () => {
    resetDbInstance(null)
    await expect(closeDb()).resolves.not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// executeQuery のテスト
// ---------------------------------------------------------------------------

describe('executeQuery', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    vi.clearAllMocks()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  /**
   * 【テスト対象】executeQuery
   * 【テスト内容】バリデーション失敗時に SqlValidationError がスローされること
   * 【期待結果】SqlValidationError がスローされること
   */
  it('should throw SqlValidationError when validation fails', async () => {
    vi.mocked(validate).mockReturnValue({ ok: false, reason: 'Forbidden keyword' })

    await expect(executeQuery('DROP TABLE users')).rejects.toThrow(SqlValidationError)
  })

  /**
   * 【テスト対象】executeQuery
   * 【テスト内容】PostgreSQLモードでクエリを実行した場合
   * 【期待結果】正規化された QueryResult が返ること
   */
  it('should execute query and return normalized result for PostgreSQL', async () => {
    process.env.DB_TYPE = 'postgresql'

    vi.mocked(validate).mockReturnValue({ ok: true, sanitizedSql: 'SELECT id, name FROM users' })

    const mockRows = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ]
    const mockRaw = vi.fn().mockResolvedValue({ rows: mockRows })
    const mockDb = { raw: mockRaw } as any

    const result = await executeQuery('SELECT id, name FROM users', mockDb)

    expect(result.columns).toEqual(['id', 'name'])
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toEqual({ id: 1, name: 'Alice' })
  })

  /**
   * 【テスト対象】executeQuery
   * 【テスト内容】MySQLモードでクエリを実行した場合
   * 【期待結果】タプル形式の結果から正規化された QueryResult が返ること
   */
  it('should execute query and return normalized result for MySQL', async () => {
    process.env.DB_TYPE = 'mysql'

    vi.mocked(validate).mockReturnValue({ ok: true, sanitizedSql: 'SELECT id FROM orders' })

    const mockRows = [{ id: 1 }, { id: 2 }]
    const mockRaw = vi.fn().mockResolvedValue([mockRows, []])
    const mockDb = { raw: mockRaw } as any

    const result = await executeQuery('SELECT id FROM orders', mockDb)

    expect(result.columns).toEqual(['id'])
    expect(result.rows).toHaveLength(2)
  })

  /**
   * 【テスト対象】executeQuery
   * 【テスト内容】結果が空の場合
   * 【期待結果】columns が空配列、rows が空配列で返ること
   */
  it('should return empty columns and rows when result is empty', async () => {
    process.env.DB_TYPE = 'postgresql'

    vi.mocked(validate).mockReturnValue({ ok: true, sanitizedSql: 'SELECT * FROM empty_table' })

    const mockRaw = vi.fn().mockResolvedValue({ rows: [] })
    const mockDb = { raw: mockRaw } as any

    const result = await executeQuery('SELECT * FROM empty_table', mockDb)

    expect(result.columns).toEqual([])
    expect(result.rows).toEqual([])
  })

  /**
   * 【テスト対象】executeQuery
   * 【テスト内容】BigInt 値が文字列に変換されること
   * 【期待結果】BigInt が文字列化されていること
   */
  it('should normalize BigInt values to strings', async () => {
    process.env.DB_TYPE = 'postgresql'

    vi.mocked(validate).mockReturnValue({ ok: true, sanitizedSql: 'SELECT big_num FROM data' })

    const mockRows = [{ big_num: BigInt('9999999999999999') }]
    const mockRaw = vi.fn().mockResolvedValue({ rows: mockRows })
    const mockDb = { raw: mockRaw } as any

    const result = await executeQuery('SELECT big_num FROM data', mockDb)

    expect(result.rows[0].big_num).toBe('9999999999999999')
  })

  /**
   * 【テスト対象】executeQuery
   * 【テスト内容】Date 値が ISO 文字列に変換されること
   * 【期待結果】Date が ISO 8601 文字列化されていること
   */
  it('should normalize Date values to ISO strings', async () => {
    process.env.DB_TYPE = 'postgresql'

    vi.mocked(validate).mockReturnValue({ ok: true, sanitizedSql: 'SELECT created_at FROM data' })

    const testDate = new Date('2024-01-15T10:30:00.000Z')
    const mockRows = [{ created_at: testDate }]
    const mockRaw = vi.fn().mockResolvedValue({ rows: mockRows })
    const mockDb = { raw: mockRaw } as any

    const result = await executeQuery('SELECT created_at FROM data', mockDb)

    expect(result.rows[0].created_at).toBe('2024-01-15T10:30:00.000Z')
  })

  /**
   * 【テスト対象】executeQuery
   * 【テスト内容】null 値がそのまま null で返ること
   * 【期待結果】null が保持されること
   */
  it('should preserve null values', async () => {
    process.env.DB_TYPE = 'postgresql'

    vi.mocked(validate).mockReturnValue({ ok: true, sanitizedSql: 'SELECT nullable_col FROM data' })

    const mockRows = [{ nullable_col: null }]
    const mockRaw = vi.fn().mockResolvedValue({ rows: mockRows })
    const mockDb = { raw: mockRaw } as any

    const result = await executeQuery('SELECT nullable_col FROM data', mockDb)

    expect(result.rows[0].nullable_col).toBeNull()
  })

  /**
   * 【テスト対象】executeQuery
   * 【テスト内容】sanitizedSql が使用されること
   * 【期待結果】validate が返した sanitizedSql が DB に渡されること
   */
  it('should use sanitizedSql from validator', async () => {
    process.env.DB_TYPE = 'postgresql'

    vi.mocked(validate).mockReturnValue({ ok: true, sanitizedSql: 'SELECT * FROM users' })

    const mockRaw = vi.fn().mockResolvedValue({ rows: [] })
    const mockDb = { raw: mockRaw } as any

    await executeQuery('SELECT * FROM users -- comment', mockDb)

    // sanitizedSql が渡されていること（コメント除去後のSQL）
    expect(mockRaw).toHaveBeenCalledWith('SELECT * FROM users')
  })

  /**
   * 【テスト対象】executeQuery
   * 【テスト内容】sanitizedSql が undefined の場合は元の SQL が使用されること
   * 【期待結果】元の SQL 文が DB に渡されること
   */
  it('should fall back to original sql when sanitizedSql is undefined', async () => {
    process.env.DB_TYPE = 'postgresql'

    vi.mocked(validate).mockReturnValue({ ok: true })

    const mockRaw = vi.fn().mockResolvedValue({ rows: [] })
    const mockDb = { raw: mockRaw } as any

    await executeQuery('SELECT 1', mockDb)

    expect(mockRaw).toHaveBeenCalledWith('SELECT 1')
  })
})

// ---------------------------------------------------------------------------
// SqlValidationError のテスト
// ---------------------------------------------------------------------------

describe('SqlValidationError', () => {
  /**
   * 【テスト対象】SqlValidationError
   * 【テスト内容】instanceof チェックが正しく動作すること
   * 【期待結果】Error および SqlValidationError の instanceof が true であること
   */
  it('should be instanceof Error and SqlValidationError', () => {
    const err = new SqlValidationError('test error')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(SqlValidationError)
    expect(err.name).toBe('SqlValidationError')
    expect(err.type).toBe('SqlValidationError')
    expect(err.message).toBe('test error')
  })
})
