# Context7 MCP

サードパーティのライブラリを使用する場合は、必ずContext7でドキュメントを確認すること。
CLIとして使う場合（npx playwright等）も含む。

**記憶に頼らない。熟知していても確認を省略してはならない。**

実装前に確認する。ライブラリ追加時も必ず確認する。

## 例外

- Context7で見つからない場合はスキップ

## 呼び出し手順

1. `mcp__context7__resolve-library-id` でlibrary_id取得
2. `mcp__context7__query-docs` でドキュメント取得
