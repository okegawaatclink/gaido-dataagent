/**
 * 【モジュール】backend/src/services/graphqlExecutor.ts
 * GraphQLクエリ実行サービスのユニットテスト
 *
 * このファイルでは GraphQL Executor の以下の挙動を検証する:
 * - flattenObject: ネストしたオブジェクトのフラット化
 * - formatGraphQLResult: GraphQLレスポンスの rows/columns 形式への変換
 * - executeGraphQLQuery: バリデーションと実行（fetch モック）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  flattenObject,
  formatGraphQLResult,
  executeGraphQLQuery,
  GraphQLValidationError,
  GraphQLApiError,
  GraphQLTimeoutError,
  GraphQLConnectionError,
} from '../../backend/src/services/graphqlExecutor'

// =============================================================================
// flattenObject テスト
// =============================================================================

/**
 * 【モジュール】flattenObject
 * ネストしたオブジェクトのフラット化テスト
 */
describe('flattenObject', () => {
  /**
   * 【テスト対象】flattenObject
   * 【テスト内容】フラットなオブジェクト（ネストなし）を渡した場合
   * 【期待結果】元のオブジェクトがそのまま返ること
   */
  it('should return flat object unchanged', () => {
    const obj = { id: 1, name: 'Alice', active: true }
    const result = flattenObject(obj)
    expect(result).toEqual({ id: 1, name: 'Alice', active: true })
  })

  /**
   * 【テスト対象】flattenObject
   * 【テスト内容】1階層ネストしたオブジェクトを渡した場合
   * 【期待結果】ドット記法のキー名でフラット化されること
   *
   * 入力例: { user: { name: "Alice", age: 30 } }
   * 期待値: { "user.name": "Alice", "user.age": 30 }
   */
  it('should flatten one level of nesting with dot notation', () => {
    const obj = { user: { name: 'Alice', age: 30 } }
    const result = flattenObject(obj)
    expect(result).toEqual({ 'user.name': 'Alice', 'user.age': 30 })
  })

  /**
   * 【テスト対象】flattenObject
   * 【テスト内容】複数階層にネストしたオブジェクトを渡した場合
   * 【期待結果】全階層がドット記法でフラット化されること
   *
   * 入力例: { a: { b: { c: "value" } } }
   * 期待値: { "a.b.c": "value" }
   */
  it('should flatten multiple levels of nesting', () => {
    const obj = { a: { b: { c: 'value' } } }
    const result = flattenObject(obj)
    expect(result).toEqual({ 'a.b.c': 'value' })
  })

  /**
   * 【テスト対象】flattenObject
   * 【テスト内容】配列を含むオブジェクトを渡した場合
   * 【期待結果】配列はそのまま保持されること（再帰的にフラット化しない）
   *
   * 入力例: { items: [{ id: 1 }, { id: 2 }] }
   * 期待値: { items: [{ id: 1 }, { id: 2 }] }
   */
  it('should keep arrays as-is without flattening', () => {
    const obj = { items: [{ id: 1 }, { id: 2 }] }
    const result = flattenObject(obj)
    expect(result).toEqual({ items: [{ id: 1 }, { id: 2 }] })
  })

  /**
   * 【テスト対象】flattenObject
   * 【テスト内容】null 値を含むオブジェクトを渡した場合
   * 【期待結果】null 値がそのまま保持されること
   */
  it('should keep null values as-is', () => {
    const obj = { name: 'Alice', email: null }
    const result = flattenObject(obj)
    expect(result).toEqual({ name: 'Alice', email: null })
  })

  /**
   * 【テスト対象】flattenObject
   * 【テスト内容】空のオブジェクトを渡した場合
   * 【期待結果】空のオブジェクトが返ること
   */
  it('should return empty object for empty input', () => {
    const result = flattenObject({})
    expect(result).toEqual({})
  })

  /**
   * 【テスト対象】flattenObject
   * 【テスト内容】混在したオブジェクト（ネスト・配列・スカラー）を渡した場合
   * 【期待結果】ネストした部分のみフラット化され、配列・スカラーはそのまま保持されること
   */
  it('should handle mixed nested and flat fields', () => {
    const obj = {
      id: 1,
      user: { name: 'Alice', role: 'admin' },
      tags: ['a', 'b'],
    }
    const result = flattenObject(obj)
    expect(result).toEqual({
      id: 1,
      'user.name': 'Alice',
      'user.role': 'admin',
      tags: ['a', 'b'],
    })
  })
})

// =============================================================================
// formatGraphQLResult テスト
// =============================================================================

/**
 * 【モジュール】formatGraphQLResult
 * GraphQLレスポンスの data 部分を rows/columns 形式に変換するテスト
 */
describe('formatGraphQLResult', () => {
  /**
   * 【テスト対象】formatGraphQLResult
   * 【テスト内容】配列結果を含む data オブジェクトを渡した場合
   * 【期待結果】columns と rows が正しく抽出されること
   *
   * 入力例: { users: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }] }
   * 期待値: { columns: ['id', 'name'], rows: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }] }
   */
  it('should convert array data to columns and rows', () => {
    const data = {
      users: [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ],
    }
    const result = formatGraphQLResult(data)
    expect(result.columns).toContain('id')
    expect(result.columns).toContain('name')
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toEqual({ id: 1, name: 'Alice' })
    expect(result.rows[1]).toEqual({ id: 2, name: 'Bob' })
  })

  /**
   * 【テスト対象】formatGraphQLResult
   * 【テスト内容】単一オブジェクト結果を含む data を渡した場合
   * 【期待結果】1行として扱われること
   *
   * 入力例: { user: { id: 1, name: 'Alice' } }
   * 期待値: { columns: ['id', 'name'], rows: [{ id: 1, name: 'Alice' }] }
   */
  it('should convert single object data to one row', () => {
    const data = { user: { id: 1, name: 'Alice' } }
    const result = formatGraphQLResult(data)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toEqual({ id: 1, name: 'Alice' })
  })

  /**
   * 【テスト対象】formatGraphQLResult
   * 【テスト内容】ネストしたオブジェクトを含む data を渡した場合
   * 【期待結果】ネストしたフィールドがフラット化されること
   *
   * 入力例: { users: [{ id: 1, profile: { bio: 'hello' } }] }
   * 期待値: { columns: ['id', 'profile.bio'], rows: [{ id: 1, 'profile.bio': 'hello' }] }
   */
  it('should flatten nested objects in rows', () => {
    const data = {
      users: [{ id: 1, profile: { bio: 'hello' } }],
    }
    const result = formatGraphQLResult(data)
    expect(result.columns).toContain('id')
    expect(result.columns).toContain('profile.bio')
    expect(result.rows[0]['profile.bio']).toBe('hello')
  })

  /**
   * 【テスト対象】formatGraphQLResult
   * 【テスト内容】空の配列を含む data を渡した場合
   * 【期待結果】columns が空配列、rows が空配列で返ること
   */
  it('should return empty columns and rows for empty array', () => {
    const data = { users: [] }
    const result = formatGraphQLResult(data)
    expect(result.columns).toEqual([])
    expect(result.rows).toEqual([])
  })

  /**
   * 【テスト対象】formatGraphQLResult
   * 【テスト内容】空のオブジェクトを渡した場合
   * 【期待結果】columns が空配列、rows が空配列で返ること
   */
  it('should return empty result for empty data object', () => {
    const result = formatGraphQLResult({})
    expect(result.columns).toEqual([])
    expect(result.rows).toEqual([])
  })

  /**
   * 【テスト対象】formatGraphQLResult
   * 【テスト内容】プリミティブ値（数値）を含む data を渡した場合
   * 【期待結果】1行1列として扱われること
   */
  it('should handle primitive scalar result', () => {
    const data = { count: 42 }
    const result = formatGraphQLResult(data)
    expect(result.columns).toContain('count')
    expect(result.rows[0]).toEqual({ count: 42 })
  })
})

// =============================================================================
// executeGraphQLQuery テスト（fetch モック）
// =============================================================================

/**
 * 【モジュール】executeGraphQLQuery
 * GraphQLクエリ実行のテスト（グローバル fetch をモック）
 */
describe('executeGraphQLQuery', () => {
  beforeEach(() => {
    // fetch をモックする
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /**
   * 【テスト対象】executeGraphQLQuery
   * 【テスト内容】Mutation キーワードを含むクエリを実行しようとした場合
   * 【期待結果】GraphQLValidationError がスローされること（fetch は呼ばれない）
   */
  it('should throw GraphQLValidationError for mutation query', async () => {
    await expect(
      executeGraphQLQuery('https://api.example.com/graphql', 'mutation { createUser { id } }')
    ).rejects.toThrow(GraphQLValidationError)
    // バリデーションで弾かれるため fetch は呼ばれない
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  /**
   * 【テスト対象】executeGraphQLQuery
   * 【テスト内容】Subscription キーワードを含むクエリを実行しようとした場合
   * 【期待結果】GraphQLValidationError がスローされること
   */
  it('should throw GraphQLValidationError for subscription query', async () => {
    await expect(
      executeGraphQLQuery('https://api.example.com/graphql', 'subscription { userCreated { id } }')
    ).rejects.toThrow(GraphQLValidationError)
  })

  /**
   * 【テスト対象】executeGraphQLQuery
   * 【テスト内容】有効なクエリでエンドポイントが正常応答した場合
   * 【期待結果】rows/columns 形式の結果が返ること
   */
  it('should return query result for valid query with successful response', async () => {
    const mockResponse = {
      data: {
        users: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
      },
    }
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response)

    const result = await executeGraphQLQuery(
      'https://api.example.com/graphql',
      '{ users { id name } }'
    )
    expect(result.columns).toContain('id')
    expect(result.columns).toContain('name')
    expect(result.rows).toHaveLength(2)
  })

  /**
   * 【テスト対象】executeGraphQLQuery
   * 【テスト内容】GraphQLエンドポイントが errors 配列のみを返した場合
   * 【期待結果】GraphQLApiError がスローされること
   */
  it('should throw GraphQLApiError when response contains only errors', async () => {
    const mockResponse = {
      errors: [{ message: 'Field "unknownField" not found' }],
    }
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response)

    await expect(
      executeGraphQLQuery('https://api.example.com/graphql', '{ unknownField }')
    ).rejects.toThrow(GraphQLApiError)
  })

  /**
   * 【テスト対象】executeGraphQLQuery
   * 【テスト内容】HTTP エラー（404）が返った場合
   * 【期待結果】GraphQLConnectionError がスローされること
   */
  it('should throw GraphQLConnectionError for HTTP error response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    } as Response)

    await expect(
      executeGraphQLQuery('https://api.example.com/graphql', '{ users { id } }')
    ).rejects.toThrow(GraphQLConnectionError)
  })

  /**
   * 【テスト対象】executeGraphQLQuery
   * 【テスト内容】fetch が AbortError をスローした場合（タイムアウト）
   * 【期待結果】GraphQLTimeoutError がスローされること
   */
  it('should throw GraphQLTimeoutError when fetch is aborted', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError')
    vi.mocked(fetch).mockRejectedValueOnce(abortError)

    await expect(
      executeGraphQLQuery('https://api.example.com/graphql', '{ users { id } }')
    ).rejects.toThrow(GraphQLTimeoutError)
  })

  /**
   * 【テスト対象】executeGraphQLQuery
   * 【テスト内容】fetch がネットワークエラーをスローした場合
   * 【期待結果】GraphQLConnectionError がスローされること
   */
  it('should throw GraphQLConnectionError for network error', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'))

    await expect(
      executeGraphQLQuery('https://api.example.com/graphql', '{ users { id } }')
    ).rejects.toThrow(GraphQLConnectionError)
  })

  /**
   * 【テスト対象】executeGraphQLQuery
   * 【テスト内容】部分成功（data と errors の両方が存在）の場合
   * 【期待結果】data 部分が結果として返ること（エラーは無視される）
   */
  it('should return data part when both data and errors are present (partial success)', async () => {
    const mockResponse = {
      data: { users: [{ id: 1, name: 'Alice' }] },
      errors: [{ message: 'Some non-critical error' }],
    }
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response)

    const result = await executeGraphQLQuery(
      'https://api.example.com/graphql',
      '{ users { id name } }'
    )
    // 部分成功: data 部分を結果として返す
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toEqual({ id: 1, name: 'Alice' })
  })

  /**
   * 【テスト対象】executeGraphQLQuery
   * 【テスト内容】空の data を含むレスポンスが返った場合
   * 【期待結果】空の columns と rows が返ること
   */
  it('should return empty result for empty data response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: {} }),
    } as Response)

    const result = await executeGraphQLQuery(
      'https://api.example.com/graphql',
      '{ users { id } }'
    )
    expect(result.columns).toEqual([])
    expect(result.rows).toEqual([])
  })
})
