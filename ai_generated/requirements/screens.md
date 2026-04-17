# 画面一覧・遷移図

## 画面一覧

| # | 画面名 | パス | 説明 |
|---|--------|------|------|
| 1 | チャット画面 | / | メイン画面。サイドバー（履歴）+ チャットエリア + グラフ表示 |
| 2 | 設定画面 | /settings | データソース切り替え、OpenAPI Spec登録・管理 |

## 画面遷移図

```mermaid
stateDiagram-v2
    [*] --> チャット画面
    チャット画面 --> チャット画面: "新しい会話を作成"
    チャット画面 --> チャット画面: "履歴から会話を選択"
    チャット画面 --> 設定画面: "設定ボタン押下"
    設定画面 --> チャット画面: "戻るボタン押下"
    設定画面 --> 設定画面: "OpenAPI Spec登録/削除"
```

## ワイヤーフレーム

### チャット画面

```mermaid
flowchart TB
    subgraph "DataAgent - チャット画面"
        direction TB

        subgraph "Header"
            Logo["DataAgent ロゴ + タイトル"]
            DataSourceBadge["データソース表示バッジ<br>DB: MySQL / API: API名"]
            SettingsBtn["設定ボタン"]
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
            end

            subgraph "Main メインエリア"
                direction TB

                subgraph "ChatArea チャットエリア スクロール可能"
                    UserMsg["ユーザー: 今月の売上トップ10を教えて"]
                    AssistantMsg["アシスタント: 以下のクエリを生成しました"]
                    QueryBlock["SQL / GraphQL 表示ブロック"]
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

### 設定画面

```mermaid
flowchart TB
    subgraph "DataAgent - 設定画面"
        direction TB

        subgraph "Header"
            BackBtn["戻るボタン"]
            Title["設定"]
        end

        subgraph "DataSourceSection データソース設定"
            direction TB
            DSLabel["データソース選択"]
            DSToggle["DB モード / API モード 切り替え"]
        end

        subgraph "DBSection DB設定 DBモード選択時のみ表示"
            direction TB
            DBInfo["現在のDB接続情報<br>ホスト・データベース名・ステータス"]
            DBNote["DB接続設定は .env ファイルで管理"]
        end

        subgraph "APISection API設定 APIモード選択時のみ表示"
            direction TB

            subgraph "APIRegistration OpenAPI Spec登録"
                APIName["API名 入力フィールド"]
                SpecURL["Spec URL 入力フィールド"]
                SpecUpload["ファイルアップロード ボタン"]
                RegisterBtn["登録ボタン"]
            end

            subgraph "APIList 登録済みAPI一覧"
                API1["API-1: Petstore API ステータス: 有効"]
                API2["API-2: Weather API ステータス: 有効"]
                DeleteBtn["削除ボタン"]
            end
        end
    end
```

### UI要素の詳細

| 要素 | 説明 | 備考 |
|------|------|------|
| サイドバー | クエリ履歴一覧。クリックで会話を切り替え | 幅250px程度。折りたたみ可能 |
| チャットエリア | メッセージの表示領域 | スクロール可能。最新メッセージが下に表示 |
| SQL/GraphQL表示ブロック | 生成されたクエリをコードブロックで表示 | シンタックスハイライト付き。DBモード→SQL、APIモード→GraphQL |
| グラフ表示エリア | Rechartsで描画されたグラフ | LLMが自動選択した種類で表示 |
| 入力フィールド | 自然言語で質問を入力 | Enter で送信。Shift+Enter で改行 |
| 新しい会話ボタン | 新規会話を開始 | 現在の会話は履歴に保存 |
| データソース表示バッジ | 現在のデータソースをヘッダーに表示 | DB: MySQL / API: API名 |
| 設定ボタン | 設定画面への遷移 | ヘッダー右上に配置 |
| エラー表示 | クエリ実行エラー時のメッセージ | 「質問を変えてみてください」等のガイド付き |
| ローディング | LLM応答待ち中の表示 | ストリーミングで逐次表示 |
| OpenAPI Spec登録フォーム | URL入力またはファイルアップロード | OpenAPI 3.0のみ対応 |
| 登録済みAPI一覧 | 複数登録されたAPIの管理 | 選択・削除が可能 |
