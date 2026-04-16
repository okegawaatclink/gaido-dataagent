# JSON操作 共通手順

## 概要

Epic/PBI/Task定義で共通して使用するJSON操作パターン。

## JSONファイルの初期化

```bash
# 既存ファイルがない場合は空配列で初期化
[ ! -f ai_generated/issues.json ] && echo '[]' > ai_generated/issues.json
```

## Issueの追記

```python
import json

# 既存のissuesを読み込み
with open('ai_generated/issues.json', 'r') as f:
    issues = json.load(f)

# 新しいIssueを追加
new_issue = {
    "type": "epic",       # "epic" | "pbi" | "task"
    "id": "epic-1",       # 一意のID
    "parent_id": None,    # 親ID（Epicの場合はなし）
    "title": "タイトル",
    "body": "本文（Markdown形式）",
    "labels": ["epic"]    # "epic" | "pbi" | "task"
}
issues.append(new_issue)

# 保存
with open('ai_generated/issues.json', 'w') as f:
    json.dump(issues, f, ensure_ascii=False, indent=2)
```

## Issueの検索・修正

```python
import json

# 読み込み
with open('ai_generated/issues.json', 'r') as f:
    issues = json.load(f)

# 該当Issueを検索して修正
for issue in issues:
    if issue['id'] == 'pbi-1-1':
        issue['body'] = "修正後の本文..."
        break

# 保存
with open('ai_generated/issues.json', 'w') as f:
    json.dump(issues, f, ensure_ascii=False, indent=2)
```

## タイプ別フィルタリング

```python
epics = [i for i in issues if i['type'] == 'epic']
pbis = [i for i in issues if i['type'] == 'pbi']
tasks = [i for i in issues if i['type'] == 'task']
```
