#!/usr/bin/env python3
"""
record_progress.py - 開発進捗状態をJSONファイルに記録するスクリプト

概要:
    フェーズ名と進捗情報をgaido_progress.jsonに記録します。
    Pockode（React）がこのファイルを監視し、UIに進捗を表示します。

使い方:
    python3 record_progress.py <phase> <status> [options]

    引数:
        phase   : フェーズ名（例: "壁打ちフェーズ", "実装フェーズ"）
        status  : 状態（"starting", "in_progress", "completed", "waiting_approval"）

    オプション:
        --task <task_name>     : 現在のタスク名
        --progress <current>   : 現在の進捗数
        --total <total>        : 総タスク数
        --message <message>    : 追加メッセージ
        --output <path>        : 出力ファイルパス（デフォルト: gaido_progress.json）
        --flow-type <type>     : フロータイプ（undetermined, new_development,
                                  existing_modification, tool,
                                  project_advisor, proposal）
        --skip-phases <phases> : スキップするフェーズ名（カンマ区切り）

    例:
        python3 record_progress.py "壁打ちフェーズ" "starting"
        python3 record_progress.py "壁打ちフェーズ" "starting" --flow-type new_development
        python3 record_progress.py "実装フェーズ" "in_progress" --flow-type existing_modification --task "Task #5: ログイン機能" --progress 3 --total 8
        python3 record_progress.py "作業内容入力フェーズ" "starting" --flow-type existing_modification --skip-phases "既存ソースローカル実行フェーズ,既存ソース解析フェーズ,既存ドキュメント解析フェーズ,解析結果統合フェーズ"

出力形式 (gaido_progress.json):
    --flow-type指定時:
    {
        "phase": "壁打ちフェーズ",
        "status": "starting",
        "current_task": null,
        "progress": null,
        "total": null,
        "message": null,
        "timestamp": "2026-03-17T14:30:00+09:00",
        "flow_type": "new_development",
        "ui_phase": "analyze",
        "ui_phase_number": 3,
        "ui_phase_total": 10,
        "ui_phase_label": "壁打ち",
        "ui_phases": [
            {"ui_phase": "welcome", "ui_phase_label": "開発内容選択", "ui_phase_number": 1},
            ...
        ]
    }

    --flow-type省略時（後方互換）:
    {
        "phase": "実装フェーズ",
        "status": "in_progress",
        "current_task": null,
        "progress": null,
        "total": null,
        "message": null,
        "timestamp": "2026-02-10T14:30:00+09:00",
        "ui_phase": "develop",
        "ui_phase_number": 4,
        "ui_phase_total": 8,
        "ui_phase_label": "実装"
    }
"""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional


# フェーズ定義（phase-workflow.mdと一致）
VALID_PHASES = [
    "開発内容選択フェーズ",
    "既存requirements充足判定フェーズ",
    "作業内容入力フェーズ",
    "壁打ちフェーズ",
    "画面デザインフェーズ",
    "要件確認フェーズ",
    "実装フェーズ",
    "テスト設計フェーズ",
    "テスト実装フェーズ",
    "成果まとめフェーズ",
    "完了",
    "既存ソースローカル実行フェーズ",
    "既存ソース解析フェーズ",
    "既存ドキュメント解析フェーズ",
    "解析結果統合フェーズ",
    "既存テスト生成フェーズ",
    # project_advisor フロー
    "案件ヒアリングフェーズ",
    "ゲートチェックフェーズ",
    "確度軸ヒアリングフェーズ",
    "戦略軸ヒアリングフェーズ",
    "営業まとめフェーズ",
    "技術確認フェーズ",
    "案件判定完了",
    # proposal フロー
    "提案準備フェーズ",
    "資料読み込みフェーズ",
    "構成壁打ちフェーズ",
    "デザインフェーズ",
    "図表・スライド生成フェーズ",
    "提案書確認フェーズ",
    "提案書完了",
]

# 有効なステータス
VALID_STATUSES = [
    "starting",           # フェーズ開始
    "in_progress",        # 処理中
    "completed",          # フェーズ完了
    "waiting_approval",   # ユーザー承認待ち
    "error",              # エラー発生
]

# 有効なフロータイプ
VALID_FLOW_TYPES = [
    "undetermined",            # 開発内容選択前（フロー未確定）
    "new_development",         # 新規開発
    "existing_modification",   # 既存改修
    "tool",                    # 非開発フロー（バグ報告、機能要望等）
    "project_advisor",         # 営業案件アドバイザー
    "proposal",                # 提案書作成
]

# フロータイプ別のフェーズ定義（順序付き）
# 各要素: {"phase": GAiDoフェーズ名, "ui_phase": UI用ID, "ui_phase_label": 表示ラベル}
FLOW_PHASES: dict[str, list[dict[str, str]]] = {
    "undetermined": [
        {"phase": "開発内容選択フェーズ", "ui_phase": "welcome", "ui_phase_label": "開発内容選択"},
    ],
    "new_development": [
        {"phase": "開発内容選択フェーズ", "ui_phase": "welcome", "ui_phase_label": "開発内容選択"},
        {"phase": "作業内容入力フェーズ", "ui_phase": "requirements_intake", "ui_phase_label": "作業内容入力"},
        {"phase": "壁打ちフェーズ", "ui_phase": "analyze", "ui_phase_label": "壁打ち"},
        {"phase": "画面デザインフェーズ", "ui_phase": "screen_design", "ui_phase_label": "画面デザイン"},
        {"phase": "要件確認フェーズ", "ui_phase": "backlog", "ui_phase_label": "要件確認"},
        {"phase": "実装フェーズ", "ui_phase": "develop", "ui_phase_label": "実装"},
        {"phase": "テスト設計フェーズ", "ui_phase": "test_design", "ui_phase_label": "テスト設計"},
        {"phase": "テスト実装フェーズ", "ui_phase": "test_run", "ui_phase_label": "テスト実装"},
        {"phase": "成果まとめフェーズ", "ui_phase": "finalize", "ui_phase_label": "まとめ"},
        {"phase": "完了", "ui_phase": "complete", "ui_phase_label": "完了"},
    ],
    "existing_modification": [
        {"phase": "開発内容選択フェーズ", "ui_phase": "welcome", "ui_phase_label": "開発内容選択"},
        {"phase": "既存requirements充足判定フェーズ", "ui_phase": "requirements_check", "ui_phase_label": "充足判定"},
        {"phase": "既存ソースローカル実行フェーズ", "ui_phase": "existing_local_run", "ui_phase_label": "ローカル実行"},
        {"phase": "既存ソース解析フェーズ", "ui_phase": "existing_source_analysis", "ui_phase_label": "ソース解析"},
        {"phase": "既存ドキュメント解析フェーズ", "ui_phase": "existing_doc_analysis", "ui_phase_label": "ドキュメント解析"},
        {"phase": "解析結果統合フェーズ", "ui_phase": "analysis_integration", "ui_phase_label": "解析統合"},
        {"phase": "作業内容入力フェーズ", "ui_phase": "requirements_intake", "ui_phase_label": "作業内容入力"},
        {"phase": "壁打ちフェーズ", "ui_phase": "analyze", "ui_phase_label": "壁打ち"},
        {"phase": "要件確認フェーズ", "ui_phase": "backlog", "ui_phase_label": "要件確認"},
        {"phase": "既存テスト生成フェーズ", "ui_phase": "existing_test_gen", "ui_phase_label": "テスト生成"},
        {"phase": "実装フェーズ", "ui_phase": "develop", "ui_phase_label": "実装"},
        {"phase": "テスト設計フェーズ", "ui_phase": "test_design", "ui_phase_label": "テスト設計"},
        {"phase": "テスト実装フェーズ", "ui_phase": "test_run", "ui_phase_label": "テスト実装"},
        {"phase": "成果まとめフェーズ", "ui_phase": "finalize", "ui_phase_label": "まとめ"},
        {"phase": "完了", "ui_phase": "complete", "ui_phase_label": "完了"},
    ],
    "tool": [],
    "project_advisor": [
        {"phase": "開発内容選択フェーズ", "ui_phase": "welcome", "ui_phase_label": "開発内容選択"},
        {"phase": "案件ヒアリングフェーズ", "ui_phase": "advisor_hearing", "ui_phase_label": "ヒアリング"},
        {"phase": "ゲートチェックフェーズ", "ui_phase": "advisor_gate", "ui_phase_label": "ゲートチェック"},
        {"phase": "確度軸ヒアリングフェーズ", "ui_phase": "advisor_certainty", "ui_phase_label": "確度評価"},
        {"phase": "戦略軸ヒアリングフェーズ", "ui_phase": "advisor_strategy", "ui_phase_label": "戦略評価"},
        {"phase": "営業まとめフェーズ", "ui_phase": "advisor_summary", "ui_phase_label": "まとめ"},
        {"phase": "技術確認フェーズ", "ui_phase": "advisor_tech", "ui_phase_label": "技術確認"},
        {"phase": "案件判定完了", "ui_phase": "advisor_complete", "ui_phase_label": "完了"},
    ],
    "proposal": [
        {"phase": "開発内容選択フェーズ", "ui_phase": "welcome", "ui_phase_label": "開発内容選択"},
        {"phase": "提案準備フェーズ", "ui_phase": "proposal_setup", "ui_phase_label": "準備"},
        {"phase": "資料読み込みフェーズ", "ui_phase": "proposal_input", "ui_phase_label": "資料読込"},
        {"phase": "構成壁打ちフェーズ", "ui_phase": "proposal_story", "ui_phase_label": "構成壁打ち"},
        {"phase": "デザインフェーズ", "ui_phase": "proposal_design", "ui_phase_label": "デザイン"},
        {"phase": "図表・スライド生成フェーズ", "ui_phase": "proposal_slides", "ui_phase_label": "スライド生成"},
        {"phase": "提案書確認フェーズ", "ui_phase": "proposal_review", "ui_phase_label": "確認"},
        {"phase": "提案書完了", "ui_phase": "proposal_complete", "ui_phase_label": "完了"},
    ],
}

# レガシー: GAiDoフェーズ → UIフェーズ（8段階）のマッピング
# --flow-type省略時の後方互換用
# UI側: 壁打ち(1) → 画面デザイン(2) → 要件確認(3) → 実装(4) → テスト設計(5) → テスト実装(6) → まとめ(7) → 完了(8)
LEGACY_UI_PHASE_MAPPING: dict[str, dict] = {
    "開発内容選択フェーズ": {"ui_phase": "welcome", "ui_phase_number": 0, "ui_phase_label": "開発内容選択"},
    "既存requirements充足判定フェーズ": {"ui_phase": "requirements_check", "ui_phase_number": 0, "ui_phase_label": "requirements充足判定"},
    "作業内容入力フェーズ": {"ui_phase": "requirements_intake", "ui_phase_number": 0, "ui_phase_label": "作業内容入力"},
    "壁打ちフェーズ": {"ui_phase": "analyze", "ui_phase_number": 1, "ui_phase_label": "壁打ち"},
    "画面デザインフェーズ": {"ui_phase": "screen_design", "ui_phase_number": 2, "ui_phase_label": "画面デザイン"},
    "要件確認フェーズ": {"ui_phase": "backlog", "ui_phase_number": 3, "ui_phase_label": "要件確認"},
    "実装フェーズ": {"ui_phase": "develop", "ui_phase_number": 4, "ui_phase_label": "実装"},
    "テスト設計フェーズ": {"ui_phase": "test_design", "ui_phase_number": 5, "ui_phase_label": "テスト設計"},
    "テスト実装フェーズ": {"ui_phase": "test_run", "ui_phase_number": 6, "ui_phase_label": "テスト実装"},
    "成果まとめフェーズ": {"ui_phase": "finalize", "ui_phase_number": 7, "ui_phase_label": "まとめ"},
    "完了": {"ui_phase": "complete", "ui_phase_number": 8, "ui_phase_label": "完了"},
    "既存ソースローカル実行フェーズ": {"ui_phase": "existing_local_run", "ui_phase_number": 0, "ui_phase_label": "既存ローカル実行"},
    "既存ソース解析フェーズ": {"ui_phase": "existing_source_analysis", "ui_phase_number": 0, "ui_phase_label": "既存ソース解析"},
    "既存ドキュメント解析フェーズ": {"ui_phase": "existing_doc_analysis", "ui_phase_number": 0, "ui_phase_label": "既存ドキュメント解析"},
    "解析結果統合フェーズ": {"ui_phase": "analysis_integration", "ui_phase_number": 0, "ui_phase_label": "解析結果統合"},
    "既存テスト生成フェーズ": {"ui_phase": "existing_test_gen", "ui_phase_number": 0, "ui_phase_label": "既存テスト生成"},
    # project_advisor フロー
    "案件ヒアリングフェーズ": {"ui_phase": "advisor_hearing", "ui_phase_number": 0, "ui_phase_label": "ヒアリング"},
    "ゲートチェックフェーズ": {"ui_phase": "advisor_gate", "ui_phase_number": 0, "ui_phase_label": "ゲートチェック"},
    "確度軸ヒアリングフェーズ": {"ui_phase": "advisor_certainty", "ui_phase_number": 0, "ui_phase_label": "確度評価"},
    "戦略軸ヒアリングフェーズ": {"ui_phase": "advisor_strategy", "ui_phase_number": 0, "ui_phase_label": "戦略評価"},
    "営業まとめフェーズ": {"ui_phase": "advisor_summary", "ui_phase_number": 0, "ui_phase_label": "まとめ"},
    "技術確認フェーズ": {"ui_phase": "advisor_tech", "ui_phase_number": 0, "ui_phase_label": "技術確認"},
    "案件判定完了": {"ui_phase": "advisor_complete", "ui_phase_number": 0, "ui_phase_label": "完了"},
    # proposal フロー
    "提案準備フェーズ": {"ui_phase": "proposal_setup", "ui_phase_number": 0, "ui_phase_label": "準備"},
    "資料読み込みフェーズ": {"ui_phase": "proposal_input", "ui_phase_number": 0, "ui_phase_label": "資料読込"},
    "構成壁打ちフェーズ": {"ui_phase": "proposal_story", "ui_phase_number": 0, "ui_phase_label": "構成壁打ち"},
    "デザインフェーズ": {"ui_phase": "proposal_design", "ui_phase_number": 0, "ui_phase_label": "デザイン"},
    "図表・スライド生成フェーズ": {"ui_phase": "proposal_slides", "ui_phase_number": 0, "ui_phase_label": "スライド生成"},
    "提案書確認フェーズ": {"ui_phase": "proposal_review", "ui_phase_number": 0, "ui_phase_label": "確認"},
    "提案書完了": {"ui_phase": "proposal_complete", "ui_phase_number": 0, "ui_phase_label": "完了"},
}

# レガシーUIフェーズの総数
LEGACY_UI_PHASE_TOTAL = 8


def build_ui_phases(
    flow_type: str,
    skip_phases: Optional[list[str]] = None,
) -> list[dict]:
    """
    フロータイプとスキップ対象からui_phases配列を生成する。

    Args:
        flow_type: フロータイプ名
        skip_phases: スキップするGAiDoフェーズ名のリスト

    Returns:
        list[dict]: ui_phases配列。各要素は
            {"ui_phase": str, "ui_phase_label": str, "ui_phase_number": int}
    """
    phases = FLOW_PHASES.get(flow_type, [])
    skip_set = set(skip_phases) if skip_phases else set()

    result: list[dict] = []
    for entry in phases:
        if entry["phase"] in skip_set:
            continue
        result.append({
            "ui_phase": entry["ui_phase"],
            "ui_phase_label": entry["ui_phase_label"],
            "ui_phase_number": len(result) + 1,
        })
    return result


def find_phase_in_ui_phases(
    phase: str,
    ui_phases: list[dict],
    flow_type: str,
) -> dict:
    """
    GAiDoフェーズ名からui_phases内の該当エントリを検索する。

    Args:
        phase: GAiDoフェーズ名
        ui_phases: build_ui_phasesで生成したリスト
        flow_type: フロータイプ名

    Returns:
        dict: {"ui_phase": str, "ui_phase_label": str, "ui_phase_number": int}
    """
    # FLOW_PHASESからphase→ui_phaseのマッピングを取得
    flow_entries = FLOW_PHASES.get(flow_type, [])
    ui_phase_id = None
    for entry in flow_entries:
        if entry["phase"] == phase:
            ui_phase_id = entry["ui_phase"]
            break

    if ui_phase_id is None:
        return {"ui_phase": "unknown", "ui_phase_label": "不明", "ui_phase_number": 0}

    # ui_phases内で該当するui_phase_idを探す
    for ui_entry in ui_phases:
        if ui_entry["ui_phase"] == ui_phase_id:
            return ui_entry

    # スキップされたフェーズの場合
    return {"ui_phase": ui_phase_id, "ui_phase_label": "不明", "ui_phase_number": 0}


def get_legacy_ui_phase_info(phase: str) -> dict:
    """
    レガシーモード: GAiDoフェーズからUIフェーズ情報を取得する。
    --flow-type省略時の後方互換用。

    Args:
        phase: GAiDoフェーズ名

    Returns:
        dict: UIフェーズ情報（ui_phase, ui_phase_number, ui_phase_label）
    """
    return LEGACY_UI_PHASE_MAPPING.get(phase, {
        "ui_phase": "unknown",
        "ui_phase_number": 0,
        "ui_phase_label": "不明"
    })


def create_progress_record(
    phase: str,
    status: str,
    flow_type: Optional[str] = None,
    skip_phases: Optional[list[str]] = None,
    current_task: Optional[str] = None,
    progress: Optional[int] = None,
    total: Optional[int] = None,
    message: Optional[str] = None,
) -> dict:
    """
    進捗レコードを作成する。

    Args:
        phase: フェーズ名
        status: 状態
        flow_type: フロータイプ（None時はレガシーモード）
        skip_phases: スキップするフェーズ名のリスト
        current_task: 現在のタスク名
        progress: 現在の進捗数
        total: 総タスク数
        message: 追加メッセージ

    Returns:
        dict: 進捗レコード
    """
    record: dict = {
        "phase": phase,
        "status": status,
        "current_task": current_task,
        "progress": progress,
        "total": total,
        "message": message,
        "timestamp": datetime.now().astimezone().isoformat(),
    }

    if flow_type is not None:
        # 新モード: フロータイプ指定あり
        ui_phases = build_ui_phases(flow_type, skip_phases)
        phase_info = find_phase_in_ui_phases(phase, ui_phases, flow_type)

        record["flow_type"] = flow_type
        record["ui_phase"] = phase_info["ui_phase"]
        record["ui_phase_number"] = phase_info["ui_phase_number"]
        record["ui_phase_total"] = len(ui_phases)
        record["ui_phase_label"] = phase_info["ui_phase_label"]
        record["ui_phases"] = ui_phases
    else:
        # レガシーモード: 後方互換
        ui_info = get_legacy_ui_phase_info(phase)
        record["ui_phase"] = ui_info["ui_phase"]
        record["ui_phase_number"] = ui_info["ui_phase_number"]
        record["ui_phase_total"] = LEGACY_UI_PHASE_TOTAL
        record["ui_phase_label"] = ui_info["ui_phase_label"]

    return record


def write_progress(record: dict, output_path: Path) -> None:
    """
    進捗レコードをJSONファイルに書き込む。

    Args:
        record: 進捗レコード
        output_path: 出力ファイルパス
    """
    # 親ディレクトリが存在しない場合は作成
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(record, f, ensure_ascii=False, indent=2)


def parse_args() -> argparse.Namespace:
    """
    コマンドライン引数をパースする。

    Returns:
        argparse.Namespace: パースされた引数
    """
    parser = argparse.ArgumentParser(
        description="開発進捗状態をJSONファイルに記録する"
    )
    parser.add_argument(
        "phase",
        type=str,
        help=f"フェーズ名（{', '.join(VALID_PHASES)}）",
    )
    parser.add_argument(
        "status",
        type=str,
        help=f"状態（{', '.join(VALID_STATUSES)}）",
    )
    parser.add_argument(
        "--task",
        type=str,
        default=None,
        help="現在のタスク名",
    )
    parser.add_argument(
        "--progress",
        type=int,
        default=None,
        help="現在の進捗数",
    )
    parser.add_argument(
        "--total",
        type=int,
        default=None,
        help="総タスク数",
    )
    parser.add_argument(
        "--message",
        type=str,
        default=None,
        help="追加メッセージ",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="gaido_progress.json",
        help="出力ファイルパス（デフォルト: gaido_progress.json）",
    )
    parser.add_argument(
        "--flow-type",
        type=str,
        default=None,
        choices=VALID_FLOW_TYPES,
        help=f"フロータイプ（{', '.join(VALID_FLOW_TYPES)}）",
    )
    parser.add_argument(
        "--skip-phases",
        type=str,
        default=None,
        help="スキップするフェーズ名（カンマ区切り）",
    )
    return parser.parse_args()


def main() -> None:
    """メイン処理"""
    args = parse_args()

    # フェーズ名の検証
    if args.phase not in VALID_PHASES:
        print(f"警告: 未知のフェーズ名 '{args.phase}'", file=sys.stderr)
        print(f"  有効なフェーズ: {', '.join(VALID_PHASES)}", file=sys.stderr)
        # 警告のみで続行（柔軟性のため）

    # ステータスの検証
    if args.status not in VALID_STATUSES:
        print(f"エラー: 無効なステータス '{args.status}'", file=sys.stderr)
        print(f"  有効なステータス: {', '.join(VALID_STATUSES)}", file=sys.stderr)
        sys.exit(1)

    # --skip-phasesのパース
    skip_phases: Optional[list[str]] = None
    if args.skip_phases:
        skip_phases = [p.strip() for p in args.skip_phases.split(",")]

    # 進捗レコードを作成
    record = create_progress_record(
        phase=args.phase,
        status=args.status,
        flow_type=args.flow_type,
        skip_phases=skip_phases,
        current_task=args.task,
        progress=args.progress,
        total=args.total,
        message=args.message,
    )

    # ファイルに書き込み
    output_path = Path(args.output)
    write_progress(record, output_path)

    # 結果を出力
    print(f"進捗記録完了: {output_path}")
    print(f"  フェーズ: {args.phase}")
    print(f"  ステータス: {args.status}")
    if args.flow_type:
        print(f"  フロータイプ: {args.flow_type}")
    if args.task:
        print(f"  タスク: {args.task}")
    if args.progress is not None and args.total is not None:
        print(f"  進捗: {args.progress}/{args.total}")
    if args.message:
        print(f"  メッセージ: {args.message}")


if __name__ == "__main__":
    main()
