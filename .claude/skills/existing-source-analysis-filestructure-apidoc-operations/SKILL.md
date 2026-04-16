---
name: existing-source-analysis-filestructure-apidoc-operations
description: ソースコードにコメント・ドキュメントを追加し、APIドキュメントとfile_structure.mdを生成する手順。
user-invocable: false
---

# ソースコメント追加・APIドキュメント・file_structure.md生成手順

ソースコードにコメント・ドキュメントを追加し、APIドキュメントとfile_structure.mdを生成します。

## 前提作業

**作業開始前に必ず `CLAUDE.md` を読み込むこと。** プロジェクト全体のルール（mermaid記法の使用、コード配置規約等）を把握してから作業を開始する。

**図表はすべてmermaid記法で記述すること（該当する場合）。** ASCIIアート、テキスト図は禁止。

## 言語ルール

**すべての出力は日本語で記述すること。** ソースコード内のコメント（AUTO_GENERATED:）、file_structure.md、APIドキュメントの説明文、すべて日本語。英語で出力してはならない。コード例・変数名・型名はそのまま（英語のまま）でよいが、説明文は日本語。

## 参照制約

解析対象は `output_system*/` 配下のソースコードのみ。

以下のディレクトリ・ファイルは**参照禁止**:

- `.claude/`
- `ai_generated/`
- `docs_with_ai/`
- `existing_docs/`

## 出力先

- `ai_generated/intermediate_files/from_source/file_structure.md`
- `ai_generated/intermediate_files/from_source/api_documents/{言語名}/`

## 処理手順

### Step 1: ソースファイル一覧取得

`output_system*/` 配下の全ソースファイルを取得する。**`| head` による件数制限は行わない（全ファイルを対象とする）。**

```bash
find output_system*/ -type f \
  -not -path '*/node_modules/*' \
  -not -path '*/.venv/*' \
  -not -path '*/.git/*' \
  -not -path '*/dist/*' \
  -not -path '*/build/*' \
  -not -path '*/__pycache__/*' \
  -not -path '*/vendor/*' \
  -not -name '*.lock' \
  -not -name 'package-lock.json' \
  -not -name 'yarn.lock'
```

### Step 2: 言語リスト作成・source_file_tasks.md 生成

Step 1の結果からソースコードファイル（`.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.go`, `.java`, `.rs` 等）と主要設定ファイル（`package.json`, `tsconfig.json`, `Dockerfile`, `docker-compose.yml` 等）を抽出する。

さらに以下を行う:

1. **言語判定**: ファイル拡張子から使用言語を判定し、言語リストを作成する
   - `.go` → Go
   - `.ts`, `.tsx` → TypeScript
   - `.js`, `.jsx` → JavaScript
   - `.py` → Python
   - `.java` → Java
   - `.rs` → Rust
   - 設定ファイル（`package.json`, `tsconfig.json`, `Dockerfile` 等）は「設定ファイル」カテゴリ

2. **source_file_tasks.md 生成**: 言語ごとにグループ化したtodoリストを出力する

```bash
mkdir -p ai_generated/intermediate_files/from_source/progress
```

出力先: `ai_generated/intermediate_files/from_source/progress/source_file_tasks.md`

フォーマット:
```markdown
# ソースファイルコメント付与タスク

生成日時: YYYY-MM-DD HH:MM:SS

## Go (N ファイル)
- [ ] output_system/internal/agent/agent.go
- [ ] output_system/internal/agent/session.go
...

## TypeScript (N ファイル)
- [ ] output_system/src/App.tsx
- [ ] output_system/src/main.tsx
...

## 設定ファイル (N ファイル)
- [ ] output_system/package.json
- [ ] output_system/tsconfig.json
...
```

**再開対応**: `source_file_tasks.md` が既に存在する場合、新規作成せずに既存ファイルの未完了タスク（`- [ ]`）をそのまま使用する。

### Step 3: コメント・ドキュメント追加【チャンク分割・並行処理】

**Bashツールのタイムアウト上限（10分）により、1回の `/call-teams-using-cli` で全ファイルを処理することはできない。** チャンク分割ループで繰り返し処理する。

#### チャンク分割設定

| 設定 | 値 | 説明 |
|------|-----|------|
| `CHUNK_SIZE` | **15** | 1回の `/call-teams-using-cli` で処理するファイル数上限。タイムアウトする場合はこの値を小さくして調整 |

#### チャンク分割ループ

以下の手順を未完了タスクがなくなるまで繰り返す:

1. `source_file_tasks.md` の未完了タスク数を確認する
```bash
TODO_COUNT=$(grep -c '^\- \[ \]' ai_generated/intermediate_files/from_source/progress/source_file_tasks.md)
echo "未完了タスク: ${TODO_COUNT}件"
```
2. 未完了0件なら Step 3v に進む
3. `/call-teams-using-cli` を呼び出す（下記プロンプト）
4. 呼び出し完了後、事後検証を実行する（下記「事後検証」セクション）
5. 手順1に戻る

#### `/call-teams-using-cli` 呼び出しプロンプト

```
/call-teams-using-cli --model sonnet 以下のチーム構造でソースファイルへのコメント付与を行ってください。

## 重要な制約: 処理件数上限
**今回の呼び出しでは最大15件のファイルのみ処理すること。** 15件処理したら、未完了タスクが残っていても完了を報告して終了すること。

## チーム構造

### チームリード（あなた自身が担当）
`.claude/skills/existing-source-analysis-filestructure-apidoc-teamlead-operations/SKILL.md` をReadツールで読み込み、その手順に従うこと。

### チームメンバー（Agent tool × N、各メンバーは1ファイルを担当）
`.claude/skills/existing-source-analysis-filestructure-apidoc-member-operations/SKILL.md` をReadツールで読み込み、その手順に従うこと。
```

#### 事後検証（チャンクループ内、各 `/call-teams-using-cli` 完了後に実行）

`call-teams-using-cli` が返却された後、`source_file_tasks.md` で `- [x]` になったファイルが本当にコメント付与されているか検証する。偽完了を検出し、次のチャンクで再処理させるための保険。

```bash
# [x] マークされたファイルのうち、AUTO_GENERATEDが0件のものを [ ] に戻す
while IFS= read -r line; do
  FILE=$(echo "$line" | sed 's/^- \[x\] //')
  if [ -f "$FILE" ]; then
    COUNT=$(grep -c 'AUTO_GENERATED' "$FILE" 2>/dev/null || echo 0)
    if [ "$COUNT" -eq 0 ]; then
      echo "偽完了検出: $FILE (AUTO_GENERATED: 0件) → 未完了に戻す"
      sed -i "s|^\- \[x\] ${FILE}$|- [ ] ${FILE}|" ai_generated/intermediate_files/from_source/progress/source_file_tasks.md
    fi
  fi
done < <(grep '^\- \[x\]' ai_generated/intermediate_files/from_source/progress/source_file_tasks.md)
```

### Step 3v: コメント付与率検証【逐次】

Step 3完了後、Step 4に進む前に以下の検証を行う。

#### 検証A: ファイルカバレッジ確認

```bash
# source_file_tasks.md の完了率を確認
TOTAL=$(grep -c '^\- \[' ai_generated/intermediate_files/from_source/progress/source_file_tasks.md)
DONE=$(grep -c '^\- \[x\]' ai_generated/intermediate_files/from_source/progress/source_file_tasks.md)
TODO=$(grep -c '^\- \[ \]' ai_generated/intermediate_files/from_source/progress/source_file_tasks.md)
echo "ファイルカバレッジ: ${DONE}/${TOTAL} 完了, ${TODO} 未完了"
```

- 完了率100%: Step 3v-Bに進む
- 未完了あり: Step 3に戻り、未完了分だけ再処理する（`source_file_tasks.md` の `- [ ]` が対象）

#### 検証B: 関数カバレッジ確認（サンプリング）

言語ごとにランダムに5ファイルを選択し、公開関数・メソッド数とドキュメントコメント数を比較する。

```bash
# TypeScriptの場合
echo "=== TypeScript サンプリング検証 ==="
for FILE in $(grep '^\- \[x\].*\.tsx\?$' ai_generated/intermediate_files/from_source/progress/source_file_tasks.md | sed 's/^- \[x\] //' | shuf | head -5); do
  FUNC_COUNT=$(grep -cE 'export (function|const|class)' "$FILE" 2>/dev/null || echo 0)
  PARAM_COUNT=$(grep -c '@param' "$FILE" 2>/dev/null || echo 0)
  AUTO_COUNT=$(grep -c 'AUTO_GENERATED' "$FILE" 2>/dev/null || echo 0)
  echo "$FILE: 公開関数 $FUNC_COUNT, @param $PARAM_COUNT, AUTO_GENERATED $AUTO_COUNT"
done

# Goの場合
echo "=== Go サンプリング検証 ==="
for FILE in $(grep '^\- \[x\].*\.go$' ai_generated/intermediate_files/from_source/progress/source_file_tasks.md | sed 's/^- \[x\] //' | shuf | head -5); do
  FUNC_COUNT=$(grep -c '^func ' "$FILE" 2>/dev/null || echo 0)
  AUTO_COUNT=$(grep -c 'AUTO_GENERATED' "$FILE" 2>/dev/null || echo 0)
  echo "$FILE: 関数定義 $FUNC_COUNT, AUTO_GENERATED $AUTO_COUNT"
done
```

- 各ファイルでAUTO_GENERATEDコメント数が関数定義数の50%以上: 合格
- 50%未満のファイルがあれば、そのファイルを個別に再処理する（Editツールで直接コメントを追加）

#### 検証C: フォーマット品質確認

検証Bで選んだファイルの `@param`/`@returns` の有無を確認する。

```bash
# 全体の@param/@returns件数
echo "=== フォーマット品質（全体） ==="
TS_PARAM=$(grep -r '@param' output_system*/ --include='*.ts' --include='*.tsx' 2>/dev/null | wc -l)
TS_RETURNS=$(grep -r '@returns' output_system*/ --include='*.ts' --include='*.tsx' 2>/dev/null | wc -l)
GO_AUTO=$(grep -r 'AUTO_GENERATED' output_system*/ --include='*.go' 2>/dev/null | wc -l)
echo "TypeScript: @param ${TS_PARAM}件, @returns ${TS_RETURNS}件"
echo "Go: AUTO_GENERATED ${GO_AUTO}件"
```

- TypeScript: @param が10件以上 → 合格
- @param が0件のファイル（検証Bのサンプル中）があれば、プロンプトの問題として完了レポートに記載

**検証で不合格の場合**: 不合格のファイルをこのスキル内で直接修正する（Editツール使用）。全ファイルの修正は不要だが、不足の傾向と原因を完了レポートに記載する。

### Step 4: APIドキュメント生成

コメント付与済みのソースコードに対して、**言語ごとのドキュメント化ツール（xDoc系）** でAPIドキュメントを生成する。AIによるマークダウン手書きで代替してはならない（Step 4dでフォールバック条件を満たした場合のみ許可）。

#### Step 4a: 言語検出

`output_system*/` 配下のファイルから使用言語を検出する。

```bash
# 言語検出の判定基準
ls output_system*/package.json 2>/dev/null && echo "LANG: typescript"
ls output_system*/go.mod 2>/dev/null && echo "LANG: go"
ls output_system*/requirements.txt output_system*/pyproject.toml output_system*/setup.py 2>/dev/null && echo "LANG: python"
ls output_system*/Cargo.toml 2>/dev/null && echo "LANG: rust"
ls output_system*/pom.xml output_system*/build.gradle 2>/dev/null && echo "LANG: java"
```

#### Step 4b: ドキュメントツールインストール

検出した言語に応じてツールをインストールする。**最終出力はマークダウン形式**とする。

**方式A: マークダウン直接出力が可能な言語**

| 言語 | ツール | インストールコマンド | 参考URL |
|------|--------|-------------------|---------|
| TypeScript/JavaScript | TypeDoc + typedoc-plugin-markdown | `cd output_system* && npm install --save-dev typedoc typedoc-plugin-markdown` | https://github.com/typedoc2md/typedoc-plugin-markdown |
| Go | gomarkdoc | `go install github.com/princjef/gomarkdoc/cmd/gomarkdoc@latest && export PATH=$PATH:$(go env GOPATH)/bin` | https://github.com/princjef/gomarkdoc |
| Python | pydoc-markdown | `pip install pydoc-markdown` | https://github.com/NiklasRosenstein/pydoc-markdown |

**方式B: HTML出力 → pandocでマークダウン変換が必要な言語**

以下の言語はマークダウン直接出力ツールが未成熟のため、標準ツールでHTML出力し、pandocでマークダウンに変換する。

| 言語 | ドキュメントツール | pandocインストール |
|------|-----------------|-------------------|
| Java | Javadoc（JDK同梱） | `apt-get install -y pandoc` |
| Rust | rustdoc（標準ツール） | `apt-get install -y pandoc` |
| その他 | 各言語の標準ドキュメントツール | `apt-get install -y pandoc` |

pandoc参考URL: https://github.com/jgm/pandoc

上記以外の言語の場合は、まずマークダウン直接出力ツールの有無を調査し、なければ方式Bを採用する。

#### Step 4c: ツール実行

```bash
mkdir -p ai_generated/intermediate_files/from_source/api_documents
```

**方式A: マークダウン直接出力**

| 言語 | 実行コマンド例 |
|------|--------------|
| TypeScript | `cd output_system* && npx typedoc --plugin typedoc-plugin-markdown --out ../ai_generated/intermediate_files/from_source/api_documents/typescript/ --entryPointStrategy expand src/` |
| Go | `cd output_system* && gomarkdoc --output ../ai_generated/intermediate_files/from_source/api_documents/go/godoc.md ./...` |
| Python | `cd output_system* && pydoc-markdown -I . -m <モジュール名> --render-toc > ../ai_generated/intermediate_files/from_source/api_documents/python/api.md` |

**方式B: HTML出力 → pandoc変換**

```bash
# 例: Javadoc → マークダウン
cd output_system*
mkdir -p /tmp/javadoc_html
javadoc -d /tmp/javadoc_html -sourcepath src -subpackages .
mkdir -p ../ai_generated/intermediate_files/from_source/api_documents/java
find /tmp/javadoc_html -name "*.html" | while read f; do
  BASENAME=$(basename "${f%.html}")
  pandoc -f html -t gfm "$f" -o "../ai_generated/intermediate_files/from_source/api_documents/java/${BASENAME}.md"
done
rm -rf /tmp/javadoc_html
```

上記はコマンド例であり、プロジェクト構成に応じてパスやオプションを調整すること。ツール実行でエラーが出た場合はオプションを調整して再試行する。

#### Step 4d: 検証・フォールバック

```bash
# ツール出力が存在するか検証
TOOL_OUTPUT_COUNT=$(find ai_generated/intermediate_files/from_source/api_documents/ -type f 2>/dev/null | wc -l)
echo "ツール出力ファイル数: $TOOL_OUTPUT_COUNT"
```

- `TOOL_OUTPUT_COUNT >= 1` → ツール出力成功。Step 5に進む
- `TOOL_OUTPUT_COUNT == 0` → ツール実行に失敗。以下のフォールバックを許可:
  - AIがソースコードを読み取ってマークダウン形式のAPIドキュメントを生成してよい
  - 出力ファイルの先頭に `<!-- FALLBACK: ドキュメント生成ツール実行失敗のためAI生成 -->` を記載すること
  - フォールバック理由（エラーメッセージ等）をファイル内に記録すること

### Step 5: file_structure.md生成

コメント付与済みのソースコード全体を読み取り、以下の内容で `ai_generated/intermediate_files/from_source/file_structure.md` を生成する。

- ディレクトリ構成（ツリー形式）
- 各ディレクトリ・ファイルの役割（テーブル形式）
- npmスクリプト等のビルドコマンド一覧
- ファイル間の呼び出し関係

ソースコードから読み取れた事実のみを記載。推測は「推測:」と明記する。

## others.mdへの追記

自分の担当外だが記録すべき情報を見つけた場合、`ai_generated/intermediate_files/from_source/others.md` に追記する。追記のみ許可、既存内容の編集は禁止。
