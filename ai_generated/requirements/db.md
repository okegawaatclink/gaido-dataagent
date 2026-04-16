# ER図

## DataAgent 内部DB（クエリ履歴用）

DataAgent自身はSQLiteでクエリ履歴を管理する。ユーザーDBは外部接続のため、ここでは内部DBのみ定義。

```mermaid
erDiagram
    conversations {
        string id PK "UUID"
        string title "会話タイトル（最初の質問から自動生成）"
        datetime created_at "作成日時"
        datetime updated_at "更新日時"
    }

    messages {
        string id PK "UUID"
        string conversation_id FK "会話ID"
        string role "user / assistant"
        string content "メッセージ内容"
        string sql "生成されたSQL（assistantの場合）"
        string chart_type "グラフ種類（bar/line/pie/table）"
        text query_result "クエリ結果JSON"
        text error "エラー内容（エラー時）"
        datetime created_at "作成日時"
    }

    conversations ||--o{ messages : "has"
```

## テーブル定義

### conversations テーブル

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | TEXT | PK | UUID |
| title | TEXT | NOT NULL | 会話タイトル |
| created_at | DATETIME | NOT NULL | 作成日時 |
| updated_at | DATETIME | NOT NULL | 更新日時 |

### messages テーブル

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | TEXT | PK | UUID |
| conversation_id | TEXT | FK, NOT NULL | 会話ID |
| role | TEXT | NOT NULL | user / assistant |
| content | TEXT | NOT NULL | メッセージ内容 |
| sql | TEXT | NULL | 生成されたSQL |
| chart_type | TEXT | NULL | グラフ種類 |
| query_result | TEXT | NULL | クエリ結果JSON |
| error | TEXT | NULL | エラー内容 |
| created_at | DATETIME | NOT NULL | 作成日時 |
