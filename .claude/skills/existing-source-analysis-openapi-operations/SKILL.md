---
name: existing-source-analysis-openapi-operations
description: ソースコードからWebAPI定義を解析し、openapi.yamlを生成する手順。
user-invocable: false
---

# WebAPI定義解析手順

ソースコードからWebAPI定義を解析し、OpenAPI形式で `ai_generated/intermediate_files/from_source/openapi.yaml` に生成します。

## 前提作業

**作業開始前に必ず `CLAUDE.md` を読み込むこと。** プロジェクト全体のルール（mermaid記法の使用、コード配置規約等）を把握してから作業を開始する。

**図表はすべてmermaid記法で記述すること（該当する場合）。** ASCIIアート、テキスト図は禁止。

## 言語ルール

**すべての出力は日本語で記述すること。** openapi.yaml内のdescriptionフィールド、summary、すべて日本語。英語で出力してはならない。エンドポイントパス・HTTPメソッド・スキーマのプロパティ名等はそのまま（英語のまま）でよいが、説明文は日本語。

## 参照制約

解析対象は `output_system*/` 配下のソースコードのみ。

以下のディレクトリ・ファイルは**参照禁止**:

- `.claude/`
- `ai_generated/`
- `docs_with_ai/`
- `existing_docs/`

## 出力先

- `ai_generated/intermediate_files/from_source/openapi.yaml`

## 解析内容

以下をソースコードから読み取り、OpenAPI 3.0形式のYAMLで記載する:

- エンドポイント一覧（パス、HTTPメソッド）
- リクエストパラメータ（パスパラメータ、クエリパラメータ、ヘッダー）
- リクエストボディのスキーマ
- レスポンスのスキーマとステータスコード
- 認証方式（Bearer, Cookie, API Key等）
- 共通スキーマ（components/schemas）

ソースコードから読み取れた事実のみを記載。推測は「推測:」と明記する。

WebAPI が存在しないシステムの場合は、その旨を記載したopenapi.yamlを生成する（コメントのみのYAML）。

## others.mdへの追記

自分の担当外だが記録すべき情報を見つけた場合、`ai_generated/intermediate_files/from_source/others.md` に追記する。追記のみ許可、既存内容の編集は禁止。
