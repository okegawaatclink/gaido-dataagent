# ディレクトリ構成

```
output_system/
├── docker-compose.yml          # フロントエンド + バックエンド + MySQL + phpMyAdmin + MockAPI
├── Dockerfile                  # マルチステージビルド
├── Dockerfile.mock-api         # モックAPIサーバー用
├── .env.example                # 環境変数テンプレート
├── package.json                # ルートpackage.json (workspaces)
├── tsconfig.base.json          # 共通TypeScript設定
│
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx            # エントリポイント
│       ├── App.tsx             # ルートコンポーネント（React Router追加）
│       ├── components/
│       │   ├── Chat/
│       │   │   ├── ChatContainer.tsx    # チャット全体コンテナ
│       │   │   ├── ChatInput.tsx        # メッセージ入力フォーム
│       │   │   ├── ChatMessage.tsx      # 個別メッセージ表示
│       │   │   └── StreamingText.tsx    # ストリーミングテキスト表示
│       │   ├── Chart/
│       │   │   ├── ChartRenderer.tsx    # グラフ種類振り分け
│       │   │   ├── BarChart.tsx         # 棒グラフ
│       │   │   ├── LineChart.tsx        # 折れ線グラフ
│       │   │   ├── PieChart.tsx         # 円グラフ
│       │   │   └── DataTable.tsx        # テーブル表示
│       │   ├── Sidebar/
│       │   │   ├── Sidebar.tsx          # サイドバーコンテナ
│       │   │   └── HistoryItem.tsx      # 履歴アイテム
│       │   ├── SQL/
│       │   │   └── SQLDisplay.tsx       # 生成SQL表示
│       │   ├── GraphQL/
│       │   │   └── GraphQLDisplay.tsx   # 生成GraphQLクエリ表示（新規）
│       │   ├── Settings/
│       │   │   ├── SettingsPage.tsx     # 設定画面（新規）
│       │   │   ├── DataSourceSelector.tsx  # データソース切替（新規）
│       │   │   ├── ApiSpecForm.tsx      # OpenAPI Spec登録フォーム（新規）
│       │   │   └── ApiSpecList.tsx      # 登録済みAPI一覧（新規）
│       │   └── common/
│       │       ├── ErrorMessage.tsx     # エラー表示
│       │       └── Loading.tsx          # ローディング
│       ├── hooks/
│       │   ├── useChat.ts              # チャットロジック
│       │   ├── useStreaming.ts          # ストリーミング処理
│       │   ├── useHistory.ts           # 履歴管理
│       │   ├── useSettings.ts          # データソース設定管理（新規）
│       │   └── useApiSpecs.ts          # OpenAPI Spec管理（新規）
│       ├── services/
│       │   └── api.ts                  # バックエンドAPI呼び出し
│       ├── types/
│       │   └── index.ts               # 型定義
│       └── styles/
│           └── global.css             # グローバルスタイル
│
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                   # エントリポイント
│       ├── routes/
│       │   ├── chat.ts                # チャットAPI (POST /api/chat)
│       │   ├── history.ts             # 履歴API (GET/DELETE /api/history)
│       │   ├── schema.ts             # スキーマAPI (GET /api/schema)
│       │   ├── settings.ts           # 設定API (GET/PUT /api/settings)（新規）
│       │   └── specs.ts              # OpenAPI Spec管理API（新規）
│       ├── services/
│       │   ├── llm.ts                 # Claude API連携（GraphQLクエリ生成追加）
│       │   ├── database.ts            # DB接続・クエリ実行
│       │   ├── schema.ts             # スキーマ情報取得
│       │   ├── sqlValidator.ts        # SQLバリデーション (SELECTのみ)
│       │   ├── history.ts            # クエリ履歴管理
│       │   ├── graphqlGateway.ts     # OpenAPI→GraphQL変換+実行（新規）
│       │   ├── graphqlValidator.ts   # GraphQLバリデーション（Queryのみ許可）（新規）
│       │   ├── apiSpecManager.ts     # OpenAPI Spec管理（新規）
│       │   └── settings.ts           # データソース設定管理（新規）
│       ├── types/
│       │   └── index.ts              # 型定義
│       └── config/
│           └── index.ts              # 環境変数・設定管理
│
├── mock-api/
│   ├── package.json               # モックAPIサーバー依存関係（新規）
│   ├── openapi.yaml               # モック用OpenAPI 3.0 Spec（新規）
│   └── server.ts                  # モックAPIサーバー実装（新規）
│
└── test/
    ├── e2e/
    │   ├── chat.spec.ts              # E2Eテスト（既存）
    │   ├── api-mode.spec.ts          # APIモードE2Eテスト（新規）
    │   └── settings.spec.ts          # 設定画面E2Eテスト（新規）
    └── unit/
        ├── sqlValidator.test.ts       # SQLバリデーションテスト
        ├── schema.test.ts            # スキーマ取得テスト
        ├── graphqlValidator.test.ts   # GraphQLバリデーションテスト（新規）
        └── apiSpecManager.test.ts    # OpenAPI Spec管理テスト（新規）
```
