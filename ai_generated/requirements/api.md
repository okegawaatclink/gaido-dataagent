# WebAPI一覧

## エンドポイント一覧

| メソッド | パス | 説明 |
|---------|------|------|
| POST | /api/chat | 自然言語でクエリを送信し、SQL/GraphQL生成・実行・結果を取得（SSE） |
| GET | /api/history | 会話履歴一覧を取得 |
| GET | /api/history/:id | 特定の会話の詳細を取得 |
| DELETE | /api/history/:id | 特定の会話を削除 |
| GET | /api/schema | 接続先DBのスキーマ情報を取得 |
| GET | /api/settings | 現在のデータソース設定を取得 |
| PUT | /api/settings | データソース設定を更新 |
| GET | /api/specs | 登録済みOpenAPI Spec一覧を取得 |
| POST | /api/specs | OpenAPI Specを新規登録（URL指定またはファイルアップロード） |
| GET | /api/specs/:id | 特定のOpenAPI Specの詳細を取得 |
| DELETE | /api/specs/:id | OpenAPI Specを削除 |
| GET | /api/specs/:id/schema | 指定Specから生成されたGraphQLスキーマを取得 |

## OpenAPI定義

```yaml
openapi: 3.0.3
info:
  title: DataAgent API
  description: 自然言語データ分析システムのバックエンドAPI
  version: 2.0.0

paths:
  /api/chat:
    post:
      summary: チャットメッセージ送信
      description: |
        自然言語の質問を送信し、SQL/GraphQL生成・実行・結果をストリーミングで返却。
        Server-Sent Events (SSE) でレスポンスを返す。
        データソースの種類（DB/API）は会話に紐づく設定で自動判定。
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
                  - event: sql (生成されたSQL - DBモード)
                  - event: graphql (生成されたGraphQLクエリ - APIモード)
                  - event: chart_type (推奨グラフ種類)
                  - event: result (クエリ結果JSON)
                  - event: analysis (AI分析コメントのチャンク - DBモードのみ)
                  - event: error (エラー発生時)
                  - event: done (ストリーム終了)
                  
                  会話コンテキスト: conversationId指定時、同一会話の過去メッセージ（直近10往復）を
                  LLMのmessages配列に含めて送信する。これにより直前のクエリに対する修正依頼に対応可能。
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
                    dataSourceType:
                      type: string
                      enum: [db, api]
                    apiSpecName:
                      type: string
                      nullable: true
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
                  dataSourceType:
                    type: string
                    enum: [db, api]
                  apiSpecId:
                    type: string
                    nullable: true
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
                        graphqlQuery:
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
                          description: AI分析コメント（DBモードのみ）
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
                          description: テーブルコメント
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
        "500":
          description: DB接続エラー

  /api/settings:
    get:
      summary: データソース設定取得
      description: 現在のデータソース設定を取得
      responses:
        "200":
          description: データソース設定
          content:
            application/json:
              schema:
                type: object
                properties:
                  dataSourceType:
                    type: string
                    enum: [db, api]
                  activeApiSpecId:
                    type: string
                    nullable: true

    put:
      summary: データソース設定更新
      description: データソース設定を更新
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                dataSourceType:
                  type: string
                  enum: [db, api]
                activeApiSpecId:
                  type: string
                  nullable: true
      responses:
        "200":
          description: 更新成功
        "400":
          description: リクエスト不正

  /api/specs:
    get:
      summary: OpenAPI Spec一覧取得
      description: 登録済みのOpenAPI Spec一覧を取得
      responses:
        "200":
          description: Spec一覧
          content:
            application/json:
              schema:
                type: array
                items:
                  type: object
                  properties:
                    id:
                      type: string
                    name:
                      type: string
                    specUrl:
                      type: string
                      nullable: true
                    status:
                      type: string
                      enum: [active, error]
                    createdAt:
                      type: string
                      format: date-time

    post:
      summary: OpenAPI Spec登録
      description: OpenAPI Specを新規登録（URL指定またはファイルアップロード）
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - name
              properties:
                name:
                  type: string
                  description: API名（表示用）
                specUrl:
                  type: string
                  description: OpenAPI Spec URL（URL指定の場合）
                specContent:
                  type: string
                  description: OpenAPI Spec内容（ファイルアップロードの場合、JSON/YAML文字列）
          multipart/form-data:
            schema:
              type: object
              required:
                - name
                - file
              properties:
                name:
                  type: string
                file:
                  type: string
                  format: binary
                  description: OpenAPI Specファイル（YAML/JSON）
      responses:
        "201":
          description: 登録成功
        "400":
          description: Spec解析エラー（不正なOpenAPI形式等）

  /api/specs/{id}:
    get:
      summary: OpenAPI Spec詳細取得
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        "200":
          description: Spec詳細
        "404":
          description: Specが見つからない

    delete:
      summary: OpenAPI Spec削除
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
          description: Specが見つからない

  /api/specs/{id}/schema:
    get:
      summary: GraphQLスキーマ取得
      description: 指定されたOpenAPI Specから生成されたGraphQLスキーマ（SDL形式）を返す
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        "200":
          description: GraphQLスキーマ
          content:
            application/json:
              schema:
                type: object
                properties:
                  specId:
                    type: string
                  specName:
                    type: string
                  graphqlSchema:
                    type: string
                    description: GraphQLスキーマ（SDL形式）
        "404":
          description: Specが見つからない
        "500":
          description: スキーマ生成エラー
```
