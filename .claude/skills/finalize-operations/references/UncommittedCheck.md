# 未コミットファイル確認手順

## 手順

1. `git status --short` を実行し、出力を**全行**確認する
2. `??` で始まる行（untracked files）を1行ずつ確認する
3. 下記「コミット対象外」に該当しないファイルは**すべてコミット対象**とする
4. `.gitignore` が存在しない場合は作成する（`git-rules.md` 参照）
5. コミット対象ファイルを `git add` → `git commit` する
6. `git status --short` を再実行し、出力が空になるまで手順1-5を繰り返す
7. `git push` を実行する
8. `git status` で `Your branch is up to date with 'origin/main'` と表示されることを確認する

**判定基準**: 以下の**両方**を満たすまで完了しない。
- `git status --short` の出力が空（未追跡・未コミットファイルが0件）
- `git status` で `up to date with 'origin/main'` と表示される（ローカルのコミットがすべてpush済み）

## コミット対象（見落としやすいファイル）

| ファイル | 理由 |
|---------|------|
| `.claude/` 配下全体 | agents, rules, skills等のプロジェクト設定 |
| `ai_generated/requirements/` | 要件ドキュメント（ディレクトリ） |
| `ai_generated/screenshots/` | PRで参照（Playwrightスクリーンショット） |
| `ai_generated/pencil_screenshots/` | PRで参照（Pencilデザインスクリーンショット） |
| `ai_generated/readme_screenshots/` | README.md用の画面スクリーンショット |
| `ai_generated/screens.pen` | 画面デザインファイル |
| `ai_generated/screen_detail.md` | 画面詳細ドキュメント |
| `ai_generated/screens.md` | 画面一覧ドキュメント |
| `cost_metrics.jsonl` | 開発メトリクス |
| `session_*/*.jsonl` | セッション履歴 |
| `session_*/*.md` | セッション履歴（可読形式） |
| `agent_activity_report.md` | エージェント活動レポート |
| `problems.md` | 実装の振り返り |
| `openapi.yaml` | OpenAPI定義（APIがある場合のみ） |
| `README.md` | プロジェクト説明 |

## コミット対象外

| ファイル | 理由 |
|---------|------|
| `.env`、`credentials.json` | 機密情報 |
| `node_modules/`、`venv/` | 依存パッケージ |
| `__pycache__/` | Pythonキャッシュ |
| `ai_generated/input/` | 入力資料（RFP等）。機密性が高く、gitに含めない |

上記対象外以外で `??` 表示されるファイルがあれば、それもコミット対象。`.claude/rules/git-rules.md` に従ってコミットする。
