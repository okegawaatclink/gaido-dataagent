---
name: semantic-search-start-indexing
description: SocratiCodeのMCPツールでインデックス構築を開始する。codebase_indexは即returnし、実際の構築はMCPサーバー側で非同期実行される。
user-invocable: false
---

# Semantic Search インデックス構築開始

SocratiCodeのMCPツールでインフラ状態を確認し、インデックス構築を開始する。

`codebase_index`は即returnし、実際のembedding生成はollama側で非同期実行される。完了確認は実装フェーズ直前に親が`codebase_status`で行う。

**前提条件**: `/semantic-search-setup` によりQdrant/Ollamaコンテナが起動済みであること。

## 手順

### 1. インフラ状態確認

`codebase_health` でインフラ状態を確認する。全項目OKであること。OKでない項目がある場合はエラー内容を報告して終了する。

### 2. インデックス構築開始

`codebase_index` でインデックス構築を開始する（MCPサーバー側で非同期実行される）。

## エラー時の対処

- `codebase_health`でOKでない項目がある場合: エラー内容をそのまま報告する
- `codebase_index`がエラーを返した場合: エラー内容を報告する
