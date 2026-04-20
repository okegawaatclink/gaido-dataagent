# WebAPI一覧

## エンドポイント一覧

| メソッド | パス | 説明 |
|---------|------|------|
| POST | /api/chat | 自然言語でクエリを送信し、SQL生成・実行・結果を取得（SSE） |
| GET | /api/history | 会話履歴一覧を取得 |
| GET | /api/history/:id | 特定の会話の詳細を取得 |
| DELETE | /api/history/:id | 特定の会話を削除 |
| GET | /api/schema | 接続先DBのスキーマ情報を取得 |

## OpenAPI定義

```yaml
openapi: 3.0.3
info:
  title: DataAgent API
  description: 自然言語データ分析システムのバックエンドAPI
  version: 1.0.0

paths:
  /api/chat:
    post:
      summary: チャットメッセージ送信
      description: |
        自然言語の質問を送信し、SQL生成・実行・結果をストリーミングで返却。
        Server-Sent Events (SSE) でレスポンスを返す。
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - message
              properties:
                message:
                  type: string
                  description: ユーザーの自然言語質問
                  example: "今月の売上トップ10を教えて"
                conversationId:
                  type: string
                  description: 会話ID（既存会話の続きの場合）
                  example: "550e8400-e29b-41d4-a716-446655440000"
      responses:
        "200":
          description: SSEストリーム
          content:
            text/event-stream:
              schema:
                type: string
                description: |
                  以下のイベントが順番に送信される:
                  - event: conversation (会話ID通知)
                  - event: message (テキスト応答のチャンク)
                  - event: sql (生成されたSQL)
                  - event: chart_type (推奨グラフ種類)
                  - event: result (クエリ結果JSON)
                  - event: analysis (AI分析コメントのチャンク)
                  - event: error (エラー発生時)
                  - event: done (ストリーム終了)
                  
                  会話コンテキスト: conversationId指定時、同一会話の過去メッセージ（直近10往復）を
                  LLMのmessages配列に含めて送信する。これにより直前のSQLに対する修正依頼に対応可能。
        "400":
          description: リクエスト不正
        "500":
          description: サーバーエラー

  /api/history:
    get:
      summary: 会話履歴一覧取得
      description: 全ての会話履歴を作成日時の降順で取得
      responses:
        "200":
          description: 会話一覧
          content:
            application/json:
              schema:
                type: array
                items:
                  type: object
                  properties:
                    id:
                      type: string
                    title:
                      type: string
                    createdAt:
                      type: string
                      format: date-time
                    updatedAt:
                      type: string
                      format: date-time

  /api/history/{id}:
    get:
      summary: 会話詳細取得
      description: 特定の会話のメッセージ一覧を取得
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        "200":
          description: 会話詳細
          content:
            application/json:
              schema:
                type: object
                properties:
                  id:
                    type: string
                  title:
                    type: string
                  messages:
                    type: array
                    items:
                      type: object
                      properties:
                        id:
                          type: string
                        role:
                          type: string
                          enum: [user, assistant]
                        content:
                          type: string
                        sql:
                          type: string
                          nullable: true
                        chartType:
                          type: string
                          nullable: true
                          enum: [bar, line, pie, table]
                        queryResult:
                          type: object
                          nullable: true
                        error:
                          type: string
                          nullable: true
                        analysis:
                          type: string
                          nullable: true
                          description: AI分析コメント
                        createdAt:
                          type: string
                          format: date-time
        "404":
          description: 会話が見つからない

    delete:
      summary: 会話削除
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        "204":
          description: 削除成功
        "404":
          description: 会話が見つからない

  /api/schema:
    get:
      summary: DBスキーマ情報取得
      description: 接続先DBのテーブル・カラム情報を取得
      responses:
        "200":
          description: スキーマ情報
          content:
            application/json:
              schema:
                type: object
                properties:
                  database:
                    type: string
                    description: データベース名
                  tables:
                    type: array
                    items:
                      type: object
                      properties:
                        name:
                          type: string
                          description: テーブル名
                        comment:
                          type: string
                          nullable: true
                          description: テーブルコメント（MySQL TABLE_COMMENT / PostgreSQL obj_description）
                        columns:
                          type: array
                          items:
                            type: object
                            properties:
                              name:
                                type: string
                              type:
                                type: string
                              nullable:
                                type: boolean
                              comment:
                                type: string
                                nullable: true
                                description: カラムコメント（MySQL COLUMN_COMMENT / PostgreSQL col_description）
        "500":
          description: DB接続エラー
```
