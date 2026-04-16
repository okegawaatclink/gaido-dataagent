# PBI定義手順

## 概要

Product Backlog Item（PBI）を定義し、JSONファイルに追記します。
受入条件とDoD（完成の定義）を定義し、**全EpicのPBIを一括定義**します。

## 前提条件

- Epic定義が全て完了していること
- `ai_generated/issues.json` にEpicが定義されていること

## 実行手順

1. **関連情報の読み込み**
   ```
   ai_generated/requirements/ 配下のファイルを読み込み
   ai_generated/issues.json を読み込み（Epic定義を確認）
   ```

2. **参照すべき情報**
   - `ai_generated/requirements/README.md` の「確定要件」→ PBIの機能範囲
   - Epic定義の「含まれるPBI」→ 作成すべきPBIの一覧
   - `ai_generated/requirements/README.md` の「専門家分析」→ QA/Security観点の受入条件

## テンプレート

**以下のテンプレートに従ってPBIを定義すること:**
- [PBI テンプレート](../../../docs_with_ai/multi-expert-analysis/30_templates/backlog/pbi_template.md)

## 出力先

**JSONファイル**: `ai_generated/issues.json`

## JSON形式

各PBIを以下の形式でJSONファイルに追記する:

```json
{
  "type": "pbi",
  "id": "pbi-1-1",
  "parent_id": "epic-1",
  "title": "PBI 1.1: [ユーザーストーリー形式のタイトル]",
  "body": "[テンプレートに従った本文（Markdown形式）]",
  "labels": ["pbi"]
}
```

### bodyの記述例

```markdown
## 親Epic

（Issue登録後にTasklistで設定）

## ユーザーストーリー

**As a** [誰が]
**I want to** [何をしたい]
**So that** [どんな小さな価値が得られる]

## 価値の説明

この PBI が完了すると、ユーザーは具体的に何ができるようになるか：

## INVESTチェック

- [x] **I**ndependent: 他PBIと独立しているか
- [x] **N**egotiable: 交渉・調整の余地があるか
...

## YAGNIチェック

- [x] 今この瞬間、これがないと先に進めないか？
...

## 完成の定義（DoD）

- [ ] 受入条件がすべて満たされている
- [ ] コードレビュー完了
- [ ] ユニットテストカバレッジ達成
- [ ] E2Eテスト合格
- [ ] セキュリティレビュー完了

## 受入条件

| # | 条件 | 品質分類 | 回帰テスト |
|---|------|----------|-----------|
| 1 | | [必須]/[推奨]/[任意] | ○/△/× |

## 依存関係

- **前提**:
  - PBI 1.1
- **後続**:
  - PBI 1.3
  - PBI 1.4

> ※ `build_tasklist.py` 実行時に「PBI X.Y」がGitHub Issue番号に自動解決されます。

## タスク

（Issue登録後にTasklistで設定）
```

## 番号ルール

- **Epic番号**: 親EpicのEpic番号
- **連番**: 依存関係順（依存先より大きい番号を付ける）
- **id**: `pbi-1-1`, `pbi-1-2`, ... の形式（Task定義で参照）

**重要**: PBI番号順 = 実装順。依存先PBIより小さい番号を付けてはならない。

例:
- `PBI 1.1`: ログインできる（依存なし）→ id: `pbi-1-1`
- `PBI 1.2`: パスワードを忘れても復旧できる（1.1に依存）→ id: `pbi-1-2`

## 複数Epic対応

複数Epicがある場合：

1. **全Epic定義を順に処理**: 各Epicの「含まれるPBI」を確認
2. **Epic番号.連番でタイトル付け**: `PBI [Epic番号].[連番]: ...`
3. **parent_idを設定**: 親EpicのID（`epic-1`, `epic-2`, ...）
4. **idを記録**: 後続ステップ（Task定義）で使用

## JSONファイルへの追記方法

Pythonコードで追記する:

```python
import json

# 既存のissuesを読み込み
with open('ai_generated/issues.json', 'r') as f:
    issues = json.load(f)

# 新しいPBIを追加
new_pbi = {
    "type": "pbi",
    "id": "pbi-1-1",
    "parent_id": "epic-1",
    "title": "PBI 1.1: ログインできる",
    "body": "## 親Epic\n\n（Issue登録後にTasklistで設定）\n\n## ユーザーストーリー\n...",
    "labels": ["pbi"]
}
issues.append(new_pbi)

# 保存
with open('ai_generated/issues.json', 'w') as f:
    json.dump(issues, f, ensure_ascii=False, indent=2)
```

## 注意事項

- PBIは「何を作るか」に焦点を当てる
- 技術的な実装詳細はTaskで定義
- 1つのPBIに含まれるTaskは3-10個が目安
- 受入条件は具体的かつ検証可能に記述
- **PBIには必ずユーザーストーリーを含めること**
- **要件ファイルと親Epic定義を必ず参照して作成すること**
- **「親Epic」「タスク」セクションはIssue登録後にTasklistで設定する**

## 完了後

全PBI定義完了後、メインのフローに戻り、次のStep（Task定義）に進む。
