/**
 * 【モジュール】backend/src/services/encryption.ts
 * パスワード暗号化サービスのユニットテスト
 *
 * AES-256-GCM 暗号化/復号の正常動作・エラーハンドリングを検証する。
 * DB接続先パスワードを安全に保存するための暗号化機能が期待通りに
 * 動作することを確認する。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// テスト用の有効なDB_ENCRYPTION_KEY（32バイト = 64文字のhex文字列）
const TEST_ENCRYPTION_KEY = 'a'.repeat(64) // 全て'a'で埋めた64文字のhex文字列

describe('encryption service', () => {
  beforeEach(() => {
    // テスト前に環境変数をセット
    process.env.DB_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY
  })

  afterEach(() => {
    // テスト後にモジュールキャッシュをリセット（環境変数変更の反映のため）
    vi.resetModules()
    delete process.env.DB_ENCRYPTION_KEY
  })

  describe('encrypt', () => {
    /**
     * 【テスト対象】encrypt関数
     * 【テスト内容】平文パスワードを暗号化し、Base64文字列が返ること
     * 【期待結果】暗号化結果がBase64形式の文字列であること
     */
    it('should return a base64 encoded string', async () => {
      const { encrypt } = await import('../../backend/src/services/encryption')
      const result = encrypt('mypassword')
      // Base64形式の文字列であることを確認
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
      // Base64文字セットのみで構成されていること
      expect(/^[A-Za-z0-9+/]+=*$/.test(result)).toBe(true)
    })

    /**
     * 【テスト対象】encrypt関数
     * 【テスト内容】同じ平文を2回暗号化した結果が異なること（ランダムIV）
     * 【期待結果】毎回異なる暗号文が生成されること
     *
     * ランダムIVを使用しているため、同じパスワードでも毎回異なる暗号文が
     * 生成される（既知平文攻撃への対策）
     */
    it('should produce different ciphertext for the same plaintext (random IV)', async () => {
      const { encrypt } = await import('../../backend/src/services/encryption')
      const plaintext = 'samepassword'
      const encrypted1 = encrypt(plaintext)
      const encrypted2 = encrypt(plaintext)
      // ランダムIVにより毎回異なる暗号文が生成される
      expect(encrypted1).not.toBe(encrypted2)
    })

    /**
     * 【テスト対象】encrypt関数
     * 【テスト内容】空文字列の暗号化ができること
     * 【期待結果】空文字列もエラーなく暗号化できること
     */
    it('should encrypt empty string without error', async () => {
      const { encrypt } = await import('../../backend/src/services/encryption')
      expect(() => encrypt('')).not.toThrow()
    })

    /**
     * 【テスト対象】encrypt関数
     * 【テスト内容】日本語・特殊文字を含む平文の暗号化
     * 【期待結果】マルチバイト文字・特殊文字もエラーなく暗号化できること
     */
    it('should encrypt multibyte and special characters', async () => {
      const { encrypt } = await import('../../backend/src/services/encryption')
      const specialChars = 'パスワード123!@#$%^&*()'
      expect(() => encrypt(specialChars)).not.toThrow()
      const result = encrypt(specialChars)
      expect(typeof result).toBe('string')
    })
  })

  describe('decrypt', () => {
    /**
     * 【テスト対象】decrypt関数
     * 【テスト内容】encrypt→decryptで元の平文に戻ること
     * 【期待結果】暗号化→復号のラウンドトリップで平文が一致すること
     */
    it('should decrypt to the original plaintext (round-trip)', async () => {
      const { encrypt, decrypt } = await import('../../backend/src/services/encryption')
      const plaintext = 'mypassword'
      const encrypted = encrypt(plaintext)
      const decrypted = decrypt(encrypted)
      expect(decrypted).toBe(plaintext)
    })

    /**
     * 【テスト対象】decrypt関数
     * 【テスト内容】様々な平文でのラウンドトリップ検証
     * 【期待結果】各平文が正しく暗号化・復号されること
     *
     * 【入力例】
     * - 英数字のみ
     * - 特殊文字を含む
     * - 日本語
     * - 長い文字列
     */
    it('should correctly round-trip various plaintext values', async () => {
      const { encrypt, decrypt } = await import('../../backend/src/services/encryption')
      const testCases = [
        'simple',
        'with spaces and special !@#$%',
        'パスワード',
        'a'.repeat(1000), // 長い文字列
        '', // 空文字列
        '123456789',
      ]

      for (const plaintext of testCases) {
        const encrypted = encrypt(plaintext)
        const decrypted = decrypt(encrypted)
        expect(decrypted).toBe(plaintext)
      }
    })

    /**
     * 【テスト対象】decrypt関数
     * 【テスト内容】不正な暗号文（改ざんされたデータ）の復号でエラーがスローされること
     * 【期待結果】認証タグ検証に失敗してエラーをスローすること
     */
    it('should throw error for invalid/tampered ciphertext', async () => {
      const { encrypt, decrypt } = await import('../../backend/src/services/encryption')
      const encrypted = encrypt('password')
      // Base64デコードしてデータを改ざん
      const buffer = Buffer.from(encrypted, 'base64')
      // 暗号文部分（IV=12バイト + authTag=16バイト以降）を改ざん
      if (buffer.length > 28) {
        buffer[28] ^= 0xff // ビット反転で改ざん
      }
      const tampered = buffer.toString('base64')
      // 改ざんされたデータの復号はエラーをスローする（認証タグ検証失敗）
      expect(() => decrypt(tampered)).toThrow()
    })

    /**
     * 【テスト対象】decrypt関数
     * 【テスト内容】短すぎる（不正な）暗号文の復号でエラーがスローされること
     * 【期待結果】最小サイズチェックに失敗してエラーをスローすること
     */
    it('should throw error for too-short ciphertext', async () => {
      const { decrypt } = await import('../../backend/src/services/encryption')
      // IV(12) + authTag(16) = 28バイト未満の不正データ
      const tooShort = Buffer.alloc(10).toString('base64')
      expect(() => decrypt(tooShort)).toThrow()
    })

    /**
     * 【テスト対象】decrypt関数
     * 【テスト内容】不正なBase64文字列の復号でエラーがスローされること
     * 【期待結果】復号処理がエラーをスローすること
     */
    it('should throw error for completely invalid base64 input', async () => {
      const { decrypt } = await import('../../backend/src/services/encryption')
      // Base64として有効だが内容が不正
      const invalidData = Buffer.alloc(40, 0xff).toString('base64') // 40バイトのFFで埋めたデータ
      expect(() => decrypt(invalidData)).toThrow()
    })
  })

  describe('key validation', () => {
    /**
     * 【テスト対象】モジュールインポート時のキー検証
     * 【テスト内容】DB_ENCRYPTION_KEY未設定時にエラーがスローされること
     * 【期待結果】環境変数未設定でモジュールのインポートがエラーになること
     */
    it('should throw error when DB_ENCRYPTION_KEY is not set', async () => {
      delete process.env.DB_ENCRYPTION_KEY
      // モジュールキャッシュをクリアして再インポート
      vi.resetModules()
      await expect(import('../../backend/src/services/encryption')).rejects.toThrow()
    })

    /**
     * 【テスト対象】モジュールインポート時のキー検証
     * 【テスト内容】DB_ENCRYPTION_KEYが64文字未満の場合にエラーがスローされること
     * 【期待結果】不正な長さのキーでモジュールのインポートがエラーになること
     */
    it('should throw error when DB_ENCRYPTION_KEY is too short', async () => {
      process.env.DB_ENCRYPTION_KEY = 'tooshort'
      vi.resetModules()
      await expect(import('../../backend/src/services/encryption')).rejects.toThrow()
    })

    /**
     * 【テスト対象】モジュールインポート時のキー検証
     * 【テスト内容】DB_ENCRYPTION_KEYが16進数でない場合にエラーがスローされること
     * 【期待結果】非hex文字列のキーでモジュールのインポートがエラーになること
     */
    it('should throw error when DB_ENCRYPTION_KEY contains non-hex characters', async () => {
      // 64文字だが'g'はhexではない
      process.env.DB_ENCRYPTION_KEY = 'g'.repeat(64)
      vi.resetModules()
      await expect(import('../../backend/src/services/encryption')).rejects.toThrow()
    })
  })
})
