# スライドテーマ設定手順

## 概要

`design/slide_*.html` のCSSを読み取り、python-pptxのテーマ（配色・フォント・レイアウト）を定義する。
HTMLの読み込みは SKILL.md Step 3-1 で実施済み。本ファイルは抽出した値をTHEMEへマッピングする手順を定める。

## 用語対応表

story.mdの「デザイン方針」とSlideTheme（python-pptxコード）の用語は以下のように対応する。

| story.md（DesignGuidelines準拠） | SlideTheme（python-pptxコード） |
|---|---|
| ベースカラー | `primary` |
| アクセントカラー | `accent` |
| 背景 | `bg_slide` |
| 本文テキスト（明るい背景） | `text_dark` |
| 本文テキスト（暗い背景） | `text_on_dark` |

## テーマ定義項目

### 配色

**必ずHTMLのCSSから実際の値を読み取り、下記デフォルト値を上書きすること。デフォルト値のまま使ってはならない。**

| 用途 | 説明 | デフォルト（必ずHTML値で上書き） |
|---|---|---|
| bg_slide | **スライド全体の背景色**（最重要。`body`/`.slide`の`background-color`） | `#ffffff`（HTMLがダークテーマなら必ず暗色に変更） |
| primary | メインカラー（タイトル文字色またはタイトルバー背景等） | `#1a365d`（ダークネイビー） |
| accent | アクセントカラー（強調要素・ボーダー等） | `#2b6cb0`（ブルー） |
| text_on_dark | 暗い背景上のテキスト色 | `#ffffff`（白） |
| text_dark | 明るい背景上の本文テキスト | `#1a202c`（ほぼ黒） |
| text_light | サブテキスト・キャプション | `#4a5568`（グレー） |
| bg_light | テーブル交互背景・薄いセクション背景等 | `#f7fafc`（薄いグレー） |
| table_header_bg | テーブルヘッダー背景 | primary と同じ |
| table_header_text | テーブルヘッダー文字 | `#ffffff`（白） |

### フォント

日本語対応のフォントを使用する。Windowsで開くことを前提に選択する。

| 用途 | 推奨フォント | フォールバック |
|---|---|---|
| タイトル | 游ゴシック Bold | メイリオ Bold |
| 本文 | 游ゴシック | メイリオ |
| テーブル | 游ゴシック | メイリオ |
| コード・数値 | Consolas | Courier New |

### python-pptxでのテーマ適用コード例

```python
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN

# テーマ色の定義
# !! 必ずdesign/slide_*.htmlのCSSで全値を上書きすること。デフォルト値のまま使用禁止 !!
THEME = {
    "bg_slide": RGBColor(0xff, 0xff, 0xff),   # ← HTMLのbody/slideの背景色で必ず上書き
    "primary": RGBColor(0x1a, 0x36, 0x5d),
    "accent": RGBColor(0x2b, 0x6c, 0xb0),
    "text_on_dark": RGBColor(0xff, 0xff, 0xff),
    "text_dark": RGBColor(0x1a, 0x20, 0x2c),
    "text_light": RGBColor(0x4a, 0x55, 0x68),
    "bg_light": RGBColor(0xf7, 0xfa, 0xfc),
    "table_header_bg": RGBColor(0x1a, 0x36, 0x5d),
    "table_header_text": RGBColor(0xff, 0xff, 0xff),
}

# フォント設定
FONT = {
    "title": "游ゴシック",
    "body": "游ゴシック",
    "table": "游ゴシック",
    "code": "Consolas",
}

# フォントサイズ（SKILL.mdのガイドラインに基づく推奨値。下回ってはならない）
FONT_SIZE = {
    "slide_title": Pt(34),     # 推奨34-38pt、最小30pt
    "section_heading": Pt(26), # 推奨26-30pt、最小22pt
    "body": Pt(20),            # 推奨20-22pt、最小18pt
    "table_cell": Pt(16),      # 推奨16-18pt、最小14pt
    "caption": Pt(12),         # 推奨12-14pt、最小12pt
}
```

## HTMLデザインからのTHEMEへのマッピング

SKILL.md Step 3-1 で抽出したCSS値を以下の対応表でTHEMEキーに当てはめる。
抽出した16進数カラーコードを `RGBColor(0xRR, 0xGG, 0xBB)` に変換して設定すること。

| 抽出対象 | 確認するCSS箇所の例 | THEMEキー |
|---|---|---|
| **スライド全体背景**（最重要） | `body`, `.slide`, `.slide-container` の `background-color` | `bg_slide` |
| タイトル文字色 / タイトルバー背景 | `h1`, `.slide-header`, `.title-bar` の `color` / `background-color` | `primary` |
| アクセント色 | `.accent`, `.badge`, `border-left` の色 | `accent` |
| 暗い背景上の文字 | 暗い背景上の `p`, `.content` の `color`（白系） | `text_on_dark` |
| 明るい背景上の本文 | 白・薄い背景上の `p`, `.content` の `color` | `text_dark` |
| サブテキスト | `.subtitle`, `.caption` の `color` | `text_light` |
| 薄い背景 | `.section`, `.alt-row`, `.box-inactive` の `background-color` | `bg_light` |
| テーブルヘッダー背景 | `th`, `.table-header` の `background-color` | `table_header_bg` |
| テーブルヘッダー文字 | `th`, `.table-header` の `color` | `table_header_text` |

フォントもHTMLで使用したものに合わせる（ただし日本語対応フォントに限る）。

### スライド背景色の適用（必須）

スライドごとに `bg_slide` 色で全面を塗りつぶすこと。python-pptxはデフォルトで白背景になるため、明示的に設定が必要。

```python
from pptx.util import Inches
from pptx.enum.shapes import MSO_AUTO_SHAPE_TYPE

def set_slide_background(slide, slide_width, slide_height, color):
    """
    スライド全体の背景色を設定する。

    :param slide: python-pptxのSlideオブジェクト
    :param slide_width: スライド幅（Emu）
    :param slide_height: スライド高さ（Emu）
    :param color: RGBColorオブジェクト（THEMEのbg_slide）
    """
    bg = slide.shapes.add_shape(
        MSO_AUTO_SHAPE_TYPE.RECTANGLE, 0, 0, slide_width, slide_height
    )
    bg.fill.solid()
    bg.fill.fore_color.rgb = color
    bg.line.fill.background()  # 枠線なし
    # 背景は最背面に送る
    slide.shapes._spTree.remove(bg._element)
    slide.shapes._spTree.insert(2, bg._element)
```

### レイアウト構造の実装

**HTML再現ルールはSKILL.mdのStep 4冒頭「全種別共通ルール」を参照すること。**

配色だけでなく、HTMLのレイアウト構造も `generate_slides.py` で再現する。

| HTMLの構造要素 | python-pptxでの再現方法 |
|---|---|
| 全幅タイトルバー（`background-color` の帯） | `add_shape(RECTANGLE, 0, 0, slide_width, タイトル高さ)` で背景帯 |
| 左ボーダーアクセント（HTMLに存在する場合のみ） | `add_shape(RECTANGLE, 0, y, 細い幅, 高さ)` で縦帯 |
| 区切り線（HTMLに存在する場合のみ） | `add_shape(RECTANGLE, x, y, 幅, 2px相当のEmu)` |
| アクセントボックス | `add_shape(ROUNDED_RECTANGLE, ...)` |
| セクション背景帯 | `add_shape(RECTANGLE, ...)` で薄い背景色を設定 |
| コネクタ矢印（`→` / SVG arrow等） | `add_shape(RIGHT_ARROW, ...)` または `add_connector()` で再現 |

各スライドの **タイトル・コンテンツ・装飾要素の位置・サイズもHTMLのレイアウトに合わせて** `Inches` / `Emu` 値で設定すること。

## 注意事項

- python-pptxではシステムフォントの埋め込みができないため、閲覧環境にフォントがインストールされている必要がある
- 日本語フォントは游ゴシック / メイリオがWindows/Mac両対応で安全
- 色の指定は `RGBColor` で行い、HTMLのHex値から変換する
