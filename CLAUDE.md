# CLAUDE.md

このファイルはclaude codeが順守すべき基本ルールを提供します。詳細は `.claude/rules/` を参照。

## 前提

- 開発はウォーターフォールモデルを前提とする
- このシステムは人間の手離れが良いことを美徳とする。人間の判断が必要になるまでなるべく自動的に動き続けること
- フローチャートやシーケンス図などは、ASCIIアートで表現するのではなく、マークダウンファイル内にmermaid記法で表現すること

## 開発ワークフロー概要

壁打ちフェーズと既存ソースローカル実行フェーズはSkill（親コンテキスト実行）、それ以外はCustom Subagent（Task tool）で実行する。

**メインエージェント（SubAgentでない場合）は、ユーザーから最初のメッセージを受け取ったら、メッセージの内容に関わらず、まず `/orchestration-guide`、`/phase-workflow`、`/character` を実行すること。ユーザーのメッセージ内容から判断して手順を省略してはならない。SubAgentはこれらのSkillを実行してはならない。**

| フェーズ | 実行方式 | 動作 |
|---------|----------|------|
| 壁打ちフェーズ | Skill `/analyze` | 専門家による質問・回答ループ |
| 要件確認フェーズ | Subagent `phase-backlog` | Epic/PBI/Task定義 → 品質検証 → Issue一括登録 → 親子関係構築 |
| 実装フェーズ | Subagent `phase-develop` | PBI単位でSubagent呼出 → 各SubagentがTask実装・コミット・PR作成 → レビュー（設定に応じてユーザー/AI(`code-reviewer` + `security-reviewer`)/なし） |
| テスト設計フェーズ | Subagent `phase-test-design` | ユーザーストーリーをテストケースIssue化 |
| テスト実装フェーズ | Subagent `phase-test-run` | Playwright E2Eテスト実装 |
| 成果まとめフェーズ | Subagent `phase-finalize` | README.md作成・セッションエクスポート・コスト集計 |

## ディレクトリ構成

```
/
├── CLAUDE.md               # gaido管理（毎回上書き）
├── .claude/                # gaido管理（毎回上書き）
│   ├── agents/             # Custom Subagent定義（スキルローダー）
│   │   ├── phase-*.md      # フェーズSubagent（10ファイル、各~8行）
│   │   ├── code-reviewer.md    # コードレビューSubagent
│   │   ├── security-reviewer.md # セキュリティレビューSubagent
│   │   ├── legal-agent.md  # 法務エージェント（独立ツール）
│   │   ├── semantic-search-setup-runner.md # セマンティック検索コンテナ起動（バックグラウンド実行）
│   │   ├── semantic-search-start-indexing-runner.md # セマンティック検索インデックス構築開始（フォアグラウンド実行）
│   │   └── semantic-search-wait-indexing-runner.md # セマンティック検索インデックス完了待機（フォアグラウンド実行）
│   ├── rules/              # 常時読み込みルール
│   └── skills/             # Skill定義
│       ├── backlog-operations/   # バックログ作成手順（phase-backlogにプリロード）
│       ├── develop-operations/   # 実装手順（phase-developにプリロード）
│       ├── test-design-operations/ # テスト設計手順（phase-test-designにプリロード）
│       ├── test-run-operations/  # テスト実装手順（phase-test-runにプリロード）
│       ├── finalize-operations/  # 成果まとめ手順（phase-finalizeにプリロード）
│       ├── existing-local-run-operations/  # 既存ソースローカル実行手順（親コンテキストで実行）
│       ├── existing-source-analysis-operations/ # 既存ソース解析手順（phase-existing-source-analysisにプリロード）
│       ├── existing-doc-analysis-operations/    # 既存ドキュメント解析手順（phase-existing-doc-analysisにプリロード）
│       ├── analysis-integration-operations/     # 解析結果統合手順（phase-analysis-integrationにプリロード）
│       ├── existing-test-gen-operations/        # 既存テスト生成手順（phase-existing-test-genにプリロード）
│       ├── analyze/        # 壁打ちフェーズ（親コンテキストで実行）
│       ├── epic-workshop/  # 対話型Epic/Spike作成（独立ツール）
│       ├── legal-review/   # 契約書レビュー（独立ツール）
│       ├── legal-oss-check/  # OSSライセンスチェック（独立ツール）
│       ├── legal-policy/   # 利用規約・プライバシーポリシー生成（独立ツール）
│       ├── legal-playbook/ # 法務Playbookテンプレート
│       ├── orchestration-guide/  # オーケストレーション手順（メインエージェント専用）
│       ├── phase-workflow/      # フェーズ遷移ワークフロー（メインエージェント専用）
│       ├── character/           # キャラクター設定（メインエージェント専用）
│       ├── welcome-message/       # ウェルカムメッセージ（メインエージェント専用）
│       ├── requirements-completeness-check/ # 既存requirements充足判定（メインエージェント専用）
│       ├── requirements-intake/   # 作業内容入力（メインエージェント専用）
│       ├── test-standards/  # テストコード規約（phase-develop/test-run/reviewにプリロード）
│       ├── record-costs/   # コスト記録
│       ├── report-costs/   # コストレポート
│       ├── read-excel-design/  # Excel方眼紙設計書読み取り（proposal-initから自動呼び出し）
│       ├── semantic-search-setup/   # セマンティック検索コンテナ起動（semantic-search-setup-runnerにプリロード）
│       ├── semantic-search-start-indexing/ # セマンティック検索インデックス構築開始（semantic-search-start-indexing-runnerにプリロード）
│       ├── semantic-search-cleanup/ # セマンティック検索停止
│       ├── bug-ticket-from-user/    # 利用者対話型バグ報告（独立ツール）
│       ├── bug-tickets-from-problems/ # problems.md→Issue登録（独立ツール）
│       └── feature-request-ticket-from-user/ # 利用者対話型機能要望（独立ツール）
├── ai_generated/           # AI生成ファイル
│   ├── requirements/       # 要件ファイル（ディレクトリ）
│   │   ├── README.md       # メイン（ガイド+確定要件+設定+専門家分析）
│   │   ├── architecture.md # システム構成図
│   │   ├── file_structure.md # ディレクトリ構成
│   │   ├── db.md           # ER図
│   │   ├── screens.md      # 画面一覧・遷移図
│   │   ├── api.md          # WebAPI一覧
│   │   ├── devops.md       # デプロイ構造・コマンド
│   │   └── others.md       # その他（カテゴリ外情報）
│   ├── intermediate_files/ # 既存改修時の中間ファイル
│   │   ├── from_source/    # ソース解析結果
│   │   └── from_docs/      # ドキュメント解析結果
│   └── screenshots/        # スクリーンショット
├── docs_with_ai/           # gaido管理（毎回上書き）
│   └── multi-expert-analysis/  # 分析フレームワーク
├── existing_docs/          # 既存設計ドキュメント（既存改修時のみ）
├── output_system/          # ユーザーの実装コード
│   ├── src/               # ソースコード
│   ├── test/              # テスト
│   ├── docker-compose.yml # Output System用
│   ├── Dockerfile         # Output System用
│   └── ...
├── ssl-certificates/       # gaido管理（SSL証明書）
├── tools/                  # gaido管理（ユーティリティ）
└── pencil_template/        # gaido管理（Pencilテンプレート）
```

## コード配置規約

- **ルート階層はgaido管理領域**。CLAUDE.md、.claude/、docs_with_ai/、tools/、pencil_template/等はコンテナ起動時に毎回上書きされる。手動変更は保持されない
- **実装コードはすべて `output_system/` 配下に配置**すること（ソースコード、テスト、Dockerfile、docker-compose.yml、設定ファイル等）
- マルチリポジトリ構成の場合: `output_system_frontend/`、`output_system_backend/` のようにプレフィックス付きで分離
- ai_generated/、existing_docs/ はルート階層に残す（gaido管理外だが毎回上書きされない）
- 新規開発時: AIが `output_system/` 配下にプロジェクトを初期化する
- 既存改修時: ユーザーが事前に `output_system/` 配下にソースコードを配置する
- ビルド・テスト等のコマンドは `output_system/` を作業ディレクトリとして実行すること

## Custom Subagent一覧

| Subagent | 用途 |
|----------|------|
| `phase-backlog` | バックログ作成（Epic/PBI/Task Issue作成・検証・親子関係構築） |
| `phase-develop` | 実装（PBI単位で呼出。指定PBIのTask実装・コミット・PR作成） |
| `code-reviewer` | コードレビュー（AIレビュー設定時、PBI単位でPR差分の品質・保守性チェック・GitHub Review投稿） |
| `security-reviewer` | セキュリティレビュー（AIレビュー設定時、PBI単位でPR差分のOWASP Top 10・脆弱性チェック・GitHub Review投稿） |
| `phase-test-design` | テスト設計（テストケースIssue作成） |
| `phase-test-run` | テスト実装（E2Eテスト実装・実行） |
| `phase-finalize` | 成果まとめ（README.md作成・セッションエクスポート） |
| `legal-agent` | 法務エージェント（契約書レビュー・OSSライセンスチェック・ポリシー生成。ワークフロー内でOSSチェック自動実行、スキルとしても独立利用可能） |
| `phase-existing-source-analysis` | 既存ソース解析（ソースのみ、ドキュメント参照禁止）。内部で `call-sub-agent-using-cli` / `call-teams-using-cli` スキル経由で専門agentを起動 |
| `existing-source-analysis-filestructure-apidoc` | ソースにコメント追加→APIドキュメント→file_structure.md生成（`phase-existing-source-analysis` から起動） |
| `existing-source-analysis-db` | ソースからDB構造解析→db.md生成（`phase-existing-source-analysis` から起動） |
| `existing-source-analysis-screens` | ソースから画面構成解析→screens.md生成（`phase-existing-source-analysis` から起動） |
| `existing-source-analysis-architecture` | ソースからアーキテクチャ解析→architecture.md生成（`phase-existing-source-analysis` から起動） |
| `existing-source-analysis-openapi` | ソースからWebAPI定義解析→openapi.yaml生成（`phase-existing-source-analysis` から起動） |
| `phase-existing-doc-analysis` | 既存ドキュメント解析（ドキュメントのみ、ソース参照禁止） |
| `phase-analysis-integration` | 解析結果統合（中間ファイルから統合、原本参照禁止） |
| `phase-existing-test-gen` | 既存テスト生成（改修対象コンポーネントのunit/E2Eテスト生成） |
| `semantic-search-setup-runner` | セマンティック検索コンテナ起動（Dockerイメージ取得・コンテナ起動・モデルダウンロード。インデックス構築は含まない。バックグラウンドで実行） |
| `semantic-search-start-indexing-runner` | セマンティック検索インデックス構築開始（codebase_health確認+codebase_index開始のみ。即完了。フォアグラウンドで実行） |
| `semantic-search-wait-indexing-runner` | セマンティック検索インデックス完了待機（codebase_statusを300秒間隔でポーリング。completedになったら報告。フォアグラウンドで実行） |

## Skill一覧

| Skill | 用途 |
|-------|------|
| `/analyze` | 壁打ちフェーズ（親コンテキストで実行、AskUserQuestionによるQ&A） |
| `/existing-local-run-operations` | 既存ソースローカル実行（親コンテキストで実行、AskUserQuestionで設定確認・動作確認） |
| `/epic-workshop` | 対話でEpic+Spikeを練り上げるワークショップ（メインワークフロー外の独立ツール） |
| `/record-costs` | コスト記録（各フェーズ開始前に親が実行） |
| `/record-progress` | 進捗記録（各フェーズ開始・完了時に親が実行、`/record-costs`と同時使用） |
| `/report-costs` | コストレポート生成（finalize完了後に親が実行） |
| `/orchestration-guide` | オーケストレーション詳細手順（メインエージェント専用、開発開始時に実行） |
| `/phase-workflow` | フェーズ遷移・判断主体・コスト記録タイミング（メインエージェント専用、開発開始時に実行） |
| `/character` | キャラクター設定・メェナビの口調ルール（メインエージェント専用、開発開始時に実行） |
| `/welcome-message` | ウェルカムメッセージ・機能紹介・次アクション選択（メインエージェント専用、開発開始時に実行） |
| `/requirements-completeness-check` | 既存requirements充足判定（メインエージェント専用、既存改修時に実行） |
| `/requirements-intake` | 作業内容入力（メインエージェント専用、開発依頼内容の聞き取り） |
| `/legal-review` | 契約書・NDA等の法務文書レビュー（メインワークフロー外の独立ツール） |
| `/legal-oss-check` | OSSライセンス互換性チェック（メインワークフロー外の独立ツール） |
| `/legal-policy` | 利用規約・プライバシーポリシーのドラフト生成（メインワークフロー外の独立ツール） |
| `/bug-ticket-from-user` | 利用者との対話でGAiDoアプリのバグ情報を聞き取り、gaidoリポジトリにIssue登録（独立ツール） |
| `/bug-tickets-from-problems` | problems.mdの各項目をgaidoリポジトリのIssueとして登録（finalizeフェーズ後に実行） |
| `/feature-request-ticket-from-user` | 利用者との対話でGAiDoアプリへの機能要望を聞き取り、gaidoリポジトリにIssue登録（独立ツール） |
| `/semantic-search-setup` | セマンティック検索コンテナ起動（Dockerイメージ確認・コンテナ起動・モデルダウンロード。インデックス構築は含まない）。`semantic-search-setup-runner`エージェント経由でバックグラウンド実行 |
| `/semantic-search-start-indexing` | セマンティック検索インデックス構築開始（codebase_health確認+codebase_index開始。即return）。`semantic-search-start-indexing-runner`エージェント経由で実行 |
| `/semantic-search-cleanup` | セマンティック検索停止（Qdrant/Ollamaコンテナ停止。ボリュームは保持） |
| `test-standards` | テストコード規約（phase-develop/test-run/code-reviewerにプリロード） |
| `call-sub-agent-using-cli` | SubAgentから別agentを `claude -p` で逐次実行（SubAgent→SubAgent制限の回避策） |
| `call-teams-using-cli` | SubAgentから複数agentを `claude -p` で並列実行（SubAgent→SubAgent制限の回避策） |
| `existing-source-analysis-filestructure-apidoc-operations` | ソースコメント追加・APIドキュメント・file_structure.md生成手順（`existing-source-analysis-filestructure-apidoc` にプリロード） |
| `existing-source-analysis-db-operations` | DB構造解析手順（`existing-source-analysis-db` にプリロード） |
| `existing-source-analysis-screens-operations` | 画面構成解析手順（`existing-source-analysis-screens` にプリロード） |
| `existing-source-analysis-architecture-operations` | アーキテクチャ解析手順（`existing-source-analysis-architecture` にプリロード） |
| `existing-source-analysis-openapi-operations` | WebAPI定義解析手順（`existing-source-analysis-openapi` にプリロード） |
| `existing-source-analysis-filestructure-apidoc-teamlead-operations` | コメント付与チームリード手順（タスク管理・完了検証。`call-teams-using-cli` 経由のclaude -pがRead参照） |
| `existing-source-analysis-filestructure-apidoc-member-operations` | コメント付与メンバー手順（TSDoc/GoDoc書式ルール・ケースA/B/C分類。Agent toolがRead参照） |

## rulesファイル一覧

| ファイル | 内容 |
|---------|------|
| `rules/hallucination.md` | ハルシネーション防止（根拠提示・曖昧さ排除） |
| `rules/context7.md` | Context7 MCP使用ルール |
| `rules/constraints.md` | Docker/SSL制約・Bash実行ルール・Playwright使い分け |
| `rules/git-rules.md` | Gitコミット規約 |
| `rules/box-integration.md` | Box連携（tools/box_client.pyの使い方・CLIコマンド・エラー対応） |
