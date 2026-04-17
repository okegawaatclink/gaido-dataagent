# システム構成図

## アーキテクチャ概要

DataAgentは、フロントエンド（React）、バックエンド（Node.js/Express）、外部LLM（Claude API）、データベース（MySQL + SQLite）の4層構成に、OpenAPI→GraphQLゲートウェイを追加。Docker Compose でフロントエンド・バックエンド・MySQL・phpMyAdmin・モックAPIサーバーを一括起動する。

```mermaid
flowchart TB
    subgraph "Client"
        Browser["Chrome ブラウザ"]
    end

    subgraph "Docker Compose"
        subgraph "Web Container"
            React["React + TypeScript<br>Recharts<br>Vite"]
            Express["Node.js + Express<br>TypeScript"]
            SchemaLoader["Schema Loader<br>INFORMATION_SCHEMA<br>テーブル/カラムコメント取得"]
            SQLValidator["SQL Validator<br>SELECT のみ許可"]
            QueryHistory["Query History<br>SQLite 履歴管理"]
            ContextManager["Context Manager<br>会話履歴をLLMに渡す"]
            AnalysisEngine["Analysis Engine<br>クエリ結果のAI分析"]
            GraphQLGateway["GraphQL Gateway<br>openapi-to-graphql<br>OpenAPI Spec → GraphQL変換"]
            GraphQLValidator["GraphQL Validator<br>Query のみ許可<br>Mutation/Subscription 拒否"]
            APISpecManager["API Spec Manager<br>OpenAPI Spec 登録・管理<br>URL取得 / ファイルアップロード"]
        end

        subgraph "MySQL Container"
            MySQL["MySQL 8.0<br>ユーザーデータ"]
        end

        subgraph "phpMyAdmin Container"
            PMA["phpMyAdmin 5<br>DB管理UI"]
        end

        subgraph "Mock API Container"
            MockAPI["Mock API Server<br>テスト用REST API"]
        end
    end

    subgraph "External Services"
        Claude["Claude API<br>Anthropic"]
        TargetAPI["対象 REST API<br>OpenAPI 3.0 準拠"]
    end

    Browser -->|"HTTP"| React
    React -->|"REST API + SSE"| Express
    Express -->|"SQL生成 / GraphQL生成<br>Streaming"| Claude
    Express -->|"分析コメント Streaming<br>DBモードのみ"| Claude
    Express --> SchemaLoader
    Express --> SQLValidator
    Express --> QueryHistory
    Express --> ContextManager
    Express --> AnalysisEngine
    Express --> GraphQLGateway
    Express --> GraphQLValidator
    Express --> APISpecManager
    SchemaLoader -->|"INFORMATION_SCHEMA<br>+ コメント情報"| MySQL
    SQLValidator -->|"SELECT only"| MySQL
    GraphQLGateway -->|"GET only"| TargetAPI
    GraphQLGateway -->|"GET only"| MockAPI
    PMA -->|"管理"| MySQL
```

## データフロー（DBモード - 既存）

```mermaid
flowchart LR
    A["ユーザー入力<br>自然言語"] --> B["バックエンド<br>Express"]
    B --> B2["会話履歴取得<br>SQLite"]
    B2 --> C["スキーマ情報取得<br>INFORMATION_SCHEMA<br>+ テーブル/カラムコメント"]
    C --> D["Claude API<br>SQL生成 + グラフ種類判定<br>会話コンテキスト付き"]
    D --> E["SQLバリデーション<br>SELECT のみ許可"]
    E --> F["SQL実行<br>MySQL"]
    F --> G["結果整形<br>+ グラフデータ生成"]
    G --> G2["Claude API<br>AI分析コメント生成"]
    G2 --> H["フロントエンド<br>Recharts で描画<br>+ 分析コメント表示"]
```

## データフロー（APIモード - 新規追加）

```mermaid
flowchart LR
    A2["ユーザー入力<br>自然言語"] --> B3["バックエンド<br>Express"]
    B3 --> B4["会話履歴取得<br>SQLite"]
    B4 --> C2["GraphQLスキーマ取得<br>openapi-to-graphql<br>で生成済み"]
    C2 --> D2["Claude API<br>GraphQLクエリ生成<br>+ グラフ種類判定<br>会話コンテキスト付き"]
    D2 --> E2["GraphQLバリデーション<br>Query のみ許可"]
    E2 --> F2["GraphQL実行<br>ゲートウェイ経由<br>GET リクエストのみ"]
    F2 --> G3["結果整形<br>トップレベル配列を<br>テーブル/グラフデータ化"]
    G3 --> H2["フロントエンド<br>Recharts で描画"]
```

## 技術スタック詳細

| レイヤー | 技術 | 備考 |
|---------|------|------|
| フロントエンド | React 18+, TypeScript, Vite | SPA構成 |
| UIコンポーネント | Recharts, グローバルCSS | グラフ描画 + テーブル表示 |
| バックエンド | Node.js 20+, Express, TypeScript | REST API + SSE |
| DB接続 | knex.js | PostgreSQL/MySQL 抽象化 |
| LLM連携 | @anthropic-ai/sdk | Claude API公式SDK。SQL/GraphQL生成+分析コメントの呼び出し |
| OpenAPI→GraphQL変換 | openapi-to-graphql | IBM製、MITライセンス。OpenAPI 3.0 Spec → GraphQLスキーマ変換 |
| クエリ履歴 | SQLite (better-sqlite3, WAL mode) | 会話・メッセージの永続化。LLMへの会話コンテキスト提供にも使用 |
| ユーザーDB | MySQL 8.0 | Docker Compose内で起動。テーブル/カラムコメント対応 |
| DB管理 | phpMyAdmin 5 | MySQL管理UI。ポート8080 |
| モックAPI | Express + OpenAPI Mock | テスト用REST APIサーバー。Docker Compose内で起動 |
| コンテナ | Docker Compose | web + MySQL + phpMyAdmin + mock-api の4コンテナ構成 |
