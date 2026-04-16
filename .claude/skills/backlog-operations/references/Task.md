# Task定義手順

## 概要

具体的な作業単位であるTaskを定義し、JSONファイルに追記します。
完了条件を明確にし、**全PBIのTaskを一括定義**します。

## 前提条件

- PBI定義が全て完了していること
- `ai_generated/issues.json` にEpic/PBIが定義されていること

## 実行手順

1. **関連情報の読み込み**
   ```
   ai_generated/requirements/ 配下のファイルを読み込み
   ai_generated/issues.json を読み込み（Epic/PBI定義を確認）
   ```

2. **参照すべき情報**
   - `ai_generated/requirements/README.md` の「確定要件」または `architecture.md` → 使用する技術スタック
   - PBI定義の「タスク」→ 作成すべきTaskの一覧
   - PBI定義の「受入条件」→ Taskの完了条件に反映
   - `ai_generated/requirements/README.md` の「専門家分析」→ 技術的な注意点

## テンプレート

**以下のテンプレートに従ってTaskを定義すること:**
- [Task テンプレート](../../../docs_with_ai/multi-expert-analysis/30_templates/backlog/task_template.md)

## 出力先

**JSONファイル**: `ai_generated/issues.json`

## JSON形式

各Taskを以下の形式でJSONファイルに追記する:

```json
{
  "type": "task",
  "id": "task-1-1-1",
  "parent_id": "pbi-1-1",
  "title": "Task 1.1.1: [動詞で始まる具体的作業]",
  "body": "[テンプレートに従った本文（Markdown形式）]",
  "labels": ["task"]
}
```

### bodyの記述例

```markdown
## 親PBI

（Issue登録後にTasklistで設定）

## 作業内容

- 実装する具体的な内容1
- 実装する具体的な内容2
- ...

## 完了条件

- [ ] 条件1
- [ ] 条件2
- [ ] 条件3

## 技術的な注意点

- 注意点1
- 注意点2

## 依存関係

- **前提（これが必要）**: なし / task-x-x-x
- **ブロッカー**: なし

## 参考資料

- 参考URL
- 既存コードのパス
```

## 番号ルール

- **Epic番号**: 親EpicのEpic番号
- **PBI連番**: 親PBIのPBI連番
- **連番**: 依存関係順（依存先より大きい番号を付ける）
- **id**: `task-1-1-1`, `task-1-1-2`, ... の形式

**重要**: Task番号順 = 実装順。依存先Taskより小さい番号を付けてはならない。

例:
- `Task 1.1.1`: DBスキーマを作成する（依存なし）→ id: `task-1-1-1`
- `Task 1.1.2`: 認証APIを実装する（1.1.1に依存）→ id: `task-1-1-2`
- `Task 1.1.3`: ログイン画面を作成する（1.1.2に依存）→ id: `task-1-1-3`

## 複数PBI対応

複数PBIがある場合：

1. **全PBI定義を順に処理**: 各PBIの「タスク」を確認
2. **Epic番号.PBI連番.Task連番でタイトル付け**: `Task [Epic番号].[PBI連番].[連番]: ...`
3. **parent_idを設定**: 親PBIのID（`pbi-1-1`, `pbi-1-2`, ...）
4. **依存関係もidで記載**: 前提Taskがある場合は `task-x-x-x` で記載

## ステータス管理

TaskのステータスはIssueの open/closed で管理：

| 状態 | Issue状態 | タイミング |
|----|----------|-----------|
| 未着手 | open | Issue登録時 |
| 実装中 | open | `/develop` 開始時（変更なし） |
| 完了 | closed | 実装完了時に close |

## JSONファイルへの追記方法

Pythonコードで追記する:

```python
import json

# 既存のissuesを読み込み
with open('ai_generated/issues.json', 'r') as f:
    issues = json.load(f)

# 新しいTaskを追加
new_task = {
    "type": "task",
    "id": "task-1-1-1",
    "parent_id": "pbi-1-1",
    "title": "Task 1.1.1: DBスキーマを作成する",
    "body": "## 親PBI\n\n（Issue登録後にTasklistで設定）\n\n## 作業内容\n...",
    "labels": ["task"]
}
issues.append(new_task)

# 保存
with open('ai_generated/issues.json', 'w') as f:
    json.dump(issues, f, ensure_ascii=False, indent=2)
```

## 注意事項

- Taskは「どう作るか」に焦点を当てる
- 1つのTaskは1日以内で完了できるサイズが理想
- 完了条件は開発者が自己判断できる具体性で記述
- **1つのチケットの内容を確認するだけで実装可能なすべての情報を含めること**
- **要件ファイルと親PBI定義を必ず参照して作成すること**
- **「親PBI」セクションはIssue登録後にTasklistで設定する**

## 完了後

全Task定義完了後、メインのフローに戻り、次のStep（品質検証）に進む。
