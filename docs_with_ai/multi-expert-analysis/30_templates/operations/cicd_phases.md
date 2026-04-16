# CI/CDフェーズ定義ガイドライン

CI/CDパイプラインの各フェーズで実行する内容を定義するためのガイドライン。

---

## フェーズ定義

| フェーズ | タイミング | 許容時間 | 目的 |
|---------|-----------|---------|------|
| **PR** | プルリクエスト作成/更新時 | <5分 | 早期フィードバック |
| **Merge** | マージ時 | <15分 | 統合確認 |
| **Nightly** | 毎晩定時（例: 2:00 AM） | <60分 | 網羅的テスト |
| **Release** | リリース前 | 制限なし | 最終確認 |

---

## フェーズ別の実行内容

### PR フェーズ（<5分）

**目的**: 開発者への早期フィードバック

```markdown
実行内容:
- [ ] Lint（コードスタイルチェック）
- [ ] 型チェック（TypeScript等）
- [ ] ユニットテスト
- [ ] セキュリティスキャン（軽量）
- [ ] ビルド確認

失敗時の対応:
- マージブロック
- PRにコメントでフィードバック
```

### Merge フェーズ（<15分）

**目的**: メインブランチへの統合確認

```markdown
実行内容:
- [ ] PRフェーズの全項目
- [ ] E2Eスモークテスト（主要フロー）
- [ ] コントラクトテスト（API互換性）
- [ ] 依存関係の脆弱性スキャン
- [ ] ビルドアーティファクト生成

失敗時の対応:
- 通知（Slack等）
- ロールバック検討
```

### Nightly フェーズ（<60分）

**目的**: 網羅的なテストによる品質確認

```markdown
実行内容:
- [ ] 全E2Eテスト
- [ ] 回帰テスト（○マークのもの全て）
- [ ] パフォーマンステスト（軽量）
- [ ] セキュリティスキャン（詳細）
- [ ] カバレッジレポート生成
- [ ] 静的解析（詳細）

失敗時の対応:
- 翌朝通知
- 翌営業日対応
```

### Release フェーズ（制限なし）

**目的**: リリース前の最終確認

```markdown
実行内容:
- [ ] Nightlyフェーズの全項目
- [ ] 負荷テスト
- [ ] ペネトレーションテスト（必要に応じて）
- [ ] ステージング環境での動作確認
- [ ] リリースノート生成
- [ ] 承認フロー

失敗時の対応:
- リリース延期
- 原因調査・修正
```

---

## テンプレート

```markdown
## CI/CD設定

### PRフェーズ

| 項目 | 実行 | 失敗時 |
|------|------|--------|
| Lint | ○ | Block |
| 型チェック | ○ | Block |
| ユニットテスト | ○ | Block |
| ビルド | ○ | Block |

### Mergeフェーズ

| 項目 | 実行 | 失敗時 |
|------|------|--------|
| E2Eスモーク | ○ | Notify |
| 脆弱性スキャン | ○ | Notify |

### Nightlyフェーズ

| 項目 | 実行 | 失敗時 |
|------|------|--------|
| 全E2E | ○ | Notify |
| 回帰テスト | ○ | Notify |
| カバレッジ | ○ | Report |

### Releaseフェーズ

| 項目 | 実行 | 失敗時 |
|------|------|--------|
| 負荷テスト | ○ | Block |
| ステージング確認 | ○ | Block |
| 承認 | ○ | Block |
```

---

## 受入条件との対応

| 受入条件のCI/CDフェーズ | 実行タイミング |
|----------------------|---------------|
| `[CI/CD:PR]` | PRフェーズ |
| `[CI/CD:Merge]` | Mergeフェーズ |
| `[CI/CD:Nightly]` | Nightlyフェーズ |
| `[CI/CD:Release]` | Releaseフェーズ |

---

## パイプライン例（GitHub Actions）

```yaml
name: CI/CD Pipeline

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
  schedule:
    - cron: '0 17 * * *'  # JST 2:00 AM
  workflow_dispatch:
    inputs:
      phase:
        description: 'Phase to run'
        required: true
        default: 'release'

jobs:
  pr-phase:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - name: Lint
        run: npm run lint
      - name: Type Check
        run: npm run typecheck
      - name: Unit Test
        run: npm run test:unit

  merge-phase:
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      # ... PR phase steps ...
      - name: E2E Smoke
        run: npm run test:e2e:smoke

  nightly-phase:
    if: github.event_name == 'schedule'
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      # ... All tests ...
```

---

**End of cicd_phases.md**
