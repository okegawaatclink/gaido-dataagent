"""draw.io XMLビルダーモジュール

draw.io (mxGraph) XMLフォーマットのダイアグラムをPythonコードで生成するための
汎用ユーティリティ。提案書のシステム構成図、体制図、フロー図などの作成に使用する。

使い方:
    提案書ごとの生成スクリプト（例: assets/generate_diagrams.py）から
    importして使用する。

    >>> from drawio_builder import DrawioBuilder, STYLE_SERVER
    >>> b = DrawioBuilder(name="システム構成図")
    >>> group_id = b.add_group(0, 0, 400, 300, "リソースPod")
    >>> b.add_node(20, 40, 150, 60, "ESXi Server", parent=group_id, style=STYLE_SERVER)
    >>> b.save("output.drawio")

生成された .drawio ファイルは draw.io (diagrams.net) で開いて編集可能。

関連Skill:
    .claude/skills/slide-generator/SKILL.md
"""

import xml.etree.ElementTree as ET
from xml.dom import minidom
from typing import Optional
from dataclasses import dataclass, field


# ============================================================
# スタイル定数
# ============================================================
# draw.ioのmxCell要素に設定するスタイル文字列。
# 各定数はセミコロン区切りのプロパティで、色・フォント・形状を定義する。
# draw.io GUIで図形を右クリック→「スタイルを編集」で確認できる形式と同じ。
# ============================================================

# --- グループ（コンテナ）スタイル ---
# 他のノードを内包できる領域。Pod、クラスタ、サブネット等の表現に使用。
# container=1 により子要素をドラッグ時に一緒に移動できる。

STYLE_GROUP_BLUE = (
    "rounded=1;whiteSpace=wrap;html=1;container=1;"
    "collapsible=0;verticalAlign=top;fontStyle=1;"
    "fillColor=#dae8fc;strokeColor=#6c8ebf;fontSize=12;"
)
"""青系グループ。一般的なコンテナ、Pod、サブネット等に使用。"""

STYLE_GROUP_GREEN = (
    "rounded=1;whiteSpace=wrap;html=1;container=1;"
    "collapsible=0;verticalAlign=top;fontStyle=1;"
    "fillColor=#d5e8d4;strokeColor=#82b366;fontSize=12;"
)
"""緑系グループ。正常系、本番環境、ストレージ領域等に使用。"""

STYLE_GROUP_ORANGE = (
    "rounded=1;whiteSpace=wrap;html=1;container=1;"
    "collapsible=0;verticalAlign=top;fontStyle=1;"
    "fillColor=#fff2cc;strokeColor=#d6b656;fontSize=12;"
)
"""橙系グループ。注意が必要な領域、ステージング環境等に使用。"""

STYLE_GROUP_RED = (
    "rounded=1;whiteSpace=wrap;html=1;container=1;"
    "collapsible=0;verticalAlign=top;fontStyle=1;"
    "fillColor=#f8cecc;strokeColor=#b85450;fontSize=12;"
)
"""赤系グループ。重要度の高い領域、警告が必要な領域等に使用。"""

STYLE_GROUP_PURPLE = (
    "rounded=1;whiteSpace=wrap;html=1;container=1;"
    "collapsible=0;verticalAlign=top;fontStyle=1;"
    "fillColor=#e1d5e7;strokeColor=#9673a6;fontSize=12;"
)
"""紫系グループ。仮想化レイヤー、コンピュート領域等に使用。"""

STYLE_GROUP_GRAY = (
    "rounded=1;whiteSpace=wrap;html=1;container=1;"
    "collapsible=0;verticalAlign=top;fontStyle=1;"
    "fillColor=#f5f5f5;strokeColor=#666666;fontSize=12;"
)
"""グレー系グループ。管理系、補助的な領域等に使用。"""

STYLE_GROUP_DASHED_RED = (
    "rounded=1;whiteSpace=wrap;html=1;container=1;"
    "collapsible=0;verticalAlign=top;fontStyle=1;"
    "fillColor=none;strokeColor=#b85450;fontSize=12;"
    "dashed=1;dashPattern=8 4;strokeWidth=2;"
)
"""赤破線グループ。スコープ範囲、対象範囲の強調表示に使用。"""

# --- ノード（個別要素）スタイル ---
# 図中の個々のコンポーネントを表現する。

STYLE_NW_SWITCH = (
    "rounded=1;whiteSpace=wrap;html=1;"
    "fillColor=#fff2cc;strokeColor=#d6b656;fontSize=9;"
)
"""ネットワークスイッチ。Leaf SW、Spine SW、Storage SW等に使用。黄色系。"""

STYLE_SERVER = (
    "rounded=0;whiteSpace=wrap;html=1;"
    "fillColor=#e1d5e7;strokeColor=#9673a6;fontSize=9;"
)
"""物理サーバ。ESXi、ベアメタルサーバ等に使用。紫系、角丸なし。"""

STYLE_STORAGE = (
    "shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;"
    "backgroundOutline=1;size=10;fillColor=#d5e8d4;"
    "strokeColor=#82b366;fontSize=9;"
)
"""ストレージ。NetApp等に使用。円筒形、緑系。"""

STYLE_VM = (
    "rounded=1;whiteSpace=wrap;html=1;"
    "fillColor=#e1d5e7;strokeColor=#9673a6;fontSize=8;"
)
"""仮想マシン（VM）。vCSA、仮想アプライアンス等に使用。紫系、小さめフォント。"""

STYLE_CONTAINER = (
    "rounded=1;whiteSpace=wrap;html=1;"
    "fillColor=#dae8fc;strokeColor=#6c8ebf;fontSize=8;"
)
"""コンテナ。OpenShift Pod、Dockerコンテナ等に使用。青系。"""

STYLE_MGMT = (
    "rounded=1;whiteSpace=wrap;html=1;"
    "fillColor=#f5f5f5;strokeColor=#666666;fontSize=8;"
)
"""管理系コンポーネント。Console、管理SW、監視サーバ等に使用。グレー系。"""

STYLE_SPINE = (
    "rounded=1;whiteSpace=wrap;html=1;"
    "fillColor=#f8cecc;strokeColor=#b85450;fontSize=10;"
)
"""Spineスイッチ。赤系、やや大きめフォント。"""

STYLE_SUPERSPINE = (
    "rounded=1;whiteSpace=wrap;html=1;"
    "fillColor=#f8cecc;strokeColor=#b85450;fontSize=10;fontStyle=1;"
)
"""SuperSpineスイッチ。赤系、太字。Spineより上位のスイッチに使用。"""

STYLE_EXTERNAL = (
    "rounded=1;whiteSpace=wrap;html=1;"
    "fillColor=#ffe6cc;strokeColor=#d79b00;fontSize=9;"
)
"""外部システム・連携先。外部NW、既存システム等に使用。オレンジ系。"""

# --- ラベル（テキストのみ）スタイル ---
# 図中の注釈や補足テキストに使用。枠線・背景なし。

STYLE_LABEL = (
    "text;html=1;strokeColor=none;fillColor=none;"
    "align=center;verticalAlign=middle;whiteSpace=wrap;"
    "rounded=0;fontSize=11;fontStyle=1;"
)
"""見出しラベル。太字、中央揃え。セクション名等に使用。"""

STYLE_LABEL_SMALL = (
    "text;html=1;strokeColor=none;fillColor=none;"
    "align=center;verticalAlign=middle;whiteSpace=wrap;"
    "rounded=0;fontSize=9;"
)
"""補足ラベル。小さめフォント。注釈、補足説明等に使用。"""

STYLE_SCOPE_MARKER = (
    "text;html=1;strokeColor=none;fillColor=none;"
    "align=left;verticalAlign=middle;whiteSpace=wrap;"
    "rounded=0;fontSize=10;fontStyle=1;fontColor=#b85450;"
)
"""スコープ表示ラベル。赤字太字。「★ 構築対象スコープ」等の表示に使用。"""

# --- 体制図（組織図）用スタイル ---
# OrgChartBuilderと組み合わせて使用する。

STYLE_ORG_TOP = (
    "rounded=1;whiteSpace=wrap;html=1;"
    "fillColor=#1e3a5f;strokeColor=#1e3a5f;"
    "fontColor=#ffffff;fontSize=12;fontStyle=1;"
    "verticalAlign=middle;align=center;"
)
"""体制図トップノード。紺色背景・白文字・太字。PM、リーダー等の最上位役割に使用。"""

STYLE_ORG_MEMBER = (
    "rounded=1;whiteSpace=wrap;html=1;"
    "fillColor=#dae8fc;strokeColor=#6c8ebf;"
    "fontColor=#1e3a5f;fontSize=11;"
    "verticalAlign=middle;align=center;"
)
"""体制図メンバーノード。水色背景。自社メンバーの役割に使用。"""

STYLE_ORG_VENDOR = (
    "rounded=1;whiteSpace=wrap;html=1;"
    "fillColor=#f5f5f5;strokeColor=#666666;"
    "fontColor=#333333;fontSize=11;"
    "verticalAlign=middle;align=center;"
)
"""体制図ベンダーノード。グレー背景。協力会社・ベンダー担当者に使用。"""

STYLE_ORG_EDGE = (
    "edgeStyle=orthogonalEdgeStyle;rounded=0;"
    "orthogonalLoop=1;jettySize=auto;"
    "exitX=0.5;exitY=1;exitDx=0;exitDy=0;"
    "entryX=0.5;entryY=0;entryDx=0;entryDy=0;"
    "endArrow=none;startArrow=none;"
)
"""体制図エッジ。矢印なしの縦線。親子関係の接続に使用。"""


# ============================================================
# DrawioBuilder クラス
# ============================================================


class DrawioBuilder:
    """draw.io XMLを構築するビルダークラス。

    draw.ioの.drawioファイル（mxGraph XML形式）をPythonコードから生成する。
    add_group / add_node / add_edge でダイアグラム要素を追加し、
    build() でXML文字列を、save() でファイルを出力する。

    :param name: ダイアグラム名（draw.ioのタブ名として表示される）
    :param dx: キャンバス幅（ピクセル）
    :param dy: キャンバス高さ（ピクセル）
    """

    def __init__(self, name: str = "Page-1", dx: int = 1422, dy: int = 900) -> None:
        self._id_counter: int = 2  # 0=ルートセル, 1=デフォルト親レイヤー
        self._cells: list[ET.Element] = []
        self._name: str = name
        self._dx: int = dx
        self._dy: int = dy

        # draw.ioの必須構造: ルートセル(id=0) と デフォルト親レイヤー(id=1)
        root_cell = ET.Element("mxCell", id="0")
        self._cells.append(root_cell)
        layer_cell = ET.Element("mxCell", id="1", parent="0")
        self._cells.append(layer_cell)

    def _next_id(self) -> str:
        """次のユニークIDを返す。

        :return: ユニークID文字列
        """
        current = self._id_counter
        self._id_counter += 1
        return str(current)

    def add_group(
        self,
        x: int,
        y: int,
        width: int,
        height: int,
        label: str = "",
        parent: str = "1",
        style: str = STYLE_GROUP_BLUE,
    ) -> str:
        """グループ（コンテナ）を追加する。

        他のノードを内包できる領域を作成する。
        戻り値のIDを他のadd_node/add_groupのparent引数に渡すと
        グループ内に要素を配置できる。

        :param x: X座標（parent内での相対位置）
        :param y: Y座標（parent内での相対位置）
        :param width: 幅
        :param height: 高さ
        :param label: グループ上部に表示されるラベル
        :param parent: 親セルID（"1"=ルート直下、グループIDを指定するとネスト）
        :param style: スタイル文字列（STYLE_GROUP_* 定数を使用）
        :return: 作成したグループのセルID（子要素のparentに使用）
        """
        cell_id = self._next_id()
        cell = ET.Element(
            "mxCell",
            id=cell_id,
            value=label,
            style=style,
            vertex="1",
            parent=parent,
        )
        geo = ET.SubElement(
            cell, "mxGeometry",
            x=str(x), y=str(y), width=str(width), height=str(height),
        )
        geo.set("as", "geometry")
        self._cells.append(cell)
        return cell_id

    def add_node(
        self,
        x: int,
        y: int,
        width: int,
        height: int,
        label: str,
        parent: str = "1",
        style: Optional[str] = None,
    ) -> str:
        """ノード（矩形）を追加する。

        サーバ、スイッチ、ストレージなど個々のコンポーネントを配置する。

        :param x: X座標（parent内での相対位置）
        :param y: Y座標（parent内での相対位置）
        :param width: 幅
        :param height: 高さ
        :param label: ノード内に表示されるテキスト（\\nで改行可能）
        :param parent: 親セルID（"1"=ルート直下、グループIDを指定するとグループ内）
        :param style: スタイル文字列（STYLE_* 定数を使用、Noneの場合はデフォルト矩形）
        :return: 作成したノードのセルID
        """
        cell_id = self._next_id()
        if style is None:
            style = "rounded=1;whiteSpace=wrap;html=1;fontSize=10;"
        cell = ET.Element(
            "mxCell",
            id=cell_id,
            value=label,
            style=style,
            vertex="1",
            parent=parent,
        )
        geo = ET.SubElement(
            cell, "mxGeometry",
            x=str(x), y=str(y), width=str(width), height=str(height),
        )
        geo.set("as", "geometry")
        self._cells.append(cell)
        return cell_id

    def add_edge(
        self,
        source: str,
        target: str,
        label: str = "",
        parent: str = "1",
        style: Optional[str] = None,
    ) -> str:
        """エッジ（接続線）を追加する。

        2つのノード間を線で結ぶ。ネットワーク接続、データフロー等の表現に使用。

        :param source: 接続元のセルID（add_node/add_groupの戻り値）
        :param target: 接続先のセルID（add_node/add_groupの戻り値）
        :param label: 線上に表示されるラベル（空文字でラベルなし）
        :param parent: 親セルID
        :param style: スタイル文字列（Noneの場合は直角折れ線）
        :return: 作成したエッジのセルID
        """
        cell_id = self._next_id()
        if style is None:
            style = "edgeStyle=orthogonalEdgeStyle;rounded=0;"
        cell = ET.Element(
            "mxCell",
            id=cell_id,
            value=label,
            style=style,
            edge="1",
            parent=parent,
            source=source,
            target=target,
        )
        geo = ET.SubElement(cell, "mxGeometry")
        geo.set("relative", "1")
        geo.set("as", "geometry")
        self._cells.append(cell)
        return cell_id

    def build(self) -> str:
        """draw.io XMLを構築して文字列として返す。

        :return: draw.io XML文字列（.drawioファイルの内容）
        """
        mxfile = ET.Element("mxfile", host="Embedded", agent="Python DrawioBuilder")
        diagram = ET.SubElement(mxfile, "diagram", id="diagram-1", name=self._name)
        model = ET.SubElement(
            diagram, "mxGraphModel",
            dx=str(self._dx), dy=str(self._dy),
            grid="1", gridSize="10",
        )
        root = ET.SubElement(model, "root")
        for cell in self._cells:
            root.append(cell)

        rough_string = ET.tostring(mxfile, encoding="unicode")
        dom = minidom.parseString(rough_string)
        return dom.toprettyxml(indent="  ", encoding=None)

    def save(self, filepath: str) -> None:
        """draw.io XMLをファイルに保存する。

        :param filepath: 出力先ファイルパス（拡張子 .drawio を推奨）
        """
        content = self.build()
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)


# ============================================================
# ヘルパー関数
# ============================================================


def add_pod_contents(
    b: DrawioBuilder,
    pod_id: str,
    server_count: int,
    has_ops_server: bool = False,
) -> None:
    """Pod内の標準コンポーネント（Leaf SW、サーバ、ストレージ等）を追加する。

    SDN基盤の典型的なPod構成を一括追加するヘルパー。
    Pod内の配置: 上段にLeaf/Storage SW、中段にサーバ+ストレージ、下段に管理系。

    :param b: DrawioBuilderインスタンス
    :param pod_id: Pod グループのセルID（add_groupの戻り値）
    :param server_count: ESXiサーバ台数
    :param has_ops_server: 運用サーバ（設備Log/統計）を含むか
    """
    # 上段: ネットワークスイッチ
    b.add_node(20, 35, 80, 28, "Server\\nLeaf", parent=pod_id, style=STYLE_NW_SWITCH)
    b.add_node(110, 35, 80, 28, "Server\\nLeaf", parent=pod_id, style=STYLE_NW_SWITCH)
    b.add_node(200, 35, 80, 28, "Storage\\nSW", parent=pod_id, style=STYLE_NW_SWITCH)
    b.add_node(290, 35, 80, 28, "Storage\\nSW", parent=pod_id, style=STYLE_NW_SWITCH)

    # 中段: サーバ + ストレージ
    b.add_node(
        30, 80, 150, 60,
        f"ESXi Server\\n(Dell R670 x{server_count})",
        parent=pod_id, style=STYLE_SERVER,
    )
    b.add_node(
        210, 80, 150, 60,
        "NFS Storage\\n(NetApp)",
        parent=pod_id, style=STYLE_STORAGE,
    )

    # 中段（オプション）: 運用サーバ
    if has_ops_server:
        b.add_node(30, 155, 100, 25, "設備Log/統計", parent=pod_id, style=STYLE_MGMT)

    # 下段: 管理系
    b.add_node(20, 190, 80, 25, "Console SV", parent=pod_id, style=STYLE_MGMT)
    b.add_node(120, 190, 80, 25, "Mgmt L2SW", parent=pod_id, style=STYLE_MGMT)


# ============================================================
# 体制図（組織図）ビルダー
# ============================================================


@dataclass
class _OrgNode:
    """OrgChartBuilderの内部ノード表現。"""

    key: str
    title: str
    name: str
    org: str
    style: str
    parent_key: Optional[str]
    children: list[str] = field(default_factory=list)
    cell_id: Optional[str] = None


class OrgChartBuilder:
    """体制図（組織図）ビルダー。

    プロジェクト体制図・プロジェクト組織図を自動レイアウトで生成する。
    add_role() でメンバーを登録し、layout() で DrawioBuilder に展開する。

    :param builder: 出力先の DrawioBuilder インスタンス
    :param node_width: ノードの幅（ピクセル）
    :param node_height: ノードの高さ（ピクセル）
    :param h_gap: 兄弟ノード間の水平間隔
    :param v_gap: 親子ノード間の垂直間隔

    使い方::

        b = DrawioBuilder(name="提案体制図")
        org = OrgChartBuilder(b)
        org.add_role("pm",      title="PMリーダー",     name="山田 太郎", org="CTC", style=STYLE_ORG_TOP)
        org.add_role("se1",     title="システムSE",     name="鈴木 花子", org="CTC", parent="pm")
        org.add_role("se2",     title="インフラSE",     name="佐藤 次郎", org="CTC", parent="pm")
        org.add_role("vendor1", title="ベンダー担当",   name="田中 三郎", org="ABC社", parent="se2", style=STYLE_ORG_VENDOR)
        org.layout(start_x=400, start_y=50)
        b.save("assets/team.drawio")
    """

    def __init__(
        self,
        builder: DrawioBuilder,
        node_width: int = 160,
        node_height: int = 60,
        h_gap: int = 24,
        v_gap: int = 60,
    ) -> None:
        self._b = builder
        self._node_width = node_width
        self._node_height = node_height
        self._h_gap = h_gap
        self._v_gap = v_gap
        self._nodes: dict[str, _OrgNode] = {}
        self._roots: list[str] = []

    def add_role(
        self,
        key: str,
        title: str,
        name: str = "",
        org: str = "",
        parent: Optional[str] = None,
        style: str = STYLE_ORG_MEMBER,
    ) -> "OrgChartBuilder":
        """体制図にロール（役割）を追加する。

        :param key: このノードを参照するための一意キー（parent引数で使用）
        :param title: 役割名（例: "PMリーダー"、"インフラSE"）
        :param name: 担当者名（例: "山田 太郎"）。空文字の場合は非表示
        :param org: 所属組織名（例: "CTC"、"ABC社"）。空文字の場合は非表示
        :param parent: 親ノードのキー（Noneの場合はルート）
        :param style: ノードスタイル（STYLE_ORG_TOP / STYLE_ORG_MEMBER / STYLE_ORG_VENDOR）
        :return: メソッドチェーン用に自身を返す
        """
        node = _OrgNode(
            key=key,
            title=title,
            name=name,
            org=org,
            style=style,
            parent_key=parent,
        )
        self._nodes[key] = node
        if parent is None:
            self._roots.append(key)
        else:
            if parent in self._nodes:
                self._nodes[parent].children.append(key)
            else:
                raise ValueError(f"親ノード '{parent}' が未登録です。add_role() は親→子の順で呼び出してください。")
        return self

    def _subtree_width(self, key: str) -> int:
        """ノードのサブツリーが必要とする水平幅を再帰的に計算する。

        :param key: ノードキー
        :return: サブツリーの水平幅（ピクセル）
        """
        children = self._nodes[key].children
        if not children:
            return self._node_width
        children_total = sum(self._subtree_width(c) for c in children)
        gaps = self._h_gap * (len(children) - 1)
        return max(self._node_width, children_total + gaps)

    @staticmethod
    def _format_label(title: str, name: str, org: str) -> str:
        """ノードラベルをHTML形式で組み立てる。

        :param title: 役割名
        :param name: 担当者名
        :param org: 所属組織名
        :return: draw.io HTML形式のラベル文字列
        """
        parts = [f"<b>{title}</b>"]
        if name:
            parts.append(name)
        if org:
            parts.append(f'<font style="font-size:9px;">{org}</font>')
        return "<br>".join(parts)

    def _place_node(self, key: str, x_center: int, y: int) -> None:
        """ノードをDrawioBuilderに配置し、子ノードを再帰的に展開する。

        :param key: ノードキー
        :param x_center: ノード中心のX座標
        :param y: ノード上端のY座標
        """
        node = self._nodes[key]
        x = x_center - self._node_width // 2
        label = self._format_label(node.title, node.name, node.org)
        cell_id = self._b.add_node(x, y, self._node_width, self._node_height, label, style=node.style)
        node.cell_id = cell_id

        # 親との接続
        if node.parent_key and self._nodes[node.parent_key].cell_id:
            self._b.add_edge(
                self._nodes[node.parent_key].cell_id,
                cell_id,
                style=STYLE_ORG_EDGE,
            )

        # 子ノードをセンタリングして再帰配置
        children = node.children
        if not children:
            return

        total_w = sum(self._subtree_width(c) for c in children) + self._h_gap * (len(children) - 1)
        child_x = x_center - total_w // 2
        child_y = y + self._node_height + self._v_gap

        for child_key in children:
            sw = self._subtree_width(child_key)
            self._place_node(child_key, child_x + sw // 2, child_y)
            child_x += sw + self._h_gap

    def layout(self, start_x: int = 50, start_y: int = 50) -> None:
        """登録済みのロールを DrawioBuilder に展開して体制図を完成させる。

        ルートノードが複数の場合は横に並べて配置する。
        このメソッドを呼び出した後、DrawioBuilder.save() でファイルを保存すること。

        :param start_x: 体制図全体の左端X座標
        :param start_y: 体制図全体の上端Y座標
        """
        if not self._roots:
            raise ValueError("ルートノードがありません。add_role() でノードを追加してください。")

        total_w = sum(self._subtree_width(r) for r in self._roots) + self._h_gap * (len(self._roots) - 1)
        x = start_x + total_w // 2 - sum(self._subtree_width(r) for r in self._roots) // 2

        for root_key in self._roots:
            sw = self._subtree_width(root_key)
            self._place_node(root_key, x + sw // 2, start_y)
            x += sw + self._h_gap
