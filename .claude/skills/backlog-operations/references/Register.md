# Issue一括登録手順

## 概要

`ai_generated/issues.json` のEpic/PBI/Task定義を `create_issues.py` を使ってGitHub Issueに一括登録します。

## 前提条件

- 品質検証が完了していること
- `ai_generated/issues.json` にEpic/PBI/Taskが定義されていること
- 環境変数 `GITHUB_TOKEN` が設定されていること

## 実行手順

### 1. JSONファイルの変換

`ai_generated/issues.json` は内部ID（`id`, `parent_id`, `type`）を含むため、
`create_issues.py` 用のフォーマットに変換する。

```python
import json

# 読み込み
with open('ai_generated/issues.json', 'r') as f:
    issues = json.load(f)

# create_issues.py用に変換（id, parent_id, typeを除去）
output_issues = []
for issue in issues:
    output_issues.append({
        "title": issue["title"],
        "body": issue["body"],
        "labels": issue["labels"]
    })

# 出力
with open('ai_generated/issues_for_register.json', 'w') as f:
    json.dump(output_issues, f, ensure_ascii=False, indent=2)
```

### 2. ドライランで確認

```bash
python3 tools/create_issues.py \
    "$TARGET_REPO_URL" \
    ai_generated/issues_for_register.json \
    --dry-run
```

出力例:
```
============================================================
GitHub Issue一括作成ツール
============================================================
対象リポジトリ: owner/repo
JSONファイル: ai_generated/issues_for_register.json
Issue数: 10件
ラベル: epic, pbi, task

*** ドライランモード: 実際には作成しません ***

作成するIssue:
  1. Epic 1: ユーザーが安全にログインできる [epic]
  2. PBI 1.1: ログインできる [pbi]
  3. Task 1.1.1: DBスキーマを作成する [task]
  ...
```

### 3. Issue一括登録

```bash
python3 tools/create_issues.py \
    "$TARGET_REPO_URL" \
    ai_generated/issues_for_register.json \
    --yes
```

### 4. 登録結果の記録

登録されたIssue番号を `ai_generated/issue_numbers.json` に記録する。

```python
import json

# ai_generated/issues.json を読み込み
with open('ai_generated/issues.json', 'r') as f:
    issues = json.load(f)

# 登録結果を取得（create_issues.py の出力から）
# 例: [(1, "Epic 1: ..."), (2, "PBI 1.1: ..."), ...]

# ID → Issue番号のマッピングを作成
id_to_number = {}
for i, issue in enumerate(issues):
    # Issue番号は登録順に割り当てられる
    issue_number = i + 1  # 実際の番号に置き換え
    id_to_number[issue["id"]] = issue_number

# 保存
with open('ai_generated/issue_numbers.json', 'w') as f:
    json.dump(id_to_number, f, ensure_ascii=False, indent=2)
```

出力例（`ai_generated/issue_numbers.json`）:
```json
{
  "epic-1": 1,
  "pbi-1-1": 2,
  "pbi-1-2": 3,
  "task-1-1-1": 4,
  "task-1-1-2": 5
}
```

## 出力先

- **GitHub Issue**: 対象リポジトリにIssueが作成される
- **ローカルファイル**: `ai_generated/issue_numbers.json` にID→番号マッピングを保存

## 環境変数

| 変数名 | 説明 |
|--------|------|
| `TARGET_REPO_URL` | 対象リポジトリのURL |
| `GITHUB_TOKEN` | GitHub Personal Access Token |

## エラー時の対応

### ラベルが存在しない

`create_issues.py` は存在しないラベルを自動作成するため、通常は問題ない。

### 認証エラー

```
エラー: コマンド実行に失敗しました
```

→ `GITHUB_TOKEN` が正しく設定されているか確認。

### リポジトリが見つからない

```
エラー: リポジトリが見つかりません
```

→ `TARGET_REPO_URL` が正しいか確認。

## 完了後

Issue登録完了後、メインのフローに戻り、次のStep（親子関係構築）に進む。

**重要**: `ai_generated/issue_numbers.json` のマッピングは親子関係構築（Tasklist.md）で使用する。
