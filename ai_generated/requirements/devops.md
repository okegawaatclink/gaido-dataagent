# デプロイ構造・コマンド

## デプロイ構成

Docker Composeで フロントエンド + バックエンド を一括起動する構成。

## 環境変数

`.env` ファイルで以下を設定:

| 変数名 | 説明 | 例 |
|--------|------|-----|
| ANTHROPIC_API_KEY | Claude APIキー | sk-ant-... |
| DB_TYPE | データベース種類 | postgresql / mysql |
| DB_HOST | DBホスト | localhost |
| DB_PORT | DBポート | 5432 / 3306 |
| DB_USER | DBユーザー名（リードオンリー） | readonly_user |
| DB_PASSWORD | DBパスワード | ******* |
| DB_NAME | データベース名 | mydb |
| BACKEND_PORT | バックエンドポート | 3002 |
| FRONTEND_PORT | フロントエンドポート | 3001 |

## コマンド

### ビルド・起動

```bash
cd output_system
docker compose build
docker compose up -d
```

### 停止

```bash
cd output_system
docker compose down
```

### ログ確認

```bash
docker compose logs -f
```

### コンテナ内でのデバッグ

```bash
docker compose exec web bash
```

## Docker Compose構成

```yaml
services:
  web:
    build:
      context: ..
      dockerfile: output_system/Dockerfile
    container_name: <instance-config参照>
    ports:
      - "${FRONTEND_PORT:-3001}:3001"
      - "${BACKEND_PORT:-3002}:3002"
    env_file:
      - .env
    environment:
      - __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=<instance-config参照>

networks:
  default:
    name: <instance-config参照>
    external: true
```

※ 実際のコンテナ名・ネットワーク名は `rules/instance-config.md` を参照
