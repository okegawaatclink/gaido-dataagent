# HANDOVER

## 技術スタック
- フロントエンド: React 18 + TypeScript + Vite 5
- バックエンド: Node.js 20 + Express 4 + TypeScript
- テスト: Playwright (E2E)
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
│   ├── package.json         # Express 4, cors, ts-node-dev
│   └── src/index.ts         # GET /api/health エンドポイント
└── test/e2e/app.spec.ts     # 疎通確認テスト（3件）
```

## ビルド・起動方法

```bash
# .envファイルの準備（初回のみ）
cp output_system/.env.example output_system/.env

# 起動（output_system/ で実行）
cd output_system
docker compose build
docker compose up -d

# 確認
docker compose ps
curl http://localhost:3002/api/health  # または コンテナIP使用

# E2Eテスト（AI Agent container上で実行）
cd output_system
npx playwright test test/e2e/app.spec.ts
```

## 設計判断

- **単一コンテナ構成**: フロントエンドとバックエンドを1コンテナにまとめた。instance-config.mdでコンテナ名が1つ（フロントエンド）に設定されているため。Dockerfileで両方を起動する
- **concurrently**: 単一コンテナで複数プロセス起動のためconcurrentlyを採用。supervisordやforemanは過剰のため不採用
- **vite preview**: DockerコンテナではViteのdevモードではなくbuildしてpreviewサーブ。devモードはHMRのWebSocket接続が必要でコンテナ環境と相性が悪い場合があるため
- **CORS設定**: フロント（3001）とバックエンド（3002）のオリジンが異なるため明示的にCORS設定が必要

## はまりポイント

- **WSL2でlocalhostポートフォワード不可**: `curl http://localhost:3002` が `ERR_CONNECTION_REFUSED` になる。コンテナIPを使う: `CONTAINER_IP=$(docker inspect <container_name> --format='{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')`
- **Vite 5のホスト制限**: `allowedHosts` に `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` 環境変数経由でコンテナ名を設定しないとAI Agent containerからアクセスできない

## 実装済み機能

- PBI #5: Docker Composeで雛形アプリを起動できる（frontend/backend一括起動、ヘルスチェックAPI、E2Eテスト）
