# エージェント活動レポート

生成日時: 2026-04-21 16:53:47 JST

## サマリ

| 項目 | 値 |
|------|-----|
| 登録スキル数 | 50 |
| 使用スキル数（明示呼出） | 6 |
| 使用スキル数（プリロード） | 1 |
| 使用スキル数（Read経由） | 0 |
| 未使用スキル数 | 43 |
| SubAgent呼出回数 | 1 |

## SubAgent呼出一覧

| # | SubAgent | 呼出元 | 時刻(JST) | プリロードスキル | 概要 |
|---|----------|--------|-----------|-----------------|------|
| 1 | semantic-search-setup-runner | main | 18:27 | semantic-search-setup | Start semantic search container |

## agent-ID対応表

| agent-ID | SubAgent |
|----------|----------|
| agent-a011bb01dca160e72 | semantic-search-setup-runner |

## 明示的に呼び出されたスキル

| スキル名 | 呼出回数 | 呼出元 | 初回 | 最終 |
|----------|---------|--------|------|------|
| character | 1 | main | 18:26 | 18:26 |
| orchestration-guide | 1 | main | 18:26 | 18:26 |
| phase-workflow | 1 | main | 18:26 | 18:26 |
| record-costs | 1 | main | 18:27 | 18:27 |
| record-progress | 1 | main | 18:27 | 18:27 |
| welcome-message | 1 | main | 18:27 | 18:27 |

## SubAgentにプリロードされたスキル

| スキル名 | プリロード先 | プリロード回数 |
|----------|-------------|---------------|
| semantic-search-setup | semantic-search-setup-runner | 1 |

## Read経由で読み込まれたスキル

Read経由で読み込まれたスキルはありませんでした。

## 未使用スキル

| スキル名 | 説明 |
|----------|------|
| analysis-integration-operations | 解析結果統合の手順。中間ファイルを統合しrequirements/に出力する。差異があればユーザー確認依頼を含める。 |
| analyze | 壁打ちフェーズ。マルチエキスパート分析で要件を深掘りし、要件ファイルを作成する。 |
| backlog-operations | バックログ作成の手順。Epic/PBI/Task定義、品質検証、Issue一括登録、親子関係構築の全ステップをガイドする。 |
| bug-ticket-from-user | 利用者との対話でGAiDoアプリ自体のバグ情報を聞き取り、gaidoリポジトリにIssue登録する。 |
| bug-tickets-from-problems | problems.mdの各項目をgaidoリポジトリのIssueとして1件ずつ登録する。finalizeフェーズ後に実行。 |
| call-sub-agent-using-cli | SubAgentから別のagentをclaude -pで逐次実行する。SubAgentからSubAgentを呼べない制限の回避策。 |
| call-teams-using-cli | SubAgentから複数agentをclaude -pで並列実行する。SubAgentからSubAgentを呼べない制限の回避策。 |
| deal-feedback | 案件の受注/失注/辞退結果を記録する振り返りレポート作成スキル。welcome-messageの「営業支援」→「案件の振り返りを記録する」で呼び出す。 |
| develop-operations | 実装フェーズの手順。PBI特定、環境確認、Task実装ループ、コミット、PR作成、HANDOVER作成の全ステップをガイドする。 |
| epic-workshop | 対話でPBI+Spikeを練り上げるワークショップ。技術検討・比較を含む対話型Issue作成。 |
| existing-doc-analysis-operations | 既存ドキュメント解析の手順。ドキュメントのみを解析しrequirements形式の中間ファイルを生成する。 |
| existing-local-run-operations | 既存ソースローカル実行の手順。既存システムのビルド・起動・動作確認を行い、devops情報を記録する。 |
| existing-source-analysis-architecture-operations | ソースコードからアーキテクチャを解析し、architecture.mdを生成する手順。 |
| existing-source-analysis-db-operations | ソースコードからDB構造を解析し、db.mdを生成する手順。 |
| existing-source-analysis-filestructure-apidoc-member-operations | ソースコメント付与のメンバー手順。1ファイルを受け取り、コメント・ドキュメントを追加する。 |
| existing-source-analysis-filestructure-apidoc-operations | ソースコードにコメント・ドキュメントを追加し、APIドキュメントとfile_structure.mdを生成する手順。 |
| existing-source-analysis-filestructure-apidoc-teamlead-operations | ソースコメント付与のチームリード手順。タスク管理・メンバー割り当て・完了検証を行う。 |
| existing-source-analysis-openapi-operations | ソースコードからWebAPI定義を解析し、openapi.yamlを生成する手順。 |
| existing-source-analysis-operations | 既存ソース解析の手順。ソースコードのみを解析しrequirements形式の中間ファイルを生成する。 |
| existing-source-analysis-screens-operations | ソースコードから画面構成を解析し、screens.mdを生成する手順。 |
| existing-test-gen-operations | 既存テスト生成の手順。既存コードに対するunit/E2Eテストを生成し、カバレッジ80-90%を目標とする。 |
| feature-request-ticket-from-user | 利用者との対話でGAiDoアプリ自体への機能要望を聞き取り、gaidoリポジトリにIssue登録する。 |
| finalize-operations | 成果まとめフェーズの手順。README.md作成、mermaid検証、セッションログエクスポート、活動レポート生成、実装振り返り、コミット＆プッシュ、成果物一覧返却の全ステップをガイドする。 |
| frontend-design | Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when the user asks to build web components, pages, or applications. Generates creative, polished code that avoids generic AI aesthetics. |
| legal-oss-check | プロジェクトのOSSライセンス互換性をチェック。依存関係のライセンス一覧とリスク判定を生成。 |
| legal-policy | Webサービス等の利用規約・プライバシーポリシーのドラフトを対話で生成。 |
| legal-review | 契約書・NDA等の法務文書をPlaybookに基づきレビュー。GREEN/YELLOW/RED判定とredline提案を生成。 |
| pencil-draw | Pencil MCPを使ったデザイン操作のリファレンス。screen-design-phaseスキル等から参照される。 |
| playwright-cli | Automate browser interactions, test web pages and work with Playwright tests. |
| project-advisor | 案件ヒアリング・スコアリング・判定を行うAI案件アドバイザー。営業案件の対応可否を定量的に評価する。 |
| proposal-init | 提案書ワークスペースの初期化とストーリー壁打ち。RFP等の入力資料を読み込み、対話でスライド構成を練り上げる。 |
| read-excel-design | Excel方眼紙設計書(.xlsx)のdrawingML(XML)をAIが直接読み取り、設計内容を意味理解してサマリを生成する内部スキル。proposal-initから自動呼び出しされる。 |
| report-costs | コスト集計レポートを生成しREADME.mdに追記。全作業完了後に使用。 |
| requirements-completeness-check | 既存requirements充足判定フェーズ。既存改修時にai_generated/requirements/の充足状況を調査し、人間にスキップ/解析実行を判断させる（メインエージェント専用） |
| requirements-intake | 作業内容入力フェーズ。自然文でシステム開発・改造の全体像を聞き取り、ai_generated/requirements/intake_notes.mdに保存する（メインエージェント専用） |
| rfp-qa-generator | RFP・ヒアリング結果から4観点の質疑一覧を自動生成し、Excel/Markdown出力・顧客回答取込・提案反映まで一気通貫で行う。 |
| screen-design-phase | 画面デザインフェーズ。Pencilで詳細な画面設計を行い、人間のレビューを受ける。 |
| semantic-search-cleanup | SocratiCodeのQdrant/Ollamaコンテナを停止する。セマンティック検索が不要になったときに使用。 |
| semantic-search-start-indexing | SocratiCodeのMCPツールでインデックス構築を開始する。codebase_indexは即returnし、実際の構築はMCPサーバー側で非同期実行される。 |
| slide-generator | story.mdとHTMLデザインを参考にpython-pptxでPowerPointファイルを生成。テキスト・テーブル・図の埋め込みに対応。 |
| test-design-operations | テスト設計フェーズの手順。PBIユーザーストーリー収集、テストケースIssue作成、追加テストケース提案の全ステップをガイドする。 |
| test-run-operations | テスト実装フェーズの手順。Playwright E2Eテスト実装、実行、コミット、Issue close、サマリ返却の全ステップをガイドする。 |
| test-standards | テストコード規約。ディレクトリ構成・命名規約・コメント規約・テンプレート・網羅性ルールを定義。 |
