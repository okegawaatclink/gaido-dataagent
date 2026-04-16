# Epic定義手順

## 概要

ユーザーストーリー形式でEpicを定義し、JSONファイルに追記します。
INVEST/YAGNIチェックを適用し、**要件に応じて複数のEpicを定義可能**です。

## 前提条件

- `/analyze` による要件分析が完了していること
- `ai_generated/requirements/` ディレクトリが存在すること

## 実行手順

1. **要件ファイルの読み込み**
   ```
   ai_generated/requirements/ 配下のファイルを読み込み
   ```
   - ファイルが存在しない場合は `/analyze` を先に実行するよう案内

2. **要件ファイルの「確定要件」セクションを参照**
   - 機能要件 → Epicのスコープ決定に使用
   - 非機能要件 → 制約条件として考慮
   - 技術選定 → 前提条件に反映

3. **JSONファイルの初期化**
   ```bash
   # 既存ファイルがない場合は空配列で初期化
   [ ! -f ai_generated/issues.json ] && echo '[]' > ai_generated/issues.json
   ```

## テンプレート

**以下のテンプレートに従ってEpicを定義すること:**
- [Epic テンプレート](../../../docs_with_ai/multi-expert-analysis/30_templates/backlog/epic_template.md)

## 出力先

**JSONファイル**: `ai_generated/issues.json`

## JSON形式

各Epicを以下の形式でJSONファイルに追記する:

```json
{
  "type": "epic",
  "id": "epic-1",
  "title": "Epic 1: [ユーザーストーリー形式のタイトル]",
  "body": "[テンプレートに従った本文（Markdown形式）]",
  "labels": ["epic"]
}
```

### bodyの記述例

```markdown
## ユーザーストーリー

**As a** [誰が]
**I want to** [何をしたい]
**So that** [どんな価値が得られる]

## ビジネス価値

- ...

## 成功指標（KPI）

| 指標 | 目標値 | 計測方法 |
|------|--------|----------|
| | | |

## INVESTチェック

- [x] **I**ndependent: 他Epicと独立しているか
- [x] **N**egotiable: 交渉・調整の余地があるか
...

## 含まれるPBI

（Issue登録後にTasklistで設定）

## 主要リスク

| リスク | 影響度 | 発生可能性 | 対策 |
|--------|--------|-----------|------|
| | High/Med/Low | High/Med/Low | |

## 前提条件

-

## 参照ドキュメント

| パス | ファイル名 | 内容 |
|------|-----------|------|
| | | |
```

## 番号ルール

- **連番**: 依存関係順（依存先より大きい番号を付ける）
- **id**: `epic-1`, `epic-2`, ... の形式（PBI/Task定義で参照）

**重要**: Epic番号順 = 実装順。依存先Epicより小さい番号を付けてはならない。

例:
- `Epic 1`: ユーザーが安全にログインできる（依存なし）→ id: `epic-1`
- `Epic 2`: ユーザーが商品を検索できる（Epic 1に依存）→ id: `epic-2`

## 複数Epic定義時の注意

要件の規模に応じて複数のEpicを定義する場合：

1. **連番を付与**: Epic 1, Epic 2, ... の形式
2. **Epic間の独立性を確保**: 各EpicはINVESTの「Independent」を満たすこと
3. **idを記録**: 後続ステップ（PBI定義）で使用
4. **依存関係の明記**: Epic間に依存がある場合は「前提条件」に明記

## JSONファイルへの追記方法

Pythonコードで追記する:

```python
import json

# 既存のissuesを読み込み
with open('ai_generated/issues.json', 'r') as f:
    issues = json.load(f)

# 新しいEpicを追加
new_epic = {
    "type": "epic",
    "id": "epic-1",
    "title": "Epic 1: ユーザーが安全にログインできる",
    "body": "## ユーザーストーリー\n\n**As a** 一般ユーザー\n...",
    "labels": ["epic"]
}
issues.append(new_epic)

# 保存
with open('ai_generated/issues.json', 'w') as f:
    json.dump(issues, f, ensure_ascii=False, indent=2)
```

## 注意事項

- Epicは「なぜやるか」に焦点を当てる
- 技術的な詳細はPBI/Taskで定義
- 1つのEpicに含まれるPBIは3-7個が目安
- **必ず要件ファイルを参照して作成すること**
- **「含まれるPBI」セクションはIssue登録後にTasklistで設定する**

## 完了後

全Epic定義完了後、メインのフローに戻り、次のStep（PBI定義）に進む。
