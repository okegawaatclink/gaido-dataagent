import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    // backendパッケージから見た相対パスで test/unit 配下のテストファイルを探す
    // output_system/test/unit/*.test.ts を対象
    include: ['../test/unit/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // カバレッジ対象: services/ 配下のサービスファイル
      // Task 1.2.4: schema.ts, Task 2.1.1: sqlValidator.ts を含む
      // Task 2.2.1: llm.ts を追加
      include: ['src/services/schema.ts', 'src/services/sqlValidator.ts', 'src/services/llm.ts'],
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
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
