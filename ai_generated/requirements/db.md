# ER図

## DataAgent 内部DB（クエリ履歴用）

DataAgent自身はSQLiteでクエリ履歴とAPI設定を管理する。ユーザーDBは外部接続のため、ここでは内部DBのみ定義。

```mermaid
erDiagram
    conversations {
        string id PK "UUID"
        string title "会話タイトル（最初の質問から自動生成）"
        string data_source_type "データソース種別（db / api）"
        string api_spec_id FK "使用するAPI Spec ID（APIモードの場合）"
        datetime created_at "作成日時"
        datetime updated_at "更新日時"
    }

    messages {
        string id PK "UUID"
        string conversation_id FK "会話ID"
        string role "user / assistant"
        string content "メッセージ内容"
        string sql "生成されたSQL（DBモード・assistantの場合）"
        string graphql_query "生成されたGraphQLクエリ（APIモード・assistantの場合）"
        string chart_type "グラフ種類（bar/line/pie/table）"
        text query_result "クエリ結果JSON（DBモードのみ保存）"
        text error "エラー内容（エラー時）"
        text analysis "AI分析コメント（DBモードのみ）"
        datetime created_at "作成日時"
    }

    api_specs {
        string id PK "UUID"
        string name "API名（表示用）"
        string spec_url "OpenAPI Spec URL（URL登録の場合）"
        text spec_content "OpenAPI Spec内容（JSON/YAML）"
        string status "ステータス（active / error）"
        datetime created_at "作成日時"
        datetime updated_at "更新日時"
    }

    conversations ||--o{ messages : "has"
    api_specs ||--o{ conversations : "used_by"
```

## テーブル定義

### conversations テーブル

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | TEXT | PK | UUID |
| title | TEXT | NOT NULL | 会話タイトル |
| data_source_type | TEXT | NOT NULL, DEFAULT 'db' | データソース種別（db / api） |
| api_spec_id | TEXT | FK, NULL | 使用するAPI Spec ID（APIモードの場合） |
| created_at | DATETIME | NOT NULL | 作成日時 |
| updated_at | DATETIME | NOT NULL | 更新日時 |

### messages テーブル

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | TEXT | PK | UUID |
| conversation_id | TEXT | FK, NOT NULL | 会話ID |
| role | TEXT | NOT NULL | user / assistant |
| content | TEXT | NOT NULL | メッセージ内容 |
| sql | TEXT | NULL | 生成されたSQL（DBモード） |
| graphql_query | TEXT | NULL | 生成されたGraphQLクエリ（APIモード） |
| chart_type | TEXT | NULL | グラフ種類 |
| query_result | TEXT | NULL | クエリ結果JSON（DBモードのみ） |
| error | TEXT | NULL | エラー内容 |
| analysis | TEXT | NULL | AI分析コメント（DBモードのみ） |
| created_at | DATETIME | NOT NULL | 作成日時 |

### api_specs テーブル（新規追加）

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | TEXT | PK | UUID |
| name | TEXT | NOT NULL | API名（表示用） |
| spec_url | TEXT | NULL | OpenAPI Spec URL（URL登録の場合） |
| spec_content | TEXT | NOT NULL | OpenAPI Spec内容（JSON/YAML文字列） |
| status | TEXT | NOT NULL, DEFAULT 'active' | ステータス（active / error） |
| created_at | DATETIME | NOT NULL | 作成日時 |
| updated_at | DATETIME | NOT NULL | 更新日時 |
