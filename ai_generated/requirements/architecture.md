# システム構成図

## アーキテクチャ概要

DataAgentは、フロントエンド（React）、バックエンド（Node.js/Express）、外部LLM（Claude API / Amazon Bedrock）、データソース（ユーザーDB: MySQL/PostgreSQL + GraphQL API + 内部DB: SQLite）の4層構成。Docker Compose でフロントエンド・バックエンド・MySQL・phpMyAdminを一括起動する。AWS ECS Fargate へのデプロイにも対応。

接続先は画面から動的に登録（MySQL/PostgreSQL/GraphQL）。DB接続情報はSQLiteに暗号化保存。GraphQL接続はエンドポイントURLのみ。LLMバックエンドはAnthropic API直接呼び出しとAmazon Bedrock経由を環境変数で切替可能。

```mermaid
flowchart TB
    subgraph "Client"
        Browser["Chrome ブラウザ"]
    end

    subgraph "Docker Compose"
        subgraph "Web Container"
            React["React + TypeScript<br>Recharts<br>Vite"]
            Express["Node.js + Express<br>TypeScript"]
            ConnectionManager["Connection Manager<br>接続先CRUD<br>DB: パスワード暗号化<br>GraphQL: URL管理"]
            SchemaLoader["Schema Loader<br>DB: INFORMATION_SCHEMA<br>GraphQL: Introspection Query"]
            QueryValidator["Query Validator<br>DB: SELECT のみ許可<br>GraphQL: Query のみ許可"]
            GraphQLExecutor["GraphQL Executor<br>クエリ実行<br>レスポンス整形"]
            QueryHistory["Query History<br>SQLite 履歴管理"]
            ContextManager["Context Manager<br>会話履歴をLLMに渡す"]
            AnalysisEngine["Analysis Engine<br>クエリ結果のAI分析"]
            Encryption["Encryption<br>AES-256-GCM<br>パスワード暗号化/復号"]
        end

        subgraph "MySQL Container"
            MySQL["MySQL 8.0<br>サンプルデータ"]
        end

        subgraph "phpMyAdmin Container"
            PMA["phpMyAdmin 5<br>DB管理UI"]
        end
    end

    subgraph "External Data Sources"
        UserMySQL["MySQL<br>ユーザーDB"]
        UserPostgreSQL["PostgreSQL<br>ユーザーDB"]
        UserGraphQL["GraphQL API<br>社内API"]
    end

    subgraph "External Services"
        Claude["Claude API<br>Anthropic<br>直接呼び出し"]
        Bedrock["Amazon Bedrock<br>Claude<br>IAM認証"]
    end

    Browser -->|"HTTP"| React
    React -->|"REST API + SSE"| Express
    Express -->|"SQL生成 Streaming<br>USE_BEDROCK=false"| Claude
    Express -->|"SQL生成 Streaming<br>USE_BEDROCK=true"| Bedrock
    Express -->|"分析コメント Streaming"| Claude
    Express -->|"分析コメント Streaming"| Bedrock
    Express --> ConnectionManager
    Express --> SchemaLoader
    Express --> QueryValidator
    Express --> GraphQLExecutor
    Express --> QueryHistory
    Express --> ContextManager
    Express --> AnalysisEngine
    ConnectionManager --> Encryption
    ConnectionManager -->|"接続テスト"| UserMySQL
    ConnectionManager -->|"接続テスト"| UserPostgreSQL
    ConnectionManager -->|"Introspection<br>接続テスト"| UserGraphQL
    SchemaLoader -->|"INFORMATION_SCHEMA<br>+ コメント情報"| UserMySQL
    SchemaLoader -->|"INFORMATION_SCHEMA<br>+ コメント情報"| UserPostgreSQL
    SchemaLoader -->|"Introspection Query<br>Type/Field情報"| UserGraphQL
    QueryValidator -->|"SELECT only"| UserMySQL
    QueryValidator -->|"SELECT only"| UserPostgreSQL
    GraphQLExecutor -->|"Query only"| UserGraphQL
    PMA -->|"管理"| MySQL
```

## データフロー

```mermaid
flowchart LR
    A["ユーザー入力<br>自然言語"] --> A2["接続先選択<br>ヘッダードロップダウン"]
    A2 --> B["バックエンド<br>Express"]
    B --> B1["接続先情報取得<br>SQLite + 復号"]
    B1 --> B2["会話履歴取得<br>SQLite"]
    B2 --> C{"接続先種別?"}
    C -->|"DB"| C1["スキーマ情報取得<br>INFORMATION_SCHEMA"]
    C -->|"GraphQL"| C2["スキーマ情報取得<br>Introspection Query"]
    C1 --> D["Claude API<br>SQL生成 + グラフ種類判定"]
    C2 --> D2["Claude API<br>GraphQLクエリ生成<br>+ グラフ種類判定"]
    D --> E["SQLバリデーション<br>SELECT のみ許可"]
    D2 --> E2["GraphQLバリデーション<br>Query のみ許可"]
    E --> F["SQL実行<br>選択中のユーザーDB"]
    E2 --> F2["GraphQL実行<br>選択中のエンドポイント"]
    F --> G["結果整形<br>+ グラフデータ生成"]
    F2 --> G
    G --> G2["Claude API<br>AI分析コメント生成"]
    G2 --> H["フロントエンド<br>Recharts で描画<br>+ 分析コメント表示"]
```

## 技術スタック詳細

| レイヤー | 技術 | 備考 |
|---------|------|------|
| フロントエンド | React 18+, TypeScript, Vite | SPA構成 |
| UIコンポーネント | Recharts, グローバルCSS | グラフ描画 + テーブル表示 |
| バックエンド | Node.js 20+, Express, TypeScript | REST API + SSE |
| DB接続 | knex.js | PostgreSQL/MySQL 抽象化。動的接続先切替対応 |
| GraphQL接続 | Node.js fetch（標準API） | Introspection + クエリ実行。追加ライブラリ不要 |
| LLM連携 | @anthropic-ai/sdk, @anthropic-ai/bedrock-sdk | Claude API公式SDK + Bedrock SDK。SQL生成+分析コメントの2回呼び出し。USE_BEDROCK環境変数で切替 |
| クエリ履歴 | SQLite (better-sqlite3, WAL mode) | 会話・メッセージ・DB接続先の永続化 |
| パスワード暗号化 | Node.js crypto (AES-256-GCM) | 追加依存なし。暗号化キーは環境変数で管理 |
| ユーザーDB | MySQL / PostgreSQL（画面から動的登録） | 画面からCRUD可能。接続テスト機能付き |
| GraphQL API | 社内GraphQL API（画面から動的登録） | エンドポイントURLで登録。Introspectionでスキーマ取得 |
| DB管理 | phpMyAdmin 5 | MySQL管理UI。ポート8080 |
| コンテナ | Docker Compose | web + MySQL + phpMyAdmin の3コンテナ構成（変更なし） |
