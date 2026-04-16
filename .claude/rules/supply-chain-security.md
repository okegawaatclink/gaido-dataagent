# サプライチェーン攻撃対策: クールダウン設定

パッケージ管理ツールの初期セットアップ時、クールダウン（公開から一定期間未経過のバージョンをインストール対象外にする）設定を必ず適用すること。

背景: サプライチェーン攻撃の大半は公開から1週間以内に検出・削除される。7日間のクールダウンにより、悪意あるバージョンへの露出を大幅に削減できる。

参考:
- https://zenn.dev/dely_jp/articles/supply-chain-kowai
- https://nesbitt.io/2026/03/04/package-managers-need-to-cool-down.html

## 原則

1. プロジェクトで使用するパッケージマネージャにクールダウン設定が存在する場合、**必ず7日間相当のクールダウンを設定する**
2. 下記の設定例にないパッケージマネージャを使用する場合は、Context7やWeb検索でそのツールのクールダウン機能の有無を調べ、存在すれば同様に設定する
3. クールダウン機能が存在しないパッケージマネージャの場合は、「クールダウン未対応ツールの代替策」セクションに従う
4. クールダウン設定は `npm install` 等でバージョン解決が新たに走るときに効果を発揮する。ロックファイルに既に記録されたバージョンには影響しない
5. CIでは必ずロックファイルベースのインストールコマンドを使用する（後述）

## Node.js

### npm (v11.10.0+)

`.npmrc` に追加（単位: 日）:

```
min-release-age=7
```

注意事項:
- 内部的に `--before` フラグ（現在時刻 - 7日のタイムスタンプ）に変換される
- パッケージ除外機構は未実装（npm/cli#8994）。新規パッケージで全バージョンが7日以内の場合はインストールがエラーになる。その場合は一時的に `.npmrc` から設定を外して対応する
- チルダ範囲（`~`）との組み合わせでバグ報告あり（npm/cli#9005）。問題が出た場合はキャレット範囲（`^`）への変更を検討する
- CI: `npm ci` を使用（ロックファイルに記録済みのバージョンをそのままインストール）

### pnpm (v10.16+)

`pnpm-workspace.yaml` に追加（単位: 分）:

```yaml
minimumReleaseAge: 10080
```

除外が必要な場合は `minimumReleaseAgeExclude` を使用:

```yaml
minimumReleaseAgeExclude:
  - "@myorg/*"
```

- CI: `pnpm install --frozen-lockfile` を使用

### Yarn (v4.10.0+)

`.yarnrc.yml` に追加:

```yaml
npmMinimalAgeGate: "7 days"
```

除外が必要な場合は `npmPreapprovedPackages` を使用:

```yaml
npmPreapprovedPackages:
  - "@myorg/*"
```

- CI: `yarn install --immutable` を使用

### Bun (v1.3+)

`bunfig.toml` に追加（単位: 秒）:

```toml
[install]
minimumReleaseAge = 604800
```

- CI: `bun install --frozen-lockfile` を使用

### Deno

CLIフラグで指定:

```bash
deno install --minimum-dependency-age=7d
```

- CI: `deno install --frozen` を使用

## Python

### uv

`pyproject.toml` に追加:

```toml
[tool.uv]
exclude-newer = "7 days"
```

個別パッケージの除外（v0.9.17+）:

```toml
[tool.uv]
exclude-newer = "7 days"
exclude-newer-package = { my-internal-package = "0 days" }
```

- CI: `uv sync --locked` を使用

### pip (v26.0+)

設定ファイルでの指定は未対応。CLIフラグのみ:

```bash
# 7日前の日時を計算してフラグに渡す
pip install --uploaded-prior-to "$(date -u -d '7 days ago' '+%Y-%m-%dT%H:%M:%SZ')" -r requirements.txt
```

- CI: `pip install --no-deps -r requirements.txt`（lockファイル相当として `pip freeze` の出力を使用）

## Rust

### Cargo (v1.94+)

crates.ioレジストリ側でクールダウンが実装済み。追加設定不要。

- CI: `cargo install --locked` を使用

## クールダウン未対応ツールの代替策

以下のツールはクールダウン機能が未実装（2026年4月時点）。ロックファイルの厳密運用で代替する:

### Go

```bash
# ロックファイル相当: go.sum をリポジトリにコミット
# CI: ロックファイルの整合性を検証
go mod verify
```

### Ruby (Bundler)

```bash
# Gemfile.lock をリポジトリにコミット
# CI: ロックファイルベースでインストール
bundle install --frozen
```

注: gem.coop をミラーとして利用すれば、サーバー側で48時間のクールダウンが適用される。

### PHP (Composer)

```bash
# composer.lock をリポジトリにコミット
# CI: ロックファイルベースでインストール
composer install --no-update
```

### .NET (NuGet)

```bash
# packages.lock.json をリポジトリにコミット
# CI: ロックファイルベースでリストア
dotnet restore --locked-mode
```

### Java (Maven)

```xml
<!-- pom.xml: バージョンを厳密に固定し、SNAPSHOT は使用しない -->
<!-- CI: mvn dependency:resolve で依存を事前解決 -->
```

```bash
mvn dependency:resolve
```

### Java (Gradle)

```bash
# gradle.lockfile をリポジトリにコミット
# build.gradle に以下を追加してロック有効化:
# dependencyLocking { lockAllConfigurations() }
# CI: ロックファイルベースでビルド
gradle build --dependency-lock
```

## 上記にないパッケージマネージャを使用する場合

1. Context7またはWeb検索で「{ツール名} minimum release age」「{ツール名} cooldown supply chain」を検索する
2. クールダウン機能が見つかった場合: 7日間相当の値を設定する
3. クールダウン機能が見つからなかった場合: 「クールダウン未対応ツールの運用ルール」セクションに従う
4. いずれの場合も、調査結果と設定内容を `problems.md` の改善提案として記録すること（gaidoの改善サイクルに組み込まれる）

## クールダウン未対応ツールの運用ルール

上記の設定例に該当するクールダウン機能が存在しないパッケージマネージャを使用する場合、以下を遵守すること。

### 1. 人間への報告

クールダウン機能が存在しないことが判明した時点で、AskUserQuestionで人間に以下を報告する:

- このパッケージマネージャにはクールダウン機能が存在しないこと
- ロックファイルの厳密な運用がサプライチェーン攻撃対策として重要になること
- AIがロックファイルを更新する際は、公開から7日以上経過したバージョンのみで構成されていることを確認すること

### 2. ロックファイル更新時の確認手順

AIが `npm install`、`pip install`、`go get`、`bundle update` 等のコマンドでロックファイルを更新する場合、以下を必ず実施する:

1. コマンド実行後、ロックファイルの差分（`git diff`）を確認する
2. 新たに追加・更新されたパッケージについて、公開日を確認する
   - npm: `npm view {パッケージ名} time --json` で各バージョンの公開日を取得
   - pip/uv: `pip index versions {パッケージ名}` またはPyPI APIで確認
   - その他: 各レジストリのAPIまたはWebページで確認
3. **公開から7日未満のバージョンが含まれている場合**:
   - そのパッケージ名とバージョン、公開日を人間に報告する
   - 7日以上経過した直前のバージョンにダウングレードするか、そのまま採用するかを人間に判断を仰ぐ
   - 人間が承認するまでコミットしない

### 3. CIでのロックファイル厳密運用

ロックファイルの自動更新を防止するため、CIでは必ず以下のコマンドを使用する:

- Go: `go mod verify`
- Ruby: `bundle install --frozen`
- PHP: `composer install --no-update`
- .NET: `dotnet restore --locked-mode`
- Java (Gradle): `gradle build --dependency-lock`

記録フォーマット例:
```
### N. サプライチェーン攻撃対策: {ツール名}のクールダウン設定が未掲載

- **苦労度**: ★★☆☆☆（2/5）
- **深刻度**: ★★☆☆☆（2/5）
- **原因カテゴリ**: ルール不足
- **影響範囲**: ルール改善で予防可能

#### 何が起きたか
{ツール名}を使用したプロジェクトで、supply-chain-security.mdにクールダウン設定例が掲載されていなかった。

#### 原因
supply-chain-security.mdに{ツール名}の設定例が含まれていない。

#### どう解決したか
{調査して見つけた設定方法を記述}

#### 改善提案
| 項目 | 内容 |
|------|------|
| 対象ファイル | .claude/rules/supply-chain-security.md |
| 変更種別 | 既存修正 |

**具体的な変更内容:**
{ツール名}のクールダウン設定を追記する:
> {具体的な設定内容}
```
