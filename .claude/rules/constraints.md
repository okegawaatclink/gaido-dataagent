# 制約事項

## Docker設定

### ベースイメージ

Output system container用Dockerfileのベースイメージは、**必ず ubuntu:24.04 を使うこと**。

理由: AI Agent側のベースイメージと同一にしないと、aptパッケージのバージョン違いで動かない。

**例外: 既存改修時は、既存プロジェクトのベースイメージをそのまま使用すること。** ubuntu:24.04の制約は新規開発時のみ適用する。既存プロジェクトのDockerfileを書き換えてはならない。

### docker-compose.yaml設定

AI Agent containerのネットワークに参加させ、コンテナ名でアクセスできるように定義すること。
docker-compose.ymlは `output_system/docker-compose.yml` に配置する。

**重要な点:**
- コンテナ名（container_name）を固定するとAI Agent containerからその名前でアクセス可能
- **実際のコンテナ名・ネットワーク名・ポート番号は `rules/instance-config.md` を参照**
- networksは external: true を指定
- 起動は `docker compose up -d`（`output_system/` で実行）

以下はデフォルト値での例:

```yaml
services:
  web:
    container_name: output-system-container
    ports:
      - "3001:3001"
      - "3002:3002"
    environment:
      - __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=output-system-container

networks:
  default:
    name: gaido-network  # ← デフォルト値。実際の値は rules/instance-config.md の「Dockerネットワーク名」を参照
    external: true
```

### SSL証明書設定

Dockerfileには**企業プロキシ用SSL証明書の設定を含めること**。

- `ssl-certificates/` ディレクトリに証明書が配置されている（entrypoint.shで自動コピー済み、ルート階層に存在）
- 証明書が存在しない環境でもビルドできるようオプショナルに実装
- **注意**: `ssl-certificates/` はルート階層にあるため、`output_system/` からの参照にはビルドコンテキストの設定が必要。Dockerfileで `COPY ../ssl-certificates/ ...` は使えないため、`docker compose build` の `context` を親ディレクトリに設定するか、entrypoint.shで `output_system/ssl-certificates/` にもコピーされたものを使用する

```dockerfile
# 企業プロキシ用SSL証明書のコピー（オプション）
# ビルドコンテキストに応じてパスを調整すること
COPY ssl-certificates/ /etc/ssl/certs/custom/

# SSL証明書をシステムCAストアに登録（オプション）
RUN if [ -f /etc/ssl/certs/custom/netskope.cer ]; then \
      cp /etc/ssl/certs/custom/netskope.cer /usr/local/share/ca-certificates/netskope.crt && \
      update-ca-certificates && \
      echo "Custom CA certificate registered to system CA store"; \
    fi

# Node.js依存パッケージのインストール（SSL証明書対応）
RUN if [ -f /etc/ssl/certs/custom/netskope.cer ]; then \
      export NODE_EXTRA_CA_CERTS=/etc/ssl/certs/custom/netskope.cer; \
    fi && \
    npm install
```

**重要**: `COPY ssl-certificates/` は、ディレクトリが空でもビルドが成功する（空ディレクトリがコピーされるだけ）。

**Node.js環境での注意**: Dockerfile内の`RUN npm install`等では、上記のように環境変数を同一RUN内で設定すること。

## PDFファイルの読み込み

PDFファイルは `pdfinfo` でページ数を確認し、Read toolの `pages` パラメータで読む（例: `pages: "1-20"`, `pages: "21-40"`）。一度に最大20ページ、`pages` の省略禁止。

## Office文書の読み込み

Office文書(.xlsx/.xls/.docx/.doc/.pptx/.ppt)は、PDFに変換してからRead toolで読むこと。例外: `read-excel-design` スキル実行時はXML直接読み取りのため変換不要。

```bash
libreoffice --headless --norestore --convert-to pdf --outdir "$(dirname "$FILE")" "$FILE"
```

変換後のPDFは元ファイルと同じディレクトリに生成される。読み込みは「PDFファイルの読み込み」ルールに従う。

## 大きなファイルの読み込み

外部から取得したファイル（Boxからのダウンロード等）をReadツールで読み込む際は、以下に注意すること:

- **テキストファイル**: 2000行を超える場合は `offset` と `limit` パラメータで分割して読む
- **読み込み前にサイズ確認**: `ls -lh` でファイルサイズを確認し、大きいファイルは分割読み込みを計画する
- **一括読み込みの禁止**: 大きなファイルを丸ごとReadしようとするとタイムアウトや無応答の原因になる

## Bashコマンドのタイムアウト

Bashコマンドの `timeout` は一律 `600000`（10分、Claude Code上限値）を指定すること。

## 環境情報

### AI Agent container

- `playwright`パッケージ、Chromiumブラウザ、依存ライブラリがプリインストール済み
- `playwright-cli` コマンドがグローバルインストール済み（対話的ブラウザ操作用）
- `npx playwright install chromium` は不要（既にインストール済み）
- LibreOffice（calc, writer, impress）と`fonts-noto-cjk`がプリインストール済み

### PlaywrightからのURL指定ルール

AI Agent containerからOutput System containerにPlaywrightでアクセスする場合、**`localhost`は絶対に使用しないこと**。`localhost`はAI Agent container自身を指すため、Output System containerには到達できない（`ERR_CONNECTION_REFUSED`になる）。

必ず `rules/instance-config.md` の「**コンテナ内からアクセスする時のフロントエンドURL**」を使用すること。

```bash
# NG: localhostはAI Agent container自身を指す
npx playwright screenshot http://localhost:3001 screenshot.png

# OK: コンテナ名経由（推奨、デフォルト値の例）
npx playwright screenshot http://output-system-container:3001 screenshot.png
```

`playwright.config.ts` の `baseURL` も同様:

```typescript
// NG
use: { baseURL: 'http://localhost:3001' }

// OK（デフォルト値の例。実際の値はrules/instance-config.mdを参照）
use: { baseURL: 'http://output-system-container:3001' }
```

**Viteのホスト制限**: Vite 5.x以降はデフォルトで `localhost` 以外のホスト名からのアクセスをブロックする。`docker-compose.yaml設定`セクションの `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` 環境変数でコンテナ名を許可済みだが、もしブロックされる場合はコンテナIPでアクセスすること:

```bash
# コンテナIPを取得してアクセス（コンテナ名でブロックされる場合のフォールバック）
CONTAINER_IP=$(docker inspect output-system-container --format='{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
npx playwright screenshot http://${CONTAINER_IP}:3001 screenshot.png
```

**WSL環境での注意**: WSL2環境ではDockerコンテナのポートフォワードが正常に動作しない場合がある。上記のコンテナIP取得方法で対応すること。

### Playwrightの使い分け

| フェーズ | 使用方法 | 目的 |
|---------|---------|------|
| 実装フェーズ | `playwright-cli`（対話的ブラウザ操作） | 動作確認・スクリーンショット取得 |
| テスト実装フェーズ | `@playwright/test`をimportしてテストコード作成 | E2Eテストスイート構築 |

### docker-compose使用ルール

コンテナを利用するときは、1つだけでも必ずdocker composeを利用すること。

- `docker run` ではなく `docker compose build` や `docker compose up` を利用
- docker-compose.yml内ではボリュームマウントは使用しない（AI Agent container依存になる）

**例外: 既存改修時のバインドマウント対応**: 既存のdocker-compose.ymlにホストバインドマウント（`./data:/app/data`等）が含まれる場合、`docker-compose.override.yml` を新規作成してDocker named volumeに上書きすること。既存ファイルは変更しない。

## URL表示ルール

ユーザーにURLを提示する際は、**1つのURLにつき1行**で記載すること。複数のURLを同一行に並べると、リンクが連結して正しくクリックできなくなる。

**NG（禁止）**:
```
アクセスURL: http://localhost:3001（フロントエンド）、http://localhost:3002（バックエンド）
```

**OK（正しい形式）**:
```
アクセスURL:
  - フロントエンド: http://localhost:3001
  - バックエンド: http://localhost:3002
```
