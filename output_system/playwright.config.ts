/**
 * Playwright テスト設定ファイル
 *
 * AI Agent containerからOutput System containerにアクセスする設定。
 * rules/constraints.md の「PlaywrightからのURL指定ルール」に従い、
 * localhost ではなくコンテナ名でアクセスする。
 *
 * 参考:
 * - コンテナ内からアクセス: http://okegawaatclink-gaido-dataagent-output-system:3001
 * - instance-config.md の「コンテナ内からアクセスする時のフロントエンドURL」参照
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  // テストファイルのディレクトリ（test-standards.mdのディレクトリ規約に従う）
  testDir: './test',
  // E2Eテストのみを対象にする（unit/ 配下のVitestファイルを除外）
  testMatch: '**/e2e/**/*.spec.ts',

  // テストのタイムアウト設定（秒）
  timeout: 30000,

  // アサーションのタイムアウト設定
  expect: {
    timeout: 5000,
  },

  // テストの並列実行設定
  // 開発環境では並列無効にして安定性を優先
  fullyParallel: false,
  workers: 1,

  // テスト失敗時のリトライ回数
  retries: 1,

  // テスト結果のレポーター設定
  reporter: [
    // コンソール出力（CI向け）
    ['list'],
    // HTMLレポート（ローカル確認用、playwright-report/に保存）
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  // すべてのテストプロジェクトで共通の設定
  use: {
    /**
     * ベースURL設定
     * rules/constraints.md: AI Agent containerからはコンテナ名でアクセスすること
     * localhost は AI Agent container 自身を指すため使用禁止
     * instance-config.md の「コンテナ内からアクセスする時のフロントエンドURL」参照
     */
    baseURL: 'http://okegawaatclink-gaido-dataagent-output-system:3001',

    // ヘッドレスモードで実行（CI対応）
    headless: true,

    // スクリーンショットの設定（失敗時に保存）
    screenshot: 'only-on-failure',

    // トレースの設定（デバッグ用）
    trace: 'on-first-retry',

    // タイムアウト設定
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },

  // テストプロジェクト設定（ブラウザ別）
  projects: [
    {
      name: 'chromium',
      // Chromium（AI Agent containerにプリインストール済み）
      // rules/constraints.md: npx playwright install chromium は不要
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
})
