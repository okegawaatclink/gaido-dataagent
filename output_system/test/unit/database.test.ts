/**
 * 【モジュール】backend/src/services/database.ts
 * DB接続ファクトリ・クエリ実行サービスのユニットテスト
 *
 * PBI #149 改修後のテスト:
 *   - executeQuery(): dbConnectionId + SQL を引数に取り、connectionManager 経由で動的接続
 *   - SqlValidationError: カスタムエラークラスの instanceof チェック
 *   - destroyConnection(): 接続プール破棄（副作用なしで完了すること）
 *
 * テスト方針:
 *   - connectionManager.getById() をモックして実際のDB接続を行わない
 *   - sqlValidator.validate() をモックしてバリデーションロジックを独立してテスト
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// sqlValidator モジュールをモック
vi.mock('../../backend/src/services/sqlValidator', () => ({
  validate: vi.fn(),
}))

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
  executeQuery,
  destroyConnection,
  destroyAllConnections,
  SqlValidationError,
} from '../../backend/src/services/database'
import { validate } from '../../backend/src/services/sqlValidator'
import { getById } from '../../backend/src/services/connectionManager'
import Knex from 'knex'

// ---------------------------------------------------------------------------
// テストセットアップ: 各テスト前に接続プールをクリア
// ---------------------------------------------------------------------------
// database.ts はモジュールレベルの connectionPool (Map) を持つ。
// テスト間の独立性を確保するため、各テスト後に destroyAllConnections() で
// プールをクリアする。これにより各テストで新しい Knex モックが適用される。

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

// ---------------------------------------------------------------------------
// executeQuery のテスト
// ---------------------------------------------------------------------------

describe('executeQuery', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    vi.clearAllMocks()
  })

  afterEach(async () => {
    process.env = originalEnv
    // 接続プールをクリア（テスト間の独立性確保: 各テストで新しい Knex モックを適用）
    // afterEach でクリアすることで、次のテストが始まる前に必ず空の状態になる
    await destroyAllConnections()
  })

  /**
   * 【テスト対象】executeQuery
   * 【テスト内容】SQLバリデーション失敗時に SqlValidationError がスローされること
   * 【期待結果】SqlValidationError がスローされること（DB接続前にバリデーションで弾かれる）
   */
  it('should throw SqlValidationError when validation fails', async () => {
    vi.mocked(validate).mockReturnValue({ ok: false, reason: 'Forbidden keyword' })

    await expect(executeQuery('validation-fail-conn-id', 'DROP TABLE users')).rejects.toThrow(SqlValidationError)
  })

  /**
   * 【テスト対象】executeQuery
   * 【テスト内容】PostgreSQLモードでクエリを実行した場合
   * 【期待結果】正規化された QueryResult が返ること
   */
  it('should execute query and return normalized result for PostgreSQL', async () => {
    const connId = 'pg-conn-id-001'
    const mockConnection = createMockConnection({ id: connId, dbType: 'postgresql' })
    vi.mocked(getById).mockReturnValue(mockConnection)
    vi.mocked(validate).mockReturnValue({ ok: true, sanitizedSql: 'SELECT id, name FROM users' })

    const mockRows = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ]
    const mockRaw = vi.fn().mockResolvedValue({ rows: mockRows })
    vi.mocked(Knex as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      raw: mockRaw,
      destroy: vi.fn().mockResolvedValue(undefined),
    })

    const result = await executeQuery(connId, 'SELECT id, name FROM users')

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
    const connId = 'mysql-conn-id-002'
    const mockConnection = createMockConnection({ id: connId, dbType: 'mysql' })
    vi.mocked(getById).mockReturnValue(mockConnection)
    vi.mocked(validate).mockReturnValue({ ok: true, sanitizedSql: 'SELECT id FROM orders' })

    const mockRows = [{ id: 1 }, { id: 2 }]
    const mockRaw = vi.fn().mockResolvedValue([mockRows, []])
    vi.mocked(Knex as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      raw: mockRaw,
      destroy: vi.fn().mockResolvedValue(undefined),
    })

    const result = await executeQuery(connId, 'SELECT id FROM orders')

    expect(result.columns).toEqual(['id'])
    expect(result.rows).toHaveLength(2)
  })

  /**
   * 【テスト対象】executeQuery
   * 【テスト内容】結果が空の場合
   * 【期待結果】columns が空配列、rows が空配列で返ること
   */
  it('should return empty columns and rows when result is empty', async () => {
    const connId = 'pg-conn-id-003'
    const mockConnection = createMockConnection({ id: connId, dbType: 'postgresql' })
    vi.mocked(getById).mockReturnValue(mockConnection)
    vi.mocked(validate).mockReturnValue({ ok: true, sanitizedSql: 'SELECT * FROM empty_table' })

    const mockRaw = vi.fn().mockResolvedValue({ rows: [] })
    vi.mocked(Knex as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      raw: mockRaw,
      destroy: vi.fn().mockResolvedValue(undefined),
    })

    const result = await executeQuery(connId, 'SELECT * FROM empty_table')

    expect(result.columns).toEqual([])
    expect(result.rows).toEqual([])
  })

  /**
   * 【テスト対象】executeQuery
   * 【テスト内容】BigInt 値が文字列に変換されること
   * 【期待結果】BigInt が文字列化されていること
   */
  it('should normalize BigInt values to strings', async () => {
    const connId = 'pg-conn-id-004'
    const mockConnection = createMockConnection({ id: connId, dbType: 'postgresql' })
    vi.mocked(getById).mockReturnValue(mockConnection)
    vi.mocked(validate).mockReturnValue({ ok: true, sanitizedSql: 'SELECT big_num FROM data' })

    const mockRows = [{ big_num: BigInt('9999999999999999') }]
    const mockRaw = vi.fn().mockResolvedValue({ rows: mockRows })
    vi.mocked(Knex as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      raw: mockRaw,
      destroy: vi.fn().mockResolvedValue(undefined),
    })

    const result = await executeQuery(connId, 'SELECT big_num FROM data')

    expect(result.rows[0].big_num).toBe('9999999999999999')
  })

  /**
   * 【テスト対象】executeQuery
   * 【テスト内容】Date 値が ISO 文字列に変換されること
   * 【期待結果】Date が ISO 8601 文字列化されていること
   */
  it('should normalize Date values to ISO strings', async () => {
    const connId = 'pg-conn-id-005'
    const mockConnection = createMockConnection({ id: connId, dbType: 'postgresql' })
    vi.mocked(getById).mockReturnValue(mockConnection)
    vi.mocked(validate).mockReturnValue({ ok: true, sanitizedSql: 'SELECT created_at FROM data' })

    const testDate = new Date('2024-01-15T10:30:00.000Z')
    const mockRows = [{ created_at: testDate }]
    const mockRaw = vi.fn().mockResolvedValue({ rows: mockRows })
    vi.mocked(Knex as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      raw: mockRaw,
      destroy: vi.fn().mockResolvedValue(undefined),
    })

    const result = await executeQuery(connId, 'SELECT created_at FROM data')

    expect(result.rows[0].created_at).toBe('2024-01-15T10:30:00.000Z')
  })

  /**
   * 【テスト対象】executeQuery
   * 【テスト内容】null 値がそのまま null で返ること
   * 【期待結果】null が保持されること
   */
  it('should preserve null values', async () => {
    const connId = 'pg-conn-id-006'
    const mockConnection = createMockConnection({ id: connId, dbType: 'postgresql' })
    vi.mocked(getById).mockReturnValue(mockConnection)
    vi.mocked(validate).mockReturnValue({ ok: true, sanitizedSql: 'SELECT nullable_col FROM data' })

    const mockRows = [{ nullable_col: null }]
    const mockRaw = vi.fn().mockResolvedValue({ rows: mockRows })
    vi.mocked(Knex as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      raw: mockRaw,
      destroy: vi.fn().mockResolvedValue(undefined),
    })

    const result = await executeQuery(connId, 'SELECT nullable_col FROM data')

    expect(result.rows[0].nullable_col).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// destroyConnection / destroyAllConnections のテスト
// ---------------------------------------------------------------------------

describe('destroyConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /**
   * 【テスト対象】destroyConnection
   * 【テスト内容】存在しない接続先IDを渡した場合
   * 【期待結果】エラーなく完了すること（プールに存在しない場合は何もしない）
   */
  it('should complete without error for non-existent connection id', async () => {
    await expect(destroyConnection('non-existent-id')).resolves.not.toThrow()
  })
})

describe('destroyAllConnections', () => {
  /**
   * 【テスト対象】destroyAllConnections
   * 【テスト内容】プールが空の場合に呼び出した場合
   * 【期待結果】エラーなく完了すること
   */
  it('should complete without error when pool is empty', async () => {
    await expect(destroyAllConnections()).resolves.not.toThrow()
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
