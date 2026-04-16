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
 */

import { Router, Request, Response } from 'express'
import { fetchSchema } from '../services/schema'
import { LlmService, LlmConfigError, LlmApiError, LlmTimeoutError, LlmParseError } from '../services/llm'
import { executeQuery, SqlValidationError } from '../services/database'

const router = Router()

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
 * レスポンス:
 *   Content-Type: text/event-stream（SSEストリーム）
 *   各イベントを順次送信し、最後に event: done を送信して終了する
 *
 * エラーハンドリング:
 *   - message 未設定: event: error 送信後 event: done
 *   - DB接続エラー: event: error 送信後 event: done
 *   - LLM設定エラー（APIキー未設定）: event: error 送信後 event: done
 *   - LLM APIエラー: event: error 送信後 event: done
 *   - SQLバリデーション失敗: event: error 送信後 event: done
 *   - SQL実行エラー: event: error 送信後 event: done
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  // SSE レスポンスヘッダーを設定
  // Content-Type: text/event-stream が SSE の必須ヘッダー
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  // X-Accel-Buffering: no でnginxプロキシ経由でもバッファリングを無効化
  res.setHeader('X-Accel-Buffering', 'no')

  // ヘッダーを即時送信（SSE接続の確立）
  res.flushHeaders()

  // リクエストボディから message を取得
  const { message } = req.body as { message?: string; conversationId?: string }

  // message のバリデーション
  if (!message || message.trim() === '') {
    sendSseEvent(res, 'error', { message: 'message フィールドは必須です。' })
    sendSseEvent(res, 'done', {})
    res.end()
    return
  }

  try {
    // -----------------------------------------------------------------------
    // Step 1: DBスキーマ取得
    // -----------------------------------------------------------------------
    let schema
    try {
      schema = await fetchSchema()
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? `DBスキーマの取得に失敗しました: ${err.message}`
          : 'DBスキーマの取得に失敗しました。'
      sendSseEvent(res, 'error', { message: errorMessage })
      sendSseEvent(res, 'done', {})
      res.end()
      return
    }

    // -----------------------------------------------------------------------
    // Step 2: LLM サービスを初期化してストリーミング生成
    // -----------------------------------------------------------------------
    let llmService: LlmService
    try {
      llmService = new LlmService()
    } catch (err) {
      // APIキー未設定等の設定エラー
      const errorMessage =
        err instanceof LlmConfigError
          ? err.message
          : 'LLM サービスの初期化に失敗しました。'
      sendSseEvent(res, 'error', { message: errorMessage })
      sendSseEvent(res, 'done', {})
      res.end()
      return
    }

    // -----------------------------------------------------------------------
    // Step 3: LLM ストリーミング生成（message/sql/chart_type イベントを送信）
    // -----------------------------------------------------------------------
    let extractedSql: string | null = null
    let extractedChartType: string | null = null

    try {
      const generator = llmService.generate({
        question: message.trim(),
        schema,
      })

      for await (const event of generator) {
        switch (event.type) {
          case 'message':
            // テキストチャンクを逐次送信
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
      // LLM 関連エラーを判別して適切なメッセージを送信
      let errorMessage: string

      if (err instanceof LlmConfigError) {
        errorMessage = `LLM 設定エラー: ${err.message}`
      } else if (err instanceof LlmTimeoutError) {
        errorMessage = `LLM タイムアウト: ${err.message}`
      } else if (err instanceof LlmParseError) {
        errorMessage = `LLM レスポンス解析エラー: ${err.message}`
      } else if (err instanceof LlmApiError) {
        errorMessage = `LLM API エラー: ${err.message}`
      } else {
        errorMessage = `LLM 処理中に予期しないエラーが発生しました: ${err instanceof Error ? err.message : String(err)}`
      }

      sendSseEvent(res, 'error', { message: errorMessage })
      sendSseEvent(res, 'done', {})
      res.end()
      return
    }

    // -----------------------------------------------------------------------
    // Step 4: SQL バリデーション + クエリ実行
    // -----------------------------------------------------------------------
    if (!extractedSql) {
      // SQL が生成されなかった場合（通常は LlmParseError が先にスローされるはず）
      sendSseEvent(res, 'error', { message: 'LLM から SQL が生成されませんでした。' })
      sendSseEvent(res, 'done', {})
      res.end()
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
    } catch (err) {
      // SQL バリデーション失敗または実行エラー
      const errorMessage =
        err instanceof SqlValidationError
          ? `SQL バリデーションエラー: ${err.message}`
          : `SQL 実行エラー: ${err instanceof Error ? err.message : String(err)}`

      sendSseEvent(res, 'error', { message: errorMessage })
    }
  } catch (err) {
    // 予期しないエラー（上記の try-catch を抜けてきた場合）
    const errorMessage = err instanceof Error ? err.message : '予期しないエラーが発生しました。'
    sendSseEvent(res, 'error', { message: errorMessage })
  } finally {
    // 必ず done イベントを送信してストリームを終了する
    sendSseEvent(res, 'done', {})
    res.end()
  }
})

export default router
