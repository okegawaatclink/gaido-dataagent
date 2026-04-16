# E2Eテスト実装手順

## 概要

Playwrightを使用してE2Eテストを実装します。
テストケースIssueごとにテストファイルを作成し、passするまでコード修正を繰り返します。

## 前提条件

- テストケースIssueがopenであること
- `@playwright/test` がインストール済みであること（`npm install --save-dev @playwright/test`）
- `rules/context7.md` に従いドキュメントを確認済みであること

## 実装ルール

### 1. 1 Issue = 1 テストファイル

```bash
# テストファイル命名規則
output_system/test/e2e/test-case-{issue番号}.spec.ts
```

### 2. テストコード規約

テストコード作成時は test-standards スキルの規約に従うこと。

- ディレクトリ構成: `output_system/test/e2e/` に配置
- テストケース名: 英語で記述
- コメント: 日本語でユーザーストーリーコメントを記述

### 3. テストファイル作成例

**注: URLは `rules/instance-config.md` の「コンテナ内からアクセスする時のフロントエンドURL」を参照すること。以下はデフォルト値での例。**

```typescript
import { test, expect } from '@playwright/test';

/**
 * 【ユーザーストーリー】
 * ログイン画面でメールアドレスとパスワードを入力し、
 * 「ログイン」ボタンをクリックすると、
 * ダッシュボード画面に遷移し、ユーザー名が表示される
 *
 * 【テストケースIssue】#123
 *
 * 【前提条件】
 * - テストユーザーが登録済み
 *
 * 【期待結果】
 * - ダッシュボードに遷移する
 * - ユーザー名が表示される
 */
test.describe('Login Flow', () => {
  test('should successfully login and display user name', async ({ page }) => {
    await page.goto('http://output-system-container:3001/login');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL('http://output-system-container:3001/dashboard');
    await expect(page.locator('header')).toContainText('テストユーザー');
  });
});
```

### 4. テスト実行

```bash
# 該当ファイルのみテスト実行
npx playwright test test/e2e/test-case-123.spec.ts
```

### 5. コミット

テストがpassしたら、該当ファイルをコミット:

```bash
git add output_system/test/e2e/test-case-123.spec.ts
git commit -m "test: add E2E test for login flow (#123)"
git push
```

**注意**: コミットは `rules/git-rules.md` の規約に従うこと。

### 6. Issue close

```bash
gh issue close 123
```

## 禁止事項

- **複数のIssueをまとめてコミットしてはならない**
- テストがfailしたままコミットしてはならない
- テストコード規約に従わないコードを書いてはならない

## テスト作成の詳細

### コメント規約（E2Eテスト）

```typescript
/**
 * 【ユーザーストーリー】
 * （ユーザーの操作と期待される結果を記述）
 *
 * 【テストケースIssue】#xxx
 *
 * 【前提条件】
 * （テスト実行前の状態）
 *
 * 【期待結果】
 * （期待される画面遷移や表示内容）
 */
```

### テスト網羅性

test-standards スキルの「テスト網羅性ルール」に従い:
- 単一の入力値でテストを終えず、**異なる特性を持つ複数の入力パターン**でテスト
- マッピングテーブルや変換ロジックがある場合は、**全エントリまたは代表的なサンプル**が正常に動作するか検証

## 完了後

テストがpassしコミット完了後、メインのフローに戻り、次のテストケースIssueへ進む。
