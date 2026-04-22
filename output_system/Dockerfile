# =============================================================================
# DataAgent Dockerfile
# ベースイメージ: ubuntu:24.04 (constraints.md準拠)
# AI Agent containerと同一ベースイメージにより、aptパッケージバージョン不一致を防ぐ
# =============================================================================
FROM ubuntu:24.04

# タイムゾーンを非対話的に設定（apt-get install中のインタラクション防止）
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Asia/Tokyo

# =============================================================================
# システムパッケージのインストール
# =============================================================================
RUN apt-get update && apt-get install -y \
    # ビルドに必要なツール
    build-essential \
    # HTTPSアクセスに必要なツール
    ca-certificates \
    curl \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# =============================================================================
# 企業プロキシ用SSL証明書の設定（オプション）
# ssl-certificates/ が空でもビルドが成功するようにオプショナルに実装
# ビルドコンテキストはルート階層（docker-compose.ymlで context: .. を設定）
# =============================================================================
COPY ssl-certificates/ /etc/ssl/certs/custom/
RUN if [ -f /etc/ssl/certs/custom/netskope.cer ]; then \
      cp /etc/ssl/certs/custom/netskope.cer /usr/local/share/ca-certificates/netskope.crt && \
      update-ca-certificates && \
      echo "Custom CA certificate registered to system CA store"; \
    else \
      echo "No custom CA certificate found, skipping..."; \
    fi

# =============================================================================
# Node.js 20 のインストール（NodeSourceリポジトリ経由）
# aptではなくNodeSourceを使うことで最新のLTSバージョンを取得
# =============================================================================
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Node.jsとnpmのバージョンを確認（デバッグ用）
RUN node --version && npm --version

# =============================================================================
# アプリケーションディレクトリの設定
# =============================================================================
WORKDIR /app

# =============================================================================
# 依存パッケージのインストール
# package.jsonを先にコピーしてDockerレイヤーキャッシュを活用
# SSL証明書がある場合はNODE_EXTRA_CA_CERTSを設定
# =============================================================================
# ルートのpackage.jsonとlockfileを先にコピー
COPY output_system/package.json output_system/package-lock.json* ./
COPY output_system/frontend/package.json ./frontend/
COPY output_system/backend/package.json ./backend/

# SSL証明書がある場合は環境変数を設定してnpm installを実行
RUN if [ -f /etc/ssl/certs/custom/netskope.cer ]; then \
      export NODE_EXTRA_CA_CERTS=/etc/ssl/certs/custom/netskope.cer; \
    fi && \
    npm install

# =============================================================================
# ソースコードのコピー
# =============================================================================
COPY output_system/ ./

# =============================================================================
# ネイティブモジュールの再コンパイル（better-sqlite3対策）
# ソースコードをコピーした後に npm rebuild を実行することで、
# 現在のNode.jsバージョン（NODE_MODULE_VERSION）向けに正しくコンパイルする。
# コンテナ外でビルドされた .node ファイルはNode.jsのバージョンに依存するため、
# コンテナ内で再コンパイルすることで互換性を確保する。
# =============================================================================
RUN npm rebuild better-sqlite3

# =============================================================================
# フロントエンドのビルド（本番用静的ファイル生成）
# ビルド後の静的ファイルはfrontend/distに出力される
# APP_VERSION: ビルド時にdocker buildの--build-argで渡されるバージョン文字列
# =============================================================================
ARG APP_VERSION=unknown
RUN if [ -f /etc/ssl/certs/custom/netskope.cer ]; then \
      export NODE_EXTRA_CA_CERTS=/etc/ssl/certs/custom/netskope.cer; \
    fi && \
    APP_VERSION="${APP_VERSION}" npm run build:frontend

# =============================================================================
# バックエンドのビルド（TypeScript → JavaScript変換）
# =============================================================================
RUN npm run build:backend

# =============================================================================
# ポートの公開
# 3001: フロントエンド（Vite preview server）
# 3002: バックエンド（Express API server）
# =============================================================================
EXPOSE 3001 3002

# =============================================================================
# アプリケーションの起動
# concurrentlyを使ってフロントエンドのVite preview serverと
# バックエンドのExpressサーバーを同時起動
# =============================================================================
CMD ["npm", "run", "start:all"]
