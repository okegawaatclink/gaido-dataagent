---
name: existing-source-analysis-architecture-operations
description: ソースコードからアーキテクチャを解析し、architecture.mdを生成する手順。
user-invocable: false
---

# アーキテクチャ解析手順

ソースコードからシステムアーキテクチャを解析し、`ai_generated/intermediate_files/from_source/architecture.md` に生成します。

## 前提作業

**作業開始前に必ず `CLAUDE.md` を読み込むこと。** プロジェクト全体のルール（mermaid記法の使用、コード配置規約等）を把握してから作業を開始する。

**図表はすべてmermaid記法で記述すること。** ASCIIアート、テキスト図、箇条書きによる関係表現は禁止。システム構成図、コンポーネント関係図、通信フロー図等はすべてmermaidコードブロック（` ```mermaid `）を使う。

## 言語ルール

**すべての出力は日本語で記述すること。** architecture.mdの説明文、技術スタックの説明、構成図のラベル、すべて日本語。英語で出力してはならない。ライブラリ名・フレームワーク名等の固有名詞はそのまま（英語のまま）でよいが、説明文は日本語。

## 参照制約

解析対象は `output_system*/` 配下のソースコードのみ。

以下のディレクトリ・ファイルは**参照禁止**:

- `.claude/`
- `ai_generated/`
- `docs_with_ai/`
- `existing_docs/`

## 出力先

- `ai_generated/intermediate_files/from_source/architecture.md`

## 解析内容

以下をソースコードから読み取り、architecture.mdに記載する:

- 技術スタック（言語、フレームワーク、主要ライブラリとバージョン）
- アーキテクチャパターン（MVC, Clean Architecture, Hexagonal等）
- 主要コンポーネントとその関係（mermaid記法で図示）
- ミドルウェア・プラグイン構成
- 設定管理方式（環境変数、設定ファイル等）
- エラーハンドリング方針
- ログ出力方式

ソースコードから読み取れた事実のみを記載。推測は「推測:」と明記する。

## others.mdへの追記

自分の担当外だが記録すべき情報を見つけた場合、`ai_generated/intermediate_files/from_source/others.md` に追記する。追記のみ許可、既存内容の編集は禁止。
