# システム構成図

## アーキテクチャ概要

DataAgentは、フロントエンド（React）、バックエンド（Node.js/Express）、外部LLM（Claude API）、ユーザーDB（PostgreSQL/MySQL）の4層構成。

```mermaid
flowchart TB
    subgraph "Client"
        Browser["Chrome ブラウザ"]
    end

    subgraph "Docker Compose"
        subgraph "Frontend Container"
            React["React + TypeScript<br>Recharts<br>Vite"]
        end

        subgraph "Backend Container"
            Express["Node.js + Express<br>TypeScript"]
            SchemaLoader["Schema Loader<br>INFORMATION_SCHEMA 取得"]
            SQLValidator["SQL Validator<br>SELECT のみ許可"]
            QueryHistory["Query History<br>履歴管理"]
        end
    end

    subgraph "External Services"
        Claude["Claude API<br>Anthropic"]
    end

    subgraph "User Database"
        PG["PostgreSQL"]
        MySQL["MySQL"]
    end

    Browser -->|"HTTP/WebSocket"| React
    React -->|"REST API"| Express
    Express -->|"Streaming API"| Claude
    Express --> SchemaLoader
    Express --> SQLValidator
    Express --> QueryHistory
    SchemaLoader -->|"INFORMATION_SCHEMA"| PG
    SchemaLoader -->|"INFORMATION_SCHEMA"| MySQL
    SQLValidator -->|"SELECT only"| PG
    SQLValidator -->|"SELECT only"| MySQL
```

## データフロー

```mermaid
flowchart LR
    A["ユーザー入力<br>自然言語"] --> B["バックエンド<br>Express"]
    B --> C["スキーマ情報取得<br>INFORMATION_SCHEMA"]
    C --> D["Claude API<br>SQL生成 + グラフ種類判定"]
    D --> E["SQLバリデーション<br>SELECT のみ許可"]
    E --> F["SQL実行<br>ユーザーDB"]
    F --> G["結果整形<br>+ グラフデータ生成"]
    G --> H["フロントエンド<br>Recharts で描画"]
```

## 技術スタック詳細

| レイヤー | 技術 | 備考 |
|---------|------|------|
| フロントエンド | React 18+, TypeScript, Vite | SPA構成 |
| UIコンポーネント | Recharts, CSS Modules or Tailwind CSS | グラフ描画 |
| バックエンド | Node.js 20+, Express, TypeScript | REST API + SSE |
| DB接続 | knex.js | PostgreSQL/MySQL 抽象化 |
| LLM連携 | @anthropic-ai/sdk | Claude API公式SDK |
| クエリ履歴 | SQLite (ローカル) | 軽量な履歴保存 |
| コンテナ | Docker Compose | フロントエンド + バックエンド |
