/**
 * 【モジュール】backend/src/services/sqlValidator.ts
 * SQLバリデーターサービスのユニットテスト
 *
 * このファイルでは SQLバリデーターの以下の挙動を検証する:
 * - 許可パターン: SELECT文, JOINを含むSELECT, サブクエリ, CTE(WITH句)
 * - 拒否パターン: INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE 等の変更系SQL
 * - 拒否パターン: 複数ステートメント（セミコロン区切り）
 * - 拒否パターン: コメント内に隠された危険キーワード
 * - 境界ケース: 空文字, 空白のみ, セミコロンのみ
 */

import { describe, it, expect } from 'vitest'
import { validate, removeComments } from '../../backend/src/services/sqlValidator'

/**
 * 【モジュール】removeComments
 * コメント除去の純粋関数テスト
 */
describe('removeComments', () => {
  /**
   * 【テスト対象】removeComments
   * 【テスト内容】行コメント（-- ...）を含む SQL を渡した場合
   * 【期待結果】行コメント部分が除去されること
   */
  it('should remove line comments (--)', () => {
    const sql = 'SELECT * FROM users -- get all users'
    const result = removeComments(sql)
    expect(result).not.toContain('--')
    expect(result).toContain('SELECT * FROM users')
  })

  /**
   * 【テスト対象】removeComments
   * 【テスト内容】ブロックコメント（/* ... *‌/）を含む SQL を渡した場合
   * 【期待結果】ブロックコメント部分が除去されること
   */
  it('should remove block comments (/* ... */)', () => {
    const sql = 'SELECT /* this is a comment */ * FROM users'
    const result = removeComments(sql)
    expect(result).not.toContain('this is a comment')
    expect(result).toContain('SELECT')
    expect(result).toContain('FROM users')
  })

  /**
   * 【テスト対象】removeComments
   * 【テスト内容】複数行ブロックコメントを含む SQL を渡した場合
   * 【期待結果】改行を含むブロックコメントが除去されること
   */
  it('should remove multiline block comments', () => {
    const sql = `SELECT *
/*
  multiline
  comment
*/
FROM users`
    const result = removeComments(sql)
    expect(result).not.toContain('multiline')
    expect(result).not.toContain('comment')
    expect(result).toContain('SELECT')
    expect(result).toContain('FROM users')
  })

  /**
   * 【テスト対象】removeComments
   * 【テスト内容】ネストしたブロックコメントを渡した場合
   * 【期待結果】内側コメント除去後に残留する外側の閉じタグも除去されること
   *
   * バイパス防止:
   *   最短一致で内側コメントを除去すると外側の閉じタグが残り、
   *   後続のキーワード検査をバイパスされる恐れがある。
   *   残留する閉じタグを追加除去することでバイパスを防ぐ。
   */
  it('should remove residual block comment close tag from nested block comments', () => {
    // ネストコメント: 内側除去後に外側の閉じタグが残らないことを確認
    const sql = '/* /* DROP */ */ SELECT 1'
    const result = removeComments(sql)
    expect(result).not.toContain('*/')
    expect(result).not.toContain('DROP')
  })
})

/**
 * 【モジュール】validate
 * SQLバリデーション関数の包括的テスト
 */
describe('validate', () => {
  // -------------------------------------------------------------------
  // 許可パターン
  // -------------------------------------------------------------------

  /**
   * 【テスト対象】validate - 許可パターン
   * 【テスト内容】単純な SELECT * FROM テーブル を渡した場合
   * 【期待結果】ok: true が返ること
   */
  it('should allow a simple SELECT statement', () => {
    const result = validate('SELECT * FROM users')
    expect(result.ok).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  /**
   * 【テスト対象】validate - 許可パターン
   * 【テスト内容】WHERE句付きの SELECT を渡した場合
   * 【期待結果】ok: true が返ること
   */
  it('should allow SELECT with WHERE clause', () => {
    const result = validate("SELECT id, name FROM users WHERE active = 1")
    expect(result.ok).toBe(true)
  })

  /**
   * 【テスト対象】validate - 許可パターン
   * 【テスト内容】JOIN を含む SELECT を渡した場合
   * 【期待結果】ok: true が返ること
   */
  it('should allow SELECT with JOIN', () => {
    const result = validate(
      'SELECT u.id, u.name, o.total FROM users u INNER JOIN orders o ON u.id = o.user_id'
    )
    expect(result.ok).toBe(true)
  })

  /**
   * 【テスト対象】validate - 許可パターン
   * 【テスト内容】サブクエリを含む SELECT を渡した場合
   * 【期待結果】ok: true が返ること
   */
  it('should allow SELECT with subquery', () => {
    const result = validate(
      'SELECT * FROM orders WHERE user_id IN (SELECT id FROM users WHERE active = 1)'
    )
    expect(result.ok).toBe(true)
  })

  /**
   * 【テスト対象】validate - 許可パターン
   * 【テスト内容】CTE（WITH句）を含む SELECT を渡した場合
   * 【期待結果】ok: true が返ること
   */
  it('should allow SELECT with CTE (WITH clause)', () => {
    const result = validate(
      'WITH active_users AS (SELECT id, name FROM users WHERE active = 1) SELECT * FROM active_users'
    )
    expect(result.ok).toBe(true)
  })

  /**
   * 【テスト対象】validate - 許可パターン
   * 【テスト内容】末尾にセミコロンが1つある SELECT を渡した場合
   * 【期待結果】ok: true が返ること（末尾の単一セミコロンは許容）
   */
  it('should allow SELECT with a single trailing semicolon', () => {
    const result = validate('SELECT * FROM users;')
    expect(result.ok).toBe(true)
  })

  /**
   * 【テスト対象】validate - 許可パターン
   * 【テスト内容】文字列リテラル内にセミコロンを含む SELECT を渡した場合
   * 【期待結果】ok: true が返ること（リテラル内セミコロンはステートメント区切りではない）
   *
   * 背景: hasMultipleStatements() が単純な includes(';') だと、
   *   WHERE message = 'error; warning' のような正常クエリを誤拒否してしまう。
   *   文字列リテラルを除外してからセミコロン検出することで誤拒否を防ぐ。
   *
   * 入力例:
   *   SELECT * FROM logs WHERE message = 'error; warning'
   */
  it('should allow SELECT with semicolon inside string literal', () => {
    const result = validate("SELECT * FROM logs WHERE message = 'error; warning'")
    expect(result.ok).toBe(true)
  })

  /**
   * 【テスト対象】validate - 許可パターン
   * 【テスト内容】小文字の select を含む SQL を渡した場合
   * 【期待結果】ok: true が返ること（大文字小文字を区別しない）
   */
  it('should allow lowercase select keyword', () => {
    const result = validate('select * from users')
    expect(result.ok).toBe(true)
  })

  /**
   * 【テスト対象】validate - 許可パターン
   * 【テスト内容】aggregate関数（COUNT, SUM等）を含む SELECT を渡した場合
   * 【期待結果】ok: true が返ること
   */
  it('should allow SELECT with aggregate functions', () => {
    const result = validate(
      'SELECT COUNT(*), SUM(amount), AVG(amount) FROM orders GROUP BY user_id HAVING COUNT(*) > 1'
    )
    expect(result.ok).toBe(true)
  })

  // -------------------------------------------------------------------
  // 拒否パターン: DML
  // -------------------------------------------------------------------

  /**
   * 【テスト対象】validate - 拒否パターン
   * 【テスト内容】INSERT INTO を含む SQL を渡した場合
   * 【期待結果】ok: false が返り、reason に拒否理由が含まれること
   */
  it('should reject INSERT statement', () => {
    const result = validate("INSERT INTO users (name) VALUES ('Alice')")
    expect(result.ok).toBe(false)
    expect(result.reason).toBeDefined()
    expect(result.reason).toContain('INSERT')
  })

  /**
   * 【テスト対象】validate - 拒否パターン
   * 【テスト内容】UPDATE を含む SQL を渡した場合
   * 【期待結果】ok: false が返り、reason に拒否理由が含まれること
   */
  it('should reject UPDATE statement', () => {
    const result = validate("UPDATE users SET name = 'Bob' WHERE id = 1")
    expect(result.ok).toBe(false)
    expect(result.reason).toBeDefined()
    expect(result.reason).toContain('UPDATE')
  })

  /**
   * 【テスト対象】validate - 拒否パターン
   * 【テスト内容】DELETE FROM を含む SQL を渡した場合
   * 【期待結果】ok: false が返り、reason に拒否理由が含まれること
   */
  it('should reject DELETE statement', () => {
    const result = validate('DELETE FROM users WHERE id = 1')
    expect(result.ok).toBe(false)
    expect(result.reason).toBeDefined()
    expect(result.reason).toContain('DELETE')
  })

  // -------------------------------------------------------------------
  // 拒否パターン: DDL
  // -------------------------------------------------------------------

  /**
   * 【テスト対象】validate - 拒否パターン
   * 【テスト内容】DROP TABLE を含む SQL を渡した場合
   * 【期待結果】ok: false が返り、reason に拒否理由が含まれること
   */
  it('should reject DROP TABLE statement', () => {
    const result = validate('DROP TABLE users')
    expect(result.ok).toBe(false)
    expect(result.reason).toBeDefined()
    expect(result.reason).toContain('DROP')
  })

  /**
   * 【テスト対象】validate - 拒否パターン
   * 【テスト内容】ALTER TABLE を含む SQL を渡した場合
   * 【期待結果】ok: false が返り、reason に拒否理由が含まれること
   */
  it('should reject ALTER TABLE statement', () => {
    const result = validate('ALTER TABLE users ADD COLUMN age INT')
    expect(result.ok).toBe(false)
    expect(result.reason).toBeDefined()
    expect(result.reason).toContain('ALTER')
  })

  /**
   * 【テスト対象】validate - 拒否パターン
   * 【テスト内容】TRUNCATE TABLE を含む SQL を渡した場合
   * 【期待結果】ok: false が返り、reason に拒否理由が含まれること
   */
  it('should reject TRUNCATE TABLE statement', () => {
    const result = validate('TRUNCATE TABLE users')
    expect(result.ok).toBe(false)
    expect(result.reason).toBeDefined()
    expect(result.reason).toContain('TRUNCATE')
  })

  /**
   * 【テスト対象】validate - 拒否パターン
   * 【テスト内容】CREATE TABLE を含む SQL を渡した場合
   * 【期待結果】ok: false が返り、reason に拒否理由が含まれること
   */
  it('should reject CREATE TABLE statement', () => {
    const result = validate('CREATE TABLE new_table (id INT)')
    expect(result.ok).toBe(false)
    expect(result.reason).toBeDefined()
    expect(result.reason).toContain('CREATE')
  })

  // -------------------------------------------------------------------
  // 拒否パターン: 複数ステートメント（Stacked Queries）
  // -------------------------------------------------------------------

  /**
   * 【テスト対象】validate - 拒否パターン
   * 【テスト内容】セミコロンで区切られた複数のSELECT文を渡した場合
   * 【期待結果】ok: false が返ること（Stacked Queries の防止）
   */
  it('should reject multiple statements separated by semicolon', () => {
    const result = validate('SELECT 1; SELECT 2')
    expect(result.ok).toBe(false)
    expect(result.reason).toBeDefined()
  })

  /**
   * 【テスト対象】validate - 拒否パターン
   * 【テスト内容】SELECT の後に DROP を含む複数ステートメントを渡した場合
   * 【期待結果】ok: false が返ること（SQLインジェクション典型パターンの防止）
   */
  it('should reject SELECT followed by DROP via semicolon', () => {
    const result = validate('SELECT * FROM users; DROP TABLE users')
    expect(result.ok).toBe(false)
    expect(result.reason).toBeDefined()
  })

  // -------------------------------------------------------------------
  // 拒否パターン: コメント内の危険キーワード
  // -------------------------------------------------------------------

  /**
   * 【テスト対象】validate - 拒否パターン
   * 【テスト内容】ブロックコメント内に DROP を含む SQL を渡した場合
   * 【期待結果】コメント除去後にSELECTで始まれば ok: true（コメント内のキーワードは無視される）
   *
   * 補足: コメントは除去されてから検査するため、コメント内の DROP は無視される。
   * 実際に危険なのは「コメント外」に危険キーワードが来る場合のみ。
   */
  it('should ignore dangerous keywords inside block comments', () => {
    // コメント内の DROP は除去されるため、実際は SELECT だけが残る → 許可
    const result = validate('SELECT /* DROP TABLE users */ * FROM users')
    expect(result.ok).toBe(true)
  })

  /**
   * 【テスト対象】validate - 拒否パターン
   * 【テスト内容】行コメントの後にDROPを含む SQL を渡した場合
   * 【期待結果】コメント除去後にDROPが残れば ok: false
   *
   * 補足: コメントの後に改行で別の文が続く場合は、コメント外なので拒否される。
   */
  it('should reject dangerous keywords outside comments', () => {
    // コメントの後に改行で DROP が来る場合はコメント外なので拒否
    const result = validate('SELECT 1\n-- comment\nDROP TABLE users')
    expect(result.ok).toBe(false)
  })

  /**
   * 【テスト対象】validate - 拒否パターン
   * 【テスト内容】ネストしたブロックコメントでキーワードを隠す SQL を渡した場合
   * 【期待結果】ok: false が返ること（バイパス攻撃の防止）
   *
   * 攻撃パターン:
   *   ネストしたブロックコメントを使うと、最短一致の正規表現は内側コメントのみを
   *   除去し、外側の閉じタグが残留する。
   *   残留した閉じタグの後に実際の SQL 文が続く場合、コメント除去が不完全となり
   *   バイパスが成立する恐れがある。
   *   removeComments でループ除去 + 残留閉じタグの除去により防止する。
   *
   * 入力例:
   *   "/* /* DROP TABLE users *" + "/ *" + "/ DROP TABLE users"
   *   → コメント除去後に DROP TABLE users が残れば ok: false になるべき
   */
  it('should reject nested block comment bypass attempt', () => {
    // ネストコメントの外側に実際のDROPが存在するパターン
    const result = validate('/* /* comment */ */ DROP TABLE users')
    expect(result.ok).toBe(false)
  })

  // -------------------------------------------------------------------
  // 境界ケース
  // -------------------------------------------------------------------

  /**
   * 【テスト対象】validate - 境界ケース
   * 【テスト内容】空文字を渡した場合
   * 【期待結果】ok: false が返り、reason が設定されること
   */
  it('should reject empty string', () => {
    const result = validate('')
    expect(result.ok).toBe(false)
    expect(result.reason).toBeDefined()
  })

  /**
   * 【テスト対象】validate - 境界ケース
   * 【テスト内容】空白のみの文字列を渡した場合
   * 【期待結果】ok: false が返ること
   */
  it('should reject whitespace-only string', () => {
    const result = validate('   \t\n  ')
    expect(result.ok).toBe(false)
    expect(result.reason).toBeDefined()
  })

  /**
   * 【テスト対象】validate - 境界ケース
   * 【テスト内容】セミコロンのみの文字列を渡した場合
   * 【期待結果】ok: false が返ること（SELECT で始まっていないため）
   */
  it('should reject semicolon-only string', () => {
    const result = validate(';')
    expect(result.ok).toBe(false)
    expect(result.reason).toBeDefined()
  })

  /**
   * 【テスト対象】validate - 境界ケース
   * 【テスト内容】SELECTで始まらない任意の文字列（例: SHOW TABLES）を渡した場合
   * 【期待結果】ok: false が返ること
   */
  it('should reject SQL not starting with SELECT or WITH', () => {
    const result = validate('SHOW TABLES')
    expect(result.ok).toBe(false)
    expect(result.reason).toBeDefined()
  })

  /**
   * 【テスト対象】validate - 境界ケース
   * 【テスト内容】カラム名に "created_at" のように CREATED を含む SELECT を渡した場合
   * 【期待結果】ok: true が返ること（単語境界チェックにより誤検知しないこと）
   *
   * 補足: CREATE は禁止キーワードだが、CREATED_AT はカラム名のため許可される。
   * \b（単語境界）により識別子内部の部分一致は無視される。
   */
  it('should allow SELECT with column name containing forbidden keyword as substring', () => {
    // created_at は CREATE を含むが、単語境界で分離されているため許可される
    const result = validate('SELECT id, created_at, updated_at FROM users')
    expect(result.ok).toBe(true)
  })
})
