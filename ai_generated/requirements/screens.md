# 画面一覧・遷移図

## 画面一覧

| # | 画面名 | パス | 説明 |
|---|--------|------|------|
| 1 | チャット画面 | / | メイン画面。ヘッダー（DB選択）+ サイドバー（履歴）+ チャットエリア + グラフ表示 |
| 2 | DB管理モーダル | （モーダル） | DB接続先の登録・編集・削除。接続テスト機能付き |
| 3 | 初回起動ガイド | / | DB接続先未登録時に表示。DB登録を促すウェルカム画面 |

## 画面遷移図

```mermaid
stateDiagram-v2
    [*] --> 初回起動判定
    state 初回起動判定 <<choice>>
    初回起動判定 --> 初回起動ガイド: "DB接続先が0件"
    初回起動判定 --> チャット画面: "DB接続先が1件以上"
    初回起動ガイド --> DB管理モーダル: "DB接続先を登録"
    DB管理モーダル --> チャット画面: "登録完了・モーダル閉じる"
    チャット画面 --> チャット画面: "新しい会話を作成"
    チャット画面 --> チャット画面: "履歴から会話を選択"
    チャット画面 --> チャット画面: "DB接続先を切り替え"
    チャット画面 --> DB管理モーダル: "管理ボタンクリック"
```

## ワイヤーフレーム

### チャット画面

```mermaid
flowchart TB
    subgraph "DataAgent - チャット画面"
        direction TB

        subgraph "Header ヘッダー"
            Logo["DataAgent ロゴ + タイトル<br>+ バージョン表示<br>+ LLMバックエンド表示"]
            DBSelect["DB選択ドロップダウン<br>現在の接続先名を表示<br>+ 管理ボタン"]
            NewChat["新しい会話ボタン"]
        end

        subgraph "Content"
            direction LR

            subgraph "Sidebar 左サイドバー 250px"
                direction TB
                SearchBox["検索ボックス"]
                History1["履歴1: 売上の月別推移を教えて"]
                History2["履歴2: 部門別の人数は？"]
                History3["履歴3: ..."]
                HistoryNote["※ 選択中DBの会話のみ表示"]
            end

            subgraph "Main メインエリア"
                direction TB

                subgraph "ChatArea チャットエリア スクロール可能"
                    UserMsg["ユーザー: 今月の売上トップ10を教えて"]
                    AssistantMsg["アシスタント: 以下のSQLを生成しました"]
                    SQLBlock["SQL表示ブロック コード表示"]
                    ChartArea["グラフ表示エリア 棒/折れ線/円/テーブル"]
                end

                subgraph "InputArea 入力エリア 下部固定"
                    TextInput["テキスト入力フィールド"]
                    SendBtn["送信ボタン"]
                end
            end
        end
    end
```

### DB管理モーダル

```mermaid
flowchart TB
    subgraph "DB管理モーダル"
        direction TB

        subgraph "ModalHeader モーダルヘッダー"
            ModalTitle["DB接続先管理"]
            CloseBtn["閉じるボタン"]
        end

        subgraph "ConnectionList 接続先一覧"
            direction TB
            Conn1["接続先1: 本番DB<br>MySQL / db-server:3306 / sampledb<br>編集 | 削除"]
            Conn2["接続先2: 検証DB<br>PostgreSQL / test-server:5432 / testdb<br>編集 | 削除"]
        end

        subgraph "AddForm 登録・編集フォーム"
            direction TB
            FormName["接続名"]
            FormType["DB種別 MySQL / PostgreSQL / GraphQL"]
            FormDBFields["DB選択時:<br>ホスト名 / ポート番号<br>ユーザー名 / パスワード<br>データベース名"]
            FormGQLFields["GraphQL選択時:<br>エンドポイントURL"]
            TestBtn["接続テストボタン"]
            SaveBtn["保存ボタン"]
        end
    end
```

### 初回起動ガイド

```mermaid
flowchart TB
    subgraph "初回起動ガイド"
        direction TB
        WelcomeIcon["DataAgent アイコン"]
        WelcomeTitle["DataAgent へようこそ"]
        WelcomeMsg["まずDB接続先を登録してください"]
        RegisterBtn["DB接続先を登録する ボタン"]
    end
```

### UI要素の詳細

| 要素 | 説明 | 備考 |
|------|------|------|
| 接続先選択ドロップダウン | ヘッダーに配置。接続先名一覧 + 「管理」ボタン | `接続名 (mysql)` / `接続名 (graphql)` 形式で表示 |
| 接続先管理モーダル | 接続先のCRUD操作 | ドロップダウンの「管理」ボタンからアクセス |
| 接続テストボタン | DB: 接続試行、GraphQL: Introspection Query | 成功/失敗をトースト通知で表示 |
| サイドバー | 選択中DBの会話履歴一覧。クリックで会話を切り替え | 幅250px程度。折りたたみ可能 |
| チャットエリア | メッセージの表示領域 | スクロール可能。最新メッセージが下に表示 |
| SQL表示ブロック | 生成されたSQLをコードブロックで表示 | シンタックスハイライト付き |
| グラフ表示エリア | Rechartsで描画されたグラフ | LLMが自動選択した種類で表示 |
| バージョン表示 | gitハッシュ+ビルド日付のバージョン文字列 | ヘッダーのタイトル横に小さく表示 |
| LLMバックエンド表示 | 使用中のLLMバックエンド+モデル名のバッジ | 「Anthropic API / claude-sonnet-4-20250514」等 |
| 入力フィールド | 自然言語で質問を入力 | Shift+Enter で送信。Enter で改行 |
| 新しい会話ボタン | 新規会話を開始 | 現在の会話は履歴に保存 |
| エラー表示 | SQL実行エラー時のメッセージ | 「質問を変えてみてください」等のガイド付き |
| ローディング | LLM応答待ち中の表示 | ストリーミングで逐次表示 |
| 初回起動ガイド | DB接続先未登録時のウェルカム画面 | 「DB接続先を登録する」ボタンでモーダルを開く |
