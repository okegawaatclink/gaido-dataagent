# デプロイ構造・コマンド

## デプロイ構成

Docker Composeで web（フロントエンド+バックエンド） + MySQL + phpMyAdmin + mock-api を一括起動する構成。

## 環境変数

`.env` ファイルで以下を設定:

| 変数名 | 説明 | 例 |
|--------|------|-----|
| ANTHROPIC_API_KEY | Claude APIキー | sk-ant-... |
| ANTHROPIC_MODEL | 使用するClaude モデル名（省略時: claude-sonnet-4-20250514） | claude-sonnet-4-20250514 |
| DB_TYPE | データベース種類 | mysql |
| DB_HOST | DBホスト（コンテナ名） | okegawaatclink-gaido-dataagent-mysql |
| DB_PORT | DBポート | 3306 |
| DB_USER | DBユーザー名（リードオンリー） | readonly_user |
| DB_PASSWORD | DBパスワード | ******* |
| DB_NAME | データベース名 | sampledb |
| MYSQL_ROOT_PASSWORD | MySQLのrootパスワード | rootpassword |
| MYSQL_PORT | MySQLの外部公開ポート | 3306 |
| PHPMYADMIN_PORT | phpMyAdminのポート | 8080 |
| BACKEND_PORT | バックエンドポート | 3002 |
| FRONTEND_PORT | フロントエンドポート | 3001 |
| MOCK_API_PORT | モックAPIサーバーポート | 3003 |

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
      - MOCK_API_URL=http://<instance-config参照>-mock-api:3003
    depends_on:
      mysql:
        condition: service_healthy

  mysql:
    image: mysql:8.0
    container_name: <instance-config参照>-mysql
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:-rootpassword}
      MYSQL_DATABASE: ${DB_NAME:-sampledb}
      MYSQL_USER: ${DB_USER:-readonly_user}
      MYSQL_PASSWORD: ${DB_PASSWORD:-readonlypass}
    ports:
      - "${MYSQL_PORT:-3306}:3306"
    volumes:
      - mysql-data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s

  phpmyadmin:
    image: phpmyadmin:5
    container_name: <instance-config参照>-phpmyadmin
    environment:
      PMA_HOST: <mysql-container-name>
      PMA_PORT: 3306
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:-rootpassword}
    ports:
      - "${PHPMYADMIN_PORT:-8080}:80"
    depends_on:
      mysql:
        condition: service_healthy

  mock-api:
    build:
      context: ..
      dockerfile: output_system/Dockerfile.mock-api
    container_name: <instance-config参照>-mock-api
    ports:
      - "${MOCK_API_PORT:-3003}:3003"

volumes:
  mysql-data:

networks:
  default:
    name: <instance-config参照>
    external: true
```

※ 実際のコンテナ名・ネットワーク名は `rules/instance-config.md` を参照

## アクセスURL

| サービス | URL |
|---------|-----|
| フロントエンド | http://localhost:3001 |
| バックエンドAPI | http://localhost:3002 |
| phpMyAdmin | http://localhost:8080 |
| モックAPIサーバー | http://localhost:3003 |
