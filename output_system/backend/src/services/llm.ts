/**
 * LLMサービス（Claude API連携）
 *
 * @anthropic-ai/sdk を使用して Claude API とのストリーミング通信を行うサービス。
 * 自然言語の質問とDBスキーマ情報を受け取り、SQL文と推奨グラフ種別を生成する。
 *
 * 主な責務:
 *   - Anthropic クライアントの初期化（APIキー検証）
 *   - システムプロンプトの構築（スキーマ情報の埋め込み）
 *   - ストリーミングレスポンスから SQL と chart_type を抽出
 *   - エラーハンドリング（APIキー未設定、APIエラー、タイムアウト）
 *
 * 使用する環境変数:
 *   USE_BEDROCK       : 'true' の場合 Amazon Bedrock 経由で Claude を呼び出す
 *   AWS_REGION        : Bedrock のリージョン（USE_BEDROCK=true 時に使用、省略時: ap-northeast-1）
 *   ANTHROPIC_API_KEY : Anthropic API キー（USE_BEDROCK が未設定の場合に必須）
 *   ANTHROPIC_MODEL   : 使用するモデル名（省略時: 自動選択）
 *
 * 参考: https://context7.com/anthropics/anthropic-sdk-typescript/llms.txt
 */

import Anthropic from '@anthropic-ai/sdk'
import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk'
import { SchemaInfo } from './schema'

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/**
 * 会話履歴の1メッセージ（LLMのmessages配列に変換するための入力型）
 */
export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
  /** アシスタントが生成したSQL（コンテキスト維持用） */
  sql?: string | null
}

/**
 * LLMサービスへの入力パラメータ
 */
export interface LlmGenerateInput {
  /** ユーザーの自然言語質問 */
  question: string
  /** DBスキーマ情報（INFORMATION_SCHEMA から取得済み） */
  schema: SchemaInfo
  /** DB種別（mysql / postgresql / graphql）。SQL方言の選択に使用 */
  dbType: 'mysql' | 'postgresql' | 'graphql'
  /** 会話履歴（直近のやり取り。省略時は単発の質問として扱う） */
  conversationHistory?: ConversationMessage[]
}

/**
 * LLMから抽出された構造化データの型
 *
 * api.md の SSE イベント仕様に対応:
 *   - sql        : event: sql
 *   - chartType  : event: chart_type
 */
export type ChartType = 'bar' | 'line' | 'pie' | 'table'

/**
 * generate() が yield するイベントの型
 *
 * 呼び出し側は type フィールドで各イベントを判別する。
 */
export type LlmEvent =
  | { type: 'message'; chunk: string }      // テキストチャンク（逐次送信）
  | { type: 'sql'; sql: string }             // 抽出した SQL 文
  | { type: 'chart_type'; chartType: ChartType } // 推奨グラフ種別

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/**
 * デフォルトモデル名
 * ANTHROPIC_MODEL 環境変数が未設定の場合に使用する。
 * Bedrock と直接 API でモデル ID の形式が異なる。
 */
const DEFAULT_MODEL = 'claude-sonnet-4-20250514'
const DEFAULT_BEDROCK_MODEL = 'apac.anthropic.claude-sonnet-4-20250514-v1:0'

/**
 * Bedrock を使用するかどうか
 */
const USE_BEDROCK = process.env.USE_BEDROCK === 'true'

/**
 * APIレスポンスの最大トークン数
 * SQLとグラフ種別を含むJSONフェンスを生成するために十分な値に設定する。
 */
const MAX_TOKENS = 4096

/**
 * APIリクエストのタイムアウト（ミリ秒）
 * Anthropic SDK のデフォルト（600秒）より短く設定して早期エラー検出を優先する。
 */
const REQUEST_TIMEOUT_MS = 60_000

// ---------------------------------------------------------------------------
// システムプロンプト
// ---------------------------------------------------------------------------

/**
 * Claude に渡すシステムプロンプトのテンプレート
 *
 * SQL生成のルール:
 *   - SELECT 文のみ生成（INSERT/UPDATE/DELETE/DROP 等は絶対に生成しない）
 *   - 指定されたスキーマ情報のテーブル・カラムのみ参照する
 *   - 可視化に適したクエリを生成する（集計・ランキング等）
 *
 * chart_type のルール:
 *   - bar  : カテゴリ比較（売上ランキング等）
 *   - line : 時系列変化（日別推移等）
 *   - pie  : 構成比（シェア等）
 *   - table: その他の表形式データ
 *
 * レスポンス形式:
 *   LLM は必ず以下の JSON フェンスを含む回答を返す。
 *   フェンス外のテキストは説明文として扱われ、SSE の message イベントで送信される。
 *
 *   ```json
 *   {
 *     "sql": "SELECT ...",
 *     "chart_type": "bar"
 *   }
 *   ```
 */
/**
 * システムプロンプトを生成する
 *
 * DB種別に応じたSQL方言指示（DB接続）またはGraphQLクエリ生成指示を含める。
 * GraphQL時:
 *   - Query のみ生成。Mutation/Subscription は絶対に生成しない
 *   - フラットなデータ構造を返すよう指示（可視化のため）
 *   - JSON レスポンスフォーマットは SQL 時と同一（"sql" フィールドに GraphQL クエリを格納）
 *
 * @param dbType - DB種別（mysql / postgresql / graphql）
 * @returns システムプロンプト文字列
 */
function buildSystemPrompt(dbType: 'mysql' | 'postgresql' | 'graphql'): string {
  if (dbType === 'graphql') {
    return `You are a helpful data analyst assistant. Your role is to help users understand and query GraphQL APIs.

DATA SOURCE TYPE: GraphQL API
The connected data source is a GraphQL API. Your task is to translate natural language questions into GraphQL queries for data visualization.

SCHEMA INFORMATION:
The user's message always contains a "Database Schema" section that lists ALL available types and fields. This is the complete and authoritative schema of the connected GraphQL API.
- **NEVER say you don't have schema information. It is ALWAYS provided in the user's message.**
- **NEVER ask the user to provide type or field information. You already have it.**
- Use ONLY the types and fields listed in the "Database Schema" section.
- If the "Database Schema" section shows no types, tell the user that the API has no accessible types and suggest checking the connection settings. Do NOT generate any query in this case.

CRITICAL SECURITY RULES:
1. **ONLY generate Query operations. NEVER generate Mutation or Subscription operations.**
2. **Do NOT use "mutation" or "subscription" keywords under any circumstances.**
3. If the user asks to create, update, or delete data, politely decline and explain that only data retrieval is supported.

QUERY GENERATION RULES:
4. Generate GraphQL queries that return FLAT data structures optimized for visualization:
   - Prefer scalar fields (String, Int, Float, Boolean) over nested objects
   - If you need nested fields, expand them to get scalar values directly
   - Avoid deeply nested structures that are hard to tabulate
   - Example: prefer \`{ user { name } }\` over \`{ user }\` when \`user\` is an object type
5. Choose the most appropriate chart type for visualization:
   - "bar"  : Category comparisons (rankings, counts by category)
   - "line" : Time series data (trends over time)
   - "pie"  : Proportional data (distribution, share percentages)
   - "table": Complex data, many fields, or when no specific chart is appropriate
6. **CRITICAL: NEVER reference types or fields that are not listed in the Database Schema.**

IMPORTANT: Always try your best to help the user. If the question is vague, make reasonable assumptions based on the available schema and explain your interpretation.

RESPONSE FORMAT:
First, provide a brief explanation of your approach in the user's language.
Then, include a JSON code block with EXACTLY this structure:

\`\`\`json
{
  "sql": "query { ... }",
  "chart_type": "table"
}
\`\`\`

The "sql" field contains the GraphQL query (the field name "sql" is reused for compatibility).
The JSON must always be at the end of your response.`
  }

  const dialectName = dbType === 'mysql' ? 'MySQL' : 'PostgreSQL'

  return `You are a helpful data analyst assistant. Your role is to translate natural language questions into SQL queries for data visualization.

DATABASE TYPE: ${dialectName}
Generate SQL that is fully compatible with ${dialectName} syntax. Do NOT use syntax from other databases (SQLite, SQL Server, Oracle, etc.).
${dbType === 'mysql' ? '- Use backticks (\\`) for identifier quoting.\n- Use LIMIT (not TOP or FETCH FIRST).\n- Use IFNULL() instead of COALESCE() where appropriate.' : '- Use double quotes (") for identifier quoting if needed.\n- Use LIMIT or FETCH FIRST.\n- Use COALESCE() for null handling.'}

SCHEMA INFORMATION:
The user's message always contains a "Database Schema" section that lists ALL available tables and columns. This is the complete and authoritative schema of the connected database.
- **NEVER say you don't have schema information. It is ALWAYS provided in the user's message.**
- **NEVER ask the user to provide table or column information. You already have it.**
- Use ONLY the tables and columns listed in the "Database Schema" section. If a table or column does not appear there, it does not exist in the database.
- **NEVER query information_schema, pg_catalog, or any system tables. You already have the schema.**
- If the "Database Schema" section shows no tables, tell the user that the connected database has no tables and suggest checking the DB connection settings. Do NOT generate any SQL in this case.
- Table comments (after "--") describe the purpose of each table. Column comments describe the meaning, unit, and purpose of each column. Use them to understand the data and generate accurate queries.

RULES:
1. Generate ONLY SELECT statements. Never generate INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, TRUNCATE, or any other DDL/DML statements.
2. **CRITICAL: NEVER reference tables or columns that are not listed in the Database Schema. Do NOT invent or guess table/column names.**
3. Generate queries optimized for visualization (aggregations, rankings, time series, etc.).
4. Choose the most appropriate chart type:
   - "bar"  : Category comparisons (rankings, totals by category)
   - "line" : Time series data (trends over time)
   - "pie"  : Proportional data (distribution, share)
   - "table": Complex data, many columns, or when no specific chart is appropriate

IMPORTANT: Always try your best to generate a SQL query. If the user's question is vague or ambiguous, make a reasonable assumption based on the available schema and explain your interpretation. Only respond without SQL if the question is completely unrelated to databases (e.g., greetings, general knowledge questions).

RESPONSE FORMAT:
First, provide a brief explanation of your approach in the user's language.
Then, include a JSON code block with EXACTLY this structure:

\`\`\`json
{
  "sql": "SELECT ...",
  "chart_type": "bar"
}
\`\`\`

The JSON must always be at the end of your response.`
}

// ---------------------------------------------------------------------------
// ユーティリティ関数
// ---------------------------------------------------------------------------

/**
 * SchemaInfo をシステムプロンプトに埋め込むテキスト形式に変換する
 *
 * LLM が理解しやすいよう、テーブル名とカラム情報を人間が読みやすい形式で出力する。
 * GraphQL 接続の場合は、Type/Field として出力する（テーブル/カラムの代わり）。
 *
 * @param schema - fetchSchema() から取得したスキーマ情報
 * @returns プロンプトに埋め込む文字列
 *
 * @example DB の場合:
 * schemaToPromptText({ dbType: 'mysql', database: 'mydb', tables: [...] })
 * // => "Database: mydb (MySQL)\n\nTable: users\n  - id (integer, NOT NULL)\n..."
 *
 * @example GraphQL の場合:
 * schemaToPromptText({ dbType: 'graphql', database: 'https://...', tables: [...] })
 * // => "GraphQL API: https://...\n\nType: User\n  - id (ID!, required)\n..."
 */
export function schemaToPromptText(schema: SchemaInfo): string {
  if (schema.dbType === 'graphql') {
    // GraphQL 接続の場合: Type/Field として出力
    const lines: string[] = [`GraphQL API: ${schema.database}`, '']

    for (const table of schema.tables) {
      // table.name = GraphQL の Type 名
      lines.push(`Type: ${table.name}`)
      for (const col of table.columns) {
        // col.nullable = false の場合は NON_NULL（required）
        const nullability = col.nullable ? 'nullable' : 'required'
        lines.push(`  - ${col.name}: ${col.type} (${nullability})`)
      }
      lines.push('')
    }

    return lines.join('\n').trimEnd()
  }

  // DB 接続の場合: Table/Column として出力（既存の処理）
  const dbTypeLabel = schema.dbType === 'mysql' ? 'MySQL' : 'PostgreSQL'
  const lines: string[] = [`Database: ${schema.database} (${dbTypeLabel})`, '']

  for (const table of schema.tables) {
    const tableHeader = table.comment
      ? `Table: ${table.name} -- ${table.comment}`
      : `Table: ${table.name}`
    lines.push(tableHeader)
    for (const col of table.columns) {
      const nullability = col.nullable ? 'NULL' : 'NOT NULL'
      const colComment = col.comment ? ` -- ${col.comment}` : ''
      lines.push(`  - ${col.name} (${col.type}, ${nullability})${colComment}`)
    }
    lines.push('')
  }

  return lines.join('\n').trimEnd()
}

/**
 * LLM のレスポンステキストから JSON フェンス内の構造化データを抽出する
 *
 * LLM が生成するテキストは以下のような形式を想定:
 *   "今月の売上トップ10は...\n\n```json\n{\"sql\": \"...\", \"chart_type\": \"bar\"}\n```"
 *
 * 抽出失敗時（JSON フェンスなし、パース失敗）は null を返す。
 * 正規表現ではなく JSON フェンス（```json ... ```）を検出してパースするため
 * テキスト内の不完全な JSON への誤反応を防ぐ。
 *
 * @param text - LLM が生成した全テキスト
 * @returns 抽出した構造化データ、または null（抽出失敗時）
 */
export function extractStructuredData(text: string): {
  sql: string
  chartType: ChartType
} | null {
  // JSON フェンス（```json ... ```）を検索
  // LLM が ``` のみ（言語指定なし）で返すケースにも対応
  const jsonFenceRegex = /```(?:json)?\s*\n([\s\S]*?)\n```/g
  let match: RegExpExecArray | null

  // 最後のマッチを優先（複数フェンスがある場合はJSONが末尾に来ることが多い）
  let lastMatch: string | null = null
  while ((match = jsonFenceRegex.exec(text)) !== null) {
    lastMatch = match[1]
  }

  if (!lastMatch) {
    return null
  }

  try {
    const parsed = JSON.parse(lastMatch)

    // sql フィールドの検証
    if (typeof parsed.sql !== 'string' || parsed.sql.trim() === '') {
      return null
    }

    // chart_type フィールドの検証
    const validChartTypes: ChartType[] = ['bar', 'line', 'pie', 'table']
    const rawChartType = parsed.chart_type as string
    const chartType: ChartType = validChartTypes.includes(rawChartType as ChartType)
      ? (rawChartType as ChartType)
      : 'table' // 不正な値はフォールバック

    return {
      sql: parsed.sql.trim(),
      chartType,
    }
  } catch {
    // JSON パース失敗は null を返す
    return null
  }
}

// ---------------------------------------------------------------------------
// LLM サービスクラス
// ---------------------------------------------------------------------------

/**
 * Anthropic Claude API を使用した LLM サービス
 *
 * generate() メソッドがストリーミングで LLMEvent を yield する async generator。
 * 呼び出し側（chat.ts ルート）は for-await-of でイベントを受け取り、
 * 各イベントを SSE イベントに変換して送信する。
 *
 * @example
 * ```typescript
 * const service = new LlmService()
 * for await (const event of service.generate({ question, schema })) {
 *   if (event.type === 'message') sendSSE('message', event.chunk)
 *   if (event.type === 'sql') sendSSE('sql', event.sql)
 *   if (event.type === 'chart_type') sendSSE('chart_type', event.chartType)
 * }
 * ```
 */
export class LlmService {
  /** Anthropic クライアントインスタンス（直接 API または Bedrock） */
  private client: Anthropic | AnthropicBedrock

  /**
   * LlmService コンストラクタ
   *
   * USE_BEDROCK=true の場合: AnthropicBedrock クライアントを初期化（IAM認証）。
   * それ以外: ANTHROPIC_API_KEY でAnthropicクライアントを初期化。
   *
   * @throws LlmConfigError - 直接API時に ANTHROPIC_API_KEY が未設定の場合
   */
  constructor() {
    if (USE_BEDROCK) {
      // Bedrock: IAM認証（ECSタスクロール or 環境変数の AWS_ACCESS_KEY_ID 等）
      const awsRegion = process.env.AWS_REGION || 'ap-northeast-1'
      this.client = new AnthropicBedrock({
        awsRegion,
        timeout: REQUEST_TIMEOUT_MS,
      })
    } else {
      // 直接API: APIキー認証
      const apiKey = process.env.ANTHROPIC_API_KEY

      if (!apiKey || apiKey.trim() === '') {
        throw new LlmConfigError(
          'ANTHROPIC_API_KEY が設定されていません。環境変数に Anthropic API キーを設定するか、USE_BEDROCK=true で Bedrock を使用してください。'
        )
      }

      this.client = new Anthropic({
        apiKey,
        timeout: REQUEST_TIMEOUT_MS,
      })
    }
  }

  /**
   * 自然言語の質問を受け取り、SQL と chart_type をストリーミングで生成する
   *
   * 処理フロー:
   *   1. スキーマ情報をプロンプトテキストに変換
   *   2. Claude API にストリーミングリクエストを送信
   *   3. テキストチャンクを message イベントとして yield
   *   4. ストリーム完了後に全テキストから SQL と chart_type を抽出して yield
   *
   * @param input - 質問文とスキーマ情報
   * @yields LlmEvent - message（テキストチャンク）、sql、chart_type の各イベント
   * @throws LlmApiError - Claude API の呼び出しに失敗した場合
   * @throws LlmTimeoutError - APIリクエストがタイムアウトした場合
   * @throws LlmParseError - LLMレスポンスから SQL / chart_type を抽出できなかった場合
   */
  async *generate(input: LlmGenerateInput): AsyncGenerator<LlmEvent> {
    const { question, schema, dbType, conversationHistory } = input

    // スキーマ情報をプロンプトテキストに変換
    const schemaText = schemaToPromptText(schema)

    // 会話履歴をClaude API のmessages配列に変換
    // 直近の会話コンテキストをLLMに渡すことで、SQLの修正依頼に対応する
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = []

    if (conversationHistory && conversationHistory.length > 0) {
      // 直近10往復（20メッセージ）に制限してトークンを節約
      const recentHistory = conversationHistory.slice(-20)
      for (const msg of recentHistory) {
        if (msg.role === 'user') {
          // 履歴のユーザーメッセージはスキーマ情報なしで追加（トークン節約）
          messages.push({ role: 'user', content: msg.content })
        } else {
          // アシスタントメッセージにはSQLを含めて文脈を維持
          const assistantContent = msg.sql
            ? `${msg.content}\n\n\`\`\`json\n{"sql": ${JSON.stringify(msg.sql)}, "chart_type": "table"}\n\`\`\``
            : msg.content
          messages.push({ role: 'assistant', content: assistantContent })
        }
      }
    }

    // 最新のユーザーメッセージにスキーマを埋め込む
    const userMessage = `## Database Schema\n\n${schemaText}\n\n## Question\n\n${question}`
    messages.push({ role: 'user', content: userMessage })

    // 使用するモデル名（環境変数で上書き可能、Bedrock/直接APIで形式が異なる）
    const model = process.env.ANTHROPIC_MODEL || (USE_BEDROCK ? DEFAULT_BEDROCK_MODEL : DEFAULT_MODEL)

    // Claude API にストリーミングリクエストを送信
    let stream: ReturnType<typeof this.client.messages.stream>

    try {
      stream = this.client.messages.stream({
        model,
        max_tokens: MAX_TOKENS,
        system: buildSystemPrompt(dbType),
        messages,
      })
    } catch (err) {
      // ネットワークエラー等でストリーム開始失敗
      throw new LlmApiError(
        `Claude API への接続に失敗しました: ${err instanceof Error ? err.message : String(err)}`
      )
    }

    // テキストチャンクを逐次 yield しながら全テキストを蓄積する
    let fullText = ''

    try {
      // on('text') イベントを使用してテキストチャンクを受け取る
      // AsyncGenerator として yield するため、イベントを Promise でラップする
      for await (const chunk of stream) {
        if (
          chunk.type === 'content_block_delta' &&
          chunk.delta.type === 'text_delta'
        ) {
          const textChunk = chunk.delta.text
          fullText += textChunk

          // テキストチャンクを message イベントとして yield
          yield { type: 'message', chunk: textChunk }
        }
      }
    } catch (err) {
      // タイムアウトエラーを判別して適切な例外をスロー
      if (err instanceof Anthropic.APIError) {
        if (err.status === 408 || err.message.toLowerCase().includes('timeout')) {
          throw new LlmTimeoutError(
            `Claude API へのリクエストがタイムアウトしました（${REQUEST_TIMEOUT_MS / 1000}秒）。`
          )
        }
        throw new LlmApiError(
          `Claude API エラー (status: ${err.status}): ${err.message}`
        )
      }
      throw new LlmApiError(
        `Claude API との通信中にエラーが発生しました: ${err instanceof Error ? err.message : String(err)}`
      )
    }

    // ストリーム完了後: 全テキストから SQL と chart_type を抽出
    const extracted = extractStructuredData(fullText)

    if (extracted) {
      // SQL を yield
      yield { type: 'sql', sql: extracted.sql }

      // chart_type を yield
      yield { type: 'chart_type', chartType: extracted.chartType }
    }
    // extracted が null の場合はテキスト応答のみ（SQLなし）として正常終了する。
    // 質問が曖昧な場合や、スキーマに該当テーブルがない場合にLLMがテキストで回答することを許容する。
  }

  /**
   * クエリ結果をLLMに渡し、分析コメントをストリーミング生成する
   *
   * SQL/GraphQLクエリ実行結果に対してデータの傾向・特徴・注目ポイントを解説する。
   * dbType が 'graphql' の場合は「実行したSQL」の表示を「実行したGraphQLクエリ」に変える。
   * 呼び出し側は for-await-of で テキストチャンクを受け取る。
   *
   * @param input - 元の質問、実行クエリ（SQL or GraphQL）、クエリ結果、DB種別
   * @yields string - テキストチャンク（逐次送信用）
   */
  async *analyzeResults(input: {
    question: string
    sql: string
    columns: string[]
    rows: Record<string, unknown>[]
    dbType?: 'mysql' | 'postgresql' | 'graphql'
  }): AsyncGenerator<string> {
    const { question, sql, columns, rows, dbType } = input

    // 結果データをテキスト化（最大50行に制限してトークン節約）
    const displayRows = rows.slice(0, 50)
    const resultText = displayRows.map((row) =>
      columns.map((col) => `${col}: ${row[col] ?? 'NULL'}`).join(', ')
    ).join('\n')
    const truncatedNote = rows.length > 50 ? `\n（全${rows.length}件中、先頭50件を表示）` : ''

    // GraphQL と SQL でクエリの表現を切り替える
    const queryLabel = dbType === 'graphql' ? '実行したGraphQLクエリ' : '実行したSQL'

    const userMessage = `以下のデータについて、簡潔に分析コメントしてください。

## ユーザーの質問
${question}

## ${queryLabel}
${sql}

## クエリ結果（${rows.length}件）
カラム: ${columns.join(', ')}
${resultText}${truncatedNote}`

    const model = process.env.ANTHROPIC_MODEL || (USE_BEDROCK ? DEFAULT_BEDROCK_MODEL : DEFAULT_MODEL)

    const analysisSystemPrompt = `あなたはデータアナリストです。クエリ結果を見て、以下の観点から簡潔にコメントしてください:
- データの傾向や特徴
- 注目すべきポイント（最大値・最小値・異常値など）
- ビジネス上の示唆（あれば）

3〜5文程度で簡潔にまとめてください。日本語で回答してください。`

    let stream: ReturnType<typeof this.client.messages.stream>

    try {
      stream = this.client.messages.stream({
        model,
        max_tokens: 1024,
        system: analysisSystemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      })
    } catch (err) {
      throw new LlmApiError(
        `Claude API への接続に失敗しました: ${err instanceof Error ? err.message : String(err)}`
      )
    }

    try {
      for await (const chunk of stream) {
        if (
          chunk.type === 'content_block_delta' &&
          chunk.delta.type === 'text_delta'
        ) {
          yield chunk.delta.text
        }
      }
    } catch (err) {
      if (err instanceof Anthropic.APIError) {
        throw new LlmApiError(
          `Claude API エラー (status: ${err.status}): ${err.message}`
        )
      }
      throw new LlmApiError(
        `Claude API との通信中にエラーが発生しました: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }
}

// ---------------------------------------------------------------------------
// カスタムエラークラス
// ---------------------------------------------------------------------------

/**
 * LLM設定エラー（APIキー未設定等）
 *
 * 設定に起因するエラー。上位ルーターでは 503 Service Unavailable を返すことを推奨。
 */
export class LlmConfigError extends Error {
  readonly type = 'LlmConfigError' as const

  constructor(message: string) {
    super(message)
    this.name = 'LlmConfigError'
    Object.setPrototypeOf(this, LlmConfigError.prototype)
  }
}

/**
 * Claude API 呼び出しエラー
 *
 * ネットワークエラー、認証失敗、レート制限等。
 * 上位ルーターでは 502 Bad Gateway を返すことを推奨。
 */
export class LlmApiError extends Error {
  readonly type = 'LlmApiError' as const

  constructor(message: string) {
    super(message)
    this.name = 'LlmApiError'
    Object.setPrototypeOf(this, LlmApiError.prototype)
  }
}

/**
 * タイムアウトエラー
 *
 * Claude API へのリクエストがタイムアウトした場合。
 * 上位ルーターでは 504 Gateway Timeout を返すことを推奨。
 */
export class LlmTimeoutError extends Error {
  readonly type = 'LlmTimeoutError' as const

  constructor(message: string) {
    super(message)
    this.name = 'LlmTimeoutError'
    Object.setPrototypeOf(this, LlmTimeoutError.prototype)
  }
}

/**
 * LLMレスポンスパースエラー
 *
 * LLM が期待するフォーマットで回答しなかった場合（JSON フェンスなし等）。
 * 上位ルーターでは 422 Unprocessable Entity を返すことを推奨。
 */
export class LlmParseError extends Error {
  readonly type = 'LlmParseError' as const

  constructor(message: string) {
    super(message)
    this.name = 'LlmParseError'
    Object.setPrototypeOf(this, LlmParseError.prototype)
  }
}
