/**
 * スキーマ情報取得サービス
 *
 * PostgreSQL / MySQL の INFORMATION_SCHEMA からテーブル名・カラム名・型・NULL許容を取得する。
 * DBごとのSQL差異を吸収し、統一されたレスポンス形式で返す。
 *
 * レスポンス形式は api.md の /api/schema と同一:
 * {
 *   database: string,
 *   tables: [
 *     {
 *       name: string,
 *       columns: [
 *         { name: string, type: string, nullable: boolean }
 *       ]
 *     }
 *   ]
 * }
 *
 * セキュリティ注意事項:
 *   - このサービスは SELECT のみを実行する（リードオンリー）
 *   - DBユーザーにはリードオンリー権限（SELECT のみ）を付与することを推奨
 */

import { Knex } from 'knex'
import { getDb } from './database'

/** カラム情報 */
export interface ColumnInfo {
  name: string
  type: string
  nullable: boolean
}

/** テーブル情報 */
export interface TableInfo {
  name: string
  columns: ColumnInfo[]
}

/** スキーマ情報レスポンス */
export interface SchemaInfo {
  database: string
  tables: TableInfo[]
}

/**
 * INFORMATION_SCHEMA.COLUMNS の1行を表す内部型
 */
interface InformationSchemaColumn {
  table_name: string
  column_name: string
  data_type: string
  is_nullable: string
}

/**
 * PostgreSQL 向け: カレントスキーマのテーブル・カラム情報を取得するSQLを実行する
 *
 * current_schema() を使用してデフォルトスキーマ（通常 'public'）のテーブルのみを取得。
 * information_schema の内部テーブル（pg_catalog等）は除外する。
 *
 * @param db - knexインスタンス
 * @param database - データベース名
 * @returns スキーマ情報
 */
async function fetchSchemaPostgresql(
  db: Knex,
  database: string
): Promise<SchemaInfo> {
  const rows = await db.raw<{ rows: InformationSchemaColumn[] }>(`
    SELECT
      c.table_name,
      c.column_name,
      c.data_type,
      c.is_nullable
    FROM information_schema.columns c
    INNER JOIN information_schema.tables t
      ON t.table_schema = c.table_schema
      AND t.table_name  = c.table_name
    WHERE c.table_schema = current_schema()
      AND t.table_type   = 'BASE TABLE'
    ORDER BY c.table_name, c.ordinal_position
  `)

  return buildSchemaInfo(database, rows.rows)
}

/**
 * MySQL 向け: 現在接続中のデータベースのテーブル・カラム情報を取得するSQLを実行する
 *
 * DATABASE() を使用して現在のデータベースのテーブルのみを取得。
 * ビュー (VIEW) は除外し、BASE TABLE のみを対象とする。
 *
 * @param db - knexインスタンス
 * @param database - データベース名
 * @returns スキーマ情報
 */
async function fetchSchemaMysql(
  db: Knex,
  database: string
): Promise<SchemaInfo> {
  const [rows] = await db.raw<[InformationSchemaColumn[]]>(`
    SELECT
      c.TABLE_NAME   AS table_name,
      c.COLUMN_NAME  AS column_name,
      c.DATA_TYPE    AS data_type,
      c.IS_NULLABLE  AS is_nullable
    FROM information_schema.COLUMNS c
    INNER JOIN information_schema.TABLES t
      ON t.TABLE_SCHEMA = c.TABLE_SCHEMA
      AND t.TABLE_NAME  = c.TABLE_NAME
    WHERE c.TABLE_SCHEMA = DATABASE()
      AND t.TABLE_TYPE   = 'BASE TABLE'
    ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION
  `)

  return buildSchemaInfo(database, rows)
}

/**
 * INFORMATION_SCHEMA の行データを SchemaInfo 形式に変換する
 *
 * テーブルごとにカラムをグループ化し、統一されたレスポンス形式を構築する。
 *
 * @param database - データベース名
 * @param rows - INFORMATION_SCHEMA から取得した行
 * @returns 変換後のスキーマ情報
 */
export function buildSchemaInfo(
  database: string,
  rows: InformationSchemaColumn[]
): SchemaInfo {
  // テーブル名をキーとしたMapを使い、カラムをグループ化
  const tableMap = new Map<string, ColumnInfo[]>()

  for (const row of rows) {
    const tableName = row.table_name
    if (!tableMap.has(tableName)) {
      tableMap.set(tableName, [])
    }
    tableMap.get(tableName)!.push({
      name: row.column_name,
      type: row.data_type,
      // is_nullable は 'YES' / 'NO' の文字列
      nullable: row.is_nullable === 'YES',
    })
  }

  // テーブル名でソートした配列に変換
  const tables: TableInfo[] = Array.from(tableMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, columns]) => ({ name, columns }))

  return { database, tables }
}

/**
 * 接続先DBのスキーマ情報を取得する
 *
 * DB_TYPE 環境変数に応じて PostgreSQL または MySQL 向けのSQLを実行し、
 * 統一されたレスポンス形式で返す。
 *
 * このサービスはリードオンリー操作のみを行う（SELECT のみ）。
 * DBユーザーには SELECT 権限のみを付与したリードオンリーユーザーの使用を推奨する。
 *
 * @param db - knexインスタンス（省略時は getDb() を使用）
 * @returns スキーマ情報
 * @throws DB接続失敗またはクエリエラー
 *
 * @example
 * ```typescript
 * const schema = await fetchSchema()
 * console.log(schema.tables.map(t => t.name))
 * ```
 */
export async function fetchSchema(db?: Knex): Promise<SchemaInfo> {
  const knex = db ?? getDb()
  const dbType = process.env.DB_TYPE ?? ''
  const database = process.env.DB_NAME ?? ''

  switch (dbType) {
    case 'postgresql':
      return fetchSchemaPostgresql(knex, database)
    case 'mysql':
      return fetchSchemaMysql(knex, database)
    default:
      throw new Error(
        `DB_TYPE="${dbType}" はサポートされていません。'postgresql' または 'mysql' を指定してください。`
      )
  }
}
