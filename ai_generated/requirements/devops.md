# デプロイ構造・コマンド

## デプロイ構成

### ローカル環境

Docker Composeで web（フロントエンド+バックエンド） + MySQL + phpMyAdmin を一括起動する構成。

### AWS環境

AWS ECS Fargate + ALB + EFS でホスト。CloudFormationテンプレートとデプロイスクリプトで一括デプロイ。

- **ECS Fargate**: web + MySQL + phpMyAdmin を1タスク内の3コンテナとして実行
- **ALB**: フロントエンド（/）とバックエンドAPI（/api/*）をパスベースルーティング
- **EFS**: SQLite履歴データとMySQLデータの永続化
- **ECR**: Dockerイメージのプライベートレジストリ
- **CloudWatch**: コンテナログの集約

## 環境変数

### ローカル環境（.envファイル）

| 変数名 | 説明 | 例 | 変更 |
|--------|------|-----|------|
| ANTHROPIC_API_KEY | Claude APIキー | sk-ant-... | 変更なし |
| ANTHROPIC_MODEL | 使用するClaude モデル名（省略時: claude-sonnet-4-20250514） | claude-sonnet-4-20250514 | 変更なし |
| USE_BEDROCK | Amazon Bedrock使用フラグ（trueでBedrock経由） | true | **新規追加** |
| DB_ENCRYPTION_KEY | DB接続先パスワード暗号化キー（32バイト hex文字列） | a1b2c3...（64文字） | **新規追加** |
| MYSQL_ROOT_PASSWORD | MySQLのrootパスワード | rootpassword | 変更なし |
| MYSQL_PORT | MySQLの外部公開ポート | 3306 | 変更なし |
| PHPMYADMIN_PORT | phpMyAdminのポート | 8080 | 変更なし |
| BACKEND_PORT | バックエンドポート | 3002 | 変更なし |
| FRONTEND_PORT | フロントエンドポート | 3001 | 変更なし |

### LLMバックエンド設定

| 設定 | Anthropic API直接 | Amazon Bedrock |
|------|-------------------|----------------|
| USE_BEDROCK | 未設定 or false | true |
| ANTHROPIC_API_KEY | 必須 | 不要（IAM認証） |
| デフォルトモデル | claude-sonnet-4-20250514 | apac.anthropic.claude-sonnet-4-20250514-v1:0 |
| AWS_REGION | 不要 | ap-northeast-1（デフォルト） |

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

## AWS ECS Fargateデプロイ

### デプロイコマンド

```bash
cd output_system/aws

# Anthropic API直接利用
./deploy.sh --api-key sk-ant-xxx --vpc-id vpc-xxx --subnet-ids "subnet-aaa,subnet-bbb"

# Amazon Bedrock利用（AWS内完結）
./deploy.sh --use-bedrock --vpc-id vpc-xxx --subnet-ids "subnet-aaa,subnet-bbb"
```

### デプロイスクリプトの動作

1. ECRリポジトリ作成（未存在時）
2. Dockerイメージビルド（`--no-cache`、gitハッシュ+タイムスタンプのユニークタグ）
3. ECRへプッシュ（ユニークタグ + latestの両方）
4. CloudFormationスタックデプロイ（タスク定義の更新を検出）
5. ECSサービスの強制再デプロイ（`--force-new-deployment`）

### CloudFormation構成

| リソース | 説明 |
|---------|------|
| ECS Cluster | containerInsights有効 |
| ALB | internet-facing、HTTP/HTTPS対応 |
| ECS Task Definition | web + mysql + phpmyadmin の3コンテナ |
| EFS | 履歴データ（SQLite）+ MySQLデータの永続化 |
| IAM Role | Bedrock InvokeModel権限（foundation-model + inference-profile ARN対応） |
| Security Groups | ALB→タスク（3001, 3002, 8080）、タスク→EFS（2049） |

### AWS環境の主要オプション

| オプション | 説明 | デフォルト |
|-----------|------|-----------|
| --region | AWSリージョン | ap-northeast-1 |
| --vpc-id | VPC ID | （必須） |
| --subnet-ids | サブネットID（2つ以上、異なるAZ） | （必須） |
| --api-key | Anthropic APIキー | （--use-bedrock未指定時は必須） |
| --use-bedrock | Amazon Bedrock使用 | false |
| --cert-arn | ACM証明書ARN（HTTPS用） | （省略可） |
| --cpu | タスクCPU（512/1024/2048/4096） | 1024 |
| --memory | タスクメモリMB | 2048 |

## アクセスURL

### ローカル

| サービス | URL |
|---------|-----|
| フロントエンド | http://localhost:3001 |
| バックエンドAPI | http://localhost:3002 |
| phpMyAdmin | http://localhost:8080 |

### AWS

| サービス | URL |
|---------|-----|
| フロントエンド | http://{ALB DNS名} |
| バックエンドAPI | http://{ALB DNS名}/api/* |
