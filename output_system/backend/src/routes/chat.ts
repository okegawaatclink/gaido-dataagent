/**
 * /api/chat ルート（SSE ストリーミング）
 *
 * 自然言語の質問を受け取り、以下の処理を順次行いSSEで結果をストリーミングする:
 *   1. DBスキーマ取得（services/schema.ts）
 *   2. Claude API でSQL・グラフ種別を生成（services/llm.ts）
 *   3. SQLバリデーション（services/sqlValidator.ts 経由 / database.executeQuery 内）
 *   4. SQL実行（services/database.ts）
 *   5. 結果を SSE イベントとして送信
 *
 * SSEイベント仕様（api.md参照）:
 *   event: message  - LLMが生成したテキストチャンク（逐次送信）
 *   event: sql      - 抽出したSQL文
 *   event: chart_type - 推奨グラフ種別（bar/line/pie/table）
 *   event: result   - クエリ実行結果（QueryResult形式）
 *   event: error    - エラーメッセージ
 *   event: done     - ストリーム終了（必ず最後に送信）
 *
 * セキュリティ:
 *   - LLMが生成したSQLは sqlValidator（executeQuery内の二重防御）で検証される
 *   - SELECT 以外のSQL（INSERT/DROP等）は event: error で拒否される
 *   - エラーメッセージはユーザー向けと内部ログを分離し、内部情報（DBホスト等）の漏洩を防ぐ
 */

import { Router, Request, Response } from 'express'
import rateLimit from 'express-rate-limit'
import { v4 as uuidv4 } from 'uuid'
import { fetchSchema } from '../services/schema'
import { LlmService, LlmConfigError, LlmApiError, LlmTimeoutError, LlmParseError } from '../services/llm'
import { executeQuery, SqlValidationError } from '../services/database'
import {
  getHistoryDb,
  createConversation,
  getConversationById,
  updateConversationTimestamp,
  createMessage,
} from '../services/historyDb'

const router = Router()

/** message フィールドの最大文字数 */
const MESSAGE_MAX_LENGTH = 2000

/**
 * POST /api/chat レートリミット設定
 *
 * Claude API は有料のため、Cost Amplification Attack（大量リクエストによるAPI費用増大）を防ぐ。
 * デフォルト: 10リクエスト/分/IP
 * 環境変数で上書き可能:
 *   CHAT_RATE_LIMIT_MAX    - 最大リクエスト数（デフォルト: 10）
 *   CHAT_RATE_LIMIT_WINDOW - ウィンドウ秒数（デフォルト: 60）
 */
const chatRateLimiter = rateLimit({
  windowMs: parseInt(process.env.CHAT_RATE_LIMIT_WINDOW || '60', 10) * 1000,
  max: parseInt(process.env.CHAT_RATE_LIMIT_MAX || '10', 10),
  standardHeaders: true,   // RateLimit-* ヘッダーをレスポンスに含める（RFC 6585準拠）
  legacyHeaders: false,     // X-RateLimit-* レガシーヘッダーは使用しない
  message: {
    error: 'リクエスト数が制限を超えました。しばらく待ってから再試行してください。',
  },
  keyGenerator: (req) => {
    // X-Forwarded-For が信頼できるプロキシから来る場合はそちらを使用
    const forwarded = req.headers['x-forwarded-for']
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim()
    }
    return req.ip ?? 'unknown'
  },
})

// ---------------------------------------------------------------------------
// SSE ヘルパー関数
// ---------------------------------------------------------------------------

/**
 * SSE イベントを送信するヘルパー関数
 *
 * Server-Sent Events の仕様に従い、イベント名とデータを改行区切りで送信する。
 * data フィールドには JSON.stringify でシリアライズした値を使用する。
 *
 * SSE フォーマット:
 *   event: <eventName>\n
 *   data: <jsonData>\n
 *   \n
 *
 * @param res - Express レスポンスオブジェクト
 * @param event - SSE イベント名（message/sql/chart_type/result/error/done）
 * @param data - 送信するデータ（JSON シリアライズ可能な値）
 */
function sendSseEvent(res: Response, event: string, data: unknown): void {
  const jsonData = typeof data === 'string' ? data : JSON.stringify(data)
  res.write(`event: ${event}\ndata: ${jsonData}\n\n`)
  // Node.js の res.write はバッファリングするため、フラッシュを促す
  // （型の都合上、flushHeaders() は初回のみ使用し、以降は write 後に自動的にチャンクが送信される）
}

// ---------------------------------------------------------------------------
// POST /api/chat
// ---------------------------------------------------------------------------

/**
 * POST /api/chat
 *
 * リクエストボディ:
 *   { message: string, conversationId?: string }
 *
 *   message: 必須。2000文字以内。
 *
 * レスポンス:
 *   Content-Type: text/event-stream（SSEストリーム）
 *   各イベントを順次送信し、最後に event: done を送信して終了する
 *
 * エラーハンドリング:
 *   - message 未設定: 400エラー（SSE開始前に返す）
 *   - message が2000文字超: 400エラー（SSE開始前に返す）
 *   - DB接続エラー: event: error 送信後 event: done
 *   - LLM設定エラー（APIキー未設定）: event: error 送信後 event: done
 *   - LLM APIエラー: event: error 送信後 event: done
 *   - SQLバリデーション失敗: event: error 送信後 event: done
 *   - SQL実行エラー: event: error 送信後 event: done
 *
 * セキュリティ:
 *   - 内部エラー詳細（DBホスト名等）はサーバーログにのみ記録し、レスポンスには含めない
 */
router.post('/', chatRateLimiter, async (req: Request, res: Response): Promise<void> => {
  // リクエストボディから message と conversationId を取得
  const { message, conversationId: reqConversationId } = req.body as { message?: string; conversationId?: string }

  // message のバリデーション（SSEヘッダー送信前に400で返す）
  if (!message || message.trim() === '') {
    res.status(400).json({ error: 'message フィールドは必須です。' })
    return
  }

  if (message.length > MESSAGE_MAX_LENGTH) {
    res.status(400).json({ error: `message は ${MESSAGE_MAX_LENGTH} 文字以内で入力してください。` })
    return
  }

  // SSE レスポンスヘッダーを設定
  // Content-Type: text/event-stream が SSE の必須ヘッダー
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  // X-Accel-Buffering: no でnginxプロキシ経由でもバッファリングを無効化
  res.setHeader('X-Accel-Buffering', 'no')

  // ヘッダーを即時送信（SSE接続の確立）
  res.flushHeaders()

  // done イベント送信済みフラグ（二重送信防止）
  let doneSent = false

  /**
   * done イベントを一度だけ送信してストリームを終了するヘルパー
   * finally ブロックから呼ばれるため、エラー系の return 後も必ず実行される。
   * doneSent フラグで二重送信を防止する。
   */
  const finishStream = (): void => {
    if (!doneSent) {
      doneSent = true
      sendSseEvent(res, 'done', {})
      res.end()
    }
  }

  // -------------------------------------------------------------------------
  // 会話・メッセージの永続化（best effort）
  // -------------------------------------------------------------------------
  // 履歴DB への書き込みはチャット体験に影響しないよう best effort で行う。
  // 書き込み失敗時はエラーをログに記録するが、SSE ストリームは止めない。

  /**
   * 会話ID（SSE開始前に確定する）
   * - リクエストに conversationId が含まれる場合: 既存会話を使用
   * - 含まれない場合: 新規会話を作成し、UUID を割り当てる
   */
  let activeConversationId: string = reqConversationId ?? ''

  try {
    const historyDb = getHistoryDb()

    if (reqConversationId) {
      // 既存会話: DB に存在するか確認（存在しない場合は新規作成にフォールバック）
      const existing = getConversationById(historyDb, reqConversationId)
      if (!existing) {
        // 指定IDが存在しない場合は新規会話として作成
        const title = message.trim().slice(0, 30)
        const conv = createConversation(historyDb, { id: reqConversationId, title })
        activeConversationId = conv.id
        // SSE で conversationId をクライアントに通知
        sendSseEvent(res, 'conversation', { id: activeConversationId })
      } else {
        activeConversationId = existing.id
        // 既存会話の updated_at を更新
        updateConversationTimestamp(historyDb, activeConversationId)
        // SSE で conversationId をクライアントに通知
        sendSseEvent(res, 'conversation', { id: activeConversationId })
      }
    } else {
      // 新規会話: ユーザー発話の先頭30文字をタイトルとして自動生成
      const title = message.trim().slice(0, 30)
      const conv = createConversation(historyDb, { id: uuidv4(), title })
      activeConversationId = conv.id
      // SSE で conversationId をクライアントに通知（フロントエンドが次回以降に使用）
      sendSseEvent(res, 'conversation', { id: activeConversationId })
    }

    // user message を先にDB に保存（SSE ストリーム開始前）
    createMessage(historyDb, {
      id: uuidv4(),
      conversationId: activeConversationId,
      role: 'user',
      content: message.trim(),
    })
  } catch (err) {
    // 履歴DB 書き込みエラーはログに記録するが、ストリームは継続する
    console.error('[chat] history DB write error (user message):', err)
  }

  try {
    // -----------------------------------------------------------------------
    // Step 1: DBスキーマ取得
    // -----------------------------------------------------------------------
    let schema
    try {
      schema = await fetchSchema()
    } catch (err) {
      // 内部エラー詳細はサーバーログに記録し、ユーザーには一般的なメッセージを返す
      console.error('[chat] fetchSchema error:', err)
      sendSseEvent(res, 'error', { message: 'DBスキーマの取得に失敗しました。' })
      return
    }

    // -----------------------------------------------------------------------
    // Step 2: LLM サービスを初期化してストリーミング生成
    // -----------------------------------------------------------------------
    let llmService: LlmService
    try {
      llmService = new LlmService()
    } catch (err) {
      // APIキー未設定等の設定エラー（設定起因なのでメッセージを含める）
      console.error('[chat] LlmService init error:', err)
      const userMessage =
        err instanceof LlmConfigError
          ? err.message
          : 'LLM サービスの初期化に失敗しました。'
      sendSseEvent(res, 'error', { message: userMessage })

      // LLM 設定エラー時も assistant エラーメッセージを保存（best effort）
      _saveAssistantMessage(activeConversationId, userMessage, null, null, null, userMessage)
      return
    }

    // -----------------------------------------------------------------------
    // Step 3: LLM ストリーミング生成（message/sql/chart_type イベントを送信）
    // -----------------------------------------------------------------------
    let extractedSql: string | null = null
    let extractedChartType: string | null = null
    let fullAssistantText = ''

    try {
      const generator = llmService.generate({
        question: message.trim(),
        schema,
      })

      for await (const event of generator) {
        switch (event.type) {
          case 'message':
            // テキストチャンクを逐次送信・累積（DBへの保存用）
            fullAssistantText += event.chunk
            sendSseEvent(res, 'message', { chunk: event.chunk })
            break

          case 'sql':
            // SQL 文を送信
            extractedSql = event.sql
            sendSseEvent(res, 'sql', { sql: event.sql })
            break

          case 'chart_type':
            // グラフ種別を送信
            extractedChartType = event.chartType
            sendSseEvent(res, 'chart_type', { chartType: event.chartType })
            break
        }
      }
    } catch (err) {
      // LLM 関連エラーを判別してユーザー向けメッセージを生成
      // 内部エラー詳細はサーバーログに記録
      console.error('[chat] LLM generate error:', err)

      let userMessage: string
      if (err instanceof LlmConfigError) {
        userMessage = 'LLM の設定に問題があります。管理者にお問い合わせください。'
      } else if (err instanceof LlmTimeoutError) {
        userMessage = 'LLM の応答がタイムアウトしました。しばらく待ってから再試行してください。'
      } else if (err instanceof LlmParseError) {
        userMessage = 'LLM のレスポンス解析に失敗しました。再試行してください。'
      } else if (err instanceof LlmApiError) {
        userMessage = 'LLM API でエラーが発生しました。しばらく待ってから再試行してください。'
      } else {
        userMessage = 'LLM 処理中に予期しないエラーが発生しました。'
      }

      sendSseEvent(res, 'error', { message: userMessage })
      _saveAssistantMessage(activeConversationId, fullAssistantText || userMessage, extractedSql, extractedChartType, null, userMessage)
      return
    }

    // -----------------------------------------------------------------------
    // Step 4: SQL バリデーション + クエリ実行
    // -----------------------------------------------------------------------
    if (!extractedSql) {
      // SQL が生成されなかった場合（通常は LlmParseError が先にスローされるはず）
      const errorMsg = 'LLM から SQL が生成されませんでした。'
      sendSseEvent(res, 'error', { message: errorMsg })
      _saveAssistantMessage(activeConversationId, fullAssistantText || errorMsg, null, extractedChartType, null, errorMsg)
      return
    }

    try {
      // executeQuery() 内で sqlValidator が呼ばれる（二重防御）
      // SELECT 以外のSQL は SqlValidationError をスロー
      const queryResult = await executeQuery(extractedSql)

      // クエリ結果を送信
      sendSseEvent(res, 'result', {
        columns: queryResult.columns,
        rows: queryResult.rows,
        chartType: extractedChartType,
      })

      // assistant メッセージをDB に保存（sql, chart_type, query_result 含む）
      _saveAssistantMessage(
        activeConversationId,
        fullAssistantText,
        extractedSql,
        extractedChartType,
        queryResult,
        null
      )
    } catch (err) {
      // SQL バリデーション失敗または実行エラー
      // 内部エラー詳細（DBホスト名等）はサーバーログに記録
      console.error('[chat] executeQuery error:', err)

      const userMessage =
        err instanceof SqlValidationError
          ? `SQL バリデーションエラー: ${err.message}`
          : 'SQL の実行中にエラーが発生しました。'

      sendSseEvent(res, 'error', { message: userMessage })
      _saveAssistantMessage(activeConversationId, fullAssistantText || userMessage, extractedSql, extractedChartType, null, userMessage)
    }
  } catch (err) {
    // 予期しないエラー（上記の try-catch を抜けてきた場合）
    console.error('[chat] unexpected error:', err)
    sendSseEvent(res, 'error', { message: '予期しないエラーが発生しました。' })
  } finally {
    // done イベントは必ずここで一度だけ送信する（二重送信防止）
    finishStream()
  }
})

// ---------------------------------------------------------------------------
// ヘルパー: assistant メッセージを best effort で保存
// ---------------------------------------------------------------------------

/**
 * アシスタントメッセージを履歴DB に保存する（best effort）
 *
 * チャット体験を妨げないよう、エラー時はログに記録するだけで例外を伝播しない。
 *
 * @param conversationId - 保存先の会話ID
 * @param content        - アシスタントの応答テキスト
 * @param sql            - 生成されたSQL（nullable）
 * @param chartType      - グラフ種別（nullable）
 * @param queryResult    - クエリ実行結果（nullable）
 * @param error          - エラーメッセージ（nullable）
 */
function _saveAssistantMessage(
  conversationId: string,
  content: string,
  sql: string | null,
  chartType: string | null,
  queryResult: unknown,
  error: string | null
): void {
  if (!conversationId) return

  try {
    const historyDb = getHistoryDb()
    createMessage(historyDb, {
      id: uuidv4(),
      conversationId,
      role: 'assistant',
      content: content || '',
      sql,
      chartType,
      queryResult,
      error,
    })
  } catch (err) {
    // 履歴DB 書き込みエラーはログに記録するが、ストリームには影響しない
    console.error('[chat] history DB write error (assistant message):', err)
  }
}

export default router
