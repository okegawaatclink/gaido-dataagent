---
name: existing-source-analysis-db-operations
description: ソースコードからDB構造を解析し、db.mdを生成する手順。
user-invocable: false
---

# DB構造解析手順

ソースコードからデータベース構造を解析し、ER図（型情報込み）を `ai_generated/intermediate_files/from_source/db.md` に生成します。

## 前提作業

**作業開始前に必ず `CLAUDE.md` を読み込むこと。** プロジェクト全体のルール（mermaid記法の使用、コード配置規約等）を把握してから作業を開始する。

**図表はすべてmermaid記法で記述すること。** ASCIIアート、テキスト図、箇条書きによる関係表現は禁止。ER図、関係図、フロー図等はすべてmermaidコードブロック（` ```mermaid `）を使う。

## 言語ルール

**すべての出力は日本語で記述すること。** db.mdの説明文、テーブル定義の説明、ER図のラベル、すべて日本語。英語で出力してはならない。カラム名・型名・SQL等のコード表現はそのまま（英語のまま）でよいが、説明文は日本語。

## 参照制約

解析対象は `output_system*/` 配下のソースコードのみ。

以下のディレクトリ・ファイルは**参照禁止**:

- `.claude/`
- `ai_generated/`
- `docs_with_ai/`
- `existing_docs/`

## 出力先

- `ai_generated/intermediate_files/from_source/db.md`

## 解析内容

以下をソースコードから読み取り、db.mdに記載する:

- テーブル定義（カラム名、型、制約）
- ER図（mermaid記法）
- リレーション（外部キー、参照関係）
- マイグレーションファイルがあればその内容
- ORM定義（Prisma, TypeORM, SQLAlchemy等）からのスキーマ抽出
- インデックス定義

ソースコードから読み取れた事実のみを記載。推測は「推測:」と明記する。

DB関連のソースが存在しない場合は、その旨を記載したdb.mdを生成する。

## others.mdへの追記

自分の担当外だが記録すべき情報を見つけた場合、`ai_generated/intermediate_files/from_source/others.md` に追記する。追記のみ許可、既存内容の編集は禁止。
