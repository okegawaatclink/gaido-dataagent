/**
 * フロントエンド Vitest 設定
 *
 * テスト対象: output_system/test/unit/frontend/ 配下のテストファイル
 * テスト環境: jsdom（ブラウザAPIをシミュレート。fetch, TextDecoder, crypto 等を使用するため）
 */
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [
    // JSX/TSX のトランスフォームに必要
    react(),
  ],
  test: {
    // フロントエンドパッケージから見た相対パスで test/unit/frontend 配下のテストファイルを探す
    include: ['../test/unit/frontend/**/*.test.{ts,tsx}'],
    // ブラウザAPIシミュレーション（fetch / crypto / TextDecoder 等が必要）
    environment: 'jsdom',
    // @testing-library/jest-dom のマッチャーをグローバルに使えるようにする
    setupFiles: ['../test/unit/frontend/setup.ts'],
    globals: true,
    coverage: {
      provider: 'v8',
      // カバレッジ対象: フロントエンドの src 配下全体（hooks・components を含む）
      include: ['src/**/*.{ts,tsx}'],
      reporter: ['text', 'json', 'html'],
      // 80%以上のカバレッジを要求
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
