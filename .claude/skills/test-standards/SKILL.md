---
name: test-standards
description: テストコード規約。ディレクトリ構成・命名規約・コメント規約・テンプレート・網羅性ルールを定義。
user-invocable: false
model: sonnet
---

# テストコード規約

テスト実装時は以下の規約に従うこと。

## ディレクトリ構成

テストファイルは以下の構成で配置すること：

- **`test/` ディレクトリを `src/` と同じ階層に作成**（`src/` 内にテストを配置するのは禁止）
- **`test/` 内に `src/` と同じディレクトリ構造を再現**
- **テストファイル名: `{テスト対象ファイル名}.test.{拡張子}` または `{テスト対象ファイル名}.spec.{拡張子}`**

### 構成例（単一リポジトリ）

```
project/
├── src/
│   ├── components/
│   │   └── Button.tsx
│   └── utils/
│       └── validation.ts
└── test/
    ├── components/
    │   └── Button.test.tsx
    └── utils/
        └── validation.test.ts
```

### 構成例（モノレポ）

```
project/
├── apps/
│   └── web/
│       ├── src/
│       └── test/        # apps/web/test に配置（apps/web/src 内は禁止）
├── packages/
│   └── shared/
│       ├── src/
│       └── test/        # packages/shared/test に配置
└── test/                # E2Eテストはプロジェクトルート直下
    └── e2e/
```

参考:
- Jest: https://jestjs.io/docs/configuration#testmatch-arraystring
- Vitest: https://vitest.dev/config/#include
- Playwright Test: https://playwright.dev/docs/intro
- pytest: https://docs.pytest.org/en/stable/explanation/goodpractices.html#tests-outside-application-code

## テストケース命名規約

**テストケース名は英語で記述すること**。コメントは日本語で記述する。

### JavaScript/TypeScript

```typescript
describe('Button component', () => {
  it('should render with correct text', () => {
    // テストコード
  });

  it('should call onClick handler when clicked', () => {
    // テストコード
  });
});
```

### Python（pytest）

```python
def test_should_validate_email_with_valid_format():
    """テストコード"""
    pass
```

## コメント規約

**各テストケースの上に日本語で詳細な仕様コメントを記述すること**。

コメントには以下を含めること：
- **テスト対象**: 何をテストしているか
- **テスト内容**: どのような条件・操作を行うか
- **期待結果**: どうなるべきか
- **前提条件** (必要に応じて)
- **入力例** (必要に応じて)

### E2Eテストの場合（ユーザーストーリー重視）

```typescript
/**
 * 【ユーザーストーリー】
 * ログイン画面でメールアドレスとパスワードを入力し、
 * 「ログイン」ボタンをクリックすると、
 * ダッシュボード画面に遷移し、ユーザー名が表示される
 *
 * 【前提条件】
 * - テストユーザーが登録済み
 *
 * 【期待結果】
 * - ダッシュボードに遷移する
 * - ユーザー名が表示される
 */
test('should successfully login', async ({ page }) => {
  // ...
});
```

### Unit/Integrationテストの場合（仕様重視）

```typescript
/**
 * 【テスト対象】validateEmail関数
 * 【テスト内容】有効なメールアドレス形式が与えられた場合
 * 【期待結果】trueを返すこと
 *
 * 【入力例】
 * - "user@example.com"
 * - "test+tag@domain.co.jp"
 */
it('should return true for valid email addresses', () => {
  // ...
});
```

## テストファイルテンプレート

### Jest/Vitest

```typescript
import { describe, it, expect } from 'vitest';
import { functionName } from '@/path/to/module';

/**
 * 【モジュール】path/to/module
 * このファイルでは○○機能のテストを行う
 */
describe('functionName', () => {
  /**
   * 【テスト対象】functionName
   * 【テスト内容】（条件・操作）
   * 【期待結果】（期待される動作）
   */
  it('should do something when condition is met', () => {
    // Arrange（準備）
    const input = 'test';

    // Act（実行）
    const result = functionName(input);

    // Assert（検証）
    expect(result).toBe('expected');
  });
});
```

### Playwright E2Eテスト

```typescript
import { test, expect } from '@playwright/test';

/**
 * 【機能】ログイン機能
 * このファイルではログイン関連のE2Eテストを行う
 */
test.describe('Login Flow', () => {
  /**
   * 【ユーザーストーリー】
   * （ユーザーの操作と期待される結果を記述）
   *
   * 【前提条件】
   * （テスト実行前の状態）
   *
   * 【期待結果】
   * （期待される画面遷移や表示内容）
   */
  test('should successfully login', async ({ page }) => {
    // テストコード
  });
});
```

## テスト網羅性ルール

動作確認・テスト時は、以下を必須とする：

### 1. 入力バリエーションのテスト

- 単一の入力値でテストを終えず、**異なる特性を持つ複数の入力パターン**でテストすること
- マッピングテーブルや変換ロジックがある場合は、**全エントリまたは代表的なサンプル**が正常に動作するか検証すること

### 2. 外部依存の事前検証

- 外部API・外部サービスと連携するコードを書いた場合、**実装したデータが外部サービスで有効か**を事前に検証すること
- 「動くはず」ではなく「動いた」を確認する

### 3. エラー発生時の原因特定

- エラーが発生した場合、**推測で原因を断定せず、ログやレスポンス内容を確認**してから対処すること

### 例: 地域コードのマッピング

- NG: 東京（130000）だけでテストして完了
- OK: 北海道・東京・沖縄など複数地域でテストし、全地域コードが外部APIで有効か検証
