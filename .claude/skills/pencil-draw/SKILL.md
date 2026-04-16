---
name: pencil-draw
description: Pencil MCPを使ったデザイン操作のリファレンス。screen-design-phaseスキル等から参照される。
---

# Pencil Draw（Pencil MCP操作リファレンス）

## 前提

- Pencil App（Electron）がXvfb上で起動済み
- MCP Server（pencil）がstdioモードで接続済み（`claude mcp list` で `pencil: Connected` を確認）
- MCP Serverは `--app desktop` フラグ付きで起動される（Pencil AppのWebSocket Serverへの接続が必須）
- **コンポーネントIDはドキュメント固有**。毎回 `get_editor_state` + `batch_get` で動的に取得すること（IDのハードコード禁止）
- テキスト色は `fill` プロパティで指定する（`color` は不可）
- デザイントークンは `$--変数名` で参照できるが、トークン名はドキュメント固有。`get_variables` で取得してから使用すること

### ライセンス確認（最初に実行）

Pencilの利用にはアクティベーション済みライセンスが必要。**このスキルを使い始める前に必ず確認すること**:

```bash
# ライセンスファイルの存在確認
ls -la /root/.pencil/license-token.json
```

ファイルが存在しない場合、Pencilにアクティベーションダイアログが表示され、MCP操作（特にget_screenshot）が正常に動作しない。
この場合は人間に以下を伝えて作業を中断すること:

> Pencilのライセンスが設定されていません。`.env` ファイルに `PENCIL_LICENSE_EMAIL` と `PENCIL_LICENSE_TOKEN` を設定してコンテナを再起動してください。
> 設定方法は `local.env` のコメントを参照してください。

## UIキットテンプレート

Pencilには4つの組み込みUIキットがあり、テンプレート名で直接開ける:

| UIキット | テンプレート名 | コンポーネント数 | 特徴 |
|---------|--------------|-----------------|------|
| Shadcn UI | `pencil-shadcn.pen` | 87 | ReactコンポーネントライブラリベースのUI kit |
| Halo | `pencil-halo.pen` | 95 | モダンデザインシステム |
| Lunaris | `pencil-lunaris.pen` | 100 | デザインシステム（最もコンポーネント数が多い） |
| Nitro | `pencil-nitro.pen` | 97 | デザインシステム |

テンプレートは `open_document("pencil-lunaris.pen")` のようにテンプレート名で開く。
各テンプレートには3つのサンプルダッシュボード画面（dashboard-utility, dashboard-revenue, dashboard-football）も含まれる。

**`open_document("new")` はコンポーネント0個の空ドキュメントを作成する。UIキットが必要な場合はテンプレートを使うこと。**

## ファイル保存（重要）

MCP toolに保存機能はない。保存はxdotool経由のCtrl+Sで行う:

```bash
# Editorウィンドウを特定してCtrl+S送信
EDITOR_WIN=$(DISPLAY=:99 xdotool search --name "Editor" | tail -1)
DISPLAY=:99 xdotool key --window "$EDITOR_WIN" --clearmodifiers ctrl+s
sleep 3
# 保存確認
stat ai_generated/screens.pen
```

**ファイル保存の前提条件**:
- **Openbox**（ウィンドウマネージャ）が起動していること（entrypoint.shで自動起動）
- ファイルが**絶対パスで`open_document`されている**こと（非一時ファイル）
- 送信先は"pencil"ウィンドウではなく**"Editor"ウィンドウ**
- 保存された.penファイルはPencil独自の暗号化形式（JSONではない）
- 保存後は `open_document(path)` で再オープン可能（コンポーネントも維持される）

**注意**:
- テンプレート名で開いたドキュメント（`open_document("pencil-lunaris.pen")`）は**一時ファイル**扱い。Ctrl+Sで「名前を付けて保存」ダイアログが表示され、ヘッドレスでは`canceled`になるため保存不可
- 必ず事前にファイルとして用意し、**絶対パスで`open_document`してから**Ctrl+Sで保存すること

## ユースケース1: ファイルオープン・コンポーネント取得

### いつ使うか

コピー済みの.penファイルを使ってPencil作業を開始するとき。

### 前提

- `ai_generated/screens.pen` が既に存在すること（テンプレートコピーは呼び出し元が事前に実施）

### 手順

1. `get_editor_state(include_schema: false)` でエディタ状態を確認
2. `open_document("/workspace/target_repo/ai_generated/screens.pen")` で開く（絶対パス指定）
3. **（必須）利用可能なReusable Componentsを動的に取得**:
   - `get_editor_state` の返却からコンポーネント一覧を確認
   - 使用予定のコンポーネントの内部構造を `batch_get(nodeIds, readDepth: 3)` で調査
   - **slot ID、descendants IDを把握してから画面作成に進むこと**
   - コンポーネントが0個の場合、デザインシステムなしの基本レイアウト（frame + text）で画面を構築する
4. **注意**: `open_document("new")` は未保存の内容を消失させる。UIキットなしの空ドキュメントが作成される

### 参考: コンポーネント構造の例（lunarisデザインシステムの場合）

以下はlunarisデザインシステムでの実験結果。**IDはドキュメント固有のため、必ず動的に取得すること。**

| コンポーネント名 | 主要slot/descendants構造 |
|---|---|
| Sidebar | Content slot（推奨子: Section Title, Active Item, Default Item） |
| Card | Header slot, Content slot, Actions slot |
| Button | Icon, Label |
| Data Table | Content slot（推奨子: Table Row） |
| Table Row | slot for Cell, Column Header |
| Table Cell | 任意コンテンツを挿入可能 |
| Label | Icon, Text |

## ユースケース2: 参考URLからデザインスタイルを決定

### いつ使うか

人間が「こんな雰囲気のデザインにしたい」と参考URLを提示したとき、または新規デザイン開始時。

### 手順

1. 人間に「どんな雰囲気のデザインにしたいですか？参考URLを1-3個教えてください」と質問
2. URLを `WebFetch` で取得し、デザインの特徴を分析（配色、レイアウト、フォント、間隔感等）
3. `get_style_guide_tags` で利用可能なタグ一覧を取得（200以上のタグ）
4. 分析結果に基づいて5-10個のタグを選択し、`get_style_guide(tags)` を呼び出す
5. スタイルガイドの配色・フォント等を元に `set_variables` でデザイントークンをカスタマイズ
6. `get_variables` で現在のトークン値を確認

### スタイルガイドが返す内容

- カラーシステム（背景、アクセント、ニュートラル、セマンティック色）
- タイポグラフィ（フォントファミリー、サイズスケール、ウェイト）
- スペーシングシステム（gap、padding）
- コーナーラジアス
- コンポーネントパターン（構造、サイズ、間隔）
- レイアウトパターン（ASCII図付き）
- Dos/Don'tsリスト

## ユースケース3: requirements/screens.md から画面を作成

### いつ使うか

要件定義が完了し、画面デザインを作成するとき。

### 手順

1. `ai_generated/requirements/screens.md` の画面一覧・画面遷移図を読み込む
2. 各画面について:
   a. `find_empty_space_on_canvas(width, height, padding: 100, direction: "right")` で配置位置を決定
   b. `batch_design` で画面フレーム + 主要構造を作成（最大25操作/回）
   c. 追加の `batch_design` でコンテンツ（カード、テーブル等）を配置
   d. さらに追加の `batch_design` でナビゲーション等を配置
3. `get_screenshot(nodeId)` で各画面を視覚確認
4. ファイル保存（`xdotool key ctrl+s`）

### 画面フレーム作成パターン

**重要**: 以下のパターンはフレーム構造のみ（コンポーネント不要）。色やフォントの値は `get_variables` で取得したデザイントークンに置き換えること。デザイントークンがない場合はリテラル値（`"#FFFFFF"` 等）を使用。

**Sidebar + Content（ダッシュボード）**:
```javascript
screen=I(document, {type: "frame", name: "画面名", layout: "horizontal", width: 1440, height: 900, fill: "#FFFFFF", placeholder: true, x: X座標, y: Y座標})
sidebar=I(screen, {type: "frame", name: "Sidebar", layout: "vertical", width: 240, height: "fill_container", fill: "#F8F9FA", padding: 16, gap: 8})
main=I(screen, {type: "frame", name: "Main", layout: "vertical", width: "fill_container", height: "fill_container", padding: 32, gap: 24})
```

**Header + Content**:
```javascript
screen=I(document, {type: "frame", name: "画面名", layout: "vertical", width: 1440, height: 900, fill: "#FFFFFF", placeholder: true, x: X座標, y: Y座標})
header=I(screen, {type: "frame", name: "Header", layout: "horizontal", width: "fill_container", height: 64, padding: [0, 24], alignItems: "center", justifyContent: "space_between", stroke: {align: "inside", fill: "#E5E7EB", thickness: {bottom: 1}}})
content=I(screen, {type: "frame", name: "Content", layout: "vertical", width: "fill_container", height: "fill_container", padding: 32, gap: 24})
```

### メトリクスカード追加パターン

```javascript
metrics=I(main, {type: "frame", name: "Metrics", layout: "horizontal", width: "fill_container", gap: 16})
card1=I(metrics, {type: "frame", name: "Card", layout: "vertical", width: "fill_container", padding: 24, gap: 4, fill: "#FFFFFF", cornerRadius: [8, 8, 8, 8], stroke: {align: "inside", fill: "#E5E7EB", thickness: 1}})
label1=I(card1, {type: "text", content: "ラベル", fill: "#6B7280", fontSize: 14})
value1=I(card1, {type: "text", content: "値", fill: "#111827", fontSize: 32, fontWeight: "600"})
```

### テーブル追加パターン

```javascript
// テーブルコンテナ
table=I(main, {type: "frame", name: "Table", layout: "vertical", width: "fill_container", stroke: {align: "inside", fill: "#E5E7EB", thickness: 1}, cornerRadius: [8, 8, 8, 8]})

// ヘッダー行
headerRow=I(table, {type: "frame", name: "Header Row", layout: "horizontal", width: "fill_container", padding: [12, 16], fill: "#F9FAFB", stroke: {align: "inside", fill: "#E5E7EB", thickness: {bottom: 1}}})
hc1=I(headerRow, {type: "text", content: "列名1", fill: "#6B7280", fontSize: 12, fontWeight: "600", width: "fill_container"})
hc2=I(headerRow, {type: "text", content: "列名2", fill: "#6B7280", fontSize: 12, fontWeight: "600", width: "fill_container"})

// データ行
row1=I(table, {type: "frame", name: "Row", layout: "horizontal", width: "fill_container", padding: [12, 16], stroke: {align: "inside", fill: "#E5E7EB", thickness: {bottom: 1}}})
rc1=I(row1, {type: "text", content: "値1", fill: "#111827", fontSize: 14, width: "fill_container"})
rc2=I(row1, {type: "text", content: "値2", fill: "#111827", fontSize: 14, width: "fill_container"})
```

### Sidebarナビゲーション追加パターン

```javascript
// サイドバー内にナビゲーション項目を追加
secTitle=I(sidebar, {type: "text", content: "セクション名", fill: "#6B7280", fontSize: 12, fontWeight: "600"})
navActive=I(sidebar, {type: "frame", name: "Nav Active", layout: "horizontal", width: "fill_container", padding: [8, 12], gap: 8, fill: "#EFF6FF", cornerRadius: [6, 6, 6, 6], alignItems: "center"})
activeIcon=I(navActive, {type: "icon_font", iconFontName: "dashboard", fill: "#2563EB", fontSize: 18})
activeLabel=I(navActive, {type: "text", content: "Dashboard", fill: "#2563EB", fontSize: 14, fontWeight: "500"})
navItem=I(sidebar, {type: "frame", name: "Nav Item", layout: "horizontal", width: "fill_container", padding: [8, 12], gap: 8, cornerRadius: [6, 6, 6, 6], alignItems: "center"})
itemIcon=I(navItem, {type: "icon_font", iconFontName: "person", fill: "#6B7280", fontSize: 18})
itemLabel=I(navItem, {type: "text", content: "Users", fill: "#374151", fontSize: 14})
```

### コンポーネントを使う場合（デザインシステムがある場合のみ）

デザインシステムを含む.penファイルでは、上記の基本フレームの代わりにリユーザブルコンポーネントを使用できる。
コンポーネントの使い方は `get_editor_state` + `batch_get` で取得した情報に基づくこと。

```javascript
// 1. get_editor_stateでコンポーネント一覧を取得
// 2. batch_get(nodeIds: [コンポーネントID], readDepth: 3) で内部構造を調査
// 3. 以下の形式でインスタンスを挿入:
comp=I(parent, {type: "ref", ref: "<コンポーネントID>", width: "fill_container"})
// 4. slot内のコンテンツを置換:
replaced=R(comp+"/<slotID>", {type: "frame", layout: "vertical", children: [...]})
// 5. descendantsのプロパティを更新:
U(comp+"/<descendantID>", {content: "新しいテキスト"})
```

## ユースケース4: 画面をPNG出力してAIが判断

### いつ使うか

作成した画面の品質を確認するとき。

### 手順

1. `get_screenshot(nodeId: "画面ID")` を呼び出す
2. AIにインライン画像として表示される → 内容を視覚的に分析
3. 問題があれば `batch_design` の `U()`/`R()` で修正

### get_screenshotとPNGエクスポートの使い分け

| 方法 | 用途 | 出力 |
|------|------|------|
| `get_screenshot(nodeId)` | AIが画面を視覚確認・判断する | AIのコンテキストにインライン画像として表示（人間には見えない） |
| `scripts/pencil_export_png.py` | 人間に画面を共有する（GitHub等） | PNGファイルとして保存 |

**重要**: `get_screenshot` の結果はAIのコンテキスト内でのみ表示される。人間のチャット画面には表示されない。
人間にデザインを確認してもらう場合は、PNGエクスポート → GitHubにpush → URLを共有、というフローが必要。

### PNGファイルとして保存する場合

Claude CodeからMCPのbase64画像データに直接アクセスすることは不可。
HTTPモードのMCP Serverを一時起動し、スクリプト経由でbase64→PNG変換が必要:

**保存先**: `ai_generated/pencil_screenshots/`
**ファイル名**: `{画面ID}_{画面名の英語表記}.png`（例: `pRqc9_dashboard.png`, `c1QPB_user_registration_1.png`）

**前提条件**: スクリプト実行前に、以下がMCP経由で完了していること:
1. `open_document` で対象の.penファイルを開いている
2. `get_editor_state` でノードID（画面ID）を取得済み

スクリプト自体はドキュメントのオープンやノードID取得は行わない。
現在Pencil Appで開かれているドキュメントに対して `get_screenshot` を実行し、結果をPNGファイルに保存するのみ。

```bash
# 手順:
# 1. MCP経由でドキュメントを開く（Claude Codeが実行）
#    open_document("/workspace/target_repo/ai_generated/screens.pen")
# 2. get_editor_stateで画面IDを確認（Claude Codeが実行）
# 3. スクリプトでPNG出力
python3 .claude/skills/pencil-draw/scripts/pencil_export_png.py "画面ID" "ai_generated/pencil_screenshots/pRqc9_dashboard.png"
```

### 複数画面の並列エクスポート

`scripts/pencil_export_png.py` は内部でHTTP MCP Serverを起動するため、デフォルトポート（18083）では1つずつしか実行できない。
複数画面を高速にエクスポートするには、異なるポート番号を指定して並列実行する:

```bash
# 並列エクスポート（2〜3並列が安全。それ以上はPencil Appの負荷に注意）
python3 .claude/skills/pencil-draw/scripts/pencil_export_png.py "画面ID_1" "ai_generated/pencil_screenshots/pRqc9_dashboard.png" --port 18083 &
python3 .claude/skills/pencil-draw/scripts/pencil_export_png.py "画面ID_2" "ai_generated/pencil_screenshots/c1QPB_user_registration_1.png" --port 18084 &
wait
```

**注意**: Bashツールの `run_in_background: true` でも並列化可能だが、ポート番号の重複に注意すること。

## ユースケース5: 人間に画面を表示する（画面ID付き）

### いつ使うか

人間にデザインレビューを依頼するとき。

### 手順

1. `get_editor_state` でトップレベルノード一覧を取得
2. `type: "frame"` のノードを抽出し、デザインシステムフレームを除外
3. 画面ID + 名前 + サイズの一覧を整形して提示:

```
作成した画面一覧:（出力例。IDは実際の値に置き換わる）

| # | ID | 画面名 | サイズ |
|---|---|---|---|
| 1 | `xxxxx` | Dashboard | 1440×900 |
| 2 | `yyyyy` | User List | 1440×900 |

確認したい画面のIDまたは番号を指定してください。
変更したい箇所があれば、画面IDと変更内容を教えてください。
```

4. 人間が指定した画面の `get_screenshot` を表示
5. 変更指示を受けたら、画面IDを使って `batch_design` で修正

## ユースケース6: 変更指示を受けて修正

### いつ使うか

人間から「この画面のここを変えて」と指示されたとき。

### 手順

1. 指定された画面IDの `batch_get(nodeIds, readDepth: 2-3)` で現在の構造を確認
2. `batch_design` で修正:
   - テキスト変更: `U("ノードID", {content: "新しいテキスト"})`
   - コンポーネント追加: `I("親ID", {type: "ref", ref: "コンポーネントID", ...})`
   - コンポーネント削除: `D("ノードID")`
   - Slot内のコンテンツ置換: `R("インスタンスID/slotID", {type: "frame", ...})`
   - 色変更: `U("ノードID", {fill: "#新しい色"})` ※デザイントークンがあれば `"$--トークン名"` も可
3. `get_screenshot` で修正結果を確認
4. ファイル保存

## ユースケース7: 画面削除＋順序整理

### いつ使うか

不要な画面を削除し、残りの画面を整理するとき。

### 手順

例: ログイン → ユーザ登録1 → ユーザ登録完了 → ダッシュボード と横並びのとき、ユーザ登録1を削除する場合。

1. ユースケース5で画面一覧を提示し、削除対象を確認
2. `snapshot_layout(maxDepth: 0)` で全画面の現在位置（x, y, width, height）を取得
3. 削除対象の画面幅と間隔を記録（例: width=1440, 間隔=100 → shiftAmount=1540）
4. `batch_design` の `D("画面ID")` で削除
5. 削除した画面より右にあった画面を左に詰める:
```javascript
// ユーザ登録完了とダッシュボードを左に移動（削除した画面幅 + 間隔分）
U("ユーザ登録完了のID", {x: 元のx - 1540})
U("ダッシュボードのID", {x: 元のx - 1540})
```
6. ファイル保存

### 注意

- `D()` は即時削除。元に戻す場合は `DISPLAY=:99 xdotool key ctrl+z` でUndo可能
- 削除前にファイル保存しておくとより安全
- 右の画面を詰めるかどうかは任意。間が空いても問題なければそのままでもよい

## ユースケース8: 画面追加＋順序整理

### いつ使うか

既存の画面群に新しい画面を追加するとき。末尾追加と途中挿入の両方に対応。

### 手順（途中挿入の場合）

例: ログイン → ユーザ登録1 → ユーザ登録完了 → ダッシュボード と横並びのとき、ユーザ登録1の後にユーザ登録2を挿入する場合。

1. `snapshot_layout(maxDepth: 0)` で全画面の現在位置（x, y, width, height）を取得
2. 挿入位置より右にある画面を特定し、右にずらす:
```javascript
// ユーザ登録完了とダッシュボードを右に移動（画面幅 + 間隔分）
// shiftAmount = 挿入する画面の幅 + 間隔（例: 1440 + 100 = 1540）
U("ユーザ登録完了のID", {x: 元のx + 1540})
U("ダッシュボードのID", {x: 元のx + 1540})
```
3. 空いたスペースに新画面を作成:
```javascript
// ユーザ登録1の右隣に配置（ユーザ登録1のx + width + 間隔）
screen=I(document, {type: "frame", name: "ユーザ登録2", layout: "vertical", width: 1440, height: 900, fill: "#FFFFFF", placeholder: true, x: ユーザ登録1のx + 1540, y: ユーザ登録1のy})
```
4. ユースケース3の手順でコンテンツを追加
5. `get_screenshot` で確認
6. ファイル保存

### 手順（末尾追加の場合）

1. `find_empty_space_on_canvas(nodeId: "最後の画面ID", width: 1440, height: 900, padding: 100, direction: "right")` で配置位置を算出
2. ユースケース3の手順で新画面を作成（算出したx, yを使用）
3. `get_screenshot` で確認
4. ファイル保存

### 画面のコピー

既存画面をベースに新画面を作る場合:
```javascript
copied=C("元画面ID", document, {name: "新画面名", positionDirection: "right", positionPadding: 100})
```
- 子孫ごとコピーされ、自動配置される
- コピー後の子孫IDは元と異なるため、`descendants` パラメータでCopy時に上書きするか、新IDを確認してから修正
- 途中挿入の場合は、先に右の画面をずらしてからコピーすること

**重要: コピー後の子ノード更新手順**

`C()` の `descendants` パラメータで子ノードを上書きしようとすると、コピー後にIDが変わるため `Node not found for override path` エラーになることがある。以下の2段階アプローチを推奨:

```javascript
// NG: descendants指定でエラーになる場合がある
copied=C("元画面ID", document, {name: "新画面", descendants: {"子ノードID": {content: "新テキスト"}}})

// OK: 2段階アプローチ
// Step 1: まずコピーだけ実行
copied=C("元画面ID", document, {name: "新画面", positionDirection: "right", positionPadding: 100})
// Step 2: batch_getでコピー後の子ノード構造と新IDを確認
//   batch_get(nodeIds: [copiedのID], readDepth: 3)
// Step 3: 確認した新IDを使ってU()で更新
U("新しい子ノードID", {content: "新テキスト"})
```

**重要: コピー後のゴーストノードに注意**

画面をコピーした後、元の画面の子ノードがコピー先に残存する（ゴーストノード）ことがある。特にテキストノードが重複しやすい。

```
例: 画面4（名簿登録）をコピーして画面5（名簿編集）を作る場合
  - ヘッダー部分に元の「利用者情報を入力してください」テキストが残り、
    新しいテキストと合わせて3つの子要素になってしまう
```

**対策**: コピー後は必ず `batch_get(nodeIds: [コピー後のID], readDepth: 3)` で子ノード構造を確認し、不要なノードを `D()` で削除すること。スクリーンショットだけでは気づきにくい場合がある。

## ユースケース9: 編集後のファイル保存

### いつ使うか

デザイン作業の区切りごと（画面作成完了時、修正完了時等）。

### 手順

```bash
# xdotool経由でCtrl+S（Editorウィンドウに送信）
EDITOR_WIN=$(DISPLAY=:99 xdotool search --name "Editor" | tail -1)
DISPLAY=:99 xdotool key --window "$EDITOR_WIN" --clearmodifiers ctrl+s
sleep 3
# 保存確認
stat ai_generated/screens.pen
```

### 注意

- MCP batch_designの操作はメモリ上のみ。ファイルに保存されない
- `open_document("new")` は未保存の内容を消失させる
- Pencilのクラッシュでも未保存の内容は消失する
- ファイル保存後、.penファイルはDockerボリューム経由でホストと共有可能
- **前提条件**: ファイルが絶対パスで`open_document`されていること（非一時ファイル）
- **前提条件**: Openbox（ウィンドウマネージャ）が起動していること

## 制約事項

| 制約 | 詳細 |
|------|------|
| **テキスト色** | `fill` プロパティを使用。`color` は不可 |
| **フォント変数の警告** | フォント系のデザイントークン変数を使うと "invalid" 警告が出る場合があるが、実際には正常動作する |
| **batch_designの上限** | 1回のbatch_designは最大25操作。複雑な画面は3-4回に分けて作成 |
| **imageノード** | `image` タイプは存在しない。frame/rectangleを作成し、`G()` で画像を適用 |
| **G()画像生成** | `stock`（Unsplash）は安定。`ai`は外部AI依存でクレジット不足時に失敗する可能性 |
| **ファイル保存** | MCP toolに保存機能なし。xdotool Ctrl+Sで保存（Editorウィンドウ宛、Openbox必須） |
| **xdotool Ctrl+S** | 絶対パスで開いた非一時ファイルのみ動作。テンプレート名で開いた一時ファイルでは保存ダイアログが出て失敗する |
| **open_documentの破壊性** | `open_document("new")` は未保存内容を消失させ、コンポーネント0個の空ドキュメントを作成 |
| **UIキットテンプレート** | `open_document("pencil-XXX.pen")` でテンプレート名指定。ファイルパス指定ではない |
| **.penファイル形式** | ディスク上の.penファイルはPencil独自の暗号化形式。JSONとして直接読み書きはできない |
| **M()とU()の違い** | `M()`: ツリー構造の移動。`U()`: プロパティ更新（x/y座標変更はこちら） |
| **Copy後のID** | `C()` でコピーした子孫には新IDが付与される。元のIDでUpdate不可 |
| **コンポーネントID** | IDはドキュメント固有。ハードコード禁止、毎回 `get_editor_state` + `batch_get` で動的取得 |

## デザイントークンの確認方法

デザイントークン（変数）はドキュメントごとに異なる。`get_variables` で現在のトークン一覧を取得してから使用すること。

### トークンの使い方

```javascript
// fillプロパティにトークン名を指定
screen=I(document, {type: "frame", fill: "$--background", ...})
label=I(screen, {type: "text", content: "Hello", fill: "$--foreground", fontFamily: "$--font-primary"})
```

### 典型的なトークンカテゴリ

デザインシステムにより名前は異なるが、以下のカテゴリが一般的:

| カテゴリ | 典型的な用途 |
|---------|------------|
| 背景色 | ページ背景、カード背景、ミュート背景 |
| テキスト色 | 主テキスト、副テキスト、ミュートテキスト |
| アクセント色 | プライマリ、セカンダリ、デストラクティブ |
| ボーダー色 | 区切り線、枠線 |
| フォント | 主要フォント、副フォント |
| 角丸 | なし、小、中、大、丸 |