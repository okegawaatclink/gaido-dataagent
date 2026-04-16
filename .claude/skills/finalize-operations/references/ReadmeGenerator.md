# README.md作成手順

## 概要

プロジェクトルートに `README.md` を作成する。

## README.md テンプレート

```markdown
# [プロジェクト名]

## 概要

[システムの概要を1-2文で説明]

## 達成目標

[要件ファイルから「プロジェクト目標」を抜粋]

## システム構成

[要件ファイルの「システム構成図」をコピー（mermaid flowchart）]

## 画面フロー

[要件ファイルの「画面遷移図」をコピー（mermaid stateDiagram）]
[実装後の最終構造を再調査して出力]

## 画面詳細

### {画面名}

- **URL**: `/{path}`

![{画面名}](ai_generated/readme_screenshots/{english_name}.png)

#### UI要素

| 要素 | 挙動 | DB対応（テーブル.カラム） |
|------|------|--------------------------|
| ユーザ名テキスト | 表示のみ | users.name |
| 編集ボタン | クリックで編集画面へ遷移 | - |

#### 画面遷移条件
- 編集ボタンをクリック → ユーザ編集画面へ遷移
- 戻るボタンをクリック → ダッシュボードへ遷移

（全画面分を繰り返し）

## ER図

[要件ファイルの「ER図」をコピー（mermaid erDiagram）]
[実装後の最終構造を再調査して出力]

## ディレクトリ構成

[tree形式で実際のディレクトリ構成を出力]

## WebAPIエンドポイント一覧

[要件ファイルの「API一覧」をコピー、または実装から抽出]

| Method | Path | 説明 |
|--------|------|------|
| GET | /api/xxx | xxx |

詳細は [openapi.yaml](./output_system/openapi.yaml) を参照。

## 起動方法

\`\`\`bash
docker compose up -d
\`\`\`

アクセスURL: `.claude/rules/instance-config.md` のフロントエンドURLを参照

## ライセンス

UNLICENSED
```

## 作成手順

1. 要件ファイル（`ai_generated/requirements/` 配下の各ファイル）を読み込む
   - システム構成図 → `architecture.md`
   - 画面遷移図 → `screens.md`
   - ER図 → `db.md`
   - API一覧 → `api.md`
   - 確定要件・概要 → `README.md`
2. 実装後の最終構造を確認
   ```bash
   # ディレクトリ構成を確認（output_system/配下）
   ls -la output_system/
   find output_system/ -type f -name "*.ts" -o -name "*.tsx" | head -20

   # APIエンドポイントを確認（実装を調査）
   ```
3. **APIがある場合、OpenAPI形式でまとめたopenapi.yamlを作成**
   - 実装されたAPIエンドポイントをOpenAPI 3.0形式でまとめる
   - `output_system/openapi.yaml`として保存
   - README.mdからリンクする
4. **実装された画面を調査し、画面詳細セクションを生成する**
   - a. `output_system/` 配下の実装されたルーティング定義（React Router, Next.js pages等）からURL一覧を抽出
   - b. Output Systemコンテナの起動を確認し、各画面のスクリーンショットをPlaywrightで新規撮影する
     - **起動確認**: 撮影前に `docker compose ps`（`output_system/`で実行）でOutput Systemコンテナが起動していることを確認する。未起動の場合は `docker compose up -d` で起動する
     - **URLの指定**: `rules/instance-config.md` の「**コンテナ内からアクセスする時のフロントエンドURL**」を使用すること。`localhost`ではなくコンテナ名を使う（`rules/constraints.md`の「PlaywrightからのURL指定ルール」参照）
     - Playwright・Chromiumはプリインストール済み。`npx playwright screenshot`で撮影（`docker run mcr.microsoft.com/playwright` は禁止）
     - 撮影コマンド例（デフォルト値の例）: `npx playwright screenshot http://output-system-container:3001 ai_generated/readme_screenshots/{english_name}.png`
     - 保存先: `ai_generated/readme_screenshots/{english_name}.png`
     - 既存のスクリーンショット（`ai_generated/screenshots/` 等）は再利用しない。実装後の最終状態を撮り直す
   - c. 各画面のUI要素を実装コードから抽出し、挙動とDB対応を記載
   - d. 画面間の遷移条件を実装コードから抽出
   - **実装を正とする**: screen_detail.mdやrequirements/配下のファイルではなく、実際のコードとDBスキーマから生成すること
   - **スクリーンショットは必須**: テキストだけでなく視覚的に画面を確認できること
5. テンプレートに沿ってREADME.mdを作成
