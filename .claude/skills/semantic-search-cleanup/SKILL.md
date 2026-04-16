---
name: semantic-search-cleanup
description: SocratiCodeのQdrant/Ollamaコンテナを停止する。セマンティック検索が不要になったときに使用。
---

# Semantic Search 停止

SocratiCodeが使用するQdrant/Ollamaコンテナを停止・削除する。インデックスデータはボリュームに保持されるため、次回`/semantic-search-setup`時に再利用可能。

## 手順

### 1. コンテナ停止

```bash
docker compose -f /workspace/gaido/docker-compose.yaml --profile semantic-search down
```

### 2. 停止確認

```bash
docker ps --filter name=${PROJECT_NAME_PREFIX:-gaido}-qdrant --filter name=${PROJECT_NAME_PREFIX:-gaido}-ollama
```

コンテナが表示されないことを確認する。

## 補足

- `docker compose down`はボリュームを削除しない。インデックスデータ（`${PROJECT_NAME_PREFIX:-gaido}_qdrant_data`）とモデルデータ（`${PROJECT_NAME_PREFIX:-gaido}_ollama_data`）は保持される
- MCP設定は`.mcp.json`に残るが、コンテナが停止しているためSocratiCodeは接続エラーを返す（想定通りの動作）
- インデックスデータも完全に削除したい場合: `docker volume rm ${PROJECT_NAME_PREFIX:-gaido}_qdrant_data`
- モデルデータも削除したい場合: `docker volume rm ${PROJECT_NAME_PREFIX:-gaido}_ollama_data`
- 実際のボリューム名は`docker volume ls | grep qdrant_data`で確認できる
