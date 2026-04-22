/**
 * スキーマ情報取得サービス
 *
 * PostgreSQL / MySQL の INFORMATION_SCHEMA からテーブル名・カラム名・型・NULL許容・
 * テーブルコメント・カラムコメントを取得する。
 * DBごとのSQL差異を吸収し、統一されたレスポンス形式で返す。
 *
 * PBI #149 改修:
 *   - dbConnectionId を受け取り、connectionManager.getById() 経由で動的に接続
 *   - メモリキャッシュ: Map<dbConnectionId, SchemaInfo> でキャッシュを保持
 *   - キャッシュ無効化: invalidateSchemaCache() を公開し、接続先更新・削除時に呼ぶ
 *
 * PBI #200 追加:
 *   - GraphQL接続先のIntrospection Query対応
 *   - dbType='graphql' の場合: Introspection Query でスキーマを取得し SchemaInfo 形式に変換
 *   - ビルトイン型（__で始まる型）は除外する
 *
 * レスポンス形式は api.md の /api/schema と同一:
 * {
 *   database: string,
 *   tables: [  ← GraphQLの場合はTypeを表す
 *     {
 *       name: string,
 *       comment: string | null,
 *       columns: [  ← GraphQLの場合はFieldを表す
 *         { name: string, type: string, nullable: boolean, comment: string | null }
 *       ]
 *     }
 *   ]
 * }
 *
 * セキュリティ注意事項:
 *   - このサービスは SELECT（DB）またはIntrospection（GraphQL）のみを実行する（リードオンリー）
 *   - DBユーザーにはリードオンリー権限（SELECT のみ）を付与することを推奨
 */

import Knex, { Knex as KnexType } from 'knex'
import { getById, ConnectionNotFoundError } from './connectionManager'
import { getHistoryDb, getDbConnectionById, updateDbConnectionSchemaCache } from './historyDb'

/** カラム情報 */
export interface ColumnInfo {
  name: string
  type: string
  nullable: boolean
  comment: string | null
}

/** テーブル情報 */
export interface TableInfo {
  name: string
  comment: string | null
  columns: ColumnInfo[]
}

/**
 * スキーマ情報レスポンス
 *
 * PBI #200: dbType に 'graphql' を追加
 * GraphQLの場合: database はエンドポイントURL、tables はGraphQLのType/Field情報
 */
export interface SchemaInfo {
  database: string
  dbType: 'mysql' | 'postgresql' | 'graphql'
  tables: TableInfo[]
}

/**
 * INFORMATION_SCHEMA.COLUMNS の1行を表す内部型
 */
interface InformationSchemaColumn {
  table_name: string
  table_comment: string | null
  column_name: string
  data_type: string
  is_nullable: string
  column_comment: string | null
}

// =============================================================================
// メモリキャッシュ
// =============================================================================

/**
 * スキーマ情報のメモリキャッシュ
 *
 * キー: dbConnectionId（UUID）
 * 値: SchemaInfo（テーブル・カラム情報）
 *
 * DB選択時にキャッシュを活用することで、同じDBへの繰り返しスキーマ取得を回避する。
 * サーバーが再起動するとキャッシュはクリアされる（揮発性キャッシュ）。
 *
 * 注意: 同期的な Map を使用しているため、マルチスレッド安全ではない。
 * Node.js はシングルスレッドのため、実用上は問題なし。
 */
const schemaCache = new Map<string, SchemaInfo>()

/**
 * 指定 dbConnectionId のスキーマキャッシュを無効化（削除）する
 *
 * DB接続先の更新・削除時に呼び出すことで、古いスキーマ情報を使い続けるのを防ぐ。
 * 接続先更新ルート（PUT /api/connections/:id）や
 * 削除ルート（DELETE /api/connections/:id）から呼び出すこと。
 *
 * @param dbConnectionId - キャッシュを無効化する接続先ID
 */
export function invalidateSchemaCache(dbConnectionId: string): void {
  if (schemaCache.has(dbConnectionId)) {
    schemaCache.delete(dbConnectionId)
    console.info(`[schema] Cache invalidated for dbConnectionId: ${dbConnectionId}`)
  }
}

/**
 * 全スキーマキャッシュをクリアする（テスト用・緊急用）
 */
export function clearAllSchemaCache(): void {
  schemaCache.clear()
  console.info('[schema] All schema cache cleared')
}

// =============================================================================
// 動的接続ファクトリ
// =============================================================================

/**
 * dbConnectionId から knex インスタンスを生成する
 *
 * connectionManager.getById() で接続先情報（復号済みパスワード含む）を取得し、
 * 動的にknexインスタンスを生成して返す。
 * このインスタンスはスキーマ取得後に破棄する（リソースリーク防止）。
 *
 * @param dbConnectionId - 接続先ID（UUID）
 * @returns knexインスタンスと接続先のdatabaseName
 * @throws ConnectionNotFoundError 接続先が見つからない場合
 */
function buildDynamicKnex(dbConnectionId: string): {
  knex: KnexType
  databaseName: string
  dbType: string
} {
  // connectionManager.getById() で復号済みパスワードを取得
  const conn = getById(dbConnectionId)

  // knex クライアント識別子のマッピング
  const clientMap: Record<string, string> = {
    mysql: 'mysql2',
    postgresql: 'pg',
  }

  const client = clientMap[conn.dbType]
  if (!client) {
    throw new Error(`Unsupported DB type: ${conn.dbType}`)
  }

  // DB接続には host/port/username/databaseName が必要（GraphQL時はここに来ない想定）
  // null の場合はエラーを出す（DB型のみが buildDynamicKnex を呼ぶ）
  const host = conn.host ?? ''
  const port = conn.port ?? 0
  const username = conn.username ?? ''
  const databaseName = conn.databaseName ?? ''

  const knexInstance = Knex({
    client,
    connection: {
      host,
      port,
      user: username,
      password: conn.password,
      database: databaseName,
      // MySQL: INFORMATION_SCHEMA のコメント情報を文字化けなく取得するために charset を指定
      ...(conn.dbType === 'mysql' ? { charset: 'utf8mb4' } : {}),
    },
    // スキーマ取得専用のプール（最小限のコネクション）
    pool: { min: 0, max: 2 },
    debug: false,
  })

  return { knex: knexInstance, databaseName, dbType: conn.dbType }
}

// =============================================================================
// GraphQL Introspectionスキーマ取得
// =============================================================================

/**
 * GraphQL IntrospectionのTypeエントリ型（内部型）
 */
interface GraphQLIntrospectionField {
  name: string
  type: {
    name: string | null
    kind: string
    ofType: {
      name: string | null
      kind: string
    } | null
  }
}

/**
 * GraphQL IntrospectionのTypeエントリ型（内部型）
 */
interface GraphQLIntrospectionType {
  name: string
  kind: string
  fields: GraphQLIntrospectionField[] | null
}

/**
 * GraphQL Introspection Query のレスポンス型（内部型）
 */
interface GraphQLIntrospectionResponse {
  data?: {
    __schema?: {
      types: GraphQLIntrospectionType[]
    }
  }
  errors?: Array<{ message: string }>
}

/**
 * GraphQL型の実際の型名を解決する
 *
 * GraphQLの型は NON_NULL / LIST でラップされることがある。
 * ofType を再帰的に辿って実際の型名を取得する。
 *
 * @param type - GraphQL型オブジェクト
 * @returns 解決された型名文字列
 *
 * @example
 * ```
 * resolveTypeName({ name: null, kind: 'NON_NULL', ofType: { name: 'String', kind: 'SCALAR' } })
 * // => 'String!'
 * resolveTypeName({ name: null, kind: 'LIST', ofType: { name: 'User', kind: 'OBJECT' } })
 * // => '[User]'
 * ```
 */
function resolveTypeName(type: { name: string | null; kind: string; ofType: { name: string | null; kind: string } | null }): string {
  if (type.kind === 'NON_NULL') {
    const inner = type.ofType ? resolveTypeName(type.ofType as { name: string | null; kind: string; ofType: null }) : 'Unknown'
    return `${inner}!`
  }
  if (type.kind === 'LIST') {
    const inner = type.ofType ? resolveTypeName(type.ofType as { name: string | null; kind: string; ofType: null }) : 'Unknown'
    return `[${inner}]`
  }
  return type.name ?? 'Unknown'
}

/**
 * GraphQL Introspection Query を実行してスキーマ情報を取得する
 *
 * フルIntrospection Query（types.fields を含む）を実行し、
 * OBJECT/INTERFACE/INPUT_OBJECT 型とそのフィールドを SchemaInfo 形式に変換する。
 * ビルトイン型（__ プレフィックス）と SCALAR/ENUM/UNION は除外する。
 *
 * @param endpointUrl - GraphQLエンドポイントURL
 * @returns SchemaInfo 形式のスキーマ情報
 * @throws Error - 接続失敗またはIntrospection無効の場合
 */
async function fetchSchemaGraphQL(endpointUrl: string): Promise<SchemaInfo> {
  // フルIntrospection Query（フィールド・引数・型情報を含む）
  const introspectionQuery = `
    {
      __schema {
        types {
          name
          kind
          fields {
            name
            type {
              name
              kind
              ofType {
                name
                kind
              }
            }
          }
        }
      }
    }
  `

  const response = await fetch(endpointUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ query: introspectionQuery }),
    // タイムアウト: 10秒（フルIntrospectionはデータ量が多いため接続テストより長め）
    signal: AbortSignal.timeout(10000),
  })

  if (!response.ok) {
    throw new Error(`GraphQL接続に失敗しました: HTTP ${response.status} ${response.statusText}`)
  }

  const data = await response.json() as GraphQLIntrospectionResponse

  if (data.errors && data.errors.length > 0) {
    const errorMessages = data.errors.map((e) => e.message).join('; ')
    throw new Error(`GraphQL Introspection エラー: ${errorMessages}`)
  }

  const types = data.data?.__schema?.types ?? []

  // OBJECT/INTERFACE/INPUT_OBJECT 型のみを対象（SCALAR, ENUM, UNION, ビルトイン型は除外）
  // ビルトイン型の除外基準: 名前が '__' で始まるもの
  const filteredTypes = types.filter(
    (type) =>
      (type.kind === 'OBJECT' || type.kind === 'INTERFACE' || type.kind === 'INPUT_OBJECT') &&
      !type.name.startsWith('__')
  )

  // SchemaInfo.tables 形式に変換（GraphQLのTypeをtableとして扱う）
  const tables: TableInfo[] = filteredTypes
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((type) => {
      const columns: ColumnInfo[] = (type.fields ?? []).map((field) => ({
        name: field.name,
        // 型名を解決（NON_NULL / LIST のラップを解除）
        type: resolveTypeName(field.type),
        // NON_NULL でラップされていればnon-nullable（必須）
        nullable: field.type.kind !== 'NON_NULL',
        comment: null,
      }))

      return {
        name: type.name,
        // GraphQLではコメント（description）を取得していないためnull
        comment: null,
        columns,
      }
    })

  return {
    // GraphQLの場合: databaseにエンドポイントURLを設定
    database: endpointUrl,
    dbType: 'graphql',
    tables,
  }
}

// =============================================================================
// スキーマ取得（DB種別ごとの実装）
// =============================================================================

/**
 * PostgreSQL 向け: カレントスキーマのテーブル・カラム情報を取得するSQLを実行する
 *
 * current_schema() を使用してデフォルトスキーマ（通常 'public'）のテーブルのみを取得。
 * information_schema の内部テーブル（pg_catalog等）は除外する。
 * テーブルコメント・カラムコメントは pg_catalog の obj_description / col_description で取得。
 *
 * @param db - knexインスタンス
 * @param database - データベース名
 * @returns スキーマ情報
 */
async function fetchSchemaPostgresql(
  db: KnexType,
  database: string
): Promise<SchemaInfo> {
  const rows = await db.raw<{ rows: InformationSchemaColumn[] }>(`
    SELECT
      c.table_name,
      obj_description(
        (quote_ident(c.table_schema) || '.' || quote_ident(c.table_name))::regclass
      ) AS table_comment,
      c.column_name,
      c.data_type,
      c.is_nullable,
      col_description(
        (quote_ident(c.table_schema) || '.' || quote_ident(c.table_name))::regclass,
        c.ordinal_position
      ) AS column_comment
    FROM information_schema.columns c
    INNER JOIN information_schema.tables t
      ON t.table_schema = c.table_schema
      AND t.table_name  = c.table_name
    WHERE c.table_schema = current_schema()
      AND t.table_type   = 'BASE TABLE'
    ORDER BY c.table_name, c.ordinal_position
  `)

  return buildSchemaInfo(database, rows.rows, 'postgresql')
}

/**
 * MySQL 向け: 現在接続中のデータベースのテーブル・カラム情報を取得するSQLを実行する
 *
 * DATABASE() を使用して現在のデータベースのテーブルのみを取得。
 * ビュー (VIEW) は除外し、BASE TABLE のみを対象とする。
 * テーブルコメントは INFORMATION_SCHEMA.TABLES.TABLE_COMMENT、
 * カラムコメントは INFORMATION_SCHEMA.COLUMNS.COLUMN_COMMENT で取得。
 *
 * @param db - knexインスタンス
 * @param database - データベース名
 * @returns スキーマ情報
 */
async function fetchSchemaMysql(
  db: KnexType,
  database: string
): Promise<SchemaInfo> {
  // コメント情報を文字化けなく取得するために接続文字コードを明示的に設定
  await db.raw('SET NAMES utf8mb4')

  const [rows] = await db.raw<[InformationSchemaColumn[]]>(`
    SELECT
      c.TABLE_NAME   AS table_name,
      t.TABLE_COMMENT AS table_comment,
      c.COLUMN_NAME  AS column_name,
      c.COLUMN_TYPE  AS data_type,
      c.IS_NULLABLE  AS is_nullable,
      c.COLUMN_COMMENT AS column_comment
    FROM information_schema.COLUMNS c
    INNER JOIN information_schema.TABLES t
      ON t.TABLE_SCHEMA = c.TABLE_SCHEMA
      AND t.TABLE_NAME  = c.TABLE_NAME
    WHERE c.TABLE_SCHEMA = DATABASE()
      AND t.TABLE_TYPE   = 'BASE TABLE'
    ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION
  `)

  return buildSchemaInfo(database, rows, 'mysql')
}

// =============================================================================
// データ変換
// =============================================================================

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
  rows: InformationSchemaColumn[],
  dbType: 'mysql' | 'postgresql' | 'graphql' = 'mysql'
): SchemaInfo {
  // テーブル名をキーとしたMapを使い、カラムとテーブルコメントをグループ化
  const tableMap = new Map<string, { comment: string | null; columns: ColumnInfo[] }>()

  for (const row of rows) {
    const tableName = row.table_name
    if (!tableMap.has(tableName)) {
      tableMap.set(tableName, { comment: row.table_comment ?? null, columns: [] })
    }
    tableMap.get(tableName)!.columns.push({
      name: row.column_name,
      type: row.data_type,
      // is_nullable は 'YES' / 'NO' の文字列
      nullable: row.is_nullable === 'YES',
      comment: row.column_comment ?? null,
    })
  }

  // テーブル名でソートした配列に変換
  const tables: TableInfo[] = Array.from(tableMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, info]) => ({ name, comment: info.comment, columns: info.columns }))

  return { database, dbType, tables }
}

// =============================================================================
// 公開API
// =============================================================================

/**
 * 指定DB接続先のスキーマ情報を取得する（キャッシュ優先）
 *
 * キャッシュに該当 dbConnectionId のスキーマが存在する場合は即返却する。
 * ない場合は動的にDB接続してスキーマを取得し、キャッシュに保存してから返す。
 *
 * DB_TYPE（dbType）は接続先設定から自動取得する。
 * このサービスはリードオンリー操作のみを行う（SELECT のみ）。
 *
 * @param dbConnectionId - DB接続先ID（UUID）。connectionManager に登録済みのもの。
 * @returns スキーマ情報
 * @throws ConnectionNotFoundError 接続先が見つからない場合
 * @throws Error DB接続失敗またはクエリエラー
 *
 * @example
 * ```typescript
 * // キャッシュがある場合は即返却（2回目以降は高速）
 * const schema = await fetchSchema('uuid-of-connection')
 * console.log(schema.tables.map(t => t.name))
 * ```
 */
export async function fetchSchema(dbConnectionId: string): Promise<SchemaInfo> {
  // 1. メモリキャッシュから返せる場合は即返却
  const memoryCached = schemaCache.get(dbConnectionId)
  if (memoryCached) {
    console.info(`[schema] Memory cache hit for dbConnectionId: ${dbConnectionId}`)
    return memoryCached
  }

  // 2. SQLite 永続キャッシュから返せる場合はメモリキャッシュに載せて返却
  try {
    const db = getHistoryDb()
    const row = getDbConnectionById(db, dbConnectionId)
    if (row?.schema_cache) {
      const persisted = JSON.parse(row.schema_cache) as SchemaInfo
      schemaCache.set(dbConnectionId, persisted)
      console.info(
        `[schema] Persistent cache hit for dbConnectionId: ${dbConnectionId} (cached at: ${row.schema_cached_at})`
      )
      return persisted
    }
  } catch (err) {
    console.warn('[schema] Failed to read persistent cache, falling back to DB query:', err)
  }

  // 3. キャッシュなし → DBに問い合わせてスキーマを取得し、永続化する
  return refreshSchema(dbConnectionId)
}

/**
 * 指定DB/GraphQL接続先のスキーマをDBから再取得し、永続キャッシュとメモリキャッシュの両方を更新する
 *
 * 接続登録時やユーザーの手動リフレッシュ時に呼び出す。
 *
 * PBI #200: GraphQL対応
 * - dbType='graphql' の場合: Introspection Query でスキーマを取得
 * - dbType='mysql'/'postgresql' の場合: 従来通り INFORMATION_SCHEMA から取得
 *
 * @param dbConnectionId - DB/GraphQL接続先ID（UUID）
 * @returns 再取得したスキーマ情報
 * @throws ConnectionNotFoundError 接続先が見つからない場合
 * @throws Error DB/GraphQL接続失敗またはクエリエラー
 */
export async function refreshSchema(dbConnectionId: string): Promise<SchemaInfo> {
  console.info(`[schema] Fetching schema from DB for dbConnectionId: ${dbConnectionId}`)

  // GraphQL接続先かどうかを確認（接続先情報を取得）
  const conn = getById(dbConnectionId)

  if (conn.dbType === 'graphql') {
    // GraphQL接続先: Introspection Query でスキーマを取得
    if (!conn.endpointUrl) {
      throw new Error(`GraphQL接続先のendpointUrlが設定されていません: ${dbConnectionId}`)
    }

    const schemaInfo = await fetchSchemaGraphQL(conn.endpointUrl)

    // メモリキャッシュに保存
    schemaCache.set(dbConnectionId, schemaInfo)

    // SQLite 永続キャッシュに保存
    try {
      const db = getHistoryDb()
      updateDbConnectionSchemaCache(db, dbConnectionId, JSON.stringify(schemaInfo))
      console.info(
        `[schema] GraphQL schema persisted for dbConnectionId: ${dbConnectionId} (${schemaInfo.tables.length} types)`
      )
    } catch (err) {
      console.warn('[schema] Failed to persist GraphQL schema cache (non-fatal):', err)
    }

    return schemaInfo
  }

  // DB接続先（MySQL/PostgreSQL）: 従来通りINFORMATION_SCHEMAから取得
  let knexInstance: KnexType | null = null
  try {
    const { knex, databaseName, dbType } = buildDynamicKnex(dbConnectionId)
    knexInstance = knex

    // DB種別に応じてスキーマ取得SQLを実行
    let schemaInfo: SchemaInfo
    switch (dbType) {
      case 'postgresql':
        schemaInfo = await fetchSchemaPostgresql(knexInstance, databaseName)
        break
      case 'mysql':
        schemaInfo = await fetchSchemaMysql(knexInstance, databaseName)
        break
      default:
        throw new Error(
          `DB_TYPE="${dbType}" はサポートされていません。'postgresql' または 'mysql' を指定してください。`
        )
    }

    // メモリキャッシュに保存
    schemaCache.set(dbConnectionId, schemaInfo)

    // SQLite 永続キャッシュに保存
    try {
      const db = getHistoryDb()
      updateDbConnectionSchemaCache(db, dbConnectionId, JSON.stringify(schemaInfo))
      console.info(
        `[schema] Schema persisted for dbConnectionId: ${dbConnectionId} (${schemaInfo.tables.length} tables)`
      )
    } catch (err) {
      console.warn('[schema] Failed to persist schema cache (non-fatal):', err)
    }

    return schemaInfo
  } finally {
    if (knexInstance) {
      await knexInstance.destroy()
    }
  }
}

// =============================================================================
// 後方互換性（.envの固定DB接続向け。既存コードとの互換を保つため残存）
// =============================================================================

// NOTE: 以前の fetchSchema() は .env の固定DB接続を使用していた。
// PBI #149 改修後は dbConnectionId 必須の新APIに移行したため、
// 固定接続版は削除した。呼び出し元（routes/schema.ts, routes/chat.ts）も
// dbConnectionId を必須で渡すよう改修すること。

// Re-export ConnectionNotFoundError for use in routes
export { ConnectionNotFoundError }
