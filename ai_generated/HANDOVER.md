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
│   ├── src/
│   │   ├── App.tsx              # ヘッダー+サイドバー+チャットエリアのレイアウト
│   │   ├── hooks/
│   │   │   ├── useChat.ts       # チャット状態管理フック（SSE購読）
│   │   │   └── useStreaming.ts  # fetch+ReadableStream SSEパーサー
│   │   ├── types/index.ts       # ChatMessage / QueryResult / SSEイベント型
│   │   ├── services/api.ts      # VITE_API_BASE_URL ベースAPIURL管理
│   │   └── components/
│   │       ├── Chat/            # ChatContainer, ChatInput, ChatMessage, StreamingText
│   │       ├── SQL/SQLDisplay.tsx  # SQLコードブロック+コピーボタン
│   │       ├── Chart/DataTable.tsx # クエリ結果テーブル（最大500行）
│   │       ├── Sidebar/         # Sidebar, HistoryItem
│   │       └── common/          # Loading, ErrorMessage
├── test/
│   ├── e2e/
│   │   ├── app.spec.ts          # 疎通確認テスト（3件）
│   │   ├── chat.spec.ts         # チャットE2Eテスト（6件）
│   │   ├── chart.spec.ts        # グラフ表示E2Eテスト（6件）
│   │   └── datatable.spec.ts    # テーブル表示E2Eテスト（8件）
│   └── unit/
│       ├── schema.test.ts       # スキーマサービスユニットテスト（11件）
│       ├── sqlValidator.test.ts # SQLバリデーターユニットテスト（27件）
│       ├── llm.test.ts          # LLMサービスユニットテスト（76件）
│       └── frontend/
│           ├── useStreaming.test.ts  # SSEパーサー 5件
│           ├── useChat.test.ts      # チャットフック 9件
│           ├── DataTable.test.tsx   # テーブル表示 14件
│           ├── chartUtils.test.ts   # データ変換ロジック 12件
│           └── ChartComponents.test.tsx  # グラフコンポーネント 17件
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
- **chartUtils変換戦略**: columns[0]=カテゴリ（X軸）、columns[1+]=数値系列という単純な規約を採用。数値系列がゼロ本の場合canRender=falseでテーブルにフォールバック。DRY原則でBar/Line/PieChartが同一ユーティリティを共有
- **ChartRendererのデフォルトタブ**: LLM推奨chart_typeをデフォルトとし、数値系列なしの場合はtableにフォールバック。useState初期値はuseMemoで計算した値をそのまま使用
- **Rechartsテスト環境**: jsdomではResponsiveContainerのResizeObserverが未実装のためエラー。setup.tsにstubを追加。またResponsiveContainerはサイズ0でSVGを描画しないため、vi.mockでdivに差し替えdata-testidで確認する方式を採用
- **DataTableのNULL表示**: null/undefinedを空文字ではなく "NULL" 文字列として表示しCSSでグレー表示。空文字と区別できるよう視覚的に明示する
- **DataTableの数値列判定**: isNumericColumn() はNULLを除いた行で判定。全行NULLなら非数値列扱い。id列も数値として右寄せされる（仕様通り）
- **DataTableの日付フォーマット**: ISO 8601パターン（YYYY-MM-DD/YYYY-MM-DDTHH:mm:ss等）を正規表現で検出し、toLocaleDateString('ja-JP')でフォーマット。日付のみの場合はtimeZone: 'UTC'を指定してタイムゾーンのずれを防止
- **コピー機能の実装**: Clipboard APIは`window.isSecureContext`が必要。HTTP環境（コンテナ名アクセス）では使えないため、execCommandフォールバックを用意した
- **strict modeとPlaywright**: `page.locator()`は複数マッチするとstrict modeでエラーになる。`.first()`や`.filter()`で一意に絞ること

## はまりポイント

- **WSL2でlocalhostポートフォワード不可**: `curl http://localhost:3002` が `ERR_CONNECTION_REFUSED` になる。コンテナIPを使う: `CONTAINER_IP=$(docker inspect <container_name> --format='{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')`
- **Vite 5のホスト制限**: `allowedHosts` に `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` 環境変数経由でコンテナ名を設定しないとAI Agent containerからアクセスできない
- **crypto.randomUUID は HTTPS/localhost のみ**: HTTP経由でコンテナ名アクセスする場合は `crypto.randomUUID()` が使えない。`Date.now() + Math.random()` のフォールバックを用意すること
- **Playwright testMatch 設定**: `testDir: './test'` だけだと unit/ 配下のVitestファイルも拾う。`testMatch: '**/e2e/**/*.spec.ts'` で明示的に絞ること
- **vite preview にプロキシ機能なし**: `vite preview` は静的ファイルサービスのみ。`/api/xxx` の相対パスリクエストは同一オリジン（3001）に送られる。VITE_API_BASE_URL でバックエンドURLを明示する

## 実装済み機能

- PBI #5: Docker Composeで雛形アプリを起動できる（frontend/backend一括起動、ヘルスチェックAPI、E2Eテスト）
- PBI #6: ユーザーDB(PostgreSQL/MySQL)へ接続確認できる（knex抽象化、GET /api/schema、INFORMATION_SCHEMAスキーマ取得、ユニットテスト）
- PBI #7: SELECTのみ実行可能な安全なSQL実行基盤（sqlValidator.ts、database.executeQuery()、二重防御、ユニットテスト27件）
- PBI #8: Claude APIで自然言語からSQL/グラフ種を生成できる（llm.ts、POST /api/chat SSEストリーミング、ユニットテスト76件）
- PBI #9: チャット画面から質問を送信し結果JSONを受け取れる（useChat/useStreaming、ChatContainer/ChatInput/ChatMessage/SQLDisplay、DataTable、E2Eテスト6件）
- PBI #10: Rechartsで棒・折れ線・円グラフを確認できる（chartUtils/BarChart/LineChart/PieChart/ChartRenderer、4タブUI、ユニットテスト29件、E2Eテスト6件）
- PBI #11: テーブル形式で結果を参照・スクロール閲覧できる（DataTable本格実装、縦横スクロール/sticky header/ゼブラストライプ/NULL表示/数値右寄せ/日付フォーマット/コピー機能、ユニットテスト14件・E2Eテスト8件）
