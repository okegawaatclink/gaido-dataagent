/**
 * DB接続ファクトリ
 *
 * knex.js を使用して PostgreSQL / MySQL の両方に対応した
 * DB接続インスタンスをシングルトンで管理する。
 *
 * 接続情報は環境変数 (.env) から読み込む:
 *   DB_TYPE    : 'postgresql' または 'mysql'
 *   DB_HOST    : DBホスト
 *   DB_PORT    : DBポート (PostgreSQL: 5432, MySQL: 3306)
 *   DB_USER    : DBユーザー名（リードオンリーユーザーを推奨）
 *   DB_PASSWORD: DBパスワード
 *   DB_NAME    : 接続するデータベース名
 *
 * セキュリティ注意事項:
 *   - DBユーザーはリードオンリー権限を推奨（SELECT のみ付与）
 *   - 接続情報はログに出力しない
 */

import Knex, { Knex as KnexType } from 'knex'

/** サポートするDBタイプ */
export type DbType = 'postgresql' | 'mysql'

/** シングルトンのknexインスタンス */
let dbInstance: KnexType | null = null

/**
 * DB_TYPE 文字列を knex クライアント名に変換する
 *
 * @param dbType - 環境変数 DB_TYPE の値
 * @returns knex クライアント名
 * @throws DB_TYPE が不正な値の場合
 */
export function resolveKnexClient(dbType: string): string {
  switch (dbType) {
    case 'postgresql':
      return 'pg'
    case 'mysql':
      return 'mysql2'
    default:
      throw new Error(
        `DB_TYPE="${dbType}" はサポートされていません。'postgresql' または 'mysql' を指定してください。`
      )
  }
}

/**
 * 環境変数からknex設定オブジェクトを構築する
 *
 * @returns knex 初期化設定
 * @throws 必須の環境変数が未設定の場合
 */
export function buildKnexConfig(): KnexType.Config {
  const dbType = process.env.DB_TYPE
  const host = process.env.DB_HOST
  const port = process.env.DB_PORT
  const user = process.env.DB_USER
  const password = process.env.DB_PASSWORD
  const database = process.env.DB_NAME

  // 必須環境変数のバリデーション
  const missing: string[] = []
  if (!dbType) missing.push('DB_TYPE')
  if (!host) missing.push('DB_HOST')
  if (!user) missing.push('DB_USER')
  if (!database) missing.push('DB_NAME')

  if (missing.length > 0) {
    throw new Error(
      `必須の環境変数が設定されていません: ${missing.join(', ')}\n` +
        '.env ファイルに DB_TYPE, DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME を設定してください。'
    )
  }

  const client = resolveKnexClient(dbType!)

  // デフォルトポート: PostgreSQL=5432, MySQL=3306
  const defaultPort = dbType === 'postgresql' ? 5432 : 3306
  const portNumber = port ? parseInt(port, 10) : defaultPort

  return {
    client,
    connection: {
      host: host!,
      port: portNumber,
      user: user!,
      password: password || '',
      database: database!,
    },
    pool: {
      // 最小コネクション数: 0（アイドル時にコネクションを解放）
      min: 0,
      // 最大コネクション数: 読み取り専用なので適度な値に設定
      max: 10,
    },
    // クエリのデバッグログを無効化（接続情報漏洩防止）
    debug: false,
  }
}

/**
 * knex インスタンスを取得する（シングルトン）
 *
 * 初回呼び出し時に環境変数から設定を読み込み、knex インスタンスを生成する。
 * 2回目以降は既存のインスタンスを返す。
 *
 * @returns 初期化済みの knex インスタンス
 * @throws 環境変数が未設定または不正な場合
 *
 * @example
 * ```typescript
 * const db = getDb()
 * const rows = await db.raw('SELECT 1')
 * ```
 */
export function getDb(): KnexType {
  if (dbInstance) {
    return dbInstance
  }

  const config = buildKnexConfig()
  dbInstance = Knex(config)
  return dbInstance
}

/**
 * DB接続をクローズする
 *
 * アプリケーション終了時やテスト後に呼び出すこと。
 * コネクションプールを解放し、プロセスが正常終了できるようにする。
 *
 * @returns Promise<void>
 */
export async function closeDb(): Promise<void> {
  if (dbInstance) {
    await dbInstance.destroy()
    dbInstance = null
  }
}

/**
 * テスト用: シングルトンインスタンスをリセットする
 *
 * ユニットテストでモックインスタンスを注入できるようにする。
 *
 * @param instance - 注入するknexインスタンス（省略時はnullにリセット）
 */
export function resetDbInstance(instance: KnexType | null = null): void {
  dbInstance = instance
}
