# 自動化スクリプト

GitHub Issue連携の自動化スクリプトとその設定ファイル。

---

## ディレクトリ構成

```
40_automation/
├── README.md                    # このファイル
├── github_issue_sync.md         # Issue同期の仕様
├── scripts/
│   ├── create_issue.sh          # Issue作成スクリプト
│   ├── update_parent_tasklist.sh # 親IssueのTasklist更新
│   └── writeback_issue_number.sh # Issue番号のmd書き戻し
└── config/
    └── labels.json              # ラベル定義
```

---

## 前提条件

- GitHub CLI (`gh`) がインストールされていること
- `gh auth login` で認証済みであること
- リポジトリへの書き込み権限があること

---

## 基本的な使い方

### 1. Issue作成

```bash
./scripts/create_issue.sh path/to/epic.md
```

### 2. 親IssueのTasklist更新

```bash
./scripts/update_parent_tasklist.sh <parent_issue_number> <child_issue_number>
```

### 3. Issue番号の書き戻し

```bash
./scripts/writeback_issue_number.sh path/to/epic.md <issue_number>
```

---

## 一括処理の例

```bash
# Epic → PBI → Task の順に作成
epic_num=$(./scripts/create_issue.sh backlog/epic_001.md)
./scripts/writeback_issue_number.sh backlog/epic_001.md $epic_num

pbi_num=$(./scripts/create_issue.sh backlog/pbi_001.md)
./scripts/writeback_issue_number.sh backlog/pbi_001.md $pbi_num
./scripts/update_parent_tasklist.sh $epic_num $pbi_num

task_num=$(./scripts/create_issue.sh backlog/task_001.md)
./scripts/writeback_issue_number.sh backlog/task_001.md $task_num
./scripts/update_parent_tasklist.sh $pbi_num $task_num
```

---

## 同期方向

```
Markdown → GitHub Issue (一方向)

※ Issue → Markdown の逆同期は行わない
※ Taskは一時的な情報として扱う
```

---

## 注意事項

- スクリプト実行前に `gh auth status` で認証状態を確認
- ラベルは事前に `config/labels.json` に基づいて作成しておく
- Sub-issues機能は GitHub の設定で有効化が必要

---

## トラブルシューティング

| 問題 | 対処 |
|------|------|
| `gh: command not found` | GitHub CLI をインストール |
| `HTTP 401` | `gh auth login` で再認証 |
| `HTTP 403` | リポジトリ権限を確認 |
| ラベルが見つからない | ラベルを事前作成 |

---

**End of README.md**
