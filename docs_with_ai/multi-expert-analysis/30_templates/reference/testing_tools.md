# テストツールリファレンス

各テストカテゴリで利用可能なツールの参考情報。

---

## 言語・フレームワーク別

### JavaScript / TypeScript

| カテゴリ | ツール | 用途 |
|---------|--------|------|
| ユニットテスト | Jest | 汎用テストフレームワーク |
| ユニットテスト | Vitest | Vite向け高速テスト |
| E2Eテスト | Playwright | クロスブラウザE2E |
| E2Eテスト | Cypress | E2E + コンポーネントテスト |
| コンポーネントテスト | Testing Library | React/Vue/Angular向け |
| モック | MSW | API モック |
| カバレッジ | c8 / nyc | カバレッジ計測 |

### Python

| カテゴリ | ツール | 用途 |
|---------|--------|------|
| ユニットテスト | pytest | 汎用テストフレームワーク |
| モック | pytest-mock | モック・スタブ |
| カバレッジ | coverage.py | カバレッジ計測 |
| E2Eテスト | Playwright for Python | ブラウザE2E |
| APIテスト | httpx / requests | HTTPクライアント |
| データテスト | Great Expectations | データ品質検証 |

### Java / Kotlin

| カテゴリ | ツール | 用途 |
|---------|--------|------|
| ユニットテスト | JUnit 5 | 汎用テストフレームワーク |
| モック | Mockito | モック・スタブ |
| アサーション | AssertJ | Fluentアサーション |
| E2Eテスト | Selenium | ブラウザE2E |
| APIテスト | REST Assured | REST APIテスト |
| カバレッジ | JaCoCo | カバレッジ計測 |

### Go

| カテゴリ | ツール | 用途 |
|---------|--------|------|
| ユニットテスト | testing (標準) | 標準テストパッケージ |
| アサーション | testify | アサーション・モック |
| E2Eテスト | chromedp | ブラウザ操作 |
| カバレッジ | go test -cover | 標準カバレッジ |

---

## テストカテゴリ別

### 負荷テスト

| ツール | 特徴 |
|--------|------|
| k6 | JavaScript DSL、CI/CD統合容易 |
| Locust | Python DSL、分散実行対応 |
| JMeter | GUI、多機能、学習コスト高 |
| Gatling | Scala DSL、高性能 |
| Artillery | YAML/JS、軽量 |

### セキュリティテスト

| ツール | 用途 |
|--------|------|
| OWASP ZAP | 動的セキュリティスキャン |
| Trivy | コンテナ脆弱性スキャン |
| Snyk | 依存関係脆弱性スキャン |
| SonarQube | 静的解析・脆弱性検出 |
| Bandit | Python セキュリティ静的解析 |

### API テスト

| ツール | 用途 |
|--------|------|
| Postman | GUI APIテスト・コレクション |
| Bruno | ローカルファースト APIクライアント |
| Hurl | CLI HTTPテスト |
| Dredd | API Blueprint / OpenAPI テスト |
| Pact | コントラクトテスト |

### データ品質テスト

| ツール | 用途 |
|--------|------|
| Great Expectations | データ品質検証フレームワーク |
| dbt test | データ変換テスト |
| Soda | データ監視・品質チェック |
| Apache Griffin | ビッグデータ品質 |

---

## CI/CD統合

### GitHub Actions向け

```yaml
# Jest の例
- name: Run tests
  run: npm test -- --coverage

# pytest の例
- name: Run tests
  run: pytest --cov=src --cov-report=xml

# Playwright の例
- name: Run E2E tests
  run: npx playwright test
```

### カバレッジレポート

| サービス | 特徴 |
|----------|------|
| Codecov | GitHub統合、PR差分表示 |
| Coveralls | シンプル、多言語対応 |
| SonarCloud | 品質ゲート機能 |

---

## 選定ガイドライン

### ユニットテストフレームワーク選定

```
言語は何？
    │
    ├── JavaScript/TypeScript
    │       └── Vite使用？ → Yes: Vitest / No: Jest
    │
    ├── Python → pytest
    │
    ├── Java/Kotlin → JUnit 5
    │
    └── Go → testing (標準)
```

### E2Eテストツール選定

```
要件は？
    │
    ├── クロスブラウザ必須 → Playwright
    │
    ├── React/Vue開発 → Cypress
    │
    └── 既存Selenium資産あり → Selenium継続
```

### 負荷テストツール選定

```
チームのスキルは？
    │
    ├── JavaScript得意 → k6
    │
    ├── Python得意 → Locust
    │
    └── GUI希望 → JMeter
```

---

## 注意事項

- ツールのバージョンは定期的に更新する
- ライセンスを確認する（OSS / 商用）
- チームの習熟度を考慮して選定する
- CI/CD環境での実行時間を考慮する

---

**End of testing_tools.md**
