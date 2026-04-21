/**
 * パスワード暗号化サービス
 *
 * DB接続先のパスワードをAES-256-GCM方式で暗号化・復号するサービス。
 * Node.js 標準の `crypto` モジュールのみを使用し、追加依存なし。
 *
 * 暗号化方式: AES-256-GCM
 *   - 256ビット（32バイト）の鍵長でブロック暗号を使用
 *   - GCM（Galois/Counter Mode）で認証タグ付き暗号化
 *   - ランダムなIVにより、同じ平文を暗号化しても毎回異なる暗号文が生成される
 *
 * 暗号化結果の形式:
 *   Base64(IV[12バイト] + authTag[16バイト] + ciphertext[可変長])
 *   ↑ 3つを結合してBase64エンコードした1文字列として保存する
 *
 * 環境変数:
 *   DB_ENCRYPTION_KEY: AES-256-GCM暗号化キー（32バイト = hex文字列64文字）
 *     例: openssl rand -hex 32 で生成
 *
 * 参考:
 *   - https://nodejs.org/api/crypto.html#cryptocreatecipher
 *   - https://nodejs.org/api/crypto.html#class-gcm
 */

import crypto from 'crypto'
import { DB_ENCRYPTION_KEY } from '../config'

// =============================================================================
// 定数
// =============================================================================

/**
 * AES-256-GCM の IV（初期化ベクトル）のバイト長
 * 12バイト（96ビット）が推奨値（NIST SP 800-38D）
 */
const IV_LENGTH = 12

/**
 * AES-256-GCM の認証タグのバイト長（最大 = 16バイト）
 * 16バイトを使用することで最高の認証強度を確保する
 */
const AUTH_TAG_LENGTH = 16

/**
 * AES-256-GCM 暗号化アルゴリズム名（Node.js crypto 形式）
 */
const ALGORITHM = 'aes-256-gcm'

/**
 * 暗号化キーのバイト長（AES-256 = 32バイト = hex文字列64文字）
 */
const KEY_BYTE_LENGTH = 32

// =============================================================================
// キー検証
// =============================================================================

/**
 * 暗号化キーを検証し、Buffer として返す
 *
 * アプリケーション起動時に呼び出され、DB_ENCRYPTION_KEY が未設定または
 * 不正な形式の場合はエラーをスローしてサーバー起動を阻止する。
 *
 * @returns 32バイトの暗号化キー Buffer
 * @throws Error DB_ENCRYPTION_KEY が未設定または不正な場合
 */
function getEncryptionKey(): Buffer {
  if (!DB_ENCRYPTION_KEY) {
    throw new Error(
      '[encryption] DB_ENCRYPTION_KEY is not set. ' +
      'Please set the environment variable with a 64-character hex string. ' +
      'Generate one with: openssl rand -hex 32'
    )
  }

  if (DB_ENCRYPTION_KEY.length !== KEY_BYTE_LENGTH * 2) {
    throw new Error(
      `[encryption] DB_ENCRYPTION_KEY must be a ${KEY_BYTE_LENGTH * 2}-character hex string ` +
      `(${KEY_BYTE_LENGTH} bytes). Got ${DB_ENCRYPTION_KEY.length} characters.`
    )
  }

  // hex文字列として有効か確認
  if (!/^[0-9a-fA-F]+$/.test(DB_ENCRYPTION_KEY)) {
    throw new Error(
      '[encryption] DB_ENCRYPTION_KEY must be a valid hexadecimal string.'
    )
  }

  return Buffer.from(DB_ENCRYPTION_KEY, 'hex')
}

/**
 * 起動時にキーを検証（不正な場合は即座にエラー）
 *
 * モジュールインポート時に実行されることで、設定不備を早期発見できる。
 * テスト環境（DB_ENCRYPTION_KEY=test...）でも呼ばれるが、テスト用の正当な値を
 * 設定することで対応する。
 */
let encryptionKey: Buffer

try {
  encryptionKey = getEncryptionKey()
} catch (err) {
  // 起動時エラーをコンソールに出力して再スロー
  // サーバー起動処理（index.ts）がキャッチしてプロセスを停止させる
  console.error('[encryption] Fatal error during key initialization:', err)
  throw err
}

// =============================================================================
// 暗号化・復号関数
// =============================================================================

/**
 * 平文文字列をAES-256-GCMで暗号化する
 *
 * 毎回ランダムなIVを生成するため、同じ平文でも異なる暗号文が生成される。
 * これにより、パスワードの一致を推測される攻撃（既知平文攻撃）を防ぐ。
 *
 * 暗号化結果の形式:
 *   Base64(IV[12バイト] + authTag[16バイト] + ciphertext[可変長])
 *
 * @param plaintext - 暗号化する平文文字列（DB接続先パスワード等）
 * @returns Base64エンコードされた暗号化文字列（IV + authTag + ciphertext の結合）
 * @throws Error 暗号化処理中のエラー（キー不正など）
 *
 * @example
 * ```typescript
 * const encrypted = encrypt('mypassword')
 * // => "base64encodedstring..."
 * ```
 */
export function encrypt(plaintext: string): string {
  // ランダムなIVを生成（12バイト）
  // 毎回異なるIVを使用することで、同じパスワードでも異なる暗号文になる
  const iv = crypto.randomBytes(IV_LENGTH)

  // AES-256-GCM 暗号器を作成
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  })

  // 平文を暗号化
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])

  // 認証タグを取得（GCMモードでは暗号化後に取得する）
  // 認証タグはデータの完全性・真正性の検証に使用される
  const authTag = cipher.getAuthTag()

  // IV + authTag + 暗号文 を結合して Base64 エンコード
  // 復号時にこの順序でデータを取り出す
  const combined = Buffer.concat([iv, authTag, encrypted])
  return combined.toString('base64')
}

/**
 * AES-256-GCMで暗号化された文字列を復号する
 *
 * `encrypt()` で生成した暗号化文字列を平文に戻す。
 * 認証タグの検証により、データが改ざんされていないことを確認する。
 *
 * @param encryptedBase64 - `encrypt()` が返したBase64エンコードされた暗号化文字列
 * @returns 復号された平文文字列
 * @throws Error 不正な暗号文、認証タグの検証失敗、または復号エラーの場合
 *
 * @example
 * ```typescript
 * const encrypted = encrypt('mypassword')
 * const decrypted = decrypt(encrypted)
 * // => 'mypassword'
 * ```
 */
export function decrypt(encryptedBase64: string): string {
  // Base64 デコード
  const combined = Buffer.from(encryptedBase64, 'base64')

  // 最小サイズチェック（IV + authTag 分のバイト数が必要）
  const minLength = IV_LENGTH + AUTH_TAG_LENGTH
  if (combined.length < minLength) {
    throw new Error(
      `[encryption] Invalid encrypted data: too short. ` +
      `Expected at least ${minLength} bytes, got ${combined.length} bytes.`
    )
  }

  // IV（先頭12バイト）を取り出す
  const iv = combined.subarray(0, IV_LENGTH)

  // authTag（次の16バイト）を取り出す
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)

  // 残りが暗号文
  const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH)

  // AES-256-GCM 復号器を作成
  const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  })

  // 認証タグを設定（データの完全性・真正性を検証）
  decipher.setAuthTag(authTag)

  // 復号処理
  // 認証タグが不一致の場合、decipher.final() で Error がスローされる
  try {
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ])
    return decrypted.toString('utf8')
  } catch (err) {
    throw new Error(
      '[encryption] Decryption failed: invalid ciphertext or authentication tag mismatch. ' +
      'The data may have been tampered with or the encryption key may have changed.'
    )
  }
}
