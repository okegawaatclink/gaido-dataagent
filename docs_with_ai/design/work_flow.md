# 運用の流れ

## GAiDoコンポーネントとの対応

以下のシーケンス図は抽象的な参加者名を使用している（ターゲットリポジトリにもコピーされるため）。
GAiDoシステムにおける各参加者の実体は以下の通り:

| ワークフロー参加者 | GAiDoコンポーネント | 補足 |
|---|---|---|
| ユーザー | Pockode UI（ブラウザ/webview） | メッセージ送信、レビュー、承認/却下 |
| オーケストレーター | Pockode ChatClient + Claude Code | 会話フロー管理、タスク分解 |
| 要件/設計/タスク作成 | Claude Code + MCP tools + Project system | 設計書・Issue・タスク作成 |
| Github操作 | Claude Code（gh CLI）+ Pockode gitネームスペース | commit, push, PR |
| 実装 | Claude Code（workerエージェント） | コーディング、テスト、デプロイ |
| クラウド/実行環境 | Dockerコンテナ（DooD）+ Output Systemコンテナ | ターゲットシステムのビルド・実行 |

ランタイムアーキテクチャの詳細は [runtime_architecture.md](../../docs/concept/runtime_architecture.md) を参照。

## ワークフロー

```mermaid
sequenceDiagram
    participant User as ユーザー
    participant Orch as オーケストレーター<br/>(人間とのやり取り)
    participant ReqDesign as 要件/設計/<br/>タスク作成
    participant GHOps as Github操作
    participant Impl as 実装
    participant GH as Github
    participant Cloud as クラウド/<br/>実行環境

    %% 要件定義フェーズ
    rect rgba(200, 220, 255, 0.3)
        note over User, ReqDesign: 要件定義フェーズ
        User->>Orch: 要求を伝える
        Orch->>ReqDesign: 要求を伝える
        ReqDesign->>Orch: 要件にするためにQA
        Orch->>User: 要件にするためにQA
        User->>Orch: QA回答
        Orch->>ReqDesign: QA回答
        ReqDesign->>Orch: 設計書/タスク一覧
        Orch->>User: 設計書/タスク一覧
        User->>User: 要件/設計/タスクチェック<br/>OK判断
        User->>Orch: issue登録
        Orch->>GHOps: issue登録
        GHOps->>GH: issue登録
    end

    %% 実装フェーズ（ループ）
    rect rgba(220, 255, 220, 0.3)
        note over User, Cloud: 実装フェーズ
        loop issue数
            User->>Orch: issue開始指示
            Orch->>GHOps: issue取得
            GHOps->>GH: issue取得
            GH->>GHOps: issue情報提供
            GHOps->>Orch: issue情報提供
            Orch->>Impl: issue実装
            Impl->>Impl: 実装/単体コード
            Impl->>Impl: 静的チェック/<br/>コードレビュー
            Orch->>GHOps: commit/push
            GHOps->>GH: commit/push
            Impl->>Cloud: デプロイ
            Orch->>User: 完了通知
        end
    end

    %% テスト設計フェーズ
    rect rgba(255, 220, 220, 0.3)
        note over User, ReqDesign: テスト設計フェーズ
        User->>Orch: 試験実施指示
        Orch->>ReqDesign: 試験実施指示
        ReqDesign->>ReqDesign: 要件・設計確認
        ReqDesign->>ReqDesign: テスト設計/<br/>テストケース作成
        ReqDesign->>Orch: テストタスク一覧
        Orch->>User: テストタスク一覧
        User->>User: 要件/設計/タスクチェック<br/>OK判断
        User->>GHOps: issue登録
        GHOps->>GH: issue登録
    end

    %% テスト実装フェーズ（ループ）
    rect rgba(255, 255, 200, 0.3)
        note over User, Cloud: テスト実装フェーズ
        loop issue数
            User->>Orch: issue開始指示
            Orch->>GHOps: issue取得
            GHOps->>GH: issue取得
            GH->>GHOps: issue情報提供
            GHOps->>Orch: issue情報提供
            Orch->>Impl: issue実装
            Impl->>Impl: テストコード実装<br/>(E2E系)
            Impl->>Impl: 静的チェック/<br/>コードレビュー
            Impl->>Cloud: テスト実行
            Orch->>GHOps: commit/push
            GHOps->>GH: commit/push
            Orch->>User: 完了通知
        end
    end

    %% リリースフェーズ
    rect rgba(230, 200, 255, 0.5)
        note over User, Cloud: リリースフェーズ
        User->>Orch: release指示
        Orch->>Impl: release指示
        Impl->>GH: ブランチmerge or tag付け
        Impl->>Cloud: デプロイ処理
        Cloud->>Impl: 完了通知
        Impl->>Orch: 完了通知
        Orch->>User: 完了通知
        User->>User: 動作確認
    end
```
