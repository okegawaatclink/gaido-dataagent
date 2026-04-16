# PR作成手順

## 概要

**PBI単位でPR**を作成します。
対象PBIとその配下のTask Issueを参照して、PRの説明文を自動生成し、関連するIssueをクローズします。

## 前提条件

- 対象PBI配下の全Task Issueがcloseされていること

確認項目:
- 対象PBI配下の全Task Issueが `closed` 状態
- 各Taskに対応するコミットが作成済み
- すべての変更がリモートにプッシュ済み

## 実行前の確認

1. **対象PBIと関連Issueの取得**
   ```bash
   # 対象PBI Issueを取得
   gh issue view <pbi_number> --json number,title,body,state

   # 親Epic Issueを取得
   gh issue view <epic_number> --json number,title,body,state

   # 対象PBI配下のTask Issueを取得
   gh issue list --label "task" --state all --json number,title,body,state --limit 100
   # bodyに「親PBI: #<pbi_number>」が含まれるものを抽出
   ```

2. **対象PBI配下のTask完了確認**
   ```bash
   # 対象PBI配下のopenのTask Issueが0件であることを確認
   gh issue list --label "task" --state open --json number,body --limit 100
   # bodyに「親PBI: #<pbi_number>」が含まれるものを抽出し、0件であることを確認
   ```
   結果が空であれば対象PBI配下の全Task完了。

3. **関連ファイルの読み込み**
   ```
   ai_generated/requirements/README.md を読み込み
   ```

## PR説明文テンプレート

```markdown
## Summary

[対象PBIのユーザーストーリーを要約]

### 実装内容

**親Epic**: #[Epic番号] [Epicタイトル]

**対象PBI**: #[PBI番号] [PBIタイトル]
- #[Task番号] [Taskタイトル] ✅
- #[Task番号] [Taskタイトル] ✅
- #[Task番号] [Taskタイトル] ✅

### 変更ファイル

[主要な変更ファイルをカテゴリ別にリスト化]

## Test Plan

[対象PBI Issueの受入条件に基づくテスト項目]

- [ ] [テスト項目1]
- [ ] [テスト項目2]

## Screenshots

[ai_generated/screenshots/ 内の該当スクリーンショットを埋め込む]

### 画像URL生成手順

1. リポジトリURLを取得
   ```bash
   TARGET_REPO=$(gh repo view --json url -q .url)
   ```

2. 最新コミットハッシュを取得
   ```bash
   COMMIT_HASH=$(git rev-parse HEAD)
   ```

3. raw形式のURLを構築
   - 形式: `{TARGET_REPO}/raw/{COMMIT_HASH}/ai_generated/screenshots/{ファイル名}`
   - 例: `https://github.com/user/repo/raw/abc123/ai_generated/screenshots/task-42_login.png`

| 画面名 | スクリーンショット |
|--------|-------------------|
| [画面名1] | ![画面名1]({TARGET_REPO}/raw/{COMMIT_HASH}/ai_generated/screenshots/task-XXX_画面名1.png) |
| [画面名2] | ![画面名2]({TARGET_REPO}/raw/{COMMIT_HASH}/ai_generated/screenshots/task-XXX_画面名2.png) |

## Related Issues

[対象PBIをクローズ（Task Issueは実装時にclose済み）]

- Closes #[PBI番号]

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

**重要**: `Closes #XXX` でPRマージ時にPBI Issueが自動クローズされる（Task Issueは実装完了時にclose済み）

## 実行手順

### 1. 実装完了の確認

対象PBI配下の未完了Task Issueがないことを確認：
```bash
# 対象PBI配下のopenのTask Issueを確認
gh issue list --label "task" --state open --json number,body --limit 100
# bodyに「親PBI: #<pbi_number>」が含まれるものを抽出し、0件であることを確認
```
結果が空配列 `[]` であれば対象PBI配下の全Task完了。

### 2. Gitステータス確認

```bash
git status
git log origin/main..HEAD --oneline
```

### 3. PR作成

```bash
gh pr create --title "<タイトル>" --body "<説明文>"
```

## PR タイトル規則

```
[PBI名] 実装完了
```

例:
- `[ログイン機能] 実装完了`
- `[商品一覧表示] 実装完了`

## PR作成後の扱い

PR作成後、サマリに「レビュー待ちPR」を含めて親オーケストレーターに返却する。
**developフェーズではPRのマージは行わない。** マージは親オーケストレーターが担当する。

親オーケストレーターは、コードレビュー設定（`ai_generated/requirements/README.md`）に応じて以下を実行:
- **ユーザーレビュー**: ユーザーにPR URLを提示しレビュー・マージを依頼
- **AIレビュー**: AIレビュー（code-reviewer + security-reviewer）を実行し、通過後に自動マージ
- **なし**: 即自動マージ

## 注意事項

- 対象PBI配下の全Task Issueがclosedでない場合はPRを作成しない
- PRの説明文には対象PBIとその配下のTask Issueの内容を反映する
- テスト項目は対象PBI Issueの受入条件から生成する
- `Closes #XXX` で対象PBI Issueを必ず含める（Task Issueは実装時にclose済み）
- **Webシステムの場合、スクリーンショットは必須**
  - 画像URLはraw形式（`{TARGET_REPO}/raw/{COMMIT_HASH}/ai_generated/screenshots/{ファイル名}`）を使用
  - スクリーンショットがない場合はPR作成前に `Coding.md` で取得すること

## 完了後

PR作成後、メインのフローに戻る。
