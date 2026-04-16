---
name: existing-source-analysis-screens-operations
description: ソースコードから画面構成を解析し、screens.mdを生成する手順。
user-invocable: false
---

# 画面構成解析手順

ソースコードから画面構成・画面遷移を解析し、`ai_generated/intermediate_files/from_source/screens.md` に生成します。

## 前提作業

**作業開始前に必ず `CLAUDE.md` を読み込むこと。** プロジェクト全体のルール（mermaid記法の使用、コード配置規約等）を把握してから作業を開始する。

**図表はすべてmermaid記法で記述すること。** ASCIIアート、テキスト図、箇条書きによる関係表現は禁止。画面遷移図、コンポーネント構成図等はすべてmermaidコードブロック（` ```mermaid `）を使う。

## 言語ルール

**すべての出力は日本語で記述すること。** screens.mdの説明文、画面名、遷移図のラベル、すべて日本語。英語で出力してはならない。URL・コンポーネント名等のコード表現はそのまま（英語のまま）でよいが、説明文は日本語。

## 参照制約

解析対象は `output_system*/` 配下のソースコードのみ。

以下のディレクトリ・ファイルは**参照禁止**:

- `.claude/`
- `ai_generated/`
- `docs_with_ai/`
- `existing_docs/`

## 出力先

- `ai_generated/intermediate_files/from_source/screens.md`

## 解析内容

以下をソースコードから読み取り、screens.mdに記載する:

- 画面一覧（ページ名、URL/パス）
- 画面遷移図（mermaid記法）
- 各画面のコンポーネント構成
- ルーティング定義（React Router, Next.js pages, Vue Router等）
- フォーム・入力要素の一覧
- モーダル・ダイアログの一覧

WebシステムならURL込みで記載する。

ソースコードから読み取れた事実のみを記載。推測は「推測:」と明記する。

UIが存在しないシステム（バッチ処理等）の場合は、その旨を記載したscreens.mdを生成する。

## others.mdへの追記

自分の担当外だが記録すべき情報を見つけた場合、`ai_generated/intermediate_files/from_source/others.md` に追記する。追記のみ許可、既存内容の編集は禁止。
