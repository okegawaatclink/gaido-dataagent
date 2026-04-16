# Mermaid構文検証ルール

mermaid記法は文法エラーになりやすく、マークダウンのLintでは検出できない（マークダウンとしては正しいため）。
mermaidを含むマークダウンをcommitする前に、必ず `md-mermaid-lint` で構文検証すること。

参考: https://github.com/suwa-sh/md-mermaid-lint

## 検証コマンド

```bash
npx md-mermaid-lint "対象ファイルのglobパターン"
```

例:
```bash
# 要件ファイルを検証
npx md-mermaid-lint "ai_generated/requirements/**/*.md"

# ai_generated配下のマークダウンをすべて検証
npx md-mermaid-lint "ai_generated/**/*.md"

# README.mdを検証
npx md-mermaid-lint "README.md"
npx md-mermaid-lint "output_system/README.md"
```

## エラーが出た場合

1. エラーメッセージにファイル名と行番号が表示される
2. 該当箇所のmermaid記法を修正する
3. 再度 `npx md-mermaid-lint` を実行し、エラーが解消されるまで繰り返す

### よくあるエラーと対処

- **ノード名に特殊文字**: テキストは `"` で囲む（例: `A["ノード名"]`）
- **矢印の記法ミス**: `-->` や `==>` の記法をContext7で確認
- **ラベル付き矢印**: `A -->|"ラベル"| B` の形式を使う
- **インデント不正**: mermaidブロック内のインデントを確認
- **`\n` は改行にならない**: mermaid内で `\n` はそのまま文字列として表示される。改行したい場合は `<br>` を使うか、ノードを分割すること
