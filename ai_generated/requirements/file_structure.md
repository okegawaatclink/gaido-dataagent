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
│       │   ├── SQL/
│       │   │   └── SQLDisplay.tsx       # 生成SQL表示
│       │   └── common/
│       │       ├── ErrorMessage.tsx     # エラー表示
│       │       └── Loading.tsx          # ローディング
│       ├── hooks/
│       │   ├── useChat.ts              # チャットロジック
│       │   ├── useStreaming.ts          # ストリーミング処理
│       │   └── useHistory.ts           # 履歴管理
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
│       │   └── schema.ts             # スキーマAPI (GET /api/schema)
│       ├── services/
│       │   ├── llm.ts                 # Claude API連携
│       │   ├── database.ts            # DB接続・クエリ実行
│       │   ├── schema.ts             # スキーマ情報取得
│       │   ├── sqlValidator.ts        # SQLバリデーション (SELECTのみ)
│       │   └── history.ts            # クエリ履歴管理
│       ├── types/
│       │   └── index.ts              # 型定義
│       └── config/
│           └── index.ts              # 環境変数・設定管理
│
└── test/
    ├── e2e/
    │   └── chat.spec.ts              # E2Eテスト
    └── unit/
        ├── sqlValidator.test.ts       # SQLバリデーションテスト
        └── schema.test.ts            # スキーマ取得テスト
```
