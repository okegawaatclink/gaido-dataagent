#!/usr/bin/env python3
"""
report_cost.py - コスト・トークン消費量の集計レポートを生成するスクリプト

概要:
    cost_metrics.jsonl に記録されたフェーズ別メトリクスを集計し、
    README.md の末尾にレポートを追記します。

    注意: このスクリプトを実行する前に /record-costs で最終フェーズを記録してください。
    /report-costs スキルから呼び出す場合は自動的に記録されます。

使い方:
    python3 report_cost.py [cost_metrics_file] [readme_file]

    引数:
        cost_metrics_file : 入力ファイル（省略時: cost_metrics.jsonl）
        readme_file       : 出力先README（省略時: README.md）

    例:
        python3 report_cost.py
        python3 report_cost.py /workspace/target_repo/cost_metrics.jsonl /workspace/target_repo/README.md

前提条件:
    - cost_metrics.jsonl が存在すること（/record-costs で記録済み）
    - 最終フェーズ（"完了"）が記録済みであること

出力:
    README.md の末尾に「開発メトリクス」セクションを追記
"""

import os
import sys
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Optional


def load_cost_metrics(filepath: str) -> list[dict]:
    """
    cost_metrics.jsonl を読み込む。

    指定されたファイルから JSONL 形式のコストメトリクスを読み込み、
    各行をパースしてリストとして返す。

    Args:
        filepath: 読み込む JSONL ファイルのパス

    Returns:
        list[dict]: パースされたレコードのリスト

    Raises:
        FileNotFoundError: ファイルが存在しない場合
        json.JSONDecodeError: JSON パースに失敗した場合
    """
    records: list[dict] = []
    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


def parse_timestamp(timestamp_str: str) -> datetime:
    """
    ISO 8601形式のタイムスタンプをdatetimeオブジェクトに変換する。

    Args:
        timestamp_str: ISO 8601形式のタイムスタンプ文字列
                       (例: "2026-01-23T10:00:00+09:00" または "2026-01-23T10:00:00.000Z")

    Returns:
        datetime: パースされたdatetimeオブジェクト
    """
    # Zで終わる場合は+00:00に置換
    if timestamp_str.endswith('Z'):
        timestamp_str = timestamp_str[:-1] + '+00:00'
    return datetime.fromisoformat(timestamp_str)


def get_session_log_dir() -> Path:
    """
    セッションログディレクトリのパスを取得する。

    環境変数 SESSION_LOG_DIR が設定されていればそれを使用し、
    未設定の場合はデフォルトパス（Docker環境用）を使用する。

    Returns:
        Path: セッションログディレクトリのパス
    """
    default_path = Path.home() / ".claude/projects/-workspace-target-repo"
    env_path = os.environ.get("SESSION_LOG_DIR")

    if env_path:
        return Path(env_path)
    return default_path


def is_tool_result(record: dict) -> bool:
    """
    レコードがツール結果かどうかを判定する。

    Claude Codeのセッションログでは、ツール結果も `user` タイプで記録される。
    純粋なユーザー入力とツール結果を区別するため、message.content の構造を確認する。

    Args:
        record: セッションログのレコード

    Returns:
        bool: ツール結果の場合True、純粋なユーザー入力の場合False
    """
    message = record.get('message', {})
    content = message.get('content')

    # content が配列で、type: "tool_result" を含む場合はツール結果
    if isinstance(content, list):
        for item in content:
            if isinstance(item, dict) and item.get('type') == 'tool_result':
                return True
    return False


def has_human_interaction_tool(record: dict) -> bool:
    """
    レコードが人間の介入を必要とするツールを呼び出しているかを判定する。

    AskUserQuestion など、人間の入力を待つツールを呼び出している場合、
    そのツール結果が返るまでの時間は「人間待ち」としてカウントすべき。

    Args:
        record: セッションログのassistantレコード

    Returns:
        bool: 人間の介入を必要とするツールを呼び出している場合True
    """
    # 人間の介入を必要とするツールのリスト
    human_interaction_tools = {'AskUserQuestion'}

    message = record.get('message', {})
    content = message.get('content')

    if isinstance(content, list):
        for item in content:
            if isinstance(item, dict) and item.get('type') == 'tool_use':
                tool_name = item.get('name', '')
                if tool_name in human_interaction_tools:
                    return True
    return False


def load_session_records(
    session_log_path: Path,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None
) -> list[dict]:
    """
    セッションログからレコードを読み込む。

    user と assistant タイプのレコードのみを抽出し、
    オプションで時間範囲でフィルタリングする。

    Args:
        session_log_path: セッションログファイルのパス
        start_time: 開始時刻（ISO 8601形式、省略可）
        end_time: 終了時刻（ISO 8601形式、省略可）

    Returns:
        list[dict]: フィルタリングされたレコードのリスト
                    各レコードには以下が含まれる:
                    - type: 'user' または 'assistant'
                    - timestamp: datetime オブジェクト
                    - is_tool_result: (userの場合) ツール結果かどうか
                    - has_human_tool: (assistantの場合) 人間介入ツールを呼び出したか
    """
    start_dt = parse_timestamp(start_time) if start_time else None
    end_dt = parse_timestamp(end_time) if end_time else None

    records: list[dict] = []

    with open(session_log_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue

            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue

            # user と assistant タイプのみ抽出
            record_type = record.get('type')
            if record_type not in ('user', 'assistant'):
                continue

            # タイムスタンプでフィルタリング
            timestamp_str = record.get('timestamp')
            if not timestamp_str:
                continue

            record_dt = parse_timestamp(timestamp_str)

            if start_dt and record_dt < start_dt:
                continue
            if end_dt and record_dt > end_dt:
                continue

            parsed_record = {
                'type': record_type,
                'timestamp': record_dt
            }

            # userレコードの場合: ツール結果かどうかを判定
            if record_type == 'user':
                parsed_record['is_tool_result'] = is_tool_result(record)
            # assistantレコードの場合: 人間介入ツールを呼び出したかを判定
            elif record_type == 'assistant':
                parsed_record['has_human_tool'] = has_human_interaction_tool(record)

            records.append(parsed_record)

    # タイムスタンプでソート
    records.sort(key=lambda r: r['timestamp'])

    return records


def calculate_time_from_records(records: list[dict]) -> dict[str, float]:
    """
    レコードリストからAI時間と人間時間を計算する。

    時間計算ロジック:
        1. user(純粋な入力) → assistant = AI待ち
        2. assistant → user(純粋な入力) = 人間待ち
        3. assistant → user(tool_result) で、assistantがAskUserQuestion等を呼び出した = 人間待ち
        4. assistant → user(tool_result) で、assistantが自動ツールを呼び出した = AI待ち
        5. user → user = 人間待ち
        6. assistant → assistant = AI待ち

    Args:
        records: load_session_records で取得したレコードリスト
                 各レコードには type, timestamp, is_tool_result, has_human_tool が含まれる

    Returns:
        dict: {
            "ai_time_seconds": float,    # AI待ちの時間（秒）
            "human_time_seconds": float  # 人間待ちの時間（秒）
        }
    """
    ai_time = 0.0
    human_time = 0.0

    for i in range(len(records) - 1):
        curr = records[i]
        next_rec = records[i + 1]

        diff = (next_rec['timestamp'] - curr['timestamp']).total_seconds()

        if curr['type'] == 'user' and next_rec['type'] == 'assistant':
            # ユーザー送信/ツール結果 → AI応答 = AI待ちの時間
            ai_time += diff
        elif curr['type'] == 'assistant' and next_rec['type'] == 'user':
            # AI応答 → 次のユーザーメッセージ
            if next_rec.get('is_tool_result'):
                # ツール結果の場合: どのツールの結果かで判断
                if curr.get('has_human_tool'):
                    # AskUserQuestion等の人間介入ツール = 人間待ち
                    human_time += diff
                else:
                    # 自動ツール(Bash, Read等) = AI待ち（ツール実行時間）
                    ai_time += diff
            else:
                # 純粋なユーザー入力 = 人間待ち
                human_time += diff
        elif curr['type'] == 'user' and next_rec['type'] == 'user':
            # 連続したユーザーメッセージ = 人間の入力時間として計算
            human_time += diff
        elif curr['type'] == 'assistant' and next_rec['type'] == 'assistant':
            # 連続したAI応答（ストリーミング等）= AI時間として計算
            ai_time += diff

    return {
        "ai_time_seconds": ai_time,
        "human_time_seconds": human_time
    }


def calculate_phase_time_breakdown(
    session_log_dir: Path,
    session_id: str,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None
) -> dict[str, float]:
    """
    指定された時間範囲でセッションログからAI時間と人間時間を計算する。

    Args:
        session_log_dir: セッションログディレクトリのパス
        session_id: セッションID
        start_time: 開始時刻（ISO 8601形式、省略可）
        end_time: 終了時刻（ISO 8601形式、省略可）

    Returns:
        dict: {
            "ai_time_seconds": float,    # AI待ちの時間（秒）
            "human_time_seconds": float  # 人間待ちの時間（秒）
        }
    """
    session_log_path = session_log_dir / f"{session_id}.jsonl"

    if not session_log_path.exists():
        return {"ai_time_seconds": 0.0, "human_time_seconds": 0.0}

    records = load_session_records(session_log_path, start_time, end_time)
    return calculate_time_from_records(records)


def _aggregate_models_from_sessions(sessions: dict) -> dict:
    """
    sessions構造から全session分のmodelsを合算する。

    Args:
        sessions: sessions辞書
            {"<session_id>": {"cost_usd": float, "models": {...}}, ...}

    Returns:
        dict: 合算されたモデル別データ
            {"<model>": {"input": int, "output": int, "cache_read": int,
                         "cache_write": int, "cost_usd": float}, ...}
    """
    aggregated: dict = {}
    for session_data in sessions.values():
        for model, data in session_data.get("models", {}).items():
            if model not in aggregated:
                aggregated[model] = {
                    "input": 0, "output": 0, "cache_read": 0,
                    "cache_write": 0, "cost_usd": 0.0
                }
            aggregated[model]["input"] += data["input"]
            aggregated[model]["output"] += data["output"]
            aggregated[model]["cache_read"] += data["cache_read"]
            aggregated[model]["cache_write"] += data["cache_write"]
            aggregated[model]["cost_usd"] += data["cost_usd"]
    return aggregated


def _get_models_from_record(record: dict) -> dict:
    """
    レコードからモデル別データを取得する。

    sessions構造（新形式）とmodels構造（旧形式）の両方に対応する。

    Args:
        record: cost_metrics.jsonlのレコード

    Returns:
        dict: モデル別データ
    """
    if "sessions" in record:
        return _aggregate_models_from_sessions(record["sessions"])
    return record.get("models", {})


def get_orchestration_session_id(record: dict) -> Optional[str]:
    """
    オーケストレーションセッションのsession_idを特定する。

    sessions構造内で最大cost_usdのsession_idをオーケストレーションセッションと判定する。
    旧形式（session_id単一値）の場合はそのまま返す。

    Args:
        record: cost_metrics.jsonlのレコード

    Returns:
        Optional[str]: オーケストレーションセッションのsession_id。特定できない場合はNone
    """
    sessions = record.get("sessions", {})
    if sessions:
        return max(sessions, key=lambda sid: sessions[sid].get("cost_usd", 0))
    # 後方互換: 旧形式
    return record.get("session_id")


def calculate_phase_diffs(records: list[dict], session_log_dir: Optional[Path] = None) -> list[dict]:
    """
    フェーズ間の差分を計算する。

    各フェーズ開始時と終了時のメトリクスの差分を計算し、
    フェーズごとのコスト、時間、トークン消費量、AI時間、人間時間を算出する。

    Args:
        records: cost_metrics.jsonl から読み込んだレコードのリスト
                 各レコードには timestamp, phase, total_cost_usd,
                 sessions (新形式) または models/session_id (旧形式) が含まれる
        session_log_dir: セッションログディレクトリのパス（省略時は自動取得）

    Returns:
        list[dict]: 各フェーズの差分データ
                    各要素には phase, cost_usd, elapsed_seconds,
                    ai_time_seconds, human_time_seconds, models が含まれる
    """
    if len(records) < 2:
        return []

    if session_log_dir is None:
        session_log_dir = get_session_log_dir()

    diffs = []
    for i in range(len(records) - 1):
        prev = records[i]
        curr = records[i + 1]

        # コスト差分
        cost_diff = curr["total_cost_usd"] - prev["total_cost_usd"]

        # 実際の経過時間（タイムスタンプの差分）
        prev_timestamp = parse_timestamp(prev["timestamp"])
        curr_timestamp = parse_timestamp(curr["timestamp"])
        elapsed_seconds = (curr_timestamp - prev_timestamp).total_seconds()

        # AI時間と人間時間を計算
        session_id = get_orchestration_session_id(prev)
        if session_id:
            time_breakdown = calculate_phase_time_breakdown(
                session_log_dir,
                session_id,
                prev["timestamp"],
                curr["timestamp"]
            )
        else:
            time_breakdown = {"ai_time_seconds": 0.0, "human_time_seconds": 0.0}

        # トークン差分（モデル別、sessions構造を合算）
        prev_models = _get_models_from_record(prev)
        curr_models = _get_models_from_record(curr)

        models_diff = {}
        all_models = set(prev_models.keys()) | set(curr_models.keys())

        for model in all_models:
            prev_model = prev_models.get(model, {"input": 0, "output": 0, "cache_read": 0, "cache_write": 0, "cost_usd": 0})
            curr_model = curr_models.get(model, {"input": 0, "output": 0, "cache_read": 0, "cache_write": 0, "cost_usd": 0})

            models_diff[model] = {
                "input": curr_model["input"] - prev_model["input"],
                "output": curr_model["output"] - prev_model["output"],
                "cache_read": curr_model["cache_read"] - prev_model["cache_read"],
                "cache_write": curr_model["cache_write"] - prev_model["cache_write"],
                "cost_usd": curr_model["cost_usd"] - prev_model["cost_usd"]
            }

        diffs.append({
            "phase": prev["phase"],
            "cost_usd": cost_diff,
            "elapsed_seconds": elapsed_seconds,
            "ai_time_seconds": time_breakdown["ai_time_seconds"],
            "human_time_seconds": time_breakdown["human_time_seconds"],
            "models": models_diff
        })

    return diffs


def format_tokens(n: int) -> str:
    """
    トークン数を見やすい形式にフォーマットする。

    大きな数値を k（千）や M（百万）単位で短縮表示する。

    Args:
        n: トークン数

    Returns:
        str: フォーマットされた文字列（例: "1.5M", "50.0k", "999"）
    """
    if n >= 1000000:
        return f"{n / 1000000:.1f}M"
    elif n >= 1000:
        return f"{n / 1000:.1f}k"
    return str(n)


def format_time(seconds: float) -> str:
    """
    秒数を見やすい形式にフォーマットする。

    秒数を適切な単位（秒、分、時間）に変換して表示する。

    Args:
        seconds: 秒数

    Returns:
        str: フォーマットされた文字列（例: "1.5時間", "30分", "45秒"）
    """
    if seconds >= 3600:
        return f"{seconds / 3600:.1f}時間"
    elif seconds >= 60:
        return f"{seconds / 60:.0f}分"
    return f"{seconds:.0f}秒"


def generate_report(diffs: list[dict], final_record: dict, first_record: dict) -> str:
    """
    Markdown形式のレポートを生成する。

    フェーズ別の差分データと最終レコードから、開発メトリクスの
    Markdownレポートを生成する。レポートには以下のセクションが含まれる:
        - コスト・時間サマリー
        - フェーズ別内訳
        - モデル別使用量
        - キャッシュ効率

    Args:
        diffs: フェーズ別の差分データ（calculate_phase_diffs の戻り値）
        final_record: 最終レコード（累積値、総計計算に使用）
        first_record: 最初のレコード（総経過時間の計算に使用）

    Returns:
        str: Markdown形式のレポート文字列
    """
    lines = []
    lines.append("")
    lines.append("## コスト集計")
    lines.append("")
    lines.append("claude codeが出力する統計値を集計・加工したものが以下です")
    lines.append("")

    # コスト・時間サマリー
    total_cost = final_record["total_cost_usd"]

    # 総経過時間（最初のタイムスタンプから最後のタイムスタンプまで）
    first_timestamp = parse_timestamp(first_record["timestamp"])
    final_timestamp = parse_timestamp(final_record["timestamp"])
    total_elapsed = (final_timestamp - first_timestamp).total_seconds()

    # AI時間と人間時間の合計を計算
    total_ai_time = sum(d.get("ai_time_seconds", 0) for d in diffs)
    total_human_time = sum(d.get("human_time_seconds", 0) for d in diffs)

    # キャッシュ効率計算（sessions構造対応）
    final_models = _get_models_from_record(final_record)
    total_input = sum(m["input"] for m in final_models.values())
    total_output = sum(m["output"] for m in final_models.values())
    total_cache_read = sum(m["cache_read"] for m in final_models.values())
    total_cache_write = sum(m["cache_write"] for m in final_models.values())

    cache_hit_rate = 0
    if total_input + total_cache_read > 0:
        cache_hit_rate = total_cache_read / (total_input + total_cache_read) * 100

    lines.append("### コスト・時間サマリー")
    lines.append("")
    lines.append("| 項目 | 値 |")
    lines.append("|------|-----|")
    lines.append(f"| 総コスト | ${total_cost:.2f} |")
    lines.append(f"| 総経過時間 | {format_time(total_elapsed)} |")
    lines.append(f"| うちAI待ち | {format_time(total_ai_time)} |")
    lines.append(f"| うち人間待ち | {format_time(total_human_time)} |")
    lines.append("")

    # フェーズ別内訳
    if diffs:
        lines.append("### フェーズ別内訳")
        lines.append("")
        lines.append("| フェーズ | コスト | 経過時間 | うちAI待ち | うち人間待ち | トークン(入力/出力) |")
        lines.append("|---------|--------|----------|------------|--------------|-------------------|")

        for diff in diffs:
            phase_input = sum(m["input"] for m in diff["models"].values())
            phase_output = sum(m["output"] for m in diff["models"].values())
            ai_time = diff.get("ai_time_seconds", 0)
            human_time = diff.get("human_time_seconds", 0)
            lines.append(
                f"| {diff['phase']} | ${diff['cost_usd']:.2f} | {format_time(diff['elapsed_seconds'])} | "
                f"{format_time(ai_time)} | {format_time(human_time)} | "
                f"{format_tokens(phase_input)} / {format_tokens(phase_output)} |"
            )

        lines.append("")

    # モデル別使用量（sessions構造対応）
    if final_models:
        lines.append("### モデル別使用量")
        lines.append("")
        lines.append("| モデル | コスト | 割合 |")
        lines.append("|--------|--------|------|")

        for model, data in sorted(final_models.items(), key=lambda x: x[1]["cost_usd"], reverse=True):
            ratio = (data["cost_usd"] / total_cost * 100) if total_cost > 0 else 0
            lines.append(f"| {model} | ${data['cost_usd']:.2f} | {ratio:.0f}% |")

        lines.append("")

    # キャッシュ効率
    lines.append("### キャッシュ効率")
    lines.append("")
    lines.append("| 項目 | 値 |")
    lines.append("|------|-----|")
    lines.append(f"| キャッシュ読み取り | {format_tokens(total_cache_read)} tokens |")
    lines.append(f"| キャッシュ書き込み | {format_tokens(total_cache_write)} tokens |")
    lines.append(f"| 入力トークン（非キャッシュ） | {format_tokens(total_input)} tokens |")
    lines.append(f"| **キャッシュヒット率** | **{cache_hit_rate:.0f}%** |")
    lines.append("")
    lines.append("> キャッシュヒット率 = キャッシュ読み取り / (入力 + キャッシュ読み取り)")
    lines.append("> 高いほどコスト効率が良い")
    lines.append("")
    lines.append("---")
    lines.append("*Generated by gaido - AI駆動開発プラットフォーム*")
    lines.append("")

    return "\n".join(lines)


def append_to_readme(readme_path: str, report: str) -> None:
    """
    README.md の末尾にレポートを追記する。

    既に「開発メトリクス」セクションが存在する場合は削除してから追記する。
    これにより、複数回実行しても重複が発生しない。

    Args:
        readme_path: README.md ファイルのパス
        report: 追記する Markdown レポート文字列
    """
    # 既存のレポートセクションを削除（重複防止）
    if os.path.exists(readme_path):
        with open(readme_path, "r", encoding="utf-8") as f:
            content = f.read()

        # 既存の「開発メトリクス」セクションを削除
        pattern = r'\n## 開発メトリクス\n.*?(?=\n## |\Z)'
        content = re.sub(pattern, '', content, flags=re.DOTALL)

        with open(readme_path, "w", encoding="utf-8") as f:
            f.write(content.rstrip())
            f.write(report)
    else:
        with open(readme_path, "w", encoding="utf-8") as f:
            f.write(report)


def main() -> None:
    """
    メイン処理を実行する。

    コマンドライン引数からファイルパスを取得し、コストメトリクスを集計して
    README.md にレポートを追記する。

    使い方:
        python3 report_cost.py [cost_metrics_file] [readme_file]
        python3 report_cost.py --orchestration-session-id [cost_metrics_file]

    --orchestration-session-id オプション:
        cost_metrics.jsonl の最終レコードから、最大コストの session_id を
        標準出力に出力する。レポート生成は行わない。
        Export.md からオーケストレーションセッションを特定するために使用。

    処理の流れ（通常モード）:
        1. cost_metrics.jsonl を読み込み
        2. フェーズ間の差分を計算
        3. Markdown レポートを生成
        4. README.md に追記

    Raises:
        SystemExit: ファイルが見つからない場合、またはレコード数が不足している場合
    """
    # --orchestration-session-id オプション
    if len(sys.argv) >= 2 and sys.argv[1] == "--orchestration-session-id":
        cost_metrics_file = sys.argv[2] if len(sys.argv) > 2 else "cost_metrics.jsonl"
        try:
            if not os.path.exists(cost_metrics_file):
                sys.exit(1)
            records = load_cost_metrics(cost_metrics_file)
            if not records:
                sys.exit(1)
            session_id = get_orchestration_session_id(records[-1])
            if session_id:
                print(session_id)
            else:
                sys.exit(1)
        except Exception:
            sys.exit(1)
        return

    cost_metrics_file = sys.argv[1] if len(sys.argv) > 1 else "cost_metrics.jsonl"
    readme_file = sys.argv[2] if len(sys.argv) > 2 else "README.md"

    try:
        # cost_metrics.jsonl を読み込み
        if not os.path.exists(cost_metrics_file):
            print(f"エラー: {cost_metrics_file} が見つかりません", file=sys.stderr)
            print("  /record-costs でフェーズを記録してください", file=sys.stderr)
            sys.exit(1)

        records = load_cost_metrics(cost_metrics_file)
        print(f"読み込み: {len(records)} レコード")

        if len(records) < 2:
            print("エラー: 差分計算には2つ以上のレコードが必要です", file=sys.stderr)
            print("  /record-costs で複数のフェーズを記録してください", file=sys.stderr)
            sys.exit(1)

        # 最初と最終のレコード
        first_record = records[0]
        final_record = records[-1]
        print(f"最終フェーズ: {final_record['phase']}")
        print(f"総コスト: ${final_record['total_cost_usd']:.2f}")

        # 差分計算
        diffs = calculate_phase_diffs(records)

        # レポート生成
        report = generate_report(diffs, final_record, first_record)

        # README.md に追記
        append_to_readme(readme_file, report)
        print(f"レポート追記完了: {readme_file}")

    except FileNotFoundError as e:
        print(f"エラー: {e}", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"エラー: JSONパースに失敗しました: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"エラー: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
