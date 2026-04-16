---
name: record-progress
description: 開発進捗状態を記録。Pockode UIに進捗を表示するため各フェーズで使用。
---

# Record Progress

## 概要

開発進捗状態を `gaido_progress.json` に記録します。Pockode（React）がこのファイルを監視し、UIに進捗を表示します。

**重要: `/record-costs` と同じタイミングで使用すること。**

## 使い方

```
/record-progress <フェーズ名> <ステータス> [--flow-type <タイプ>] [--skip-phases <フェーズ名,...>]
```

## フロータイプ

`--flow-type` でフロータイプを指定すると、UIに表示するフェーズ一覧（`ui_phases`）が動的に生成されます。

| flow_type | 用途 | フェーズ数 |
|-----------|------|-----------|
| `undetermined` | 開発内容選択フェーズ（選択前） | 1 |
| `new_development` | 新規開発フロー | 10 |
| `existing_modification` | 既存改修フロー | 15 |
| `tool` | 非開発フロー（バグ報告、機能要望等） | 0 |
| `project_advisor` | 営業案件アドバイザーフロー | 8 |
| `proposal` | 提案書作成フロー | 8 |

`--flow-type` を省略した場合はレガシーモード（`ui_phase_total: 8`固定、`ui_phases`なし）で動作します。

## フェーズ名一覧

以下のフェーズ名を使用すること（`/record-costs` と同一）:

| # | フェーズ名 | 記録タイミング | UIラベル |
|---|-----------|---------------|----------|
| 1 | 開発内容選択フェーズ | /welcome-message 実行前 | 開発内容選択 |
| 2 | 既存requirements充足判定フェーズ | /requirements-completeness-check 実行前 | 充足判定 |
| 3 | 作業内容入力フェーズ | /requirements-intake 実行前 | 作業内容入力 |
| 4 | 壁打ちフェーズ | /analyze 実行前 | 壁打ち |
| 5 | 画面デザインフェーズ | /screen-design-phase 実行前 | 画面デザイン |
| 6 | 要件確認フェーズ | Task(phase-backlog) 呼出前 | 要件確認 |
| 7 | 実装フェーズ | Task(phase-develop) 呼出前 | 実装 |
| 8 | テスト設計フェーズ | Task(phase-test-design) 呼出前 | テスト設計 |
| 9 | テスト実装フェーズ | Task(phase-test-run) 呼出前 | テスト実装 |
| 10 | 成果まとめフェーズ | Task(phase-finalize) 呼出前 | まとめ |
| 11 | 完了 | コストレポート生成後 | 完了 |
| 12 | 既存ソースローカル実行フェーズ | /existing-local-run-operations 実行前 | ローカル実行 |
| 13 | 既存ソース解析フェーズ | Task(phase-existing-source-analysis) 呼出前 | ソース解析 |
| 14 | 既存ドキュメント解析フェーズ | Task(phase-existing-doc-analysis) 呼出前 | ドキュメント解析 |
| 15 | 解析結果統合フェーズ | Task(phase-analysis-integration) 呼出前 | 解析統合 |
| 16 | 既存テスト生成フェーズ | Task(phase-existing-test-gen) 呼出前 | テスト生成 |
| 17 | 案件ヒアリングフェーズ | /project-advisor Phase 0-1 開始前 | ヒアリング |
| 18 | ゲートチェックフェーズ | /project-advisor Phase 2 開始前 | ゲートチェック |
| 19 | 確度軸ヒアリングフェーズ | /project-advisor Phase 3 開始前 | 確度評価 |
| 20 | 戦略軸ヒアリングフェーズ | /project-advisor Phase 4 開始前 | 戦略評価 |
| 21 | 営業まとめフェーズ | /project-advisor まとめ生成前 | まとめ |
| 22 | 技術確認フェーズ | /project-advisor 技術確認開始前 | 技術確認 |
| 23 | 案件判定完了 | /project-advisor 判定完了時 | 完了 |
| 24 | 提案準備フェーズ | /proposal-init Step 0-1 開始前 | 準備 |
| 25 | 資料読み込みフェーズ | /proposal-init Step 3 開始前 | 資料読込 |
| 26 | 構成壁打ちフェーズ | /proposal-init Step 4 開始前 | 構成壁打ち |
| 27 | デザインフェーズ | /proposal-init Step 9 開始前 | デザイン |
| 28 | 図表・スライド生成フェーズ | /proposal-init Step 10 開始前 | スライド生成 |
| 29 | 提案書確認フェーズ | /proposal-init Step 11 確認前 | 確認 |
| 30 | 提案書完了 | /proposal-init 完了時 | 完了 |

## ステータス一覧

| ステータス | 説明 | 使用タイミング |
|-----------|------|---------------|
| starting | フェーズ開始 | フェーズ開始時 |
| in_progress | 処理中 | タスク実装中（任意） |
| completed | フェーズ完了 | フェーズ完了時 |
| waiting_approval | ユーザー承認待ち | AskUserQuestion前 |
| error | エラー発生 | エラー時 |

## スキップフェーズ

`--skip-phases` でフロー内のフェーズをスキップできます（カンマ区切り）。スキップされたフェーズは`ui_phases`から除外され、残りのフェーズ番号が自動で振り直されます。

| 決定ポイント | 条件 | スキップ対象 |
|-------------|------|-------------|
| 壁打ちフェーズ完了後 | Pencilでの画面設計なし | `画面デザインフェーズ` |
| 既存requirements充足判定 | requirements充足 | `既存ソースローカル実行フェーズ,既存ソース解析フェーズ,既存ドキュメント解析フェーズ,解析結果統合フェーズ` |
| 既存ドキュメント解析前 | existing_docs/が空 | `既存ドキュメント解析フェーズ` |
| ゲートチェック完了後 | ゲートNG | `確度軸ヒアリングフェーズ,戦略軸ヒアリングフェーズ,営業まとめフェーズ,技術確認フェーズ` |
| 営業まとめ完了後 | 見送り/情報収集 | `技術確認フェーズ` |

**重要**: `--skip-phases` は累積管理すること。一度スキップしたフェーズは以降の全呼び出しで常に含める。

## 手順

引数からフェーズ名とステータスを取得し、`record_progress.py` を実行:

```bash
python3 .claude/skills/record-progress/scripts/record_progress.py \
    "<フェーズ名>" "<ステータス>" \
    --flow-type <フロータイプ> \
    --output gaido_progress.json
```

### スキップフェーズ付き

```bash
python3 .claude/skills/record-progress/scripts/record_progress.py \
    "<フェーズ名>" "<ステータス>" \
    --flow-type <フロータイプ> \
    --skip-phases "<フェーズ名1>,<フェーズ名2>" \
    --output gaido_progress.json
```

### その他オプション付き（任意）

```bash
python3 .claude/skills/record-progress/scripts/record_progress.py \
    "<フェーズ名>" "<ステータス>" \
    --flow-type <フロータイプ> \
    --message "<メッセージ>" \
    --task "<タスク名>" \
    --progress <現在数> \
    --total <総数> \
    --output gaido_progress.json
```

## 典型的な使用パターン

### 開発内容選択フェーズ（フロー確定前）

```bash
/record-progress "開発内容選択フェーズ" "starting" --flow-type undetermined
```

### 新規開発フロー

```bash
# 壁打ちフェーズ開始
/record-progress "壁打ちフェーズ" "starting" --flow-type new_development

# 画面デザインをスキップする場合
/record-progress "要件確認フェーズ" "starting" --flow-type new_development --skip-phases "画面デザインフェーズ"
```

### 既存改修フロー

```bash
# 解析フェーズ開始
/record-progress "既存ソースローカル実行フェーズ" "starting" --flow-type existing_modification

# requirements充足で解析スキップする場合
/record-progress "作業内容入力フェーズ" "starting" --flow-type existing_modification --skip-phases "既存ソースローカル実行フェーズ,既存ソース解析フェーズ,既存ドキュメント解析フェーズ,解析結果統合フェーズ"
```

### 営業案件アドバイザーフロー

```bash
# ヒアリング開始
/record-progress "案件ヒアリングフェーズ" "starting" --flow-type project_advisor

# ゲートNG時（早期終了）
/record-progress "案件判定完了" "completed" --flow-type project_advisor --skip-phases "確度軸ヒアリングフェーズ,戦略軸ヒアリングフェーズ,営業まとめフェーズ,技術確認フェーズ" --message "ゲートNG"
```

### 提案書作成フロー

```bash
# 構成壁打ち開始
/record-progress "構成壁打ちフェーズ" "starting" --flow-type proposal

# 提案書完了
/record-progress "提案書完了" "completed" --flow-type proposal --message "提案書作成完了"
```

### 非開発フロー（ツール利用）

```bash
/record-progress "開発内容選択フェーズ" "completed" --flow-type tool
```

### ユーザー承認待ち時

```bash
/record-progress "実装フェーズ" "waiting_approval" --flow-type new_development --message "動作確認をお願いします"
```

### 全作業完了時

```bash
/record-progress "完了" "completed" --flow-type new_development --message "全ての作業が完了しました"
```

## 出力

`gaido_progress.json` が作成/更新されます:

### --flow-type指定時

```json
{
  "phase": "壁打ちフェーズ",
  "status": "starting",
  "current_task": null,
  "progress": null,
  "total": null,
  "message": null,
  "timestamp": "2026-03-17T14:30:00+09:00",
  "flow_type": "new_development",
  "ui_phase": "analyze",
  "ui_phase_number": 3,
  "ui_phase_total": 10,
  "ui_phase_label": "壁打ち",
  "ui_phases": [
    {"ui_phase": "welcome", "ui_phase_label": "開発内容選択", "ui_phase_number": 1},
    {"ui_phase": "requirements_intake", "ui_phase_label": "作業内容入力", "ui_phase_number": 2},
    {"ui_phase": "analyze", "ui_phase_label": "壁打ち", "ui_phase_number": 3},
    {"ui_phase": "screen_design", "ui_phase_label": "画面デザイン", "ui_phase_number": 4},
    {"ui_phase": "backlog", "ui_phase_label": "要件確認", "ui_phase_number": 5},
    {"ui_phase": "develop", "ui_phase_label": "実装", "ui_phase_number": 6},
    {"ui_phase": "test_design", "ui_phase_label": "テスト設計", "ui_phase_number": 7},
    {"ui_phase": "test_run", "ui_phase_label": "テスト実装", "ui_phase_number": 8},
    {"ui_phase": "finalize", "ui_phase_label": "まとめ", "ui_phase_number": 9},
    {"ui_phase": "complete", "ui_phase_label": "完了", "ui_phase_number": 10}
  ]
}
```

### --flow-type省略時（レガシー）

```json
{
  "phase": "実装フェーズ",
  "status": "in_progress",
  "current_task": null,
  "progress": null,
  "total": null,
  "message": null,
  "timestamp": "2026-02-10T14:30:00+09:00",
  "ui_phase": "develop",
  "ui_phase_number": 4,
  "ui_phase_total": 8,
  "ui_phase_label": "実装"
}
```

## 注意事項

- **`/record-costs` と同じタイミングで使用する**（フェーズ開始時に両方実行）
- このファイルはPockodeのFSWatcherが監視しているため、書き込むとUIに即座に反映される
- 上書き形式のため、最新の状態のみが保持される（履歴は残らない）
