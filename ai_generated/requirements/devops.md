# デプロイ構造・コマンド

## デプロイ構成

Docker Composeで web（フロントエンド+バックエンド） + MySQL + phpMyAdmin を一括起動する構成。今回の改修で構成変更なし。

## 環境変数

`.env` ファイルで以下を設定:

| 変数名 | 説明 | 例 | 変更 |
|--------|------|-----|------|
| ANTHROPIC_API_KEY | Claude APIキー | sk-ant-... | 変更なし |
| ANTHROPIC_MODEL | 使用するClaude モデル名（省略時: claude-sonnet-4-20250514） | claude-sonnet-4-20250514 | 変更なし |
| DB_ENCRYPTION_KEY | DB接続先パスワード暗号化キー（32バイト hex文字列） | a1b2c3...（64文字） | **新規追加** |
| MYSQL_ROOT_PASSWORD | MySQLのrootパスワード | rootpassword | 変更なし |
| MYSQL_PORT | MySQLの外部公開ポート | 3306 | 変更なし |
| PHPMYADMIN_PORT | phpMyAdminのポート | 8080 | 変更なし |
| BACKEND_PORT | バックエンドポート | 3002 | 変更なし |
| FRONTEND_PORT | フロントエンドポート | 3001 | 変更なし |

### 廃止された環境変数

以下の環境変数は今回の改修で廃止。DB接続先は画面から登録する方式に変更。

| 変数名 | 説明 | 理由 |
|--------|------|------|
| ~~DB_TYPE~~ | データベース種類 | 画面から登録に変更 |
| ~~DB_HOST~~ | DBホスト | 画面から登録に変更 |
| ~~DB_PORT~~ | DBポート | 画面から登録に変更 |
| ~~DB_USER~~ | DBユーザー名 | 画面から登録に変更 |
| ~~DB_PASSWORD~~ | DBパスワード | 画面から登録に変更 |
| ~~DB_NAME~~ | データベース名 | 画面から登録に変更 |

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
