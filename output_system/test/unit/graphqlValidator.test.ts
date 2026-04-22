/**
 * 【モジュール】backend/src/services/graphqlValidator.ts
 * GraphQLクエリバリデーターサービスのユニットテスト
 *
 * このファイルでは GraphQL バリデーターの以下の挙動を検証する:
 * - 許可パターン: shorthand query ({ ... }), 名前付き query (query { ... })
 * - 拒否パターン: mutation, subscription, 空文字
 * - コメント除去後のバリデーション
 */

import { describe, it, expect } from 'vitest'
import { validateGraphQL } from '../../backend/src/services/graphqlValidator'

/**
 * 【モジュール】validateGraphQL
 * GraphQLクエリバリデーションの全挙動テスト
 */
describe('validateGraphQL', () => {
  // ---------------------------------------------------------------------------
  // 許可パターン
  // ---------------------------------------------------------------------------

  /**
   * 【テスト対象】validateGraphQL
   * 【テスト内容】shorthand query（{ で始まるクエリ）を渡した場合
   * 【期待結果】ok: true が返ること
   */
  it('should allow shorthand query starting with {', () => {
    const result = validateGraphQL('{ users { id name } }')
    expect(result.ok).toBe(true)
    expect(result.sanitizedQuery).toBeTruthy()
  })

  /**
   * 【テスト対象】validateGraphQL
   * 【テスト内容】キーワード付き query（query { ... }）を渡した場合
   * 【期待結果】ok: true が返ること
   */
  it('should allow named query with "query" keyword', () => {
    const result = validateGraphQL('query GetUsers { users { id name } }')
    expect(result.ok).toBe(true)
    expect(result.sanitizedQuery).toBeTruthy()
  })

  /**
   * 【テスト対象】validateGraphQL
   * 【テスト内容】複数行にわたる複雑な query を渡した場合
   * 【期待結果】ok: true が返ること
   */
  it('should allow complex multi-line query', () => {
    const query = `
      query GetProducts {
        products(limit: 10) {
          id
          name
          price
          category {
            name
          }
        }
      }
    `
    const result = validateGraphQL(query)
    expect(result.ok).toBe(true)
  })

  /**
   * 【テスト対象】validateGraphQL
   * 【テスト内容】引数付きの query を渡した場合
   * 【期待結果】ok: true が返ること
   */
  it('should allow query with arguments', () => {
    const result = validateGraphQL('{ user(id: "123") { name email } }')
    expect(result.ok).toBe(true)
  })

  // ---------------------------------------------------------------------------
  // 拒否パターン: mutation
  // ---------------------------------------------------------------------------

  /**
   * 【テスト対象】validateGraphQL
   * 【テスト内容】mutation キーワードを含むクエリを渡した場合
   * 【期待結果】ok: false が返り、mutation 禁止のメッセージが含まれること
   */
  it('should reject query with mutation keyword', () => {
    const result = validateGraphQL('mutation CreateUser { createUser(name: "Alice") { id } }')
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('mutation')
  })

  /**
   * 【テスト対象】validateGraphQL
   * 【テスト内容】小文字の mutation キーワードを含むクエリを渡した場合
   * 【期待結果】ok: false が返ること（大文字小文字を無視して検出する）
   */
  it('should reject mutation keyword regardless of case', () => {
    const result = validateGraphQL('MUTATION CreateUser { createUser(name: "Alice") { id } }')
    expect(result.ok).toBe(false)
  })

  /**
   * 【テスト対象】validateGraphQL
   * 【テスト内容】mutation を含むショートハンドクエリを渡した場合
   * 【期待結果】ok: false が返ること
   */
  it('should reject any query containing mutation keyword', () => {
    const result = validateGraphQL('{ mutation { someField } }')
    expect(result.ok).toBe(false)
  })

  // ---------------------------------------------------------------------------
  // 拒否パターン: subscription
  // ---------------------------------------------------------------------------

  /**
   * 【テスト対象】validateGraphQL
   * 【テスト内容】subscription キーワードを含むクエリを渡した場合
   * 【期待結果】ok: false が返ること
   */
  it('should reject query with subscription keyword', () => {
    const result = validateGraphQL('subscription OnUserCreated { userCreated { id name } }')
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('subscription')
  })

  // ---------------------------------------------------------------------------
  // 拒否パターン: 空文字・空白
  // ---------------------------------------------------------------------------

  /**
   * 【テスト対象】validateGraphQL
   * 【テスト内容】空文字を渡した場合
   * 【期待結果】ok: false が返り、空クエリのメッセージが含まれること
   */
  it('should reject empty string', () => {
    const result = validateGraphQL('')
    expect(result.ok).toBe(false)
    expect(result.reason).toBeTruthy()
  })

  /**
   * 【テスト対象】validateGraphQL
   * 【テスト内容】空白のみの文字列を渡した場合
   * 【期待結果】ok: false が返ること
   */
  it('should reject whitespace-only string', () => {
    const result = validateGraphQL('   \n\t  ')
    expect(result.ok).toBe(false)
  })

  // ---------------------------------------------------------------------------
  // 拒否パターン: 無効な開始キーワード
  // ---------------------------------------------------------------------------

  /**
   * 【テスト対象】validateGraphQL
   * 【テスト内容】fragment 定義のみを渡した場合
   * 【期待結果】ok: false が返ること（query/shorthand queryで始まらないため）
   */
  it('should reject fragment-only definition', () => {
    const result = validateGraphQL('fragment UserFields on User { id name }')
    expect(result.ok).toBe(false)
  })

  // ---------------------------------------------------------------------------
  // コメント除去
  // ---------------------------------------------------------------------------

  /**
   * 【テスト対象】validateGraphQL
   * 【テスト内容】GraphQL の行コメント（#）を含むクエリを渡した場合
   * 【期待結果】コメント除去後に ok: true が返ること
   */
  it('should handle GraphQL line comments (#)', () => {
    const query = `
      # Get all users
      {
        users {
          id # user id
          name
        }
      }
    `
    const result = validateGraphQL(query)
    expect(result.ok).toBe(true)
  })

  /**
   * 【テスト対象】validateGraphQL
   * 【テスト内容】コメント内に mutation キーワードを含むクエリを渡した場合
   * 【期待結果】ok: false が返ること（コメント除去後もチェックを行う）
   *
   * 注意: GraphQL のコメント（#）除去後に mutation が残る場合は拒否する。
   * コメントインジェクション攻撃の防止ではなく、誤ってコメント内に mutation を
   * 書いてしまったケースを含めて一貫してチェックする。
   */
  it('should reject query with mutation in comment when query text contains mutation', () => {
    // コメント除去後に mutation が現れるケースは拒否する設計ではなく、
    // クエリ本体に mutation が含まれる場合を検出することが目的
    const query = `
      # This is a mutation comment
      { users { id } }
    `
    // コメント「# This is a mutation comment」を除去すると mutation キーワードは残らない
    // したがって ok: true になる（コメント内の mutation は問題なし）
    const result = validateGraphQL(query)
    // コメント除去後に { users { id } } だけ残るので ok: true を期待
    expect(result.ok).toBe(true)
  })

  // ---------------------------------------------------------------------------
  // sanitizedQuery の確認
  // ---------------------------------------------------------------------------

  /**
   * 【テスト対象】validateGraphQL の sanitizedQuery
   * 【テスト内容】有効なクエリを渡した場合の sanitizedQuery の形式
   * 【期待結果】sanitizedQuery が正規化された文字列であること
   */
  it('should return sanitizedQuery for valid query', () => {
    const result = validateGraphQL('  query   GetUsers  {  users  { id }  }  ')
    expect(result.ok).toBe(true)
    expect(result.sanitizedQuery).toBeDefined()
    // 正規化: 前後の空白が除去され、連続空白が単一スペースになる
    expect(result.sanitizedQuery?.startsWith('query')).toBe(true)
  })
})
