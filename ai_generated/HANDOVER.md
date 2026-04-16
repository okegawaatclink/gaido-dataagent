# HANDOVER

## 技術スタック
- フロントエンド: React 18 + TypeScript + Vite 5
- バックエンド: Node.js 20 + Express 4 + TypeScript + knex 3 (pg/mysql2)
- テスト: Playwright (E2E) + Vitest (ユニット)
- コンテナ: Docker Compose (ubuntu:24.04ベース)
- パッケージ管理: npm workspaces

## ディレクトリ構成

```
output_system/
├── docker-compose.yml       # フロントエンド + バックエンド 一括起動
├── Dockerfile               # ubuntu:24.04、Node.js 20
├── .env.example             # 環境変数テンプレート（9変数）
├── package.json             # workspaces: [frontend, backend]
├── tsconfig.base.json       # 共通TS設定
├── playwright.config.ts     # E2Eテスト設定
├── frontend/
│   ├── package.json         # React 18, Vite 5, Recharts
│   ├── vite.config.ts       # host: 0.0.0.0, port: 3001
│   └── src/
│       ├── App.tsx          # 「DataAgent」見出しを表示
│       ├── main.tsx         # エントリポイント
│       └── styles/global.css
├── backend/
│   ├── package.json         # Express 4, cors, ts-node-dev, knex, pg, mysql2
│   ├── vitest.config.ts     # Vitestユニットテスト設定
│   └── src/
│       ├── index.ts         # GET /api/health + /api/schema, グレースフルシャットダウン
│       ├── routes/schema.ts # GET /api/schema ルート
│       ├── routes/chat.ts   # POST /api/chat SSEストリーミングエンドポイント
│       └── services/
│           ├── database.ts  # knexシングルトンファクトリ + executeQuery()
│           ├── schema.ts    # INFORMATION_SCHEMAスキーマ取得
│           ├── sqlValidator.ts  # SQLバリデーター（SELECT以外を拒否）
│           └── llm.ts       # LLMサービス（Anthropic SDK ストリーミング）
├── test/
│   ├── e2e/app.spec.ts          # 疎通確認テスト（3件）
│   └── unit/
│       ├── schema.test.ts       # スキーマサービスユニットテスト（11件）
│       ├── sqlValidator.test.ts # SQLバリデーターユニットテスト（27件）
│       └── llm.test.ts          # LLMサービスユニットテスト（76件）
```

## ビルド・起動方法

```bash
# .envファイルの準備（初回のみ）
cp output_system/.env.example output_system/.env
# .envに DB_TYPE, DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME を設定

# 起動（output_system/ で実行）
cd output_system
docker compose build
docker compose up -d

# 確認
docker compose ps
curl http://localhost:3002/api/health  # または コンテナIP使用
curl http://localhost:3002/api/schema  # DBスキーマ取得（DB設定済みの場合）

# ユニットテスト（output_system/backend/ で実行）
cd output_system/backend && npm test

# E2Eテスト（AI Agent container上で実行）
cd output_system
npx playwright test test/e2e/app.spec.ts
```

## 設計判断

- **単一コンテナ構成**: フロントエンドとバックエンドを1コンテナにまとめた。instance-config.mdでコンテナ名が1つ（フロントエンド）に設定されているため。Dockerfileで両方を起動する
- **concurrently**: 単一コンテナで複数プロセス起動のためconcurrentlyを採用。supervisordやforemanは過剰のため不採用
- **vite preview**: DockerコンテナではViteのdevモードではなくbuildしてpreviewサーブ。devモードはHMRのWebSocket接続が必要でコンテナ環境と相性が悪い場合があるため
- **CORS設定**: フロント（3001）とバックエンド（3002）のオリジンが異なるため明示的にCORS設定が必要
- **knex DB_TYPE→クライアント変換**: `postgresql` → `pg`、`mysql` → `mysql2`。knex本体の `client` は `pg` / `mysql2` という文字列で指定する
- **MySQL raw() の返り値**: `knex.raw()` はPostgreSQLでは `{ rows: [...] }` を返すが、MySQLでは `[rows, fields]` のタプルを返す。DB種別ごとに異なるデストラクチャリングが必要
- **Vitest設定のincludeパス**: backendの `vitest.config.ts` から `../test/unit/**/*.test.ts` と相対パスで指定する（output_system/test/unit/ を参照）
- **SQLバリデーターの設計**: 正規表現パーサーではなくキーワードリスト+単語境界(\b)方式を採用。node-sql-parserは複雑すぎるため不採用。単語境界を使うことで `created_at`→`CREATE` の誤検知を防止
- **コメント除去の必要性**: `/* DROP TABLE users */ SELECT 1` のようなコメントインジェクション攻撃を防ぐため、キーワード検査前にコメント（--//* */）を除去してから検査する
- **SqlValidationError**: `instanceof` で判別できるカスタムエラークラス。上位ルーターで400/500の振り分けに使用する
- **LLMレスポンスのJSON抽出**: 正規表現（```json ... ```フェンス）でパース。複数フェンスがある場合は最後を使用。chart_typeが不正な場合は'table'にフォールバック
- **Anthropic SDK MessageStream型**: `Anthropic.MessageStream` として型参照できない。`ReturnType<typeof client.messages.stream>` で推論させる必要がある
- **APIErrorコンストラクタ**: `new APIError(status, error, message, headers)` の4引数。`headers` は `new Headers()` オブジェクトが必要（`{}` 不可）
- **LLMサービスの設計**: `LlmService.generate()` はasync generatorでLlmEventをyieldする設計。呼び出し側がfor-await-ofでイベントを受け取りSSEに変換する疎結合な設計

## はまりポイント

- **WSL2でlocalhostポートフォワード不可**: `curl http://localhost:3002` が `ERR_CONNECTION_REFUSED` になる。コンテナIPを使う: `CONTAINER_IP=$(docker inspect <container_name> --format='{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')`
- **Vite 5のホスト制限**: `allowedHosts` に `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` 環境変数経由でコンテナ名を設定しないとAI Agent containerからアクセスできない

## 実装済み機能

- PBI #5: Docker Composeで雛形アプリを起動できる（frontend/backend一括起動、ヘルスチェックAPI、E2Eテスト）
- PBI #6: ユーザーDB(PostgreSQL/MySQL)へ接続確認できる（knex抽象化、GET /api/schema、INFORMATION_SCHEMAスキーマ取得、ユニットテスト）
- PBI #7: SELECTのみ実行可能な安全なSQL実行基盤（sqlValidator.ts、database.executeQuery()、二重防御、ユニットテスト27件）
- PBI #8: Claude APIで自然言語からSQL/グラフ種を生成できる（llm.ts、POST /api/chat SSEストリーミング、ユニットテスト76件）
