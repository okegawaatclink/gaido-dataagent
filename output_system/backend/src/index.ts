/**
 * DataAgent バックエンド エントリポイント
 *
 * Expressサーバーを起動し、APIルートを設定する。
 * ポート3002で起動（instance-config.md: バックエンドホストポート = 3002）
 */
import express from 'express'
import cors from 'cors'
import { closeDb } from './services/database'
import schemaRouter from './routes/schema'
import chatRouter from './routes/chat'

const app = express()

// =============================================================================
// ミドルウェア設定
// =============================================================================

/**
 * JSON パーサーの設定
 * リクエストボディをJSON形式で受け取れるようにする
 */
app.use(express.json())

/**
 * CORS設定
 * フロントエンドのオリジン（localhost:3001 および コンテナ名:3001）からのアクセスを許可
 * フロントとバックのオリジンが異なるため明示的に設定が必要
 */
app.use(cors({
  // 許可するオリジン（フロントエンドのURL）
  // 環境変数で設定することを推奨、デフォルトはローカル開発用
  origin: [
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    // AI Agent containerからコンテナ名でアクセスする場合
    'http://okegawaatclink-gaido-dataagent-output-system:3001',
  ],
  // 認証情報（CookieやAuthorizationヘッダー）を含むリクエストを許可
  credentials: true,
  // 許可するHTTPメソッド
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  // 許可するHTTPヘッダー
  allowedHeaders: ['Content-Type', 'Authorization'],
}))

// =============================================================================
// ルート設定
// =============================================================================

/**
 * GET /api/schema
 * DBスキーマ情報取得エンドポイント
 * services/schema.ts の fetchSchema() を呼び出し、INFORMATION_SCHEMA からテーブル・カラム情報を返す
 */
app.use('/api/schema', schemaRouter)

/**
 * POST /api/chat
 * チャットメッセージ送信エンドポイント（SSEストリーミング）
 * 自然言語の質問を受け取り、SQL生成・実行・結果をSSEで返す
 */
app.use('/api/chat', chatRouter)

/**
 * GET /api/health
 * ヘルスチェックエンドポイント
 * Docker/K8sのヘルスチェックや疎通確認に使用
 *
 * @returns {{ status: string, timestamp: string, version: string }}
 */
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  })
})

/**
 * GET /
 * ルートエンドポイント（APIの存在確認用）
 *
 * @returns {{ message: string }}
 */
app.get('/', (_req, res) => {
  res.json({
    message: 'DataAgent Backend API',
    docs: '/api/health',
  })
})

// =============================================================================
// サーバー起動
// =============================================================================

/**
 * バックエンドポート
 * 環境変数 BACKEND_PORT が設定されている場合はその値を使用
 * デフォルト: 3002（instance-config.md: バックエンドホストポート）
 */
const PORT = parseInt(process.env.BACKEND_PORT || '3002', 10)

/**
 * 全インターフェースでリッスン
 * '0.0.0.0' を指定することでDockerコンテナ内外からアクセス可能にする
 */
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`DataAgent Backend API server running on http://0.0.0.0:${PORT}`)
  console.log(`Health check: http://localhost:${PORT}/api/health`)
})

// =============================================================================
// プロセス終了ハンドリング
// =============================================================================

/**
 * SIGTERM / SIGINT シグナル受信時にDB接続をクローズして正常終了する
 * Docker コンテナ停止時のグレースフルシャットダウンに対応
 */
async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`${signal} received. Shutting down gracefully...`)
  server.close(async () => {
    try {
      await closeDb()
      console.log('DB connection closed.')
    } catch (err) {
      console.error('Error closing DB connection:', err)
    }
    process.exit(0)
  })
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

export default app
