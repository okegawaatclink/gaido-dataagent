"""提案書用draw.ioダイアグラム一括生成スクリプト

story.mdで定義された全図表を生成し、assets/ディレクトリに保存する。
"""

import os
import sys

# tools/drawio_builder.py を参照
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "tools"))

from drawio_builder import (
    DrawioBuilder,
    add_pod_contents,
    STYLE_GROUP_BLUE,
    STYLE_GROUP_GREEN,
    STYLE_GROUP_ORANGE,
    STYLE_GROUP_RED,
    STYLE_GROUP_PURPLE,
    STYLE_GROUP_GRAY,
    STYLE_GROUP_DASHED_RED,
    STYLE_NW_SWITCH,
    STYLE_SERVER,
    STYLE_STORAGE,
    STYLE_VM,
    STYLE_CONTAINER,
    STYLE_MGMT,
    STYLE_SPINE,
    STYLE_SUPERSPINE,
    STYLE_EXTERNAL,
    STYLE_LABEL,
    STYLE_LABEL_SMALL,
    STYLE_SCOPE_MARKER,
)

ASSETS_DIR = os.path.dirname(__file__)

# === エッジスタイル定数 ===

STYLE_EDGE_THICK = (
    "edgeStyle=orthogonalEdgeStyle;rounded=0;"
    "strokeWidth=2;strokeColor=#666666;"
)
STYLE_EDGE_THIN = (
    "edgeStyle=orthogonalEdgeStyle;rounded=0;"
    "strokeWidth=1;strokeColor=#999999;"
)
STYLE_EDGE_DASHED = (
    "edgeStyle=orthogonalEdgeStyle;rounded=0;"
    "strokeWidth=1;strokeColor=#999999;dashed=1;"
)


# ============================================================
# スライド5: 商用環境全体構成図
# ============================================================

def generate_slide05_commercial_overview() -> None:
    """商用環境全体構成図（東京・大阪）を生成する。"""
    b = DrawioBuilder("商用環境全体構成", dx=1550, dy=980)

    # ────────────────────────────────────────
    # 東京セクション
    # ────────────────────────────────────────
    tokyo = b.add_group(10, 10, 1080, 950, "商用環境（東京）", style=STYLE_GROUP_GRAY)

    # --- SuperSpine ---
    ss1 = b.add_node(380, 40, 120, 32, "SuperSpine #1", parent=tokyo, style=STYLE_SUPERSPINE)
    ss2 = b.add_node(540, 40, 120, 32, "SuperSpine #2", parent=tokyo, style=STYLE_SUPERSPINE)

    # --- Spine ---
    sp1 = b.add_node(60, 100, 100, 30, "Spine #1", parent=tokyo, style=STYLE_SPINE)
    sp2 = b.add_node(180, 100, 100, 30, "Spine #2", parent=tokyo, style=STYLE_SPINE)
    sp3 = b.add_node(750, 100, 100, 30, "Spine #3", parent=tokyo, style=STYLE_SPINE)
    sp4 = b.add_node(870, 100, 100, 30, "Spine #4", parent=tokyo, style=STYLE_SPINE)

    # SuperSpine - Spine 接続
    for ss in [ss1, ss2]:
        for sp in [sp1, sp2, sp3, sp4]:
            b.add_edge(ss, sp, parent=tokyo, style=STYLE_EDGE_THIN)

    # --- リソースPod #1 ---
    rp1 = b.add_group(20, 160, 340, 250, "リソースPod #1", parent=tokyo, style=STYLE_GROUP_BLUE)

    # Leaf SW
    rp1_sl1 = b.add_node(15, 35, 70, 26, "Server\\nLeaf", parent=rp1, style=STYLE_NW_SWITCH)
    rp1_sl2 = b.add_node(95, 35, 70, 26, "Server\\nLeaf", parent=rp1, style=STYLE_NW_SWITCH)
    rp1_st1 = b.add_node(175, 35, 70, 26, "Storage\\nSW", parent=rp1, style=STYLE_NW_SWITCH)
    rp1_st2 = b.add_node(255, 35, 70, 26, "Storage\\nSW", parent=rp1, style=STYLE_NW_SWITCH)

    # Server + Storage
    b.add_node(20, 80, 140, 55, "ESXi Server\\n(Dell R670 x18)", parent=rp1, style=STYLE_SERVER)
    b.add_node(180, 80, 140, 55, "NFS Storage\\n(NetApp AFF)", parent=rp1, style=STYLE_STORAGE)

    # Scope marker for storage
    b.add_node(180, 140, 140, 18, "★ 当社調達", parent=rp1, style=STYLE_SCOPE_MARKER)

    # Mgmt
    b.add_node(15, 175, 70, 22, "Console SV", parent=rp1, style=STYLE_MGMT)
    b.add_node(95, 175, 70, 22, "Mgmt L2SW", parent=rp1, style=STYLE_MGMT)
    b.add_node(15, 210, 90, 22, "設備Log/統計", parent=rp1, style=STYLE_MGMT)

    # Spine - Leaf 接続
    for sp in [sp1, sp2]:
        b.add_edge(sp, rp1_sl1, parent=tokyo, style=STYLE_EDGE_THICK)
        b.add_edge(sp, rp1_sl2, parent=tokyo, style=STYLE_EDGE_THICK)

    # --- リソースPod #2 ---
    rp2 = b.add_group(380, 160, 340, 250, "リソースPod #2", parent=tokyo, style=STYLE_GROUP_BLUE)

    rp2_sl1 = b.add_node(15, 35, 70, 26, "Server\\nLeaf", parent=rp2, style=STYLE_NW_SWITCH)
    rp2_sl2 = b.add_node(95, 35, 70, 26, "Server\\nLeaf", parent=rp2, style=STYLE_NW_SWITCH)
    rp2_st1 = b.add_node(175, 35, 70, 26, "Storage\\nSW", parent=rp2, style=STYLE_NW_SWITCH)
    rp2_st2 = b.add_node(255, 35, 70, 26, "Storage\\nSW", parent=rp2, style=STYLE_NW_SWITCH)

    b.add_node(20, 80, 140, 55, "ESXi Server\\n(Dell R670 x18)", parent=rp2, style=STYLE_SERVER)
    b.add_node(180, 80, 140, 55, "NFS Storage\\n(NetApp AFF)", parent=rp2, style=STYLE_STORAGE)
    b.add_node(180, 140, 140, 18, "★ 当社調達", parent=rp2, style=STYLE_SCOPE_MARKER)

    b.add_node(15, 175, 70, 22, "Console SV", parent=rp2, style=STYLE_MGMT)
    b.add_node(95, 175, 70, 22, "Mgmt L2SW", parent=rp2, style=STYLE_MGMT)
    b.add_node(15, 210, 90, 22, "設備Log/統計", parent=rp2, style=STYLE_MGMT)

    for sp in [sp1, sp2]:
        b.add_edge(sp, rp2_sl1, parent=tokyo, style=STYLE_EDGE_THICK)
        b.add_edge(sp, rp2_sl2, parent=tokyo, style=STYLE_EDGE_THICK)

    # --- 管理Pod ---
    mp = b.add_group(740, 160, 320, 510, "管理Pod", parent=tokyo, style=STYLE_GROUP_GREEN)

    mp_sl1 = b.add_node(15, 35, 70, 26, "Server\\nLeaf", parent=mp, style=STYLE_NW_SWITCH)
    mp_sl2 = b.add_node(95, 35, 70, 26, "Server\\nLeaf", parent=mp, style=STYLE_NW_SWITCH)
    mp_st1 = b.add_node(175, 35, 70, 26, "Storage\\nSW", parent=mp, style=STYLE_NW_SWITCH)
    mp_st2 = b.add_node(255, 35, 70, 26, "Storage\\nSW", parent=mp, style=STYLE_NW_SWITCH)

    # Management Pod servers
    b.add_node(15, 80, 140, 50, "ESXi Server\\n(管理VM用)", parent=mp, style=STYLE_SERVER)
    b.add_node(170, 80, 140, 50, "OCP Bare Metal\\n(Master/Worker)", parent=mp, style=STYLE_SERVER)

    # Management Pod storage
    b.add_node(15, 150, 90, 50, "VM Storage\\n(NetApp)", parent=mp, style=STYLE_STORAGE)
    b.add_node(115, 150, 90, 50, "Data Storage\\n(NetApp)", parent=mp, style=STYLE_STORAGE)
    b.add_node(215, 150, 90, 50, "Backup\\nStorage\\n(NetApp)", parent=mp, style=STYLE_STORAGE)
    b.add_node(15, 205, 290, 18, "★ 当社調達（ストレージ全台）", parent=mp, style=STYLE_SCOPE_MARKER)

    # Management VMs
    b.add_node(15, 240, 90, 28, "vCSA", parent=mp, style=STYLE_VM)
    b.add_node(115, 240, 90, 28, "NSO\\n(Cisco)", parent=mp, style=STYLE_VM)
    b.add_node(215, 240, 90, 28, "GitLab", parent=mp, style=STYLE_VM)
    b.add_node(15, 280, 90, 28, "NetBox", parent=mp, style=STYLE_VM)
    b.add_node(115, 280, 90, 28, "AAP\\n(Ansible)", parent=mp, style=STYLE_CONTAINER)
    b.add_node(215, 280, 90, 28, "API-GW", parent=mp, style=STYLE_CONTAINER)

    # NSO scope marker
    b.add_node(115, 312, 90, 18, "★ 当社調達", parent=mp, style=STYLE_SCOPE_MARKER)

    # Management Mgmt
    b.add_node(15, 345, 70, 22, "Console SV", parent=mp, style=STYLE_MGMT)
    b.add_node(95, 345, 70, 22, "Mgmt L2SW", parent=mp, style=STYLE_MGMT)

    # Management NW
    b.add_node(15, 385, 130, 28, "Mgmt L3 SW", parent=mp, style=STYLE_NW_SWITCH)
    b.add_node(160, 385, 130, 28, "MgmtNW接続\\n(OnePlatform)", parent=mp, style=STYLE_EXTERNAL)

    # 監視系
    b.add_node(15, 430, 90, 28, "設備ログSV", parent=mp, style=STYLE_MGMT)
    b.add_node(115, 430, 90, 28, "顧客ログSV", parent=mp, style=STYLE_MGMT)
    b.add_node(215, 430, 90, 28, "統計SV\\n(Zabbix)", parent=mp, style=STYLE_MGMT)
    b.add_node(15, 470, 90, 28, "監視SV\\n(Zabbix)", parent=mp, style=STYLE_MGMT)

    for sp in [sp3, sp4]:
        b.add_edge(sp, mp_sl1, parent=tokyo, style=STYLE_EDGE_THICK)
        b.add_edge(sp, mp_sl2, parent=tokyo, style=STYLE_EDGE_THICK)

    # --- 外部接続 ---
    ext_sdn2 = b.add_node(20, 440, 130, 35, "SDN2（現行環境）\\nSnapMirror連携", parent=tokyo, style=STYLE_EXTERNAL)
    ext_op = b.add_node(20, 490, 130, 35, "OnePlatform\\n(既設NW)", parent=tokyo, style=STYLE_EXTERNAL)

    # --- vCSA配置ラベル ---
    b.add_node(20, 550, 340, 22, "vCSA(リソースPod用) は管理Podに配置", parent=tokyo, style=STYLE_LABEL_SMALL)

    # --- 当社提案範囲ラベル ---
    scope = b.add_group(
        20, 590, 700, 60, "当社提案・調達範囲",
        parent=tokyo, style=STYLE_GROUP_DASHED_RED,
    )
    b.add_node(
        15, 25, 330, 22,
        "ストレージ（NetApp AFF/FAS） + NSO（Cisco） + インテリジェントPDU + ケーブル",
        parent=scope, style=STYLE_LABEL_SMALL,
    )
    b.add_node(
        360, 25, 320, 22,
        "設計・構築・試験・移行 + 統合保守サービス（5年間）",
        parent=scope, style=STYLE_LABEL_SMALL,
    )

    # ────────────────────────────────────────
    # 大阪セクション
    # ────────────────────────────────────────
    osaka = b.add_group(1110, 10, 420, 500, "商用環境（大阪）", style=STYLE_GROUP_GRAY)

    # Spine
    osp1 = b.add_node(100, 100, 100, 30, "Spine #1", parent=osaka, style=STYLE_SPINE)
    osp2 = b.add_node(220, 100, 100, 30, "Spine #2", parent=osaka, style=STYLE_SPINE)

    # リソースPod #1
    orp1 = b.add_group(20, 160, 380, 250, "リソースPod #1", parent=osaka, style=STYLE_GROUP_BLUE)

    orp1_sl1 = b.add_node(15, 35, 70, 26, "Server\\nLeaf", parent=orp1, style=STYLE_NW_SWITCH)
    orp1_sl2 = b.add_node(95, 35, 70, 26, "Server\\nLeaf", parent=orp1, style=STYLE_NW_SWITCH)
    orp1_st1 = b.add_node(175, 35, 70, 26, "Storage\\nSW", parent=orp1, style=STYLE_NW_SWITCH)
    orp1_st2 = b.add_node(255, 35, 70, 26, "Storage\\nSW", parent=orp1, style=STYLE_NW_SWITCH)

    b.add_node(20, 80, 160, 55, "ESXi Server\\n(Dell R670 x18)", parent=orp1, style=STYLE_SERVER)
    b.add_node(200, 80, 160, 55, "NFS Storage\\n(NetApp AFF)", parent=orp1, style=STYLE_STORAGE)
    b.add_node(200, 140, 160, 18, "★ 当社調達", parent=orp1, style=STYLE_SCOPE_MARKER)

    b.add_node(15, 175, 70, 22, "Console SV", parent=orp1, style=STYLE_MGMT)
    b.add_node(95, 175, 70, 22, "Mgmt L2SW", parent=orp1, style=STYLE_MGMT)
    b.add_node(15, 210, 90, 22, "設備Log/統計", parent=orp1, style=STYLE_MGMT)

    for sp in [osp1, osp2]:
        b.add_edge(sp, orp1_sl1, parent=osaka, style=STYLE_EDGE_THICK)
        b.add_edge(sp, orp1_sl2, parent=osaka, style=STYLE_EDGE_THICK)

    # 大阪注記
    b.add_node(20, 430, 380, 22, "※ 管理Podなし（東京の管理Podで集中管理）", parent=osaka, style=STYLE_LABEL_SMALL)

    # --- DC間接続ラベル ---
    b.add_node(1110, 530, 420, 30, "東京 ⇔ 大阪 DC間接続（SnapMirror DR対応可）", style=STYLE_LABEL)

    b.save(os.path.join(ASSETS_DIR, "slide05_commercial_overview.drawio"))
    print("  Generated: slide05_commercial_overview.drawio")


# ============================================================
# スライド6: STG・開発環境構成図
# ============================================================

def generate_slide06_stg_dev_overview() -> None:
    """STG・開発環境構成図を生成する。"""
    b = DrawioBuilder("STG・開発環境構成", dx=1550, dy=750)

    # ────────────────────────────────────────
    # STGセクション
    # ────────────────────────────────────────
    stg = b.add_group(10, 10, 740, 700, "ステージング環境（東京）", style=STYLE_GROUP_GRAY)

    # Spine
    stg_sp1 = b.add_node(180, 40, 100, 30, "Spine #1", parent=stg, style=STYLE_SPINE)
    stg_sp2 = b.add_node(420, 40, 100, 30, "Spine #2", parent=stg, style=STYLE_SPINE)

    # リソースPod #1
    stg_rp1 = b.add_group(20, 100, 340, 230, "リソースPod #1", parent=stg, style=STYLE_GROUP_BLUE)
    stg_rp1_sl1 = b.add_node(15, 35, 70, 26, "Server\\nLeaf", parent=stg_rp1, style=STYLE_NW_SWITCH)
    stg_rp1_sl2 = b.add_node(95, 35, 70, 26, "Server\\nLeaf", parent=stg_rp1, style=STYLE_NW_SWITCH)
    b.add_node(175, 35, 70, 26, "Storage\\nSW", parent=stg_rp1, style=STYLE_NW_SWITCH)
    b.add_node(255, 35, 70, 26, "Storage\\nSW", parent=stg_rp1, style=STYLE_NW_SWITCH)
    b.add_node(20, 80, 140, 50, "ESXi Server\\n(Dell R670)", parent=stg_rp1, style=STYLE_SERVER)
    b.add_node(180, 80, 140, 50, "NFS Storage\\n(NetApp)", parent=stg_rp1, style=STYLE_STORAGE)
    b.add_node(15, 145, 70, 22, "Console SV", parent=stg_rp1, style=STYLE_MGMT)
    b.add_node(95, 145, 70, 22, "Mgmt L2SW", parent=stg_rp1, style=STYLE_MGMT)

    for sp in [stg_sp1, stg_sp2]:
        b.add_edge(sp, stg_rp1_sl1, parent=stg, style=STYLE_EDGE_THIN)
        b.add_edge(sp, stg_rp1_sl2, parent=stg, style=STYLE_EDGE_THIN)

    # リソースPod #2
    stg_rp2 = b.add_group(380, 100, 340, 230, "リソースPod #2", parent=stg, style=STYLE_GROUP_BLUE)
    stg_rp2_sl1 = b.add_node(15, 35, 70, 26, "Server\\nLeaf", parent=stg_rp2, style=STYLE_NW_SWITCH)
    stg_rp2_sl2 = b.add_node(95, 35, 70, 26, "Server\\nLeaf", parent=stg_rp2, style=STYLE_NW_SWITCH)
    b.add_node(175, 35, 70, 26, "Storage\\nSW", parent=stg_rp2, style=STYLE_NW_SWITCH)
    b.add_node(255, 35, 70, 26, "Storage\\nSW", parent=stg_rp2, style=STYLE_NW_SWITCH)
    b.add_node(20, 80, 140, 50, "ESXi Server\\n(Dell R670)", parent=stg_rp2, style=STYLE_SERVER)
    b.add_node(180, 80, 140, 50, "NFS Storage\\n(NetApp)", parent=stg_rp2, style=STYLE_STORAGE)
    b.add_node(15, 145, 70, 22, "Console SV", parent=stg_rp2, style=STYLE_MGMT)
    b.add_node(95, 145, 70, 22, "Mgmt L2SW", parent=stg_rp2, style=STYLE_MGMT)

    for sp in [stg_sp1, stg_sp2]:
        b.add_edge(sp, stg_rp2_sl1, parent=stg, style=STYLE_EDGE_THIN)
        b.add_edge(sp, stg_rp2_sl2, parent=stg, style=STYLE_EDGE_THIN)

    # 管理Pod
    stg_mp = b.add_group(20, 360, 700, 170, "管理Pod", parent=stg, style=STYLE_GROUP_GREEN)
    b.add_node(15, 35, 100, 40, "ESXi Server\\n(管理VM用)", parent=stg_mp, style=STYLE_SERVER)
    b.add_node(130, 35, 100, 40, "OCP Server", parent=stg_mp, style=STYLE_SERVER)
    b.add_node(250, 35, 90, 40, "VM Storage\\n(NetApp)", parent=stg_mp, style=STYLE_STORAGE)
    b.add_node(355, 35, 90, 40, "Data Storage\\n(NetApp)", parent=stg_mp, style=STYLE_STORAGE)
    b.add_node(460, 35, 90, 40, "Backup Storage\\n(NetApp)", parent=stg_mp, style=STYLE_STORAGE)
    b.add_node(15, 95, 70, 22, "vCSA", parent=stg_mp, style=STYLE_VM)
    b.add_node(95, 95, 70, 22, "NSO", parent=stg_mp, style=STYLE_VM)
    b.add_node(175, 95, 70, 22, "AAP", parent=stg_mp, style=STYLE_CONTAINER)
    b.add_node(255, 95, 70, 22, "GitLab", parent=stg_mp, style=STYLE_VM)
    b.add_node(335, 95, 70, 22, "NetBox", parent=stg_mp, style=STYLE_VM)

    b.add_node(20, 560, 700, 22, "※ 商用環境に準じた構成。作業手順確立・移行リハーサルに使用", parent=stg, style=STYLE_LABEL_SMALL)

    # ────────────────────────────────────────
    # 開発セクション
    # ────────────────────────────────────────
    dev = b.add_group(770, 10, 740, 700, "開発環境（東京）", style=STYLE_GROUP_GRAY)

    # Spine
    dev_sp1 = b.add_node(180, 40, 100, 30, "Spine #1", parent=dev, style=STYLE_SPINE)
    dev_sp2 = b.add_node(420, 40, 100, 30, "Spine #2", parent=dev, style=STYLE_SPINE)

    # リソースPod #1
    dev_rp1 = b.add_group(20, 100, 340, 230, "リソースPod #1", parent=dev, style=STYLE_GROUP_BLUE)
    dev_rp1_sl1 = b.add_node(15, 35, 70, 26, "Server\\nLeaf", parent=dev_rp1, style=STYLE_NW_SWITCH)
    dev_rp1_sl2 = b.add_node(95, 35, 70, 26, "Server\\nLeaf", parent=dev_rp1, style=STYLE_NW_SWITCH)
    b.add_node(175, 35, 70, 26, "Storage\\nSW", parent=dev_rp1, style=STYLE_NW_SWITCH)
    b.add_node(255, 35, 70, 26, "Storage\\nSW", parent=dev_rp1, style=STYLE_NW_SWITCH)
    b.add_node(20, 80, 140, 50, "ESXi Server\\n(Dell R670)", parent=dev_rp1, style=STYLE_SERVER)
    b.add_node(180, 80, 140, 50, "NFS Storage\\n(NetApp)", parent=dev_rp1, style=STYLE_STORAGE)
    b.add_node(15, 145, 70, 22, "Console SV", parent=dev_rp1, style=STYLE_MGMT)
    b.add_node(95, 145, 70, 22, "Mgmt L2SW", parent=dev_rp1, style=STYLE_MGMT)

    for sp in [dev_sp1, dev_sp2]:
        b.add_edge(sp, dev_rp1_sl1, parent=dev, style=STYLE_EDGE_THIN)
        b.add_edge(sp, dev_rp1_sl2, parent=dev, style=STYLE_EDGE_THIN)

    # リソースPod #2
    dev_rp2 = b.add_group(380, 100, 340, 230, "リソースPod #2", parent=dev, style=STYLE_GROUP_BLUE)
    dev_rp2_sl1 = b.add_node(15, 35, 70, 26, "Server\\nLeaf", parent=dev_rp2, style=STYLE_NW_SWITCH)
    dev_rp2_sl2 = b.add_node(95, 35, 70, 26, "Server\\nLeaf", parent=dev_rp2, style=STYLE_NW_SWITCH)
    b.add_node(175, 35, 70, 26, "Storage\\nSW", parent=dev_rp2, style=STYLE_NW_SWITCH)
    b.add_node(255, 35, 70, 26, "Storage\\nSW", parent=dev_rp2, style=STYLE_NW_SWITCH)
    b.add_node(20, 80, 140, 50, "ESXi Server\\n(Dell R670)", parent=dev_rp2, style=STYLE_SERVER)
    b.add_node(180, 80, 140, 50, "NFS Storage\\n(NetApp)", parent=dev_rp2, style=STYLE_STORAGE)
    b.add_node(15, 145, 70, 22, "Console SV", parent=dev_rp2, style=STYLE_MGMT)
    b.add_node(95, 145, 70, 22, "Mgmt L2SW", parent=dev_rp2, style=STYLE_MGMT)

    for sp in [dev_sp1, dev_sp2]:
        b.add_edge(sp, dev_rp2_sl1, parent=dev, style=STYLE_EDGE_THIN)
        b.add_edge(sp, dev_rp2_sl2, parent=dev, style=STYLE_EDGE_THIN)

    # 管理Pod #1
    dev_mp1 = b.add_group(20, 360, 340, 160, "管理Pod #1", parent=dev, style=STYLE_GROUP_GREEN)
    b.add_node(15, 35, 100, 35, "ESXi Server", parent=dev_mp1, style=STYLE_SERVER)
    b.add_node(130, 35, 90, 35, "VM Storage\\n(NetApp)", parent=dev_mp1, style=STYLE_STORAGE)
    b.add_node(235, 35, 90, 35, "Data Storage\\n(NetApp)", parent=dev_mp1, style=STYLE_STORAGE)
    b.add_node(15, 85, 70, 22, "vCSA", parent=dev_mp1, style=STYLE_VM)
    b.add_node(95, 85, 70, 22, "NSO", parent=dev_mp1, style=STYLE_VM)
    b.add_node(175, 85, 70, 22, "AAP", parent=dev_mp1, style=STYLE_CONTAINER)
    b.add_node(255, 85, 70, 22, "GitLab", parent=dev_mp1, style=STYLE_VM)

    # 管理Pod #2
    dev_mp2 = b.add_group(380, 360, 340, 160, "管理Pod #2", parent=dev, style=STYLE_GROUP_GREEN)
    b.add_node(15, 35, 100, 35, "OCP Server", parent=dev_mp2, style=STYLE_SERVER)
    b.add_node(130, 35, 90, 35, "Backup Storage\\n(NetApp)", parent=dev_mp2, style=STYLE_STORAGE)
    b.add_node(15, 85, 70, 22, "OCP Master", parent=dev_mp2, style=STYLE_CONTAINER)
    b.add_node(95, 85, 70, 22, "OCP Worker", parent=dev_mp2, style=STYLE_CONTAINER)
    b.add_node(175, 85, 70, 22, "NetBox", parent=dev_mp2, style=STYLE_VM)

    b.add_node(20, 560, 700, 22, "※ 管理Pod x2構成（商用/STGとの差異）。VCF開発・SDN機能検証用", parent=dev, style=STYLE_LABEL_SMALL)

    b.save(os.path.join(ASSETS_DIR, "slide06_stg_dev_overview.drawio"))
    print("  Generated: slide06_stg_dev_overview.drawio")


# ============================================================
# スライド12: リソースPod論理構成図
# ============================================================

def generate_slide12_resource_pod() -> None:
    """リソースPod論理構成図を生成する。"""
    b = DrawioBuilder("リソースPod論理構成", dx=900, dy=750)

    # Pod全体
    pod = b.add_group(10, 10, 860, 700, "リソースPod 論理構成", style=STYLE_GROUP_BLUE)

    # --- NW層 ---
    nw_label = b.add_node(15, 35, 100, 20, "NW層", parent=pod, style=STYLE_LABEL)
    sl1 = b.add_node(130, 35, 100, 30, "Server Leaf #1", parent=pod, style=STYLE_NW_SWITCH)
    sl2 = b.add_node(250, 35, 100, 30, "Server Leaf #2", parent=pod, style=STYLE_NW_SWITCH)
    st1 = b.add_node(550, 35, 100, 30, "Storage SW #1", parent=pod, style=STYLE_NW_SWITCH)
    st2 = b.add_node(670, 35, 100, 30, "Storage SW #2", parent=pod, style=STYLE_NW_SWITCH)

    # Spine接続ラベル
    b.add_node(130, 5, 220, 20, "↑ to Spine（サービスNW）", parent=pod, style=STYLE_LABEL_SMALL)
    b.add_node(550, 5, 220, 20, "↑ to Spine（ストレージNW）", parent=pod, style=STYLE_LABEL_SMALL)

    # --- コンピュート層 ---
    comp_grp = b.add_group(15, 90, 520, 350, "コンピュート層（vSphereクラスタ）", parent=pod, style=STYLE_GROUP_PURPLE)

    # ESXiホスト群
    for i in range(6):
        col = i % 3
        row = i // 3
        x = 15 + col * 165
        y = 35 + row * 145
        host = b.add_group(x, y, 155, 130, f"ESXi Host #{i+1}", parent=comp_grp, style=STYLE_GROUP_GRAY)
        b.add_node(10, 30, 60, 22, "VM", parent=host, style=STYLE_VM)
        b.add_node(80, 30, 60, 22, "VM", parent=host, style=STYLE_VM)
        b.add_node(10, 60, 60, 22, "VM", parent=host, style=STYLE_VM)
        b.add_node(80, 60, 60, 22, "VM", parent=host, style=STYLE_VM)
        b.add_node(10, 90, 130, 22, "vSphere ESXi 8.x", parent=host, style=STYLE_LABEL_SMALL)

    b.add_node(15, 300, 490, 22, "... x18台（DRS/HA有効、AG単位で物理障害分離）", parent=comp_grp, style=STYLE_LABEL_SMALL)

    # --- ストレージ層 ---
    stor_grp = b.add_group(555, 90, 290, 350, "ストレージ層", parent=pod, style=STYLE_GROUP_GREEN)

    nfs = b.add_group(15, 35, 260, 200, "NFS Storage (NetApp AFF)", parent=stor_grp, style=STYLE_GROUP_GREEN)
    b.add_node(15, 30, 110, 35, "Controller A\\n(Active)", parent=nfs, style=STYLE_STORAGE)
    b.add_node(140, 30, 110, 35, "Controller B\\n(Standby)", parent=nfs, style=STYLE_STORAGE)
    b.add_node(15, 80, 235, 30, "NFS Datastore（VM格納領域）", parent=nfs, style=STYLE_LABEL_SMALL)
    b.add_node(15, 120, 235, 22, "ONTAP 9.x / HA Pair", parent=nfs, style=STYLE_LABEL_SMALL)
    b.add_node(15, 150, 235, 22, "Snapshot / SnapMirror対応", parent=nfs, style=STYLE_LABEL_SMALL)

    b.add_node(15, 255, 260, 22, "★ 当社調達・構築対象", parent=stor_grp, style=STYLE_SCOPE_MARKER)
    b.add_node(15, 285, 260, 22, "サイジング: 現行実績×成長率", parent=stor_grp, style=STYLE_LABEL_SMALL)

    # --- 管理層 ---
    mgmt_grp = b.add_group(15, 460, 830, 80, "管理・運用層", parent=pod, style=STYLE_GROUP_GRAY)
    b.add_node(15, 25, 90, 28, "Console SV", parent=mgmt_grp, style=STYLE_MGMT)
    b.add_node(120, 25, 90, 28, "Mgmt L2SW", parent=mgmt_grp, style=STYLE_MGMT)
    b.add_node(230, 25, 120, 28, "設備ログ/統計SV", parent=mgmt_grp, style=STYLE_MGMT)
    b.add_node(370, 25, 120, 28, "顧客ログSV", parent=mgmt_grp, style=STYLE_MGMT)
    b.add_node(510, 25, 120, 28, "監視SV (Zabbix)", parent=mgmt_grp, style=STYLE_MGMT)

    # --- エッジ（NW - コンピュート間） ---
    b.add_edge(sl1, comp_grp, parent=pod, style=STYLE_EDGE_THICK)
    b.add_edge(sl2, comp_grp, parent=pod, style=STYLE_EDGE_THICK)

    # --- エッジ（ストレージSW - ストレージ間） ---
    b.add_edge(st1, stor_grp, parent=pod, style=STYLE_EDGE_THICK)
    b.add_edge(st2, stor_grp, parent=pod, style=STYLE_EDGE_THICK)

    # --- vCSAラベル ---
    b.add_node(15, 565, 500, 22, "vCSA（管理Podに配置）からリソースPodクラスタを管理", parent=pod, style=STYLE_LABEL_SMALL)

    # --- VCFラベル ---
    b.add_node(15, 595, 500, 22, "VCF9対応: SDDC Manager によるライフサイクル管理", parent=pod, style=STYLE_LABEL_SMALL)

    b.save(os.path.join(ASSETS_DIR, "slide12_resource_pod.drawio"))
    print("  Generated: slide12_resource_pod.drawio")


# ============================================================
# スライド13: 管理Pod論理構成図
# ============================================================

def generate_slide13_mgmt_pod() -> None:
    """管理Pod論理構成図を生成する。"""
    b = DrawioBuilder("管理Pod論理構成", dx=1100, dy=850)

    pod = b.add_group(10, 10, 1060, 810, "管理Pod 論理構成", style=STYLE_GROUP_GREEN)

    # --- NW層 ---
    sl1 = b.add_node(200, 35, 100, 30, "Server Leaf #1", parent=pod, style=STYLE_NW_SWITCH)
    sl2 = b.add_node(320, 35, 100, 30, "Server Leaf #2", parent=pod, style=STYLE_NW_SWITCH)
    st1 = b.add_node(620, 35, 100, 30, "Storage SW #1", parent=pod, style=STYLE_NW_SWITCH)
    st2 = b.add_node(740, 35, 100, 30, "Storage SW #2", parent=pod, style=STYLE_NW_SWITCH)
    b.add_node(200, 5, 220, 20, "↑ to Spine", parent=pod, style=STYLE_LABEL_SMALL)

    # --- VM基盤 ---
    vm_grp = b.add_group(15, 90, 510, 320, "VM基盤（vSphereクラスタ）", parent=pod, style=STYLE_GROUP_PURPLE)

    # 管理VM一覧
    b.add_node(15, 35, 110, 32, "vCSA\\n(リソースPod用)", parent=vm_grp, style=STYLE_VM)
    b.add_node(140, 35, 110, 32, "vCSA\\n(管理Pod用)", parent=vm_grp, style=STYLE_VM)
    b.add_node(265, 35, 110, 32, "SDDC Manager", parent=vm_grp, style=STYLE_VM)
    b.add_node(390, 35, 110, 32, "NSX Manager", parent=vm_grp, style=STYLE_VM)

    b.add_node(15, 85, 110, 32, "NSO #1\\n(Cisco)", parent=vm_grp, style=STYLE_VM)
    b.add_node(140, 85, 110, 32, "NSO #2\\n(Cisco)", parent=vm_grp, style=STYLE_VM)
    b.add_node(265, 85, 110, 32, "GitLab", parent=vm_grp, style=STYLE_VM)
    b.add_node(390, 85, 110, 32, "NetBox", parent=vm_grp, style=STYLE_VM)

    b.add_node(15, 135, 110, 32, "踏み台SV\\n(Windows)", parent=vm_grp, style=STYLE_VM)
    b.add_node(140, 135, 110, 32, "踏み台SV\\n(Linux)", parent=vm_grp, style=STYLE_VM)
    b.add_node(265, 135, 110, 32, "SDNポータル\\n(仮想LB)", parent=vm_grp, style=STYLE_VM)
    b.add_node(390, 135, 110, 32, "SDNポータル\\n(仮想FW)", parent=vm_grp, style=STYLE_VM)

    b.add_node(15, 185, 110, 32, "Deep Security", parent=vm_grp, style=STYLE_VM)
    b.add_node(140, 185, 110, 32, "Rapid7", parent=vm_grp, style=STYLE_VM)

    b.add_node(15, 240, 490, 22, "ESXi Host x N台 / DRS・HA有効", parent=vm_grp, style=STYLE_LABEL_SMALL)
    b.add_node(15, 270, 490, 22, "★ NSO (Cisco) は当社調達・構築対象", parent=vm_grp, style=STYLE_SCOPE_MARKER)

    # --- OCP基盤 ---
    ocp_grp = b.add_group(545, 90, 500, 180, "OCP基盤（OpenShift Container Platform）", parent=pod, style=STYLE_GROUP_ORANGE)

    b.add_node(15, 35, 100, 32, "OCP Master\\nx3", parent=ocp_grp, style=STYLE_CONTAINER)
    b.add_node(130, 35, 100, 32, "OCP Infra\\nx3", parent=ocp_grp, style=STYLE_CONTAINER)
    b.add_node(245, 35, 100, 32, "OCP Worker\\nxN", parent=ocp_grp, style=STYLE_CONTAINER)
    b.add_node(360, 35, 120, 32, "OCP Bootstrap\\n(初期構築時)", parent=ocp_grp, style=STYLE_CONTAINER)

    b.add_node(15, 85, 100, 28, "API-GW", parent=ocp_grp, style=STYLE_CONTAINER)
    b.add_node(130, 85, 100, 28, "NSO連携\\nAdapter", parent=ocp_grp, style=STYLE_CONTAINER)
    b.add_node(245, 85, 100, 28, "AAP\\n(Ansible)", parent=ocp_grp, style=STYLE_CONTAINER)

    b.add_node(15, 130, 465, 22, "ベアメタルサーバ上に直接デプロイ", parent=ocp_grp, style=STYLE_LABEL_SMALL)

    # --- ストレージ層 ---
    stor_grp = b.add_group(545, 290, 500, 220, "ストレージ層", parent=pod, style=STYLE_GROUP_GREEN)

    vm_stor = b.add_group(15, 35, 150, 80, "VM Storage\\n(NetApp AFF)", parent=stor_grp, style=STYLE_GROUP_GREEN)
    b.add_node(10, 40, 130, 22, "HA Pair / NFS", parent=vm_stor, style=STYLE_LABEL_SMALL)

    data_stor = b.add_group(180, 35, 150, 80, "Data Storage\\n(NetApp AFF)", parent=stor_grp, style=STYLE_GROUP_GREEN)
    b.add_node(10, 40, 130, 22, "ファイル共有/ログ", parent=data_stor, style=STYLE_LABEL_SMALL)

    bk_stor = b.add_group(345, 35, 140, 80, "Backup Storage\\n(NetApp FAS)", parent=stor_grp, style=STYLE_GROUP_GREEN)
    b.add_node(10, 40, 120, 22, "SnapVault先", parent=bk_stor, style=STYLE_LABEL_SMALL)

    b.add_node(15, 130, 470, 22, "★ 全ストレージ当社調達・構築対象", parent=stor_grp, style=STYLE_SCOPE_MARKER)
    b.add_node(15, 160, 470, 22, "SnapMirror: SDN2⇔SDN3 ミラーリング対応", parent=stor_grp, style=STYLE_LABEL_SMALL)

    # --- 管理NW ---
    mgmt = b.add_group(15, 430, 520, 100, "管理NW・運用サーバ", parent=pod, style=STYLE_GROUP_GRAY)
    b.add_node(15, 30, 80, 28, "Console SV", parent=mgmt, style=STYLE_MGMT)
    b.add_node(105, 30, 80, 28, "Mgmt L2SW", parent=mgmt, style=STYLE_MGMT)
    b.add_node(200, 30, 80, 28, "Mgmt L3SW", parent=mgmt, style=STYLE_NW_SWITCH)
    b.add_node(295, 30, 100, 28, "設備ログSV", parent=mgmt, style=STYLE_MGMT)
    b.add_node(410, 30, 100, 28, "統計SV\\n(Zabbix/Cacti)", parent=mgmt, style=STYLE_MGMT)
    b.add_node(15, 65, 490, 22, "Mgmt L3SW → OnePlatform 接続", parent=mgmt, style=STYLE_LABEL_SMALL)

    # --- 外部接続 ---
    b.add_node(545, 530, 200, 35, "SDN2 (現行)\\nSnapMirror連携", parent=pod, style=STYLE_EXTERNAL)
    b.add_node(760, 530, 200, 35, "OnePlatform\\n(既設NW)", parent=pod, style=STYLE_EXTERNAL)

    # NW接続
    b.add_edge(sl1, vm_grp, parent=pod, style=STYLE_EDGE_THICK)
    b.add_edge(sl2, vm_grp, parent=pod, style=STYLE_EDGE_THICK)
    b.add_edge(st1, stor_grp, parent=pod, style=STYLE_EDGE_THICK)
    b.add_edge(st2, stor_grp, parent=pod, style=STYLE_EDGE_THICK)

    b.save(os.path.join(ASSETS_DIR, "slide13_mgmt_pod.drawio"))
    print("  Generated: slide13_mgmt_pod.drawio")


# ============================================================
# スライド14: 管理コンポーネント配置図
# ============================================================

def generate_slide14_mgmt_components() -> None:
    """管理コンポーネント配置図を生成する。"""
    b = DrawioBuilder("管理コンポーネント配置", dx=1000, dy=700)

    # タイトルラベル
    b.add_node(10, 10, 960, 25, "管理コンポーネント配置一覧（管理Pod内VM/コンテナ）", style=STYLE_LABEL)

    # --- VM基盤エリア ---
    vm_area = b.add_group(10, 50, 470, 420, "VM基盤（ESXiクラスタ上）", style=STYLE_GROUP_PURPLE)

    # VCF管理系
    vcf = b.add_group(15, 35, 440, 80, "VCF管理", parent=vm_area, style=STYLE_GROUP_GRAY)
    b.add_node(10, 25, 100, 30, "vCSA\\n(リソース用)", parent=vcf, style=STYLE_VM)
    b.add_node(120, 25, 100, 30, "vCSA\\n(管理用)", parent=vcf, style=STYLE_VM)
    b.add_node(230, 25, 100, 30, "SDDC Mgr", parent=vcf, style=STYLE_VM)
    b.add_node(340, 25, 90, 30, "NSX Mgr", parent=vcf, style=STYLE_VM)

    # SDN管理系
    sdn = b.add_group(15, 130, 440, 60, "SDN管理 ★当社調達", parent=vm_area, style=STYLE_GROUP_DASHED_RED)
    b.add_node(10, 25, 100, 25, "NSO #1 (Active)", parent=sdn, style=STYLE_VM)
    b.add_node(120, 25, 100, 25, "NSO #2 (Standby)", parent=sdn, style=STYLE_VM)

    # 運用管理系
    ops = b.add_group(15, 205, 440, 60, "運用管理", parent=vm_area, style=STYLE_GROUP_GRAY)
    b.add_node(10, 25, 100, 25, "GitLab", parent=ops, style=STYLE_VM)
    b.add_node(120, 25, 100, 25, "NetBox", parent=ops, style=STYLE_VM)
    b.add_node(230, 25, 100, 25, "Rapid7", parent=ops, style=STYLE_VM)

    # セキュリティ・踏み台
    sec = b.add_group(15, 280, 440, 60, "セキュリティ・アクセス", parent=vm_area, style=STYLE_GROUP_GRAY)
    b.add_node(10, 25, 100, 25, "Deep Security", parent=sec, style=STYLE_VM)
    b.add_node(120, 25, 100, 25, "踏み台 (Win)", parent=sec, style=STYLE_VM)
    b.add_node(230, 25, 100, 25, "踏み台 (Linux)", parent=sec, style=STYLE_VM)

    # 移行対象
    migr = b.add_group(15, 355, 440, 50, "移行考慮対象（※5）", parent=vm_area, style=STYLE_GROUP_DASHED_RED)
    b.add_node(10, 20, 100, 22, "SDNポータル", parent=migr, style=STYLE_VM)
    b.add_node(120, 20, 80, 22, "仮想LB", parent=migr, style=STYLE_VM)
    b.add_node(210, 20, 80, 22, "仮想FW", parent=migr, style=STYLE_VM)
    b.add_node(300, 20, 130, 22, "※ 移行設計のみ対象", parent=migr, style=STYLE_LABEL_SMALL)

    # --- OCP基盤エリア ---
    ocp_area = b.add_group(500, 50, 480, 250, "OCP基盤（ベアメタル）", style=STYLE_GROUP_ORANGE)

    # OCPインフラ
    ocp_infra = b.add_group(15, 35, 450, 60, "OCPクラスタ", parent=ocp_area, style=STYLE_GROUP_GRAY)
    b.add_node(10, 20, 80, 25, "Master x3", parent=ocp_infra, style=STYLE_CONTAINER)
    b.add_node(100, 20, 80, 25, "Infra x3", parent=ocp_infra, style=STYLE_CONTAINER)
    b.add_node(190, 20, 80, 25, "Worker xN", parent=ocp_infra, style=STYLE_CONTAINER)
    b.add_node(280, 20, 100, 25, "Bootstrap\\n(初期のみ)", parent=ocp_infra, style=STYLE_CONTAINER)

    # コンテナワークロード
    wl = b.add_group(15, 110, 450, 60, "コンテナワークロード", parent=ocp_area, style=STYLE_GROUP_GRAY)
    b.add_node(10, 20, 100, 25, "API-GW", parent=wl, style=STYLE_CONTAINER)
    b.add_node(120, 20, 120, 25, "NSO連携 Adapter", parent=wl, style=STYLE_CONTAINER)
    b.add_node(250, 20, 100, 25, "自動化ツール", parent=wl, style=STYLE_CONTAINER)

    # AAP
    aap = b.add_group(15, 185, 450, 45, "Ansible Automation Platform", parent=ocp_area, style=STYLE_GROUP_GRAY)
    b.add_node(10, 15, 100, 22, "AAP Controller", parent=aap, style=STYLE_CONTAINER)
    b.add_node(120, 15, 100, 22, "Execution Env", parent=aap, style=STYLE_CONTAINER)
    b.add_node(230, 15, 100, 22, "Private Hub", parent=aap, style=STYLE_CONTAINER)

    # --- ストレージ ---
    b.add_node(500, 320, 150, 40, "VM Storage\\n(NetApp AFF)", style=STYLE_STORAGE)
    b.add_node(660, 320, 150, 40, "Data Storage\\n(NetApp AFF)", style=STYLE_STORAGE)
    b.add_node(820, 320, 150, 40, "Backup Storage\\n(NetApp FAS)", style=STYLE_STORAGE)
    b.add_node(500, 370, 470, 20, "★ 全ストレージ当社調達・構築対象", style=STYLE_SCOPE_MARKER)

    b.save(os.path.join(ASSETS_DIR, "slide14_mgmt_components.drawio"))
    print("  Generated: slide14_mgmt_components.drawio")


# ============================================================
# スライド15: MgmtNW・運用サーバ構成図
# ============================================================

def generate_slide15_mgmt_nw() -> None:
    """MgmtNW・運用サーバ構成図を生成する。"""
    b = DrawioBuilder("MgmtNW・運用サーバ構成", dx=1000, dy=650)

    # --- MgmtNW層 ---
    nw = b.add_group(10, 10, 960, 150, "管理NW（MgmtNW）", style=STYLE_GROUP_ORANGE)
    b.add_node(20, 40, 120, 35, "Mgmt L3 SW #1", parent=nw, style=STYLE_NW_SWITCH)
    b.add_node(160, 40, 120, 35, "Mgmt L3 SW #2", parent=nw, style=STYLE_NW_SWITCH)
    b.add_node(350, 40, 120, 35, "Mgmt L2 SW\\n(Pod #1)", parent=nw, style=STYLE_NW_SWITCH)
    b.add_node(490, 40, 120, 35, "Mgmt L2 SW\\n(Pod #2)", parent=nw, style=STYLE_NW_SWITCH)
    b.add_node(630, 40, 120, 35, "Mgmt L2 SW\\n(管理Pod)", parent=nw, style=STYLE_NW_SWITCH)

    op = b.add_node(810, 40, 130, 35, "OnePlatform\\n接続", parent=nw, style=STYLE_EXTERNAL)

    b.add_node(20, 95, 380, 22, "L3 SW → OnePlatform 経由で外部NW管理システムと接続", parent=nw, style=STYLE_LABEL_SMALL)

    # --- Console SV ---
    console = b.add_group(10, 180, 300, 120, "Console サーバ（OOB管理）", style=STYLE_GROUP_GRAY)
    b.add_node(15, 35, 130, 35, "Console SV #1\\n(Pod #1)", parent=console, style=STYLE_MGMT)
    b.add_node(155, 35, 130, 35, "Console SV #2\\n(Pod #2)", parent=console, style=STYLE_MGMT)
    b.add_node(15, 80, 270, 22, "シリアルコンソール経由のOOBアクセス", parent=console, style=STYLE_LABEL_SMALL)

    # --- 設備ログ ---
    log_srv = b.add_group(330, 180, 310, 120, "ログ保存サーバ", style=STYLE_GROUP_GRAY)
    b.add_node(15, 35, 135, 35, "設備ログSV\\n(syslog中継)", parent=log_srv, style=STYLE_MGMT)
    b.add_node(160, 35, 135, 35, "顧客ログSV\\n(syslog中継)", parent=log_srv, style=STYLE_MGMT)
    b.add_node(15, 80, 280, 22, "各機器 → syslog → ログSV → 外部転送", parent=log_srv, style=STYLE_LABEL_SMALL)

    # --- 統計・監視 ---
    mon = b.add_group(660, 180, 310, 120, "統計・監視サーバ", style=STYLE_GROUP_GRAY)
    b.add_node(15, 35, 135, 35, "統計SV\\n(Zabbix/Cacti)", parent=mon, style=STYLE_MGMT)
    b.add_node(160, 35, 135, 35, "監視SV\\n(Zabbix Proxy)", parent=mon, style=STYLE_MGMT)
    b.add_node(15, 80, 280, 22, "SNMP/ICMP/APIで各機器を監視・統計取得", parent=mon, style=STYLE_LABEL_SMALL)

    # --- データフロー ---
    flow = b.add_group(10, 320, 960, 100, "データフロー", style=STYLE_GROUP_GRAY)
    b.add_node(15, 25, 200, 22, "NW機器/サーバ → syslog → ログSV", parent=flow, style=STYLE_LABEL_SMALL)
    b.add_node(230, 25, 200, 22, "ログSV → OnePlatform(外部)", parent=flow, style=STYLE_LABEL_SMALL)
    b.add_node(445, 25, 240, 22, "監視SV → Zabbix Server(OnePlatform)", parent=flow, style=STYLE_LABEL_SMALL)
    b.add_node(15, 55, 350, 22, "統計SV: トラフィック統計/リソース使用率をCactiで可視化", parent=flow, style=STYLE_LABEL_SMALL)

    b.save(os.path.join(ASSETS_DIR, "slide15_mgmt_nw.drawio"))
    print("  Generated: slide15_mgmt_nw.drawio")


# ============================================================
# スライド16: 移行フロー図
# ============================================================

def generate_slide16_migration_flow() -> None:
    """SDN2→SDN3移行フロー図を生成する。"""
    b = DrawioBuilder("移行フロー", dx=1100, dy=700)

    b.add_node(10, 10, 1060, 25, "SDN2 → SDN3 段階的移行フロー", style=STYLE_LABEL)

    # --- Phase 1 ---
    p1 = b.add_group(10, 50, 250, 350, "Phase 1\\n環境構築", style=STYLE_GROUP_BLUE)
    b.add_node(15, 45, 220, 30, "① SDN3 HW搬入・設置", parent=p1, style=STYLE_MGMT)
    b.add_node(15, 85, 220, 30, "② NW構築・接続", parent=p1, style=STYLE_MGMT)
    b.add_node(15, 125, 220, 30, "③ ESXi/vSphere構築", parent=p1, style=STYLE_SERVER)
    b.add_node(15, 165, 220, 30, "④ ストレージ構築", parent=p1, style=STYLE_STORAGE)
    b.add_node(15, 205, 220, 30, "⑤ OCP構築", parent=p1, style=STYLE_CONTAINER)
    b.add_node(15, 245, 220, 30, "⑥ 管理VM構築", parent=p1, style=STYLE_VM)
    b.add_node(15, 290, 220, 22, "開発→STG→商用の順で実施", parent=p1, style=STYLE_LABEL_SMALL)

    # --- Phase 2 ---
    p2 = b.add_group(280, 50, 250, 350, "Phase 2\\nデータ移行準備", style=STYLE_GROUP_GREEN)
    b.add_node(15, 45, 220, 35, "① SnapMirror設定\\n(SDN2→SDN3)", parent=p2, style=STYLE_STORAGE)
    b.add_node(15, 95, 220, 35, "② 初期同期\\n(フルコピー)", parent=p2, style=STYLE_STORAGE)
    b.add_node(15, 145, 220, 35, "③ 差分同期\\n(継続的ミラーリング)", parent=p2, style=STYLE_STORAGE)
    b.add_node(15, 200, 220, 35, "④ 設定情報の\\n抽出・変換準備", parent=p2, style=STYLE_MGMT)
    b.add_node(15, 255, 220, 35, "⑤ 移行リハーサル\\n(STG環境)", parent=p2, style=STYLE_MGMT)
    b.add_node(15, 305, 220, 22, "サービス無影響", parent=p2, style=STYLE_LABEL_SMALL)

    # --- Phase 3 ---
    p3 = b.add_group(550, 50, 250, 350, "Phase 3\\n顧客VM移行", style=STYLE_GROUP_ORANGE)
    b.add_node(15, 45, 220, 35, "① 移行対象グループ\\nの決定", parent=p3, style=STYLE_MGMT)
    b.add_node(15, 95, 220, 35, "② 冗長あり VM:\\nvMotion (< 3分)", parent=p3, style=STYLE_VM)
    b.add_node(15, 145, 220, 35, "③ 冗長なし VM:\\nCold Migration\\n(< 30分)", parent=p3, style=STYLE_VM)
    b.add_node(15, 200, 220, 35, "④ 設定投入\\n(自動化ツール)", parent=p3, style=STYLE_CONTAINER)
    b.add_node(15, 255, 220, 30, "⑤ 動作確認・切戻し判定", parent=p3, style=STYLE_MGMT)
    b.add_node(15, 305, 220, 22, "顧客単位でバッチ実施", parent=p3, style=STYLE_LABEL_SMALL)

    # --- Phase 4 ---
    p4 = b.add_group(820, 50, 250, 350, "Phase 4\\n完了・撤去", style=STYLE_GROUP_RED)
    b.add_node(15, 45, 220, 35, "① 全VM移行完了\\n確認", parent=p4, style=STYLE_MGMT)
    b.add_node(15, 95, 220, 35, "② SnapMirror\\n最終同期・解除", parent=p4, style=STYLE_STORAGE)
    b.add_node(15, 145, 220, 35, "③ SDN2側\\nサービス停止", parent=p4, style=STYLE_MGMT)
    b.add_node(15, 200, 220, 35, "④ SDN2 HW撤去\\n（SB様作業）", parent=p4, style=STYLE_MGMT)
    b.add_node(15, 255, 220, 30, "⑤ 移行完了報告", parent=p4, style=STYLE_MGMT)

    # --- Phase間矢印 ---
    b.add_edge(p1, p2, style=STYLE_EDGE_THICK)
    b.add_edge(p2, p3, style=STYLE_EDGE_THICK)
    b.add_edge(p3, p4, style=STYLE_EDGE_THICK)

    # --- ボトムラベル ---
    b.add_node(10, 420, 530, 25, "移行自動化: Ansible Playbook + カスタムスクリプトで一括処理", style=STYLE_LABEL)
    b.add_node(550, 420, 520, 25, "リハーサル: STG環境で全手順を事前検証。切戻し手順も確認", style=STYLE_LABEL)

    b.save(os.path.join(ASSETS_DIR, "slide16_migration_flow.drawio"))
    print("  Generated: slide16_migration_flow.drawio")


# ============================================================
# スライド19: 拡張パス図
# ============================================================

def generate_slide19_scalability() -> None:
    """拡張パス図を生成する。"""
    b = DrawioBuilder("拡張パス", dx=1000, dy=600)

    b.add_node(10, 10, 960, 25, "スケーラビリティ: 拡張パスと拡張方法", style=STYLE_LABEL)

    # --- Step 1: ディスク追加 ---
    s1 = b.add_group(10, 50, 220, 200, "Step 1\\nディスクシェルフ追加", style=STYLE_GROUP_GREEN)
    b.add_node(15, 45, 190, 35, "既存NetApp筐体に\\nディスクシェルフ追加", parent=s1, style=STYLE_STORAGE)
    b.add_node(15, 95, 190, 25, "容量: +数十TB/シェルフ", parent=s1, style=STYLE_LABEL_SMALL)
    b.add_node(15, 125, 190, 25, "サービス影響: なし\\n(NDU対応)", parent=s1, style=STYLE_LABEL_SMALL)
    b.add_node(15, 160, 190, 25, "工期: 数時間", parent=s1, style=STYLE_LABEL_SMALL)

    # --- Step 2: 筐体追加 ---
    s2 = b.add_group(250, 50, 220, 200, "Step 2\\nストレージ筐体追加", style=STYLE_GROUP_GREEN)
    b.add_node(15, 45, 190, 35, "新規NetApp筐体を\\nPod内に追加", parent=s2, style=STYLE_STORAGE)
    b.add_node(15, 95, 190, 25, "容量: 大幅増加", parent=s2, style=STYLE_LABEL_SMALL)
    b.add_node(15, 125, 190, 25, "サービス影響: なし\\n(NFS追加マウント)", parent=s2, style=STYLE_LABEL_SMALL)
    b.add_node(15, 160, 190, 25, "工期: 数日", parent=s2, style=STYLE_LABEL_SMALL)

    # --- Step 3: ESXi追加 ---
    s3 = b.add_group(490, 50, 220, 200, "Step 3\\nESXiホスト追加", style=STYLE_GROUP_PURPLE)
    b.add_node(15, 45, 190, 35, "既存Pod内の\\nvSphereクラスタに追加", parent=s3, style=STYLE_SERVER)
    b.add_node(15, 95, 190, 25, "VM収容: +数十VM/台", parent=s3, style=STYLE_LABEL_SMALL)
    b.add_node(15, 125, 190, 25, "サービス影響: なし\\n(DRS自動分散)", parent=s3, style=STYLE_LABEL_SMALL)
    b.add_node(15, 160, 190, 25, "工期: 数日", parent=s3, style=STYLE_LABEL_SMALL)

    # --- Step 4: Pod追加 ---
    s4 = b.add_group(730, 50, 240, 200, "Step 4\\nPod追加（水平拡張）", style=STYLE_GROUP_BLUE)
    b.add_node(15, 45, 210, 35, "新規リソースPod\\n(サーバ+ストレージ+NW)", parent=s4, style=STYLE_NW_SWITCH)
    b.add_node(15, 95, 210, 25, "収容: Pod単位で独立", parent=s4, style=STYLE_LABEL_SMALL)
    b.add_node(15, 125, 210, 25, "サービス影響: なし\\n(既存Pod無関係)", parent=s4, style=STYLE_LABEL_SMALL)
    b.add_node(15, 160, 210, 25, "工期: 数週間", parent=s4, style=STYLE_LABEL_SMALL)

    # 矢印
    b.add_edge(s1, s2, style=STYLE_EDGE_THICK)
    b.add_edge(s2, s3, style=STYLE_EDGE_THICK)
    b.add_edge(s3, s4, style=STYLE_EDGE_THICK)

    # 注記
    b.add_node(10, 270, 480, 25, "拡張上限: Spine-Leafトポロジで最大Pod数はSpineポート数に依存", style=STYLE_LABEL_SMALL)
    b.add_node(500, 270, 470, 25, "追加ライセンス: ESXiライセンス(SB様)/ONTAPライセンス(当社)が必要", style=STYLE_LABEL_SMALL)

    b.save(os.path.join(ASSETS_DIR, "slide19_scalability.drawio"))
    print("  Generated: slide19_scalability.drawio")


# ============================================================
# スライド20: 可用性構成図
# ============================================================

def generate_slide20_availability() -> None:
    """可用性構成図を生成する。"""
    b = DrawioBuilder("可用性構成", dx=1100, dy=700)

    b.add_node(10, 10, 1060, 25, "可用性設計: 全コンポーネントの冗長構成", style=STYLE_LABEL)

    # --- NW冗長 ---
    nw = b.add_group(10, 50, 340, 200, "NW冗長構成", style=STYLE_GROUP_ORANGE)
    b.add_node(15, 40, 150, 30, "Spine #1 (Active)", parent=nw, style=STYLE_SPINE)
    b.add_node(175, 40, 150, 30, "Spine #2 (Standby)", parent=nw, style=STYLE_SPINE)
    b.add_node(15, 85, 150, 30, "Leaf #1 (Active)", parent=nw, style=STYLE_NW_SWITCH)
    b.add_node(175, 85, 150, 30, "Leaf #2 (Standby)", parent=nw, style=STYLE_NW_SWITCH)
    b.add_node(15, 130, 310, 22, "切替方式: ECMP/LAG", parent=nw, style=STYLE_LABEL_SMALL)
    b.add_node(15, 160, 310, 22, "切替時間: < 1秒（自動）", parent=nw, style=STYLE_LABEL_SMALL)

    # --- サーバ冗長 ---
    srv = b.add_group(370, 50, 340, 200, "サーバ冗長構成", style=STYLE_GROUP_PURPLE)
    esxi1 = b.add_node(15, 40, 150, 30, "ESXi Host #1", parent=srv, style=STYLE_SERVER)
    esxi2 = b.add_node(175, 40, 150, 30, "ESXi Host #2", parent=srv, style=STYLE_SERVER)
    b.add_node(15, 85, 310, 30, "vSphere HA\\n(障害検知 → 自動再起動)", parent=srv, style=STYLE_VM)
    b.add_node(15, 130, 310, 22, "DRS: 負荷自動分散", parent=srv, style=STYLE_LABEL_SMALL)
    b.add_node(15, 160, 310, 22, "切替時間: < 1分（HA再起動）", parent=srv, style=STYLE_LABEL_SMALL)

    # --- ストレージ冗長 ---
    stor = b.add_group(730, 50, 340, 200, "ストレージ冗長構成", style=STYLE_GROUP_GREEN)
    b.add_node(15, 40, 150, 30, "Controller A\\n(Active)", parent=stor, style=STYLE_STORAGE)
    b.add_node(175, 40, 150, 30, "Controller B\\n(Standby)", parent=stor, style=STYLE_STORAGE)
    b.add_node(15, 85, 310, 30, "ONTAP HA Pair\\n(自動フェイルオーバー)", parent=stor, style=STYLE_STORAGE)
    b.add_node(15, 130, 310, 22, "RAID-TEC/RAID-DP でディスク冗長", parent=stor, style=STYLE_LABEL_SMALL)
    b.add_node(15, 160, 310, 22, "切替時間: < 60秒（透過的）", parent=stor, style=STYLE_LABEL_SMALL)

    # --- 管理VM冗長 ---
    mgmt = b.add_group(10, 270, 520, 150, "管理VM/コンテナ冗長", style=STYLE_GROUP_GRAY)
    b.add_node(15, 35, 240, 30, "NSO: Active/Standby構成", parent=mgmt, style=STYLE_VM)
    b.add_node(265, 35, 240, 30, "vCSA: 単体 (vSphere HAで保護)", parent=mgmt, style=STYLE_VM)
    b.add_node(15, 75, 240, 30, "OCP: Master x3 (quorum)", parent=mgmt, style=STYLE_CONTAINER)
    b.add_node(265, 75, 240, 30, "AAP: OCP上でPod冗長", parent=mgmt, style=STYLE_CONTAINER)
    b.add_node(15, 115, 490, 22, "切替時間: < 1分（自動）", parent=mgmt, style=STYLE_LABEL_SMALL)

    # --- バックアップ/DR ---
    dr = b.add_group(550, 270, 520, 150, "バックアップ/DR", style=STYLE_GROUP_RED)
    b.add_node(15, 35, 240, 30, "Snapshot: 定期取得\\n(ONTAP標準機能)", parent=dr, style=STYLE_STORAGE)
    b.add_node(265, 35, 240, 30, "SnapVault: Backup Storage\\nへ日次バックアップ", parent=dr, style=STYLE_STORAGE)
    b.add_node(15, 75, 240, 30, "SnapMirror: 東京⇔大阪\\nDRミラーリング", parent=dr, style=STYLE_STORAGE)
    b.add_node(265, 75, 240, 30, "コンフィグBK: GitLab/\\nNetBoxに設定保存", parent=dr, style=STYLE_MGMT)
    b.add_node(15, 115, 490, 22, "RPO: 日次 / RTO: 4時間以内（コンポーネント別）", parent=dr, style=STYLE_LABEL_SMALL)

    # --- NDU ---
    b.add_node(10, 440, 530, 25, "無停止アップグレード (NDU): ONTAP / ESXi / OCP すべて対応", style=STYLE_LABEL)
    b.add_node(550, 440, 520, 25, "縮退稼働復旧: HW部材交換 4時間以内（24/365 オンサイト対応）", style=STYLE_LABEL)

    b.save(os.path.join(ASSETS_DIR, "slide20_availability.drawio"))
    print("  Generated: slide20_availability.drawio")


# ============================================================
# スライド24: ラック構成図
# ============================================================

def generate_slide24_rack() -> None:
    """ラック構成図を生成する。"""
    b = DrawioBuilder("ラック構成", dx=1200, dy=700)

    b.add_node(10, 10, 1160, 25, "ラック構成・電力設計", style=STYLE_LABEL)

    # --- リソースPodラック ---
    rack1 = b.add_group(10, 50, 270, 450, "リソースPod ラック", style=STYLE_GROUP_BLUE)

    b.add_node(15, 35, 240, 25, "Rack A (系統1)", parent=rack1, style=STYLE_LABEL)
    # 機器配置
    b.add_node(15, 65, 115, 25, "Server Leaf #1", parent=rack1, style=STYLE_NW_SWITCH)
    b.add_node(140, 65, 115, 25, "Storage SW #1", parent=rack1, style=STYLE_NW_SWITCH)
    b.add_node(15, 95, 240, 25, "ESXi Server x9 (AG-A)", parent=rack1, style=STYLE_SERVER)
    b.add_node(15, 125, 240, 30, "NFS Storage\\n(NetApp Controller A)", parent=rack1, style=STYLE_STORAGE)
    b.add_node(15, 160, 115, 25, "Console SV", parent=rack1, style=STYLE_MGMT)
    b.add_node(140, 160, 115, 25, "iPDU x2", parent=rack1, style=STYLE_MGMT)

    b.add_node(15, 210, 240, 25, "Rack B (系統2)", parent=rack1, style=STYLE_LABEL)
    b.add_node(15, 240, 115, 25, "Server Leaf #2", parent=rack1, style=STYLE_NW_SWITCH)
    b.add_node(140, 240, 115, 25, "Storage SW #2", parent=rack1, style=STYLE_NW_SWITCH)
    b.add_node(15, 270, 240, 25, "ESXi Server x9 (AG-B)", parent=rack1, style=STYLE_SERVER)
    b.add_node(15, 300, 240, 30, "NFS Storage\\n(NetApp Controller B)", parent=rack1, style=STYLE_STORAGE)
    b.add_node(15, 335, 115, 25, "Mgmt L2SW", parent=rack1, style=STYLE_MGMT)
    b.add_node(140, 335, 115, 25, "iPDU x2", parent=rack1, style=STYLE_MGMT)

    b.add_node(15, 380, 240, 22, "冗長分散: 系統1/2をラック分離", parent=rack1, style=STYLE_LABEL_SMALL)
    b.add_node(15, 410, 240, 22, "★ iPDU/ストレージ: 当社調達", parent=rack1, style=STYLE_SCOPE_MARKER)

    # --- 管理Podラック ---
    rack2 = b.add_group(300, 50, 270, 450, "管理Pod ラック", style=STYLE_GROUP_GREEN)

    b.add_node(15, 35, 240, 25, "Rack C (管理系統1)", parent=rack2, style=STYLE_LABEL)
    b.add_node(15, 65, 115, 25, "Server Leaf #1", parent=rack2, style=STYLE_NW_SWITCH)
    b.add_node(140, 65, 115, 25, "Storage SW #1", parent=rack2, style=STYLE_NW_SWITCH)
    b.add_node(15, 95, 240, 25, "ESXi Server (管理VM用)", parent=rack2, style=STYLE_SERVER)
    b.add_node(15, 125, 240, 25, "OCP Server (Master/Worker)", parent=rack2, style=STYLE_SERVER)
    b.add_node(15, 155, 115, 30, "VM Storage\\n(NetApp)", parent=rack2, style=STYLE_STORAGE)
    b.add_node(140, 155, 115, 30, "Data Storage\\n(NetApp)", parent=rack2, style=STYLE_STORAGE)

    b.add_node(15, 210, 240, 25, "Rack D (管理系統2)", parent=rack2, style=STYLE_LABEL)
    b.add_node(15, 240, 115, 25, "Server Leaf #2", parent=rack2, style=STYLE_NW_SWITCH)
    b.add_node(140, 240, 115, 25, "Storage SW #2", parent=rack2, style=STYLE_NW_SWITCH)
    b.add_node(15, 270, 240, 30, "Backup Storage\\n(NetApp FAS)", parent=rack2, style=STYLE_STORAGE)
    b.add_node(15, 305, 115, 25, "Console SV", parent=rack2, style=STYLE_MGMT)
    b.add_node(140, 305, 115, 25, "Mgmt L3 SW", parent=rack2, style=STYLE_NW_SWITCH)

    b.add_node(15, 380, 240, 22, "冗長分散: 管理系統1/2をラック分離", parent=rack2, style=STYLE_LABEL_SMALL)
    b.add_node(15, 410, 240, 22, "★ 全ストレージ/iPDU: 当社調達", parent=rack2, style=STYLE_SCOPE_MARKER)

    # --- Spineラック ---
    rack3 = b.add_group(590, 50, 200, 200, "Spine ラック", style=STYLE_GROUP_RED)
    b.add_node(15, 35, 170, 30, "Spine SW #1-#4", parent=rack3, style=STYLE_SPINE)
    b.add_node(15, 75, 170, 30, "SuperSpine #1-#2\\n(東京のみ)", parent=rack3, style=STYLE_SUPERSPINE)
    b.add_node(15, 120, 170, 22, "SB様調達", parent=rack3, style=STYLE_LABEL_SMALL)

    # --- 電力計算 ---
    power = b.add_group(590, 270, 580, 230, "電力設計", style=STYLE_GROUP_GRAY)
    b.add_node(15, 35, 550, 22, "■ 電力計算基準: ブレーカー容量の70%以内", parent=power, style=STYLE_LABEL)

    b.add_node(15, 70, 260, 22, "リソースPod (1Pod / 2ラック):", parent=power, style=STYLE_LABEL_SMALL)
    b.add_node(290, 70, 260, 22, "通常時: XX kVA / 片系障害時: XX kVA", parent=power, style=STYLE_LABEL_SMALL)

    b.add_node(15, 100, 260, 22, "管理Pod (2ラック):", parent=power, style=STYLE_LABEL_SMALL)
    b.add_node(290, 100, 260, 22, "通常時: XX kVA / 片系障害時: XX kVA", parent=power, style=STYLE_LABEL_SMALL)

    b.add_node(15, 130, 260, 22, "Spine (1ラック):", parent=power, style=STYLE_LABEL_SMALL)
    b.add_node(290, 130, 260, 22, "通常時: XX kVA / 片系障害時: XX kVA", parent=power, style=STYLE_LABEL_SMALL)

    b.add_node(15, 170, 550, 22, "インテリジェントPDU: 電力監視・リモートリブート対応（当社調達）", parent=power, style=STYLE_LABEL_SMALL)

    b.save(os.path.join(ASSETS_DIR, "slide24_rack.drawio"))
    print("  Generated: slide24_rack.drawio")


# ============================================================
# スライド26: 保守サービス体系図
# ============================================================

def generate_slide26_maintenance() -> None:
    """保守サービス体系図を生成する。"""
    b = DrawioBuilder("保守サービス体系", dx=1000, dy=600)

    b.add_node(10, 10, 960, 25, "統合保守サービス体系", style=STYLE_LABEL)

    # --- お客様 ---
    cust = b.add_group(10, 50, 200, 100, "ソフトバンク様", style=STYLE_GROUP_BLUE)
    b.add_node(15, 35, 170, 30, "運用チーム", parent=cust, style=STYLE_MGMT)

    # --- 統合窓口 ---
    desk = b.add_group(280, 50, 200, 100, "統合サポート窓口", style=STYLE_GROUP_RED)
    b.add_node(15, 35, 170, 30, "24/365 受付\\n日本語対応", parent=desk, style=STYLE_MGMT)

    b.add_edge(cust, desk, label="問い合わせ\\n障害連絡", style=STYLE_EDGE_THICK)

    # --- テクニカルサポート ---
    tech = b.add_group(550, 50, 420, 150, "テクニカルサポート", style=STYLE_GROUP_PURPLE)
    b.add_node(15, 35, 120, 35, "ストレージ\\nサポート", parent=tech, style=STYLE_STORAGE)
    b.add_node(150, 35, 120, 35, "NSO\\nサポート", parent=tech, style=STYLE_VM)
    b.add_node(285, 35, 120, 35, "インテグレーション\\nサポート", parent=tech, style=STYLE_SERVER)
    b.add_node(15, 85, 390, 22, "重要度1: 30分以内 / 重要度2: 2時間以内 / 重要度3: 4時間以内", parent=tech, style=STYLE_LABEL_SMALL)
    b.add_node(15, 115, 390, 22, "エスカレーション: 開発部門・メーカー連携", parent=tech, style=STYLE_LABEL_SMALL)

    b.add_edge(desk, tech, label="エスカレーション", style=STYLE_EDGE_THICK)

    # --- オンサイト対応 ---
    onsite = b.add_group(10, 220, 470, 120, "オンサイト対応（24/365）", style=STYLE_GROUP_ORANGE)
    b.add_node(15, 35, 210, 35, "HW障害: 4時間以内\\n駆けつけ・部材交換", parent=onsite, style=STYLE_MGMT)
    b.add_node(240, 35, 210, 35, "SW障害: 暫定対応\\n24時間以内", parent=onsite, style=STYLE_MGMT)
    b.add_node(15, 80, 440, 22, "東京/大阪DC 直接対応。部材事前配備", parent=onsite, style=STYLE_LABEL_SMALL)

    b.add_edge(tech, onsite, label="ディスパッチ", style=STYLE_EDGE_THICK)

    # --- 月次報告 ---
    monthly = b.add_group(500, 220, 470, 120, "月次運用サービス", style=STYLE_GROUP_GREEN)
    b.add_node(15, 35, 210, 35, "月次定例会\\n(リモート/オンサイト)", parent=monthly, style=STYLE_MGMT)
    b.add_node(240, 35, 210, 35, "月次報告書\\n(障害/脆弱性/EoL)", parent=monthly, style=STYLE_MGMT)
    b.add_node(15, 80, 440, 22, "セキュリティ情報は重大時に即時提供", parent=monthly, style=STYLE_LABEL_SMALL)

    # --- トレーニング ---
    train = b.add_group(10, 360, 470, 80, "トレーニング", style=STYLE_GROUP_GRAY)
    b.add_node(15, 30, 140, 28, "座学 (製品概要)", parent=train, style=STYLE_MGMT)
    b.add_node(165, 30, 140, 28, "ハンズオン\\n(実機操作)", parent=train, style=STYLE_MGMT)
    b.add_node(315, 30, 140, 28, "マニュアル提供", parent=train, style=STYLE_MGMT)

    # --- ナレッジ ---
    kb = b.add_group(500, 360, 470, 80, "ナレッジベース提供", style=STYLE_GROUP_GRAY)
    b.add_node(15, 30, 140, 28, "バグ情報", parent=kb, style=STYLE_MGMT)
    b.add_node(165, 30, 140, 28, "リリース情報", parent=kb, style=STYLE_MGMT)
    b.add_node(315, 30, 140, 28, "ベストプラクティス", parent=kb, style=STYLE_MGMT)

    # 保守期間
    b.add_node(10, 460, 960, 25, "保守契約: 検収後5年間 / 保守移管受入対応可能", style=STYLE_LABEL)

    b.save(os.path.join(ASSETS_DIR, "slide26_maintenance.drawio"))
    print("  Generated: slide26_maintenance.drawio")


# ============================================================
# スライド27: 障害対応フロー図
# ============================================================

def generate_slide27_incident_flow() -> None:
    """障害対応フロー図を生成する。"""
    b = DrawioBuilder("障害対応フロー", dx=1100, dy=600)

    b.add_node(10, 10, 1060, 25, "障害対応フロー", style=STYLE_LABEL)

    # --- フロー（左から右） ---
    # 障害検知
    detect = b.add_group(10, 50, 150, 180, "障害検知", style=STYLE_GROUP_RED)
    b.add_node(10, 35, 130, 28, "監視SV\\n(Zabbix)", parent=detect, style=STYLE_MGMT)
    b.add_node(10, 75, 130, 28, "ストレージ\\n自動通報", parent=detect, style=STYLE_STORAGE)
    b.add_node(10, 115, 130, 28, "SB様\\n手動連絡", parent=detect, style=STYLE_MGMT)

    # 受付
    accept = b.add_group(180, 50, 150, 180, "受付・一次対応", style=STYLE_GROUP_ORANGE)
    b.add_node(10, 35, 130, 28, "統合窓口\\n24/365受付", parent=accept, style=STYLE_MGMT)
    b.add_node(10, 75, 130, 28, "重要度判定\\n(1/2/3/4)", parent=accept, style=STYLE_MGMT)
    b.add_node(10, 115, 130, 28, "一次切り分け", parent=accept, style=STYLE_MGMT)

    # テクニカル
    tech_flow = b.add_group(350, 50, 180, 180, "テクニカル対応", style=STYLE_GROUP_PURPLE)
    b.add_node(10, 35, 160, 28, "二次切り分け\\n(ログ分析)", parent=tech_flow, style=STYLE_MGMT)
    b.add_node(10, 75, 160, 28, "暫定対応\\n(< 24h)", parent=tech_flow, style=STYLE_MGMT)
    b.add_node(10, 115, 160, 28, "根本原因特定\\n(< 1週間)", parent=tech_flow, style=STYLE_MGMT)

    # HW対応
    hw = b.add_group(550, 50, 170, 180, "HW障害対応", style=STYLE_GROUP_GREEN)
    b.add_node(10, 35, 150, 28, "部材手配\\n(事前配備品)", parent=hw, style=STYLE_MGMT)
    b.add_node(10, 75, 150, 28, "オンサイト\\n4h駆けつけ", parent=hw, style=STYLE_MGMT)
    b.add_node(10, 115, 150, 28, "部材交換\\n→復旧確認", parent=hw, style=STYLE_MGMT)

    # SW対応
    sw = b.add_group(740, 50, 170, 180, "SW障害対応", style=STYLE_GROUP_BLUE)
    b.add_node(10, 35, 150, 28, "パッチ適用\\n/設定変更", parent=sw, style=STYLE_MGMT)
    b.add_node(10, 75, 150, 28, "恒久対策\\n提示", parent=sw, style=STYLE_MGMT)
    b.add_node(10, 115, 150, 28, "メーカー\\nエスカレーション", parent=sw, style=STYLE_MGMT)

    # 完了
    done = b.add_group(930, 50, 130, 180, "完了", style=STYLE_GROUP_GRAY)
    b.add_node(10, 35, 110, 28, "復旧報告", parent=done, style=STYLE_MGMT)
    b.add_node(10, 75, 110, 28, "原因報告書", parent=done, style=STYLE_MGMT)
    b.add_node(10, 115, 110, 28, "再発防止策", parent=done, style=STYLE_MGMT)

    # フロー接続
    b.add_edge(detect, accept, style=STYLE_EDGE_THICK)
    b.add_edge(accept, tech_flow, style=STYLE_EDGE_THICK)
    b.add_edge(tech_flow, hw, label="HW", style=STYLE_EDGE_THICK)
    b.add_edge(tech_flow, sw, label="SW", style=STYLE_EDGE_THICK)
    b.add_edge(hw, done, style=STYLE_EDGE_THICK)
    b.add_edge(sw, done, style=STYLE_EDGE_THICK)

    # --- SLA表 ---
    b.add_node(10, 260, 1060, 25, "障害対応SLA", style=STYLE_LABEL)

    sla = b.add_group(10, 295, 1060, 120, "", style=STYLE_GROUP_GRAY)
    b.add_node(15, 15, 250, 22, "重要度1（サービス全断）: 30分以内 初動", parent=sla, style=STYLE_LABEL_SMALL)
    b.add_node(280, 15, 250, 22, "重要度2（重大影響）: 2時間以内 初動", parent=sla, style=STYLE_LABEL_SMALL)
    b.add_node(545, 15, 250, 22, "重要度3（軽微影響）: 4時間以内 初動", parent=sla, style=STYLE_LABEL_SMALL)
    b.add_node(810, 15, 230, 22, "重要度4（情報照会）: 翌営業日", parent=sla, style=STYLE_LABEL_SMALL)
    b.add_node(15, 50, 300, 22, "HW故障: 4時間以内駆けつけ（24/365）", parent=sla, style=STYLE_LABEL_SMALL)
    b.add_node(330, 50, 350, 22, "SW暫定対応: 24時間以内 / 根本原因: 1週間以内", parent=sla, style=STYLE_LABEL_SMALL)
    b.add_node(15, 80, 500, 22, "恒久対策: 重要度1-2は30日以内に提示 / 重要度3は90日以内", parent=sla, style=STYLE_LABEL_SMALL)

    b.save(os.path.join(ASSETS_DIR, "slide27_incident_flow.drawio"))
    print("  Generated: slide27_incident_flow.drawio")


# ============================================================
# スライド30: プロジェクト体制図
# ============================================================

def generate_slide30_project_org() -> None:
    """プロジェクト体制図を生成する。"""
    b = DrawioBuilder("プロジェクト体制", dx=1000, dy=600)

    b.add_node(10, 10, 960, 25, "プロジェクト体制図", style=STYLE_LABEL)

    # --- PM ---
    pm = b.add_node(380, 50, 200, 40, "プロジェクトマネージャー", style=STYLE_SUPERSPINE)

    # --- セキュリティ ---
    sec = b.add_node(650, 50, 200, 40, "セキュリティ管理責任者", style=STYLE_EXTERNAL)

    # --- チームリーダー層 ---
    # ストレージ
    st_lead = b.add_group(10, 130, 200, 250, "ストレージチーム", style=STYLE_GROUP_GREEN)
    b.add_node(15, 35, 170, 30, "チームリーダー\\n(ストレージ)", parent=st_lead, style=STYLE_STORAGE)
    b.add_node(15, 80, 170, 25, "NetApp設計・構築", parent=st_lead, style=STYLE_LABEL_SMALL)
    b.add_node(15, 110, 170, 25, "SnapMirror設計", parent=st_lead, style=STYLE_LABEL_SMALL)
    b.add_node(15, 140, 170, 25, "データ移行設計", parent=st_lead, style=STYLE_LABEL_SMALL)
    b.add_node(15, 175, 170, 25, "性能チューニング", parent=st_lead, style=STYLE_LABEL_SMALL)
    b.add_node(15, 210, 170, 25, "担当: X名", parent=st_lead, style=STYLE_LABEL_SMALL)

    # 仮想基盤
    vm_lead = b.add_group(230, 130, 200, 250, "仮想基盤チーム", style=STYLE_GROUP_PURPLE)
    b.add_node(15, 35, 170, 30, "チームリーダー\\n(仮想基盤)", parent=vm_lead, style=STYLE_VM)
    b.add_node(15, 80, 170, 25, "vSphere/VCF設計", parent=vm_lead, style=STYLE_LABEL_SMALL)
    b.add_node(15, 110, 170, 25, "OCP設計・構築", parent=vm_lead, style=STYLE_LABEL_SMALL)
    b.add_node(15, 140, 170, 25, "NSO設計・構築", parent=vm_lead, style=STYLE_LABEL_SMALL)
    b.add_node(15, 175, 170, 25, "VM移行実施", parent=vm_lead, style=STYLE_LABEL_SMALL)
    b.add_node(15, 210, 170, 25, "担当: X名", parent=vm_lead, style=STYLE_LABEL_SMALL)

    # NW
    nw_lead = b.add_group(450, 130, 200, 250, "NWチーム", style=STYLE_GROUP_ORANGE)
    b.add_node(15, 35, 170, 30, "チームリーダー\\n(NW)", parent=nw_lead, style=STYLE_NW_SWITCH)
    b.add_node(15, 80, 170, 25, "Spine-Leaf設計", parent=nw_lead, style=STYLE_LABEL_SMALL)
    b.add_node(15, 110, 170, 25, "ストレージNW設計", parent=nw_lead, style=STYLE_LABEL_SMALL)
    b.add_node(15, 140, 170, 25, "MgmtNW設計", parent=nw_lead, style=STYLE_LABEL_SMALL)
    b.add_node(15, 175, 170, 25, "NW構築・試験", parent=nw_lead, style=STYLE_LABEL_SMALL)
    b.add_node(15, 210, 170, 25, "担当: X名", parent=nw_lead, style=STYLE_LABEL_SMALL)

    # 試験
    test_lead = b.add_group(670, 130, 200, 250, "試験チーム", style=STYLE_GROUP_BLUE)
    b.add_node(15, 35, 170, 30, "チームリーダー\\n(試験)", parent=test_lead, style=STYLE_CONTAINER)
    b.add_node(15, 80, 170, 25, "単体試験", parent=test_lead, style=STYLE_LABEL_SMALL)
    b.add_node(15, 110, 170, 25, "結合試験", parent=test_lead, style=STYLE_LABEL_SMALL)
    b.add_node(15, 140, 170, 25, "性能試験", parent=test_lead, style=STYLE_LABEL_SMALL)
    b.add_node(15, 175, 170, 25, "移行リハーサル", parent=test_lead, style=STYLE_LABEL_SMALL)
    b.add_node(15, 210, 170, 25, "担当: X名", parent=test_lead, style=STYLE_LABEL_SMALL)

    # PM → 各チーム
    b.add_edge(pm, st_lead, style=STYLE_EDGE_THICK)
    b.add_edge(pm, vm_lead, style=STYLE_EDGE_THICK)
    b.add_edge(pm, nw_lead, style=STYLE_EDGE_THICK)
    b.add_edge(pm, test_lead, style=STYLE_EDGE_THICK)

    # --- 保守チーム ---
    maint = b.add_group(10, 410, 420, 70, "保守チーム（検収後5年間）", style=STYLE_GROUP_GRAY)
    b.add_node(15, 25, 120, 28, "保守リーダー", parent=maint, style=STYLE_MGMT)
    b.add_node(150, 25, 120, 28, "テクニカルSE", parent=maint, style=STYLE_MGMT)
    b.add_node(285, 25, 120, 28, "フィールドSE", parent=maint, style=STYLE_MGMT)

    # --- 協力会社 ---
    partner = b.add_group(450, 410, 420, 70, "協力会社", style=STYLE_GROUP_GRAY)
    b.add_node(15, 25, 190, 28, "NetApp\\n(メーカーサポート)", parent=partner, style=STYLE_STORAGE)
    b.add_node(220, 25, 190, 28, "Cisco\\n(NSOサポート)", parent=partner, style=STYLE_VM)

    b.save(os.path.join(ASSETS_DIR, "slide30_project_org.drawio"))
    print("  Generated: slide30_project_org.drawio")


# ============================================================
# メイン
# ============================================================

def main() -> None:
    """全ダイアグラムを生成する。"""
    print("=== 提案書ダイアグラム生成 ===")
    print()

    generators = [
        ("スライド5", generate_slide05_commercial_overview),
        ("スライド6", generate_slide06_stg_dev_overview),
        ("スライド12", generate_slide12_resource_pod),
        ("スライド13", generate_slide13_mgmt_pod),
        ("スライド14", generate_slide14_mgmt_components),
        ("スライド15", generate_slide15_mgmt_nw),
        ("スライド16", generate_slide16_migration_flow),
        ("スライド19", generate_slide19_scalability),
        ("スライド20", generate_slide20_availability),
        ("スライド24", generate_slide24_rack),
        ("スライド26", generate_slide26_maintenance),
        ("スライド27", generate_slide27_incident_flow),
        ("スライド30", generate_slide30_project_org),
    ]

    for label, func in generators:
        print(f"[{label}]")
        func()

    print()
    print(f"=== 完了: {len(generators)}件のダイアグラムを生成しました ===")


if __name__ == "__main__":
    main()
