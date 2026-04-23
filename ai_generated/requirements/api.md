# WebAPI一覧

## エンドポイント一覧

| メソッド | パス | 説明 | 変更 |
|---------|------|------|------|
| POST | /api/chat | 自然言語でクエリを送信し、SQL生成・実行・結果を取得（SSE） | 変更（db_connection_id追加） |
| GET | /api/history | 会話履歴一覧を取得 | 変更（db_connection_idフィルター追加） |
| GET | /api/history/:id | 特定の会話の詳細を取得 | 変更なし |
| DELETE | /api/history/:id | 特定の会話を削除 | 変更なし |
| GET | /api/schema | 接続先DBのスキーマ情報を取得 | 変更（db_connection_id追加） |
| GET | /api/connections | DB接続先一覧を取得 | **新規** |
| POST | /api/connections | DB接続先を登録 | **新規** |
| PUT | /api/connections/:id | DB接続先を更新 | **新規** |
| DELETE | /api/connections/:id | DB接続先を削除（関連会話も削除） | **新規** |
| POST | /api/connections/test | DB接続テスト | **新規** |
| POST | /api/chat/analyze | クエリ結果のオンデマンドAI分析（SSE） | **新規** |
| GET | /api/health | ヘルスチェック | 変更なし |
| GET | /api/config | アプリケーション設定情報（LLMバックエンド・モデル名） | **新規** |

## OpenAPI定義

```yaml
openapi: 3.0.3
info:
  title: DataAgent API
  description: 自然言語データ分析システムのバックエンドAPI
  version: 2.0.0

paths:
  /api/connections:
    get:
      summary: DB接続先一覧取得
      description: 登録済みのDB接続先を一覧取得。パスワードは返却しない
      responses:
        "200":
          description: 接続先一覧
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/DbConnection"

    post:
      summary: DB接続先登録
      description: 新しいDB接続先を登録する
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/DbConnectionInput"
      responses:
        "201":
          description: 登録成功
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/DbConnection"
        "400":
          description: バリデーションエラー
        "409":
          description: 接続名が重複

  /api/connections/{id}:
    put:
      summary: DB接続先更新
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/DbConnectionInput"
      responses:
        "200":
          description: 更新成功
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/DbConnection"
        "404":
          description: 接続先が見つからない

    delete:
      summary: DB接続先削除
      description: DB接続先と関連する全会話・メッセージを削除する
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
          description: 接続先が見つからない

  /api/connections/test:
    post:
      summary: DB接続テスト
      description: 指定された接続情報でDBに接続できるか確認する
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/DbConnectionInput"
      responses:
        "200":
          description: 接続成功
          content:
            application/json:
              schema:
                type: object
                properties:
                  success:
                    type: boolean
                  message:
                    type: string
        "400":
          description: 接続失敗
          content:
            application/json:
              schema:
                type: object
                properties:
                  success:
                    type: boolean
                  message:
                    type: string

  /api/config:
    get:
      summary: アプリケーション設定情報取得
      description: 使用中のLLMバックエンド種別とモデル名を返す
      responses:
        "200":
          description: 設定情報
          content:
            application/json:
              schema:
                type: object
                properties:
                  llmBackend:
                    type: string
                    description: LLMバックエンド種別
                    enum: ["Anthropic API", "Amazon Bedrock"]
                    example: "Anthropic API"
                  llmModel:
                    type: string
                    description: 使用中のモデル名
                    example: "claude-sonnet-4-20250514"

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
                - dbConnectionId
              properties:
                message:
                  type: string
                  description: ユーザーの自然言語質問
                  example: "今月の売上トップ10を教えて"
                conversationId:
                  type: string
                  description: 会話ID（既存会話の続きの場合）
                  example: "550e8400-e29b-41d4-a716-446655440000"
                dbConnectionId:
                  type: string
                  description: DB接続先ID
                  example: "660e8400-e29b-41d4-a716-446655440001"
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
                  - event: message_id (DB保存済みメッセージID。オンデマンド分析で使用)
                  - event: error (エラー発生時)
                  - event: done (ストリーム終了)

                  ※ AI分析コメントは自動生成されない。ユーザーが明示的に
                  POST /api/chat/analyze を呼び出すことでオンデマンドで生成する。

                  会話コンテキスト: conversationId指定時、同一会話の過去メッセージ（直近10往復）を
                  LLMのmessages配列に含めて送信する。これにより直前のSQLに対する修正依頼に対応可能。
        "400":
          description: リクエスト不正
        "500":
          description: サーバーエラー

  /api/chat/analyze:
    post:
      summary: クエリ結果のオンデマンドAI分析
      description: |
        指定メッセージのクエリ結果をLLMで分析し、SSEで結果をストリーミングする。
        ユーザーが「AIに分析させる」ボタンをクリックした場合にのみ呼ばれる。
        100行以上の結果に対してはフロントエンドで警告を表示し、ユーザー確認後に実行する。
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - messageId
                - question
              properties:
                messageId:
                  type: string
                  description: 分析対象のアシスタントメッセージID（DB上のID）
                question:
                  type: string
                  description: 元のユーザーの質問テキスト
                dbType:
                  type: string
                  enum: [mysql, postgresql, graphql]
                  description: DB種別（省略時はmysql）
      responses:
        "200":
          description: SSEストリーム
          content:
            text/event-stream:
              schema:
                type: string
                description: |
                  以下のイベントが送信される:
                  - event: analysis (分析コメントのチャンク)
                  - event: error (エラー発生時)
                  - event: done (ストリーム終了)
        "400":
          description: バリデーションエラー（messageId/question未指定、クエリ結果なし）
        "404":
          description: メッセージが見つからない

  /api/history:
    get:
      summary: 会話履歴一覧取得
      description: 指定DB接続先の会話履歴を作成日時の降順で取得
      parameters:
        - name: dbConnectionId
          in: query
          required: true
          schema:
            type: string
          description: DB接続先IDでフィルター
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
                  dbConnectionId:
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
      description: 指定DB接続先のテーブル・カラム情報を取得
      parameters:
        - name: dbConnectionId
          in: query
          required: true
          schema:
            type: string
          description: DB接続先ID
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
                                description: カラムコメント
        "404":
          description: DB接続先が見つからない
        "500":
          description: DB接続エラー

components:
  schemas:
    DbConnection:
      type: object
      properties:
        id:
          type: string
        name:
          type: string
          description: 接続名
        dbType:
          type: string
          enum: [mysql, postgresql, graphql]
        host:
          type: string
          nullable: true
          description: ホスト名（GraphQL時はnull）
        port:
          type: integer
          nullable: true
          description: ポート番号（GraphQL時はnull）
        username:
          type: string
          nullable: true
          description: ユーザー名（GraphQL時はnull）
        databaseName:
          type: string
          nullable: true
          description: データベース名（GraphQL時はnull）
        endpointUrl:
          type: string
          nullable: true
          description: GraphQLエンドポイントURL（DB接続時はnull）
        isLastUsed:
          type: boolean
        createdAt:
          type: string
          format: date-time
        updatedAt:
          type: string
          format: date-time

    DbConnectionInput:
      type: object
      required:
        - name
        - dbType
      properties:
        name:
          type: string
          description: 接続名
          example: "本番DB"
        dbType:
          type: string
          enum: [mysql, postgresql, graphql]
          example: "mysql"
        host:
          type: string
          description: ホスト名（DB接続時必須、GraphQL時は不要）
          example: "db-server"
        port:
          type: integer
          description: ポート番号（DB接続時必須、GraphQL時は不要）
          example: 3306
        username:
          type: string
          description: ユーザー名（DB接続時必須、GraphQL時は不要）
          example: "readonly_user"
        password:
          type: string
          description: パスワード（DB接続時必須、GraphQL時は不要）
          example: "password123"
        databaseName:
          type: string
          description: データベース名（DB接続時必須、GraphQL時は不要）
          example: "sampledb"
        endpointUrl:
          type: string
          description: GraphQLエンドポイントURL（GraphQL時必須、DB接続時は不要）
          example: "https://internal-api.example.com/graphql"
```
