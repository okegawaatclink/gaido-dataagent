---
name: orchestration-guide
description: Subagentオーケストレーション手順（メインエージェント専用、開発開始時に実行）
---

# オーケストレーション手順

壁打ちフェーズと画面デザインフェーズはSkill（`/analyze`, `/screen-design-phase`）で親コンテキスト実行、それ以外はCustom Subagent（Task tool）で実行する。親オーケストレーターはフェーズ間の遷移、コスト記録、進捗記録、ユーザー承認ゲートを担当する。

## 技術的制約

**AskUserQuestionはSubagentでは使用不可**（Claude Codeのハードコード制約）。そのため:
- 壁打ちフェーズ（iterativeなQ&A）と画面デザインフェーズ（UIキット選択・画面作成・レビューループ）はSkillとして親コンテキストで実行
- Subagentフェーズのユーザー承認は、Subagentのサマリに「ユーザー確認依頼」を含め、親がAskUserQuestionで仲介

## 共通ルール

1. **フォアグラウンド実行必須**: すべてのフェーズSubagentは `run_in_background: false`（デフォルト）で実行すること。
2. **サマリ返却**: 各Subagentは完了時にサマリを返却する。「ユーザー確認依頼」セクションが含まれる場合、親がAskUserQuestionでユーザーに確認を取る。
3. **冪等設計**: 各SubagentはGitHub Issue状態を確認してから作業を開始する。途中で中断しても再呼出で再開可能。
4. **コスト記録は親が実行**: Subagentから `/record-costs` は呼べないため、親がSubagent呼出前に実行する。
   ※ 例外: `project_advisor` / `proposal` フローではSkill自身が `/record-costs` を管理する。
5. **進捗記録は親が実行**: フェーズ開始・完了・承認待ち時に `/record-progress` で進捗を記録し、PockodeのUIに表示する。
   ※ 例外: `project_advisor` / `proposal` フローではSkill自身が `/record-progress` を管理する。

## フロータイプ管理

親オーケストレーターは以下の状態変数を管理し、全ての `/record-progress` 呼び出しに `--flow-type` と `--skip-phases` を付与すること。

### flow_type（フロータイプ）

| 値 | 設定タイミング |
|----|-------------|
| `undetermined` | 開発内容選択フェーズ開始時（初期値） |
| `new_development` | /welcome-messageで「新しいシステムを開発する」選択後 |
| `existing_modification` | /welcome-messageで「既存のシステムを改修する」選択後 |
| `tool` | /welcome-messageで非開発フロー（バグ報告、機能要望等）選択後 |
| `project_advisor` | /welcome-messageで「営業案件を相談する」選択後 |
| `proposal` | /welcome-messageで「提案書を作成する」選択後、または `/project-advisor` のGo判定後 |

### skip_phases（スキップフェーズリスト）

カンマ区切りの文字列。以下のタイミングで累積的に追加する:

| 決定ポイント | 条件 | 追加するフェーズ |
|-------------|------|----------------|
| 既存requirements充足判定後 | requirements充足 | `既存ソースローカル実行フェーズ,既存ソース解析フェーズ,既存ドキュメント解析フェーズ,解析結果統合フェーズ` |
| 既存ドキュメント解析前 | existing_docs/が空 | `既存ドキュメント解析フェーズ` |
| 壁打ちフェーズ完了後 | Pencilで画面設計しない | `画面デザインフェーズ` |

**重要**: skip_phasesは累積管理すること。一度追加したフェーズは以降の全呼び出しで常に含める。

## フェーズ実行手順

各フェーズの実行は以下の手順で行うこと:

```
1. /record-costs "<フェーズ名>"
2. /record-progress "<フェーズ名>" "starting" --flow-type {flow_type} [--skip-phases "{skip_phases}"]
3. Task(phase-xxx, "<ユーザーの開発依頼内容またはフェーズ指示>")
4. サマリ内に「### ユーザー確認依頼」セクションがあれば:
   a. /record-progress "<フェーズ名>" "waiting_approval" --flow-type {flow_type} [--skip-phases "{skip_phases}"] --message "<確認内容>"
   b. そのセクションを原文のまま出力
   c. AskUserQuestionでユーザーに確認（ユーザー承認ゲート参照）
5. /record-progress "<フェーズ名>" "completed" --flow-type {flow_type} [--skip-phases "{skip_phases}"]
6. 次フェーズの判定（/phase-workflow 参照）
```

### 進捗記録

`/record-progress` スキルを使用（詳細は `.claude/skills/record-progress/SKILL.md` 参照）:

```bash
# フェーズ開始時
/record-progress "<フェーズ名>" "starting" --flow-type {flow_type} [--skip-phases "{skip_phases}"]

# ユーザー承認待ち時
/record-progress "<フェーズ名>" "waiting_approval" --flow-type {flow_type} [--skip-phases "{skip_phases}"] --message "<確認内容>"

# フェーズ完了時
/record-progress "<フェーズ名>" "completed" --flow-type {flow_type} [--skip-phases "{skip_phases}"]
```

**注意**: `{flow_type}` と `{skip_phases}` はフロータイプ管理セクションで説明した状態変数の現在値を使う。

## 全フェーズの実行順序

以下、`{FT}` は `--flow-type {flow_type}`、`{SP}` は `--skip-phases "{skip_phases}"` の略記。skip_phasesが空の場合は `{SP}` を省略する。

```
【開発内容選択フェーズ】
  ※ flow_type = "undetermined", skip_phases = ""
0. /record-costs "開発内容選択フェーズ"
   /record-progress "開発内容選択フェーズ" "starting" {FT}

0-pre. セマンティック検索コンテナ起動（バックグラウンド・GitHub連携時のみ）:
    Bashで以下を実行し、現在のGitHub設定状況を確認する（ファイル優先・env varフォールバック）:
    ```bash
    GITHUB_CONFIG_FILE="/workspace/gaido-github-config/github-config.json"
    if [ -f "$GITHUB_CONFIG_FILE" ]; then
        python3 -c "import json; d=json.load(open('$GITHUB_CONFIG_FILE')); print('GITHUB_ENABLED=' + ('true' if d.get('enabled') else 'false'))"
    else
        echo "GITHUB_ENABLED=${GITHUB_ENABLED:-false}"
    fi
    ```
    GITHUB_ENABLED=true の場合のみ以下を実行する:
    Task(semantic-search-setup-runner, "セマンティック検索のコンテナを起動してください（インデックス構築は不要）", background=true)
    → このTaskはバックグラウンドで実行される。Qdrant/Ollamaコンテナ起動+Embeddingモデルダウンロードのみ行う
    → セットアップ完了を待たずに次のステップへ進む
    → セットアップ失敗の場合: セマンティック検索なしで続行する（通常のgrep/glob検索で代替可能）。ユーザーへの通知は不要
    GITHUB_ENABLED=false の場合: このステップをスキップする（アプリ開発を行わないためセマンティック検索は不要）

   /welcome-message（Skill: 親コンテキストでメェナビ自己紹介 → 次アクション選択）
   /record-progress "開発内容選択フェーズ" "completed" {FT}
   → 選択結果に応じてflow_typeを確定:
     - 「新しいシステムを開発する」→ flow_type = "new_development"
     - 「既存のシステムを改修する」→ flow_type = "existing_modification"
     - 「営業案件を相談する」→ flow_type = "project_advisor"
       ※ 確定したflow_typeでui_phasesを上書きするため、意図的に2回目のcompleted記録を行う
       /record-progress "開発内容選択フェーズ" "completed" --flow-type project_advisor
       /project-advisor を実行（進捗記録・コスト記録はSkill自身が管理）
       → 終了（/project-advisorのGo判定で /proposal-init に自動遷移する場合あり）

     - 「提案書を作成する」→ flow_type = "proposal"
       ※ 確定したflow_typeでui_phasesを上書きするため、意図的に2回目のcompleted記録を行う
       /record-progress "開発内容選択フェーズ" "completed" --flow-type proposal
       /proposal-init を実行（進捗記録・コスト記録はSkill自身が管理）
       → 終了

     - その他（バグ報告、機能要望等）→ flow_type = "tool"（進捗記録終了）

【既存requirements充足判定フェーズ（既存改修の場合のみ）】
0a. /record-costs "既存requirements充足判定フェーズ"
    /record-progress "既存requirements充足判定フェーズ" "starting" {FT}
    /requirements-completeness-check（Skill: 親コンテキストでrequirements充足判定）
    /record-progress "既存requirements充足判定フェーズ" "completed" {FT}
    → requirements充足の場合: skip_phasesに "既存ソースローカル実行フェーズ,既存ソース解析フェーズ,既存ドキュメント解析フェーズ,解析結果統合フェーズ" を追加
    → 人間の判断に応じてphase-workflowに従い進行

【既存プロジェクト解析フェーズ（既存改修で解析実行の場合のみ）】
0b. /record-costs "既存ソースローカル実行フェーズ"
    /record-progress "既存ソースローカル実行フェーズ" "starting" {FT} {SP}
    /existing-local-run-operations（Skill: 親コンテキストで実行。AskUserQuestionで設定確認・動作確認を直接実施）
    → Skill完了サマリ返却（動作確認OK/NGはSkill内で解決済み）
    → 起動失敗でユーザーが「スキップ」を選択した場合のみ次へ進む
    /record-progress "既存ソースローカル実行フェーズ" "completed" {FT} {SP}

0b-post. セマンティック検索の利用確認:
    コードベースのファイル数を計測: find output_system/ -type f | wc -l
    ファイル数に基づき推奨を判定:
      - 小規模（〜数百ファイル）: 「利用しない」を推奨
      - 中規模（数百〜1000ファイル）: 「利用しない」を推奨
      - 大規模（1000ファイル以上）: 「利用する」を推奨

    AskUserQuestionでユーザーに確認:
      header: "セマンティック検索"
      question: "セマンティック検索を利用しますか？\n※ インデックス構築が必要なため、CPU負荷が高くなり完了まで数分〜数十分かかります"
      options:
        - 大規模の場合: "(A) 利用する ← 大規模コードベースのため推奨" / "(B) 利用しない"
        - 中規模の場合: "(A) 利用する" / "(B) 利用しない ← 中規模コードベースのため推奨"
        - 小規模の場合: "(A) 利用する" / "(B) 利用しない ← 小規模コードベースのため推奨"

    → (A)の場合:
      Task(semantic-search-start-indexing-runner, "セマンティック検索のインデックス構築を開始してください")
      → codebase_health確認+codebase_index開始のみ。即完了する（フォアグラウンド実行）
      → 構築開始失敗の場合: セマンティック検索なしで続行する
      → 構築開始成功の場合: 実際のembedding生成はMCPサーバー側で非同期進行。そのまま次のステップへ進む
      → 完了確認は既存テスト生成フェーズ直前（10a-pre）で行う
    → (B)の場合: インデックス構築をスキップ

0c. /record-costs "既存ソース解析フェーズ"
    /record-progress "既存ソース解析フェーズ" "starting" {FT} {SP}
    AskUserQuestionで確認:
      header: "Step A: コメント付与・APIドキュメント生成"
      question: "ソースコードにコメント付与とAPIドキュメント生成を行いますか？\n生成することで既存の構造の解析精度が向上しますが、システム規模により数時間〜数日かかります。\n生成しなくても既存システムの改修自体は可能です。"
      options:
        - "実行する": "ソースコードにコメントを付与し、APIドキュメントを生成する（推奨）"
        - "スキップする": "コメント付与・APIドキュメント生成をスキップし、構造解析のみ行う"
    → 「実行する」の場合:
      Task(phase-existing-source-analysis, "ソースコードのみを解析し、ai_generated/intermediate_files/from_source/に出力してください。ドキュメント参照禁止")
    → 「スキップする」の場合:
      Task(phase-existing-source-analysis, "ソースコードのみを解析し、ai_generated/intermediate_files/from_source/に出力してください。ドキュメント参照禁止。Step A（コメント付与・APIドキュメント生成）はスキップしてください。ただしStep 5（file_structure.md生成）は実行してください")
    /record-progress "既存ソース解析フェーズ" "completed" {FT} {SP}

0d. existing_docs/ の存在・内容を確認。ドキュメントがある場合のみ:
    /record-costs "既存ドキュメント解析フェーズ"
    /record-progress "既存ドキュメント解析フェーズ" "starting" {FT} {SP}
    Task(phase-existing-doc-analysis, "ドキュメントのみを解析し、ai_generated/intermediate_files/from_docs/に出力してください。ソース参照禁止")
    /record-progress "既存ドキュメント解析フェーズ" "completed" {FT} {SP}
    ドキュメントがない場合: skip_phasesに "既存ドキュメント解析フェーズ" を追加

0e. /record-costs "解析結果統合フェーズ"
    /record-progress "解析結果統合フェーズ" "starting" {FT} {SP}
    Task(phase-analysis-integration, "ai_generated/intermediate_files/の解析結果を統合し、ai_generated/requirements/に出力してください。原本参照禁止")
    → サマリに「ユーザー確認依頼」があればAskUserQuestionで確認
    /record-progress "解析結果統合フェーズ" "completed" {FT} {SP}

【作業内容入力フェーズ】
0f. /record-costs "作業内容入力フェーズ"
    /record-progress "作業内容入力フェーズ" "starting" {FT} {SP}
    /requirements-intake（Skill: 親コンテキストで作業内容を聞き取り）
    /record-progress "作業内容入力フェーズ" "completed" {FT} {SP}

【設計フェーズ】
1. /record-costs "壁打ちフェーズ"
2. /record-progress "壁打ちフェーズ" "starting" {FT} {SP}
3. /analyze（Skill: 親コンテキストでQ&A実行） → 要件確定
   - 新規開発: 「パターン: new_development。{/requirements-intakeで取得した開発依頼内容}」
   - 既存改修: 「パターン: maintenance。{/requirements-intakeで取得した改修内容}」
4. /record-progress "壁打ちフェーズ" "completed" {FT} {SP}
5. 新規開発の場合のみ: サマリに「画面設計: Pencilで設計」が含まれる場合:
   a. /record-costs "画面デザインフェーズ"
   b. /record-progress "画面デザインフェーズ" "starting" {FT} {SP}
   c. /screen-design-phase（Skill: 親コンテキストで実行）
   d. /record-progress "画面デザインフェーズ" "completed" {FT} {SP}
6. 既存改修の場合 or 含まれない場合: skip_phasesに "画面デザインフェーズ" を追加
7. /record-costs "要件確認フェーズ"
8. /record-progress "要件確認フェーズ" "starting" {FT} {SP}
9. Task(phase-backlog) → サマリ返却
9a. Task(legal-agent, "タスク種別: oss-check, 対象: Backlog（PBI/Task Issue）に記載された技術・ライブラリのライセンス互換性を確認してください。要件ファイル ai_generated/requirements/ も参照してください")
9b. backlogサマリとOSSチェック結果をユーザーに提示し、承認を取得
    - 「作成したBacklogを確認してください」とIssue一覧を提示
    - RED/YELLOW判定がある場合はその旨を明記
10. /record-progress "要件確認フェーズ" "completed" {FT} {SP}

【既存テスト生成（既存改修の場合のみ）】
10a-pre. セマンティック検索インデックス完了確認（0b-postで「利用する」を選択した場合のみ）:
    mcp__socraticode__codebase_status で構築状態を確認
    → completed: そのまま次へ進む
    → それ以外（in_progress等）:
      AskUserQuestionでユーザーに確認:
        header: "インデックス構築"
        question: "セマンティック検索のインデックス構築がまだ完了していません"
        options:
          - "(A) 完了まで待つ"
          - "(B) セマンティック検索を中止して進む"
      → (A): Task(semantic-search-wait-indexing-runner, "codebase_statusがcompletedになるまでポーリングしてください")
            フォアグラウンド実行。完了したら次へ進む
      → (B): /semantic-search-cleanup でQdrant/Ollamaコンテナを停止。セマンティック検索なしで続行

10a. /record-costs "既存テスト生成フェーズ"
     /record-progress "既存テスト生成フェーズ" "starting" {FT} {SP}
     Task(phase-existing-test-gen, "既存コードに対するunit & e2eテストを生成してください。カバレッジ80-90%目標")
     /record-progress "既存テスト生成フェーズ" "completed" {FT} {SP}

【開発フェーズ】
11. /record-costs "実装フェーズ"
12. /record-progress "実装フェーズ" "starting" {FT} {SP}
13. コードレビュー設定を確認: ai_generated/requirements/README.md の「開発プロセス設定」セクションを読む
14. Epic一覧取得・ソート:
    gh issue list --label "epic" --state open --json number,title --limit 100
    → Epic番号の昇順でソート
15. Epic番号順にループ:
    a. Epic Issue本文からPBI一覧を取得・PBI番号順ソート
    b. PBI番号順にループ（ユーザーへの表示はIssueタイトルのPBI番号を使用。例: 「PBI 1.2（#2084）」）:
       - Task(phase-develop, "PBI #N（タイトル）のTask Issueに基づいて実装を進めてください。対象PBI Issue: #N")
       - サマリからPR番号を取得
       - 【ユーザーレビューの場合】AskUserQuestionでPR URLを提示しレビュー・マージ待ち
         - 「マージ」→ 次のPBIへ
         - 「修正が必要」→ PBI実装時のphase-developをresumeして修正指示を含めて再呼出
       - 【AIレビューの場合】AIレビューループ（最大3回）:
         1. Task(code-reviewer, "PR #X をコードレビューしてください。対象PR: #X")
         2. Task(security-reviewer, "PR #X のセキュリティレビューを行ってください。対象PR: #X")
         3. 両サブエージェントの返却サマリを確認:
            - 両方ともCritical/Highなし → ループ終了（Medium/LOWはそのままマージ）
            - いずれかにCritical/Highあり → PBI実装時のphase-developをresumeして修正を依頼し、1に戻る（片方だけの指摘でも修正後は必ず両方再実行）
              Task(phase-develop, "修正が必要: PR #X のレビューコメントを確認し、Critical/Highの指摘事項を修正してください。対象PR: #X", resume=agent_id)
         4. 3回レビューしてもCritical/Highが残る場合 → AskUserQuestionでユーザーに状況報告し判断を仰ぐ
         5. AIレビュー通過後 → 親が `gh pr merge --merge --delete-branch` でマージ
       - 【レビューなしの場合】親が `gh pr merge --merge --delete-branch` で即マージ
    c. Epic配下の全PBI完了後: gh issue close <epic_number>
16. 全Epic完了後:
    a. Task(legal-agent, "タスク種別: oss-check, 対象: プロジェクトの実際の依存関係ファイルをスキャンし、ライセンス互換性を確認してください")
    b. 実装サマリと動作確認方法を提示（OSSチェック結果を含める。Webシステムの場合は `rules/instance-config.md` のフロントエンドURLのMarkdownリンクを含める）
       - RED/YELLOW判定がある場合はその旨を明記
    c. AskUserQuestionで動作確認結果を確認
17. /record-progress "実装フェーズ" "completed" {FT} {SP}

【テストフェーズ】
18. /record-costs "テスト設計フェーズ"
19. /record-progress "テスト設計フェーズ" "starting" {FT} {SP}
20. Task(phase-test-design) → サマリ返却 → 親がユーザーにテスト要件確認
21. /record-progress "テスト設計フェーズ" "completed" {FT} {SP}
22. /record-costs "テスト実装フェーズ"
23. /record-progress "テスト実装フェーズ" "starting" {FT} {SP}
24. Task(phase-test-run) → テスト結果サマリ返却
24a. Task(legal-agent, "タスク種別: oss-check, 対象: プロジェクトの実際の依存関係ファイル（package.json等）をスキャンし、ライセンス互換性を最終確認してください")
24b. サマリ内にRED/YELLOW判定がある場合: AskUserQuestionでユーザーに報告し判断を仰ぐ
25. /record-progress "テスト実装フェーズ" "completed" {FT} {SP}

【完了フェーズ】
26. /record-costs "成果まとめフェーズ"
27. /record-progress "成果まとめフェーズ" "starting" {FT} {SP}
28. Task(phase-finalize) → 成果物サマリ返却
29. /record-progress "成果まとめフェーズ" "completed" {FT} {SP}
30. /report-costs → コストレポート生成
31. /record-progress "完了" "completed" {FT} {SP} --message "全ての作業が完了しました"
```

## Skill/Subagent呼出のプロンプト指針

- **`/welcome-message`**（Skill）: 引数なし。開発内容選択フェーズで実行
- **`/requirements-completeness-check`**（Skill）: 引数なし。既存改修時にrequirements充足判定
- **`/requirements-intake`**（Skill）: 引数なし。作業内容入力フェーズで実行
- **`/analyze`**（Skill）: 新規開発の場合「パターン: new_development。{/requirements-intakeで取得した開発依頼内容}」、既存改修の場合「パターン: maintenance。{/requirements-intakeで取得した改修内容}」
- **`/screen-design-phase`**（Skill）: 引数なし。analyzeサマリに「画面設計: Pencilで設計」が含まれる場合のみ実行
- **phase-backlog**: 「要件ファイル ai_generated/requirements/ に基づいてバックログを作成してください」
- **phase-develop**: 「PBI #{番号}（{タイトル}）のTask Issueに基づいて実装を進めてください。対象PBI Issue: #{番号}」（PBI単位でループ呼出）
- **code-reviewer**: 「PR #{番号} をコードレビューしてください。対象PR: #{番号}」（AIレビューの場合のみ、PBI単位でループ呼出）
- **security-reviewer**: 「PR #{番号} のセキュリティレビューを行ってください。対象PR: #{番号}」（AIレビューの場合のみ、PBI単位でループ呼出）
- **/existing-local-run-operations**（Skill）: 引数なし。既存システムのローカル起動・動作確認（AskUserQuestionで設定確認・動作確認を直接実施）
- **semantic-search-start-indexing-runner**: 「セマンティック検索のインデックス構築を開始してください」（フォアグラウンド実行。codebase_health確認+codebase_index開始のみ、即完了）
- **semantic-search-wait-indexing-runner**: 「codebase_statusがcompletedになるまでポーリングしてください」（フォアグラウンド実行。300秒間隔でポーリング）
- **phase-existing-source-analysis**: 「ソースコードのみを解析し、ai_generated/intermediate_files/from_source/に出力してください。ドキュメント参照禁止」（ASKでStep Aスキップが選択された場合は末尾に「Step A（コメント付与・APIドキュメント生成）はスキップしてください。ただしStep 5（file_structure.md生成）は実行してください」を追加）
- **phase-existing-doc-analysis**: 「ドキュメントのみを解析し、ai_generated/intermediate_files/from_docs/に出力してください。ソース参照禁止」
- **phase-analysis-integration**: 「ai_generated/intermediate_files/の解析結果を統合し、ai_generated/requirements/に出力してください。原本参照禁止」
- **phase-existing-test-gen**: 「既存コードに対するunit & e2eテストを生成してください。カバレッジ80-90%目標」
- **phase-test-design**: 「closedのPBI Issueからテストケースを設計してください」
- **phase-test-run**: 「openのテストケースIssueに基づいてE2Eテストを実装してください」
- **phase-finalize**: 「成果物をまとめてください」
- **legal-agent（Backlog後）**: 「タスク種別: oss-check, 対象: Backlog（PBI/Task Issue）に記載された技術・ライブラリのライセンス互換性を確認してください」
- **legal-agent（実装完了後）**: 「タスク種別: oss-check, 対象: プロジェクトの実際の依存関係ファイルをスキャンし、ライセンス互換性を確認してください」
- **legal-agent（テスト後）**: 「タスク種別: oss-check, 対象: プロジェクトの実際の依存関係ファイルをスキャンし、ライセンス互換性を最終確認してください」
- **/project-advisor**（Skill）: 引数なし。営業案件アドバイザーフロー全体を実行。進捗・コスト記録はSkill自身が管理
- **/proposal-init**（Skill）: 引数なし。提案書作成フロー全体を実行。進捗・コスト記録はSkill自身が管理

## ユーザー承認ゲート（親が担当）

Subagentのサマリに「ユーザー確認依頼」が含まれている場合、親はAskUserQuestionでユーザーに確認を取る。

| フェーズ | 確認内容 | ユーザー選択肢 | 条件 |
|---------|---------|---------------|------|
| existing-local-run成功後 | Skill内でAskUserQuestionにより直接処理 | — | — |
| backlog完了後 | バックログ一覧の確認・実装開始承認 | 「実装開始」/「修正が必要」 | 常時 |
| develop PBI完了ごと | PR内容のレビュー・マージ承認 | 「マージ」/「修正が必要」 | ユーザーレビューの場合のみ |
| develop全PBI完了後 | 動作確認・テスト設計承認 | 「テストへ進む」/「変更が必要」 | 常時 |
| test-design完了後 | テストケース一覧の確認 | 「テスト実装へ進む」/「追加が必要」 | 常時 |

- 「修正が必要」「変更が必要」「追加が必要」の場合: ユーザーの指示内容をプロンプトに含めて同じSubagentを再呼出
- 承認の場合: 次フェーズへ遷移
- AIレビューの場合: develop PBI間はAIレビュー（code-reviewer + security-reviewer）→ 自動修正ループ → 通過後に親がマージ → 全PBI完了後のみ動作確認ゲート
- レビューなしの場合: develop PBI完了ごとに親が即マージ → 全PBI完了後のみ動作確認ゲート

## エラーリカバリ

1. Subagentがエラーで停止した場合: **同じプロンプトで再呼出**（冪等設計のため安全）
2. 再呼出でも解決しない場合: ユーザーにエラー内容を報告し、対応を相談
3. フェーズの途中で中断した場合: 再呼出でGitHub Issue状態から自動的に再開

## 結果検証

各フェーズ完了後、親は以下のコマンドで結果を検証できる:

| フェーズ | 検証コマンド |
|---------|------------|
| backlog | `gh issue list --label epic,pbi,task --state all` |
| develop | `gh issue list --label task --state open` (0件であること) |
| code-reviewer / security-reviewer | PRコメントにレビュー結果が投稿されていること |
| test-design | `gh issue list --label test-case --state all` |
| test-run | `gh issue list --label test-case --state open` (0件であること) |
| finalize | `git log --oneline -5` (README.mdコミットあること) |
| legal-agent（各段階） | サマリのJSON内 `risk_level` を確認（green/yellow/red） |
