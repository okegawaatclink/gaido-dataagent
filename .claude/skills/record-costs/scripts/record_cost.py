#!/usr/bin/env python3
"""
record_cost.py - Claude Codeのコスト・トークン消費量を記録するスクリプト

概要:
    Prometheusエンドポイントからメトリクスを取得し、cost_metrics.jsonlに記録します。
    全session_idのメトリクスを session_id × model の粒度で記録します。

使い方:
    python3 record_cost.py <phase_name> [output_file]

    引数:
        phase_name  : フェーズ名（例: "要件定義フェーズ", "実装フェーズ", "完了"）
        output_file : 出力先ファイル（省略時: cost_metrics.jsonl）

    例:
        python3 record_cost.py "要件定義フェーズ"
        python3 record_cost.py "実装フェーズ" /workspace/target_repo/cost_metrics.jsonl
        python3 record_cost.py "完了"

環境変数:
    OTEL_EXPORTER_PROMETHEUS_PORT: Prometheusメトリクスのポート番号
                                   省略時: 9464

前提条件:
    - 環境変数が設定されていること:
        CLAUDE_CODE_ENABLE_TELEMETRY=1
        OTEL_METRICS_EXPORTER=prometheus
        OTEL_EXPORTER_PROMETHEUS_PORT=9464
    - Claude Codeセッションが開始されていること

Prometheusメトリクスの実データ例（Claude Code v2.1.49）:

    # session_count と cost/token で異なる session_id が使用される
    claude_code_session_count_total{session_id="b8400dd4-..."} 1
    claude_code_cost_usage_total{session_id="019c7953-...", model="claude-sonnet-4-6"} 0.7237
    claude_code_cost_usage_total{session_id="019c7953-...", model="claude-haiku-4-5-20251001"} 0.0051
    claude_code_token_usage_total{session_id="019c7953-...", model="claude-sonnet-4-6", type="input"} 17
    claude_code_token_usage_total{session_id="019c7953-...", model="claude-sonnet-4-6", type="output"} 2057
    claude_code_token_usage_total{session_id="019c7953-...", model="claude-sonnet-4-6", type="cacheRead"} 491327
    claude_code_token_usage_total{session_id="019c7953-...", model="claude-sonnet-4-6", type="cacheCreation"} 68252

出力形式 (cost_metrics.jsonl):
    各行が1つのJSONオブジェクト:
    {
        "timestamp": "2026-02-24T16:58:00+09:00",
        "phase": "実装フェーズ",
        "total_cost_usd": 1.83,
        "active_time_seconds": {},
        "sessions": {
            "019c7953-3725-739a-9f4e-ef263e54c103": {
                "cost_usd": 1.56,
                "models": {
                    "claude-sonnet-4-6": {
                        "input": 46, "output": 9776,
                        "cache_read": 1499021, "cache_write": 88259,
                        "cost_usd": 1.5457
                    },
                    "claude-haiku-4-5": {
                        "input": 13252, "output": 216,
                        "cache_read": 0, "cache_write": 0,
                        "cost_usd": 0.0143
                    }
                }
            }
        }
    }
"""

import os
import sys
import json
import re
import urllib.request
from pathlib import Path
from datetime import datetime


def get_metrics_url() -> str:
    """
    Prometheusメトリクスエンドポイントの URL を取得する。

    環境変数 OTEL_EXPORTER_PROMETHEUS_PORT が設定されていればそれを使用し、
    未設定の場合はデフォルトポート 9464 を使用する。

    Returns:
        str: メトリクスエンドポイントの URL
    """
    port = os.environ.get("OTEL_EXPORTER_PROMETHEUS_PORT", "9464")
    return f"http://localhost:{port}/metrics"


def fetch_metrics(metrics_url: str) -> str:
    """
    Prometheusエンドポイントからメトリクスを取得する。

    Args:
        metrics_url: メトリクスエンドポイントの URL

    Returns:
        str: Prometheus exposition format のメトリクステキスト

    Raises:
        urllib.error.URLError: エンドポイントに接続できない場合
    """
    with urllib.request.urlopen(metrics_url, timeout=10) as response:
        return response.read().decode('utf-8')


def parse_metrics(metrics_text: str) -> dict:
    """
    Prometheusメトリクスをパースする。

    全session_idのメトリクスを session_id × model の粒度で記録する。
    session_idによるフィルタリングは行わない（コンテナ内の全メトリクスが
    1つのoutput system開発のコストであるため）。

    Args:
        metrics_text: Prometheus exposition format のテキスト

    Returns:
        dict: パースされたメトリクス
            {
                "total_cost_usd": float,
                "active_time_seconds": dict,
                "sessions": {
                    "<session_id>": {
                        "cost_usd": float,
                        "models": {
                            "<model>": {
                                "input": int, "output": int,
                                "cache_read": int, "cache_write": int,
                                "cost_usd": float
                            }
                        }
                    }
                }
            }
    """
    result: dict = {
        "total_cost_usd": 0.0,
        "active_time_seconds": {},
        "sessions": {}
    }

    # 正規表現パターン: メトリクス名{ラベル} 値
    pattern = re.compile(r'^(\w+)\{([^}]*)\}\s+([\d.]+)$')

    for line in metrics_text.split('\n'):
        line = line.strip()
        if not line or line.startswith('#'):
            continue

        match = pattern.match(line)
        if not match:
            continue

        metric_name, labels_str, value = match.groups()
        value = float(value)

        # ラベルをパース
        labels: dict[str, str] = {}
        for label_match in re.finditer(r'(\w+)="([^"]*)"', labels_str):
            labels[label_match.group(1)] = label_match.group(2)

        session_id = labels.get('session_id', '')

        # コストメトリクス
        if metric_name == 'claude_code_cost_usage_total':
            model = labels.get('model', 'unknown')
            short_model = simplify_model_name(model)

            # session構造を初期化
            if session_id not in result['sessions']:
                result['sessions'][session_id] = {"cost_usd": 0.0, "models": {}}
            session = result['sessions'][session_id]

            if short_model not in session['models']:
                session['models'][short_model] = {
                    "input": 0, "output": 0, "cache_read": 0, "cache_write": 0, "cost_usd": 0.0
                }
            session['models'][short_model]['cost_usd'] += value
            session['cost_usd'] += value
            result['total_cost_usd'] += value

        # トークン使用量メトリクス
        elif metric_name == 'claude_code_token_usage_total':
            model = labels.get('model', 'unknown')
            token_type = labels.get('type', 'unknown')
            short_model = simplify_model_name(model)

            # session構造を初期化
            if session_id not in result['sessions']:
                result['sessions'][session_id] = {"cost_usd": 0.0, "models": {}}
            session = result['sessions'][session_id]

            if short_model not in session['models']:
                session['models'][short_model] = {
                    "input": 0, "output": 0, "cache_read": 0, "cache_write": 0, "cost_usd": 0.0
                }

            # タイプをマッピング
            type_mapping = {
                'input': 'input',
                'output': 'output',
                'cacheRead': 'cache_read',
                'cacheCreation': 'cache_write'
            }
            mapped_type = type_mapping.get(token_type, token_type)
            if mapped_type in session['models'][short_model]:
                session['models'][short_model][mapped_type] += int(value)

        # アクティブ時間メトリクス
        elif metric_name == 'claude_code_active_time_total':
            time_type = labels.get('type', 'unknown')
            result['active_time_seconds'][time_type] = value

    # MONKEY-PATCH: Sonnet cost correction (see #28168)
    result = _correct_cost_if_bug_present(result)

    return result


def simplify_model_name(full_name: str) -> str:
    """
    モデル名を短縮形に変換する。

    例:
        us.anthropic.claude-opus-4-6-20250925-v1:0 → claude-opus-4-6
        us.anthropic.claude-haiku-4-5-20251001-v1:0 → claude-haiku-4-5

    Args:
        full_name: 完全なモデル名

    Returns:
        str: 短縮されたモデル名
    """
    # claude-{family}-{major}-{minor} の部分を抽出
    # 例: us.anthropic.claude-opus-4-6-20250925-v1:0 → claude-opus-4-6
    match = re.search(r'(claude-(?:opus|sonnet|haiku)-\d+-\d+)', full_name)
    if match:
        return match.group(1)
    # フォールバック: claude-xxx の部分を抽出
    match = re.search(r'(claude-\w+(?:-[\d]+(?:-[\d]+)?)?)', full_name)
    if match:
        return match.group(1)
    return full_name


# ============================================================
# MONKEY-PATCH: Claude Code Sonnet 4.6 cost bug workaround
# Claude Code v2.1.51 の単価テーブルバグにより、Sonnet 4.6 の
# cost_usage_total が Opus 単価（$5/$25）で計算される。
# 正しい Sonnet 単価（$3/$15）との比率 3/5 = 0.6 で補正する。
# 自動検出: トークン数 × Opus単価 と報告コストを比較し、
# バグが修正済みなら補正をスキップする。
# See: https://github.com/anthropics/claude-code/issues/28168
# ============================================================
_OPUS_PRICING_PER_MTOK: dict[str, float] = {
    "input": 5.0,
    "output": 25.0,
    "cache_read": 0.5,
    "cache_write": 6.25,
}

_COST_CORRECTION_TARGETS: dict[str, float] = {
    "claude-sonnet-4-6": 3 / 5,  # Sonnet/Opus = $3/$5 = 0.6
}

_BUG_FIXED_MARKER: str = "<!-- MONKEY-PATCH: cost-bug-fixed-notice -->"


def _compute_expected_opus_cost(model_data: dict) -> float:
    """
    Opus単価でトークン数から期待コストを計算する。

    Args:
        model_data: モデルのトークン数を含む辞書
            {"input": int, "output": int, "cache_read": int, "cache_write": int, "cost_usd": float}

    Returns:
        float: Opus単価で計算した期待コスト（USD）
    """
    return (
        model_data["input"] / 1e6 * _OPUS_PRICING_PER_MTOK["input"]
        + model_data["output"] / 1e6 * _OPUS_PRICING_PER_MTOK["output"]
        + model_data["cache_read"] / 1e6 * _OPUS_PRICING_PER_MTOK["cache_read"]
        + model_data["cache_write"] / 1e6 * _OPUS_PRICING_PER_MTOK["cache_write"]
    )


def _notify_bug_fixed_to_problems(
    short_model: str, reported_cost: float, expected_opus: float
) -> None:
    """
    バグ修正を検出した場合、problems.md に通知を追記する。

    重複防止: マーカーコメントが既に存在する場合はスキップする。

    Args:
        short_model: 対象モデル名
        reported_cost: Prometheus報告コスト
        expected_opus: Opus単価で計算した期待コスト
    """
    problems_path = Path("problems.md")

    # 重複チェック
    if problems_path.exists():
        content = problems_path.read_text(encoding="utf-8")
        if _BUG_FIXED_MARKER in content:
            return

    notice = (
        f"\n{_BUG_FIXED_MARKER}\n"
        f"## [自動検出] Claude Code コストバグが修正された可能性\n\n"
        f"`record_cost.py` のモンキーパッチが、バグ修正を検出しました。\n\n"
        f"- **検出日時**: {datetime.now().astimezone().isoformat()}\n"
        f"- **対象モデル**: {short_model}\n"
        f"- **Prometheus報告コスト**: ${reported_cost:.4f}\n"
        f"- **Opus単価での期待コスト**: ${expected_opus:.4f}\n"
        f"- **判定**: 報告コストがOpus単価と一致しない → バグ修正済みと判断\n"
        f"- **対応**: `record_cost.py` の MONKEY-PATCH セクションを削除可能\n"
        f"- **参考**: https://github.com/anthropics/claude-code/issues/28168\n\n"
    )

    with open(problems_path, "a", encoding="utf-8") as f:
        f.write(notice)
    print(f"  [MONKEY-PATCH] problems.md にバグ修正検出の通知を追記しました")


def _correct_cost_if_bug_present(result: dict) -> dict:
    """
    Prometheus cost_usage_total のバグを自動検出し、必要に応じて補正する。

    sessions 構造内の各 session × model について、トークン数からOpus単価で
    算出した期待コストと報告コストを比較し、一致する場合のみ補正を適用する。
    バグが修正済みの場合は補正をスキップし、problems.md に通知する。

    Args:
        result: parse_metrics() の結果辞書（sessions構造）

    Returns:
        dict: 補正後の結果辞書（バグ未検出時は変更なし）
    """
    bug_detected = False
    bug_not_detected = False
    last_reported_cost = 0.0
    last_expected_opus = 0.0
    last_short_model = ""

    for sid, session_data in result.get("sessions", {}).items():
        for short_model, ratio in _COST_CORRECTION_TARGETS.items():
            if short_model not in session_data.get("models", {}):
                continue

            model_data = session_data["models"][short_model]
            expected_opus = _compute_expected_opus_cost(model_data)
            reported_cost = model_data["cost_usd"]

            if expected_opus < 0.001:
                # トークン数が少なすぎて判定不能 → 補正をスキップ
                continue

            relative_error = abs(reported_cost - expected_opus) / expected_opus

            if relative_error < 0.05:
                # Opus単価で計算されている → バグ present → 補正適用
                corrected_cost = reported_cost * ratio
                cost_diff = reported_cost - corrected_cost
                model_data["cost_usd"] = corrected_cost
                session_data["cost_usd"] -= cost_diff
                result["total_cost_usd"] -= cost_diff
                bug_detected = True
                print(f"  [MONKEY-PATCH] {short_model} (session {sid[:8]}...): "
                      f"バグ検出 → 補正適用 (${reported_cost:.4f} → ${corrected_cost:.4f})")
            else:
                bug_not_detected = True
                last_reported_cost = reported_cost
                last_expected_opus = expected_opus
                last_short_model = short_model
                print(f"  [MONKEY-PATCH] {short_model}: バグ未検出 → 補正スキップ "
                      f"(reported=${reported_cost:.4f}, expected_opus=${expected_opus:.4f})")

    # バグ未検出（= 修正済み）が1件以上あり、バグ検出が0件の場合のみ通知
    if bug_not_detected and not bug_detected:
        _notify_bug_fixed_to_problems(last_short_model, last_reported_cost, last_expected_opus)

    return result
# ============================================================
# END MONKEY-PATCH
# ============================================================


def main():
    """メイン処理"""
    # 引数チェック
    if len(sys.argv) < 2:
        print("使い方: python3 record_cost.py <phase_name> [output_file]")
        print("例: python3 record_cost.py '要件定義フェーズ'")
        sys.exit(1)

    phase_name = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else "cost_metrics.jsonl"

    # 設定を取得
    metrics_url = get_metrics_url()

    try:
        # メトリクスを取得
        metrics_text = fetch_metrics(metrics_url)

        # パース（session_idフィルタなし、全セッション取得）
        data = parse_metrics(metrics_text)

        # レコードを作成
        record = {
            "timestamp": datetime.now().astimezone().isoformat(),
            "phase": phase_name,
            **data
        }

        # ファイルに追記
        with open(output_file, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")

        print(f"記録完了: {output_file}")
        print(f"  フェーズ: {phase_name}")
        print(f"  総コスト: ${data['total_cost_usd']:.4f}")
        print(f"  セッション数: {len(data['sessions'])}")

    except urllib.error.URLError as e:
        print(f"エラー: メトリクスエンドポイントに接続できません ({metrics_url})", file=sys.stderr)
        print(f"  環境変数を確認してください:", file=sys.stderr)
        print(f"    CLAUDE_CODE_ENABLE_TELEMETRY=1", file=sys.stderr)
        print(f"    OTEL_METRICS_EXPORTER=prometheus", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"エラー: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
