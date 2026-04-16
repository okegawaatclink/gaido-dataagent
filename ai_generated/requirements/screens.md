# 画面一覧・遷移図

## 画面一覧

| # | 画面名 | パス | 説明 |
|---|--------|------|------|
| 1 | チャット画面 | / | メイン画面。サイドバー（履歴）+ チャットエリア + グラフ表示 |

※ 認証なし・単一画面構成のため、画面遷移図は省略

## 画面遷移図

```mermaid
stateDiagram-v2
    [*] --> チャット画面
    チャット画面 --> チャット画面: "新しい会話を作成"
    チャット画面 --> チャット画面: "履歴から会話を選択"
```

## ワイヤーフレーム

### チャット画面

```mermaid
flowchart TB
    subgraph "DataAgent - チャット画面"
        direction TB

        subgraph "Header"
            Logo["DataAgent ロゴ + タイトル"]
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

### UI要素の詳細

| 要素 | 説明 | 備考 |
|------|------|------|
| サイドバー | クエリ履歴一覧。クリックで会話を切り替え | 幅250px程度。折りたたみ可能 |
| チャットエリア | メッセージの表示領域 | スクロール可能。最新メッセージが下に表示 |
| SQL表示ブロック | 生成されたSQLをコードブロックで表示 | シンタックスハイライト付き |
| グラフ表示エリア | Rechartsで描画されたグラフ | LLMが自動選択した種類で表示 |
| 入力フィールド | 自然言語で質問を入力 | Enter で送信。Shift+Enter で改行 |
| 新しい会話ボタン | 新規会話を開始 | 現在の会話は履歴に保存 |
| エラー表示 | SQL実行エラー時のメッセージ | 「質問を変えてみてください」等のガイド付き |
| ローディング | LLM応答待ち中の表示 | ストリーミングで逐次表示 |
