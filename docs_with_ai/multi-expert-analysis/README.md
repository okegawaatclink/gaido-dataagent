# 多視点専門家分析フレームワーク v6.0

**目的**: 複雑な意思決定や計画策定において、複数の専門家視点から深い議論を行い、Epic-PBI-Task の階層構造でアウトプットを得るためのフレームワーク

**バージョン**: 6.0

---

## 概要

V6では単一ファイルからモジュラーなディレクトリ構成に変更し、以下を実現しました：

- **スケールアウト可能**: ファイル分割で拡張・メンテナンスが容易
- **案件タイプ別対応**: 新規開発 / 保守・改修 / データ基盤 に最適化
- **GitHub連携**: Epic-PBI-Task をIssueとして自動登録
- **専門家の拡張性**: 必要に応じて専門家を追加可能

---

## ディレクトリ構成

```
multi-expert-analysis-v6/
│
├─ 00_core/                           # 不変：分析フレームワーク
│   ├─ framework.md                   # 基本原則、プロセス、収束条件
│   └─ story_format.md                # ユーザーストーリーの書き方
│
├─ 05_experts/                        # 専門家定義
│   ├─ README.md                      # 使い方・選択方法
│   ├─ core/                          # 常に参加
│   │   ├─ po.md                      # プロダクトオーナー
│   │   ├─ architect.md               # アーキテクト
│   │   ├─ qa.md                      # QA
│   │   └─ security.md                # セキュリティ
│   └─ optional/                      # 案件タイプで選択
│       └─ data_architect.md          # データアーキテクト
│
├─ 10_project/                        # プロジェクト固有情報
│   ├─ context.md                     # 基本情報、背景、スコープ
│   └─ constraints.md                 # 制約、非機能要件
│
├─ 20_patterns/                       # 案件タイプ別フロー
│   ├─ README.md                      # パターン選択ガイド
│   ├─ new_development.md             # 新規開発
│   ├─ maintenance.md                 # 保守・改修
│   └─ data_pipeline.md               # データ基盤
│
├─ 30_templates/                      # 各種テンプレート
│   ├─ README.md
│   ├─ backlog/                       # Epic/PBI/Task用
│   │   ├─ epic_template.md
│   │   ├─ pbi_template.md
│   │   └─ task_template.md
│   ├─ quality/                       # 品質関連
│   │   ├─ acceptance_criteria.md
│   │   ├─ quality_checklist.md
│   │   ├─ edge_cases.md
│   │   ├─ regression_test_flow.md
│   │   └─ sample_verification.md
│   ├─ design/                        # 設計関連
│   │   ├─ tech_selection.md
│   │   ├─ degraded_mode.md
│   │   └─ parallel_processing.md
│   ├─ operations/                    # 運用関連
│   │   ├─ cost_estimation.md
│   │   ├─ cicd_phases.md
│   │   └─ migration_strategy.md
│   ├─ documentation/                 # ドキュメント作法
│   │   ├─ reference_format.md
│   │   └─ deliverable_exit_criteria.md
│   └─ reference/                     # 比較・選択用
│       └─ testing_tools.md
│
├─ 40_automation/                     # 差し替え可能な自動化
│   ├─ README.md
│   ├─ github_issue_sync.md           # Issue登録ロジック説明
│   ├─ scripts/
│   │   ├─ create_issue.sh
│   │   ├─ update_parent_tasklist.sh
│   │   └─ writeback_issue_number.sh
│   └─ config/
│       └─ labels.json
│
└─ backlog/                           # 作業領域（一時的）
    └─ epic_001_〇〇/
        ├─ epic.md
        ├─ _analysis_log.md
        └─ pbi_001_〇〇/
            ├─ pbi.md
            └─ task_001_〇〇.md
```

---

## 専門家一覧

### Core（常に参加）

| 専門家 | 役割 | 主な責務 |
|--------|------|----------|
| **PO** | プロダクトオーナー | 価値最大化、優先順決定、コスト意識、YAGNI |
| **Architect** | アーキテクト | 技術設計、構造決定、拡張性・保守性 |
| **QA** | 品質保証 | DoD策定、狩野モデル、テスト戦略 |
| **Security** | セキュリティ | 脅威モデリング（STRIDE）、データ保護 |

### Optional（案件タイプで選択）

| 専門家 | 役割 | 追加条件 |
|--------|------|----------|
| **Data Architect** | データアーキテクト | data_pipeline パターン時 |

---

## 分析フロー

### 開始時のフロー

```
┌─────────────────────────────────────────────────────┐
│  10_project/context.md 存在する？                    │
└─────────────────────┬───────────────────────────────┘
                      │
          ┌──────────┴──────────┐
          ▼                     ▼
        [YES]                 [NO]
          │                     │
          ▼                     ▼
┌─────────────────────┐  ┌─────────────────────────┐
│ 読み込み            │  │ 新規作成のため          │
│ 不足・確認のQA投げる │  │ QA投げて情報収集        │
└─────────────────────┘  └─────────────────────────┘
          │                     │
          └──────────┬──────────┘
                     ▼
          constraints.md も同様
                     │
                     ▼
          パターン決定 → 分析開始
```

### 階層別分析フロー

```
┌─────────────────────────────────────┐
│  Epic分析                            │
│  - 全専門家参加                      │
│  - INVESTチェック                    │
│  - YAGNIチェック                     │
│  - Why（なぜやるか）の合意           │
└──────────────┬──────────────────────┘
               ▼
┌─────────────────────────────────────┐
│  PBI分析                             │
│  - 全専門家参加                      │
│  - INVESTチェック                    │
│  - DoD策定（QA主導）                 │
│  - YAGNIチェック                     │
│  - What（何を作るか）の合意          │
└──────────────┬──────────────────────┘
               ▼
┌─────────────────────────────────────┐
│  Task分析                            │
│  - 全専門家参加                      │
│  - How（どう作るか）の確定           │
└──────────────┬──────────────────────┘
               ▼
┌─────────────────────────────────────┐
│  GitHub Issue登録（CLI自動化）       │
│  - Epic: Sub-issues で PBI を管理    │
│  - PBI: Tasklist で Task を管理      │
│  - 一方向同期（md → Issue）          │
└─────────────────────────────────────┘
```

---

## 使い方

### 1. 最速で開始（AIに任せる）

```
このフレームワークを使って多視点専門家分析を実行してください。

分析対象: [ここに概要を記載]
```

AIが `context.md` の有無を確認し、必要な質問を行います。

### 2. プロジェクト情報を事前準備

1. `10_project/context.md` を記入
2. `10_project/constraints.md` を記入
3. AIに分析を依頼

```
このフレームワークを使って多視点専門家分析を実行してください。
プロジェクト情報は 10_project/ に記載済みです。
```

### 3. パターンを指定して開始

```
このフレームワークを使って多視点専門家分析を実行してください。
パターン: data_pipeline
専門家: core + data_architect

分析対象: [ここに概要を記載]
```

---

## 案件タイプ（パターン）

| パターン | 用途 | 追加専門家 |
|----------|------|-----------|
| **new_development** | 新規開発 | - |
| **maintenance** | 保守・改修 | - |
| **data_pipeline** | データ基盤（Databricks等） | data_architect |

---

## 主要なチェックポイント

### INVESTチェック（Epic/PBI）

| 項目 | 確認内容 |
|------|----------|
| **I**ndependent | 他と独立しているか |
| **N**egotiable | 交渉・調整の余地があるか |
| **V**aluable | ユーザー/ビジネス価値があるか |
| **E**stimable | 見積もり可能か |
| **S**mall | 適切なサイズか |
| **T**estable | 検証可能か |

### YAGNIチェック（Epic/PBI）

- [ ] 今この瞬間、これがないと先に進めないか？
- [ ] 作らないことで10倍以上の手戻りが発生するか？
- [ ] 推測ではなく実際の要求に基づいているか？

### 完成の定義（DoD）

QAが主導して策定。PBIごとに明確な完了基準を設定。

---

## GitHub Issue連携

### 階層構造の表現

- **Epic → PBI**: Sub-issues（GitHub Projects v2）
- **PBI → Task**: Tasklist（チェックボックス形式）

### ラベル

| ラベル | 用途 |
|--------|------|
| `Epic` | Epic Issue |
| `PBI` | PBI Issue |
| `Task` | Task Issue |

### 自動化スクリプト

```bash
# Issue作成
./40_automation/scripts/create_issue.sh backlog/epic_001/epic.md

# 親のTasklist更新
./40_automation/scripts/update_parent_tasklist.sh

# Issue番号をmdに書き戻し
./40_automation/scripts/writeback_issue_number.sh
```

---

## V5からの変更点

| 観点 | V5 | V6 |
|------|-----|-----|
| 構成 | 単一ファイル | ディレクトリ分割 |
| 専門家 | パターン固定（A, A+, B, C, D） | 個別ファイル、core/optional分離 |
| 階層 | なし | Epic-PBI-Task |
| 出力先 | mdファイル | GitHub Issues連携 |
| チェック | 品質チェックのみ | INVEST、YAGNI、DoD追加 |
| パターン | 新規/既存 混在 | 新規/保守/データ基盤 分離 |
| 自動化 | なし | 40_automation/ で差し替え可能 |

---

## 改善履歴

| バージョン | 日付 | 変更内容 |
|-----------|------|---------|
| v1.0 | 2025-12-04 | 初版作成 |
| v2.0 | 2025-12-04 | 3者検討の結果を反映 |
| v3.0 | 2025-12-04 | デフォルト設定追加、既存アプリモード追加 |
| v4.0 | 2025-12-04 | Design Review Agentフィードバック反映 |
| v5.0 | 2025-12-08 | Phase0基本設計書作成フィードバック反映 |
| v6.0 | 2025-12-25 | モジュラー構成へ全面リニューアル |

### v6.0 主な変更

1. 単一ファイル → ディレクトリ構成でスケールアウト対応
2. 専門家を個別ファイル化、core/optional分離
3. Epic-PBI-Task階層構造（ユーザーストーリーベース）
4. GitHub Issues連携（Sub-issues + Tasklist）
5. INVEST/YAGNIチェックの明示化
6. QAによるDoD策定責務の明確化
7. 案件パターン分離（new_development / maintenance / data_pipeline）
8. 自動化スクリプトの差し替え可能な設計

---

**End of README v6.0**
