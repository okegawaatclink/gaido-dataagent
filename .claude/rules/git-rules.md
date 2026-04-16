# Gitコミット規約

コミット時は以下の規約に従うこと。

## コミットメッセージ形式

```
<type>(<scope>): <subject>

<body>

Co-Authored-By: Claude <noreply@anthropic.com>
```

### Type一覧

| Type | 用途 |
|------|------|
| `feat` | 新機能追加 |
| `fix` | バグ修正 |
| `docs` | ドキュメントのみの変更 |
| `style` | コードの意味に影響しない変更（空白、フォーマット等） |
| `refactor` | バグ修正でも機能追加でもないコード変更 |
| `perf` | パフォーマンス改善 |
| `test` | テストの追加・修正 |
| `chore` | ビルドプロセスや補助ツールの変更 |

## ルール

- subjectは50文字以内
- bodyは72文字で折り返し
- 「何を」「なぜ」を説明（「どのように」は不要）
- 現在形で記述（"Add feature" not "Added feature"）
- 日本語/英語はプロジェクトの既存スタイルに合わせる

## コミット前の確認

1. `git diff --staged` でステージされた変更を確認
2. `git log --oneline -10` で直近のコミットスタイルを確認
3. 変更内容を分析し、Conventional Commits形式でメッセージを生成

## 注意事項

- `.env`、`credentials.json` 等の機密ファイルはコミットしない
- 変更がない場合は空コミットを作成しない
- pre-commit hookが失敗した場合は問題を修正して新規コミットを作成
- **`.gitignore`が存在しない場合、コミット前に必ず作成すること**
  - `node_modules/`、`venv/`等の依存関係ディレクトリがステージされていないか確認
  - 不要なファイルがステージされていたら`git reset`で除外し、`.gitignore`を作成してから再度コミット

## コミット＆プッシュ手順

```bash
# 1. ステージされた変更を確認
git diff --staged

# 2. コミット
git commit -m "<type>(<scope>): <subject>

<body>

Co-Authored-By: Claude <noreply@anthropic.com>"

# 3. プッシュ
git push
```

## Task完了時

Task実装完了後のコミット後、Task Issueをcloseする:

```bash
gh issue close <task_issue_number>
```
