import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

/**
 * Vite設定ファイル
 *
 * 主な設定:
 * - React + TypeScriptサポート
 * - ホスト: 0.0.0.0（Dockerコンテナ内でも外部からアクセス可能にする）
 * - ポート: 3001（instance-config.md準拠）
 * - allowedHosts: Vite 5.x以降はデフォルトでlocalhost以外をブロックするため設定が必要
 *   コンテナ名でのアクセスを許可するために __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS 環境変数を参照
 *
 * 参考: https://vite.dev/config/server-options
 */
export default defineConfig(({ mode }) => {
  // .envファイルから環境変数を読み込む
  const env = loadEnv(mode, process.cwd(), '')

  // 追加で許可するホスト名（環境変数から取得）
  // コンテナ名でアクセスするAI Agent containerからのアクセスを許可するため
  const additionalAllowedHosts = env.__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS
    ? env.__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS.split(',')
    : []

  return {
    plugins: [
      // ReactのFast Refreshと新しいJSX Transformを有効化
      react(),
    ],

    // パスエイリアス設定（@/src/* で参照可能）
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },

    // 開発サーバー設定
    server: {
      // 0.0.0.0: 全インターフェースでリッスン（Dockerコンテナ内でのアクセスに必要）
      host: '0.0.0.0',
      // フロントエンドポート（instance-config.md: フロントエンドホストポート = 3001）
      port: 3001,
      // 指定ポートが使用中の場合エラーにする（意図しないポートでの起動を防ぐ）
      strictPort: true,
      // 許可するホスト名のリスト
      // Vite 5.x以降はセキュリティ上の理由でlocalhost以外をブロックするため明示的に設定
      allowedHosts: [
        'localhost',
        '127.0.0.1',
        // コンテナ名でのアクセスを許可（AI Agent containerから参照するため）
        ...additionalAllowedHosts,
      ],
    },

    // プレビューサーバー設定（ビルド後の確認用）
    preview: {
      host: '0.0.0.0',
      port: 3001,
      strictPort: true,
      // プロキシ設定: /api/* をバックエンド（Express, port 3002）に転送する
      // これにより VITE_API_BASE_URL を設定しなくても相対パスで API 呼び出しが可能
      // 同一コンテナ内では localhost でバックエンドにアクセスできる
      proxy: {
        '/api': {
          target: `http://localhost:${env.BACKEND_PORT || '3002'}`,
          changeOrigin: true,
        },
      },
    },
  }
})
