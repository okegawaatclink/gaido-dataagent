---
name: semantic-search-setup
description: SocratiCodeのQdrant/Ollamaコンテナを起動し、Embeddingモデルをダウンロードする。インデックス構築は含まない。
---

# Semantic Search コンテナ起動

SocratiCodeが使用するQdrant（ベクトルDB）とOllama（Embeddingサーバー）のDockerイメージを確認・取得し、コンテナを起動し、Embeddingモデルをダウンロードする。

MCP登録は`.mcp.json`に静的に記述済みのため、コンテナを起動するだけでSocratiCodeのツール（`codebase_index`、`codebase_search`等）が利用可能になる。

**注意**: このスキルはコンテナ起動+モデルダウンロードのみを行う。インデックス構築は `/semantic-search-start-indexing` で別途実行する。

## 前提条件

- Docker socketが利用可能（DooD構成）
- `.mcp.json`にsocraticode MCPサーバーが設定済み（gaido管理ファイルとして自動配布）
- 環境変数 `PROJECT_NAME_PREFIX` が設定済み（デフォルト: `gaido`）
- `/workspace/gaido/docker-compose.yaml` にQdrant/Ollamaサービスが`profiles: [semantic-search]`で定義済み

## 手順

以下の手順を上から順に実行すること。

### 1. Dockerイメージの確認とダウンロード

必要なイメージがローカルに存在するか確認し、なければダウンロードする。

```bash
# Qdrantイメージの確認
if ! docker image inspect qdrant/qdrant:v1.17.0 > /dev/null 2>&1; then
  echo "Qdrantイメージをダウンロードしています..."
  docker pull qdrant/qdrant:v1.17.0
else
  echo "Qdrantイメージは既にダウンロード済みです"
fi

# Ollamaイメージの確認
if ! docker image inspect ollama/ollama:0.18.2 > /dev/null 2>&1; then
  echo "Ollamaイメージをダウンロードしています..."
  docker pull ollama/ollama:0.18.2
else
  echo "Ollamaイメージは既にダウンロード済みです"
fi
```

### 2. コンテナ起動

```bash
docker compose -f /workspace/gaido/docker-compose.yaml --profile semantic-search up -d
```

起動確認:

```bash
docker ps --filter name=${PROJECT_NAME_PREFIX:-gaido}-qdrant --filter name=${PROJECT_NAME_PREFIX:-gaido}-ollama
```

両コンテナが`Up`状態であることを確認する。

### 3. Embeddingモデルのダウンロード（初回のみ）

初回はbge-m3モデル（約1.2GB）のダウンロードが必要。完了まで数分かかる。

```bash
docker exec ${PROJECT_NAME_PREFIX:-gaido}-ollama ollama pull bge-m3
```

### 4. 完了報告

コンテナ起動が正常に完了したら報告する。

## エラー時の対処

- Dockerイメージのダウンロードに失敗した場合: ネットワーク状態を確認し、リトライする
- コンテナ起動に失敗した場合: `docker compose logs`でエラー内容を確認し、報告する

## 注意事項

- マルチインスタンス環境では、`PROJECT_NAME_PREFIX`に応じてコンテナ名・ポートが変わる
- SocratiCodeの環境変数（`QDRANT_MODE=external`等）は`.mcp.json`で設定済み。手動での`claude mcp add`は不要
- ポートの使い分け: `.mcp.json`の`QDRANT_PORT=6333`/`OLLAMA_URL=...:11434`はコンテナ内ポート（Docker内部ネットワーク経由のアクセス用）。`docker-compose.yaml`の`QDRANT_HOST_PORT=16333`/`OLLAMA_HOST_PORT=11435`はホストポート（ホストPC外部からのアクセス用）。SocratiCode MCPはコンテナ名経由で接続するためホストポートは使用しない
