/**
 * useStreaming - SSEストリーミング共通処理フック
 *
 * fetch + ReadableStream を使用して Server-Sent Events（SSE）を受信・パースする。
 * EventSource は GET リクエストしか送れないため、POST で SSE を受信する場合は
 * fetch + ReadableStream パターンを採用する。
 *
 * 参考:
 *  - https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream
 *  - https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder
 *
 * SSE フォーマット（バックエンド chat.ts の sendSseEvent 準拠）:
 *   event: <eventName>\n
 *   data: <jsonData>\n
 *   \n
 */

/**
 * SSE パース済みイベント
 *
 * @property event - イベント名（message / sql / chart_type / result / error / done）
 * @property data  - デシリアライズされたデータオブジェクト
 */
export interface ParsedSseEvent {
  event: string
  data: unknown
}

/**
 * SSEストリームを受信してコールバックに渡す非同期ジェネレーター
 *
 * fetch で SSE ストリームを開き、チャンクをテキストデコードして
 * "\n\n" 区切りで SSE イベントブロックに分割し、
 * ParsedSseEvent としてyieldする。
 *
 * @param url      - SSE エンドポイントURL
 * @param body     - POST リクエストボディ（JSON シリアライズ可能）
 * @param signal   - AbortSignal（接続キャンセル用）
 * @yields ParsedSseEvent - パース済みのSSEイベント
 * @throws Error - fetch エラー / HTTP エラー / JSON パースエラー
 */
export async function* streamSseEvents(
  url: string,
  body: unknown,
  signal?: AbortSignal,
): AsyncGenerator<ParsedSseEvent> {
  // POST リクエストで SSE ストリームを開始
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // SSE 受信のための Accept ヘッダー
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(body),
    signal,
  })

  // HTTPエラーレスポンスの場合はエラーをスロー
  if (!response.ok) {
    let errorMessage = `HTTP Error: ${response.status} ${response.statusText}`
    try {
      const errorBody = await response.json()
      if (errorBody.error) {
        errorMessage = errorBody.error
      }
    } catch {
      // JSON パース失敗はそのまま
    }
    throw new Error(errorMessage)
  }

  // レスポンスボディが存在しない場合（通常は発生しない）
  if (!response.body) {
    throw new Error('レスポンスボディが空です')
  }

  const reader = response.body.getReader()
  // TextDecoder でバイト列をUTF-8文字列にデコード
  const decoder = new TextDecoder('utf-8')
  // チャンク間をまたぐイベントブロックのバッファ
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()

      if (done) {
        // ストリーム終了: バッファに残ったデータを処理
        if (buffer.trim()) {
          const event = parseSseBlock(buffer)
          if (event) {
            yield event
          }
        }
        break
      }

      // バイト列を文字列にデコードしてバッファに追加
      // stream: true により、マルチバイト文字がチャンク境界をまたいでも正しくデコードされる
      buffer += decoder.decode(value, { stream: true })

      // "\n\n" を区切りとして SSE イベントブロックを分割
      // SSE の仕様では空行（\n\n）でイベントの終端を示す
      const parts = buffer.split('\n\n')

      // 最後の部分は次のチャンクに続く可能性があるためバッファに保持
      // （末尾の "\n\n" がない場合、最後のブロックはまだ完全ではない）
      buffer = parts.pop() ?? ''

      for (const block of parts) {
        if (!block.trim()) {
          continue
        }
        const event = parseSseBlock(block)
        if (event) {
          yield event
        }
      }
    }
  } finally {
    // 接続が切断された場合（abort等）もリーダーを解放する
    reader.releaseLock()
  }
}

/**
 * SSEイベントブロックをパースして ParsedSseEvent に変換する
 *
 * SSE ブロック形式:
 *   event: <eventName>
 *   data: <jsonData>
 *
 * @param block - 1つのSSEイベントブロック（\n区切りの複数行）
 * @returns ParsedSseEvent | null - パース成功時はイベント、失敗時はnull
 */
function parseSseBlock(block: string): ParsedSseEvent | null {
  let eventName = ''
  let dataLine = ''

  // ブロックを行単位に分割してフィールドを抽出
  for (const line of block.split('\n')) {
    if (line.startsWith('event: ')) {
      // "event: " プレフィックスを除いてイベント名を取得
      eventName = line.slice('event: '.length).trim()
    } else if (line.startsWith('data: ')) {
      // "data: " プレフィックスを除いてデータを取得
      dataLine = line.slice('data: '.length).trim()
    }
  }

  // event か data が取得できなかった場合はスキップ
  if (!eventName || !dataLine) {
    return null
  }

  // data フィールドを JSON としてパース
  let parsedData: unknown
  try {
    parsedData = JSON.parse(dataLine)
  } catch {
    // JSON パース失敗の場合は生文字列をそのままデータとして使用
    console.warn('[useStreaming] JSON parse failed for data:', dataLine)
    parsedData = dataLine
  }

  return { event: eventName, data: parsedData }
}
