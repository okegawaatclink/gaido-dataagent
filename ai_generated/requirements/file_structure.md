# ディレクトリ構成

```
output_system/
├── docker-compose.yml          # フロントエンド + バックエンド定義
├── Dockerfile                  # マルチステージビルド
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
│       ├── App.tsx             # ルートコンポーネント
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
│       │   ├── Header/
│       │   │   ├── Header.tsx           # ヘッダーコンテナ（改修）
│       │   │   └── DbSelector.tsx       # DB選択ドロップダウン（新規）
│       │   ├── DbManagement/
│       │   │   ├── DbManagementModal.tsx  # DB管理モーダル（新規）
│       │   │   ├── DbConnectionForm.tsx   # DB接続先登録・編集フォーム（新規）
│       │   │   └── DbConnectionList.tsx   # DB接続先一覧（新規）
│       │   ├── Welcome/
│       │   │   └── WelcomeGuide.tsx     # 初回起動ガイド（新規）
│       │   ├── SQL/
│       │   │   └── SQLDisplay.tsx       # 生成SQL表示
│       │   └── common/
│       │       ├── ErrorMessage.tsx     # エラー表示
│       │       ├── Loading.tsx          # ローディング
│       │       └── Toast.tsx            # トースト通知（新規）
│       ├── hooks/
│       │   ├── useChat.ts              # チャットロジック（改修: dbConnectionId対応）
│       │   ├── useStreaming.ts          # ストリーミング処理
│       │   ├── useHistory.ts           # 履歴管理（改修: dbConnectionIdフィルター）
│       │   └── useDbConnections.ts     # DB接続先管理（新規）
│       ├── services/
│       │   └── api.ts                  # バックエンドAPI呼び出し（改修: 接続先API追加）
│       ├── types/
│       │   └── index.ts               # 型定義（改修: DbConnection型追加）
│       └── styles/
│           └── global.css             # グローバルスタイル
│
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                   # エントリポイント
│       ├── routes/
│       │   ├── chat.ts                # チャットAPI（改修: dbConnectionId対応）
│       │   ├── history.ts             # 履歴API（改修: dbConnectionIdフィルター）
│       │   ├── schema.ts             # スキーマAPI（改修: dbConnectionId対応）
│       │   └── connections.ts         # DB接続先API（新規）
│       ├── services/
│       │   ├── llm.ts                 # Claude API連携
│       │   ├── database.ts            # DB接続・クエリ実行（改修: 動的接続対応）
│       │   ├── schema.ts             # スキーマ情報取得（改修: 接続先指定対応）
│       │   ├── sqlValidator.ts        # SQLバリデーション (SELECTのみ)
│       │   ├── history.ts            # クエリ履歴管理（改修: dbConnectionId対応）
│       │   ├── connectionManager.ts   # DB接続先管理（新規）
│       │   └── encryption.ts          # パスワード暗号化（新規: AES-256-GCM）
│       ├── types/
│       │   └── index.ts              # 型定義（改修: DbConnection型追加）
│       └── config/
│           └── index.ts              # 環境変数・設定管理（改修: DB_ENCRYPTION_KEY追加）
│
└── test/
    ├── e2e/
    │   ├── chat.spec.ts              # E2Eテスト
    │   └── dbConnections.spec.ts     # DB接続先管理E2Eテスト（新規）
    └── unit/
        ├── sqlValidator.test.ts       # SQLバリデーションテスト
        ├── schema.test.ts            # スキーマ取得テスト
        ├── connectionManager.test.ts  # 接続先管理テスト（新規）
        └── encryption.test.ts         # 暗号化テスト（新規）
```
