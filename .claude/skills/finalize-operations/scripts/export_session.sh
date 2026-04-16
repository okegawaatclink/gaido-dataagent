#!/bin/bash
# セッションログエクスポートスクリプト
#
# 現在のセッションの会話履歴（JSONL）をMarkdownファイルに変換し、
# セッション単位のディレクトリにまとめて配置する。
#
# Usage:
#     bash export_session.sh
#
# 前提:
#     - Claude Codeセッションが開始されていること
#     - /workspace/gaido/tools/convert_conversation.py が存在すること
#
# 出力構造:
#     session_YYYYMMDD_HHMMSS/
#     ├── main.jsonl              # メインセッション（親オーケストレーター）
#     ├── main.md                 # メインセッション（Markdown変換）
#     ├── agent-xxxxxxx.jsonl     # サブエージェント
#     ├── agent-xxxxxxx.md        # サブエージェント（Markdown変換）
#     └── ...

set -euo pipefail

# セッションログディレクトリを特定
# /workspace/target_repo → -workspace-target-repo
SESSION_LOG_DIR="$HOME/.claude/projects/-workspace-target-repo"

# オーケストレーションセッションのJSONLファイルを特定
# cost_metrics.jsonlからコスト最大のsession_id（Prometheus由来）を取得
PROMETHEUS_SID=$(python3 /workspace/gaido/docker/template/.claude/skills/report-costs/scripts/report_cost.py \
    --orchestration-session-id /workspace/target_repo/cost_metrics.jsonl 2>/dev/null)

# セッションログJSONLを特定（3段階フォールバック）
if [ -n "$PROMETHEUS_SID" ] && [ -f "$SESSION_LOG_DIR/${PROMETHEUS_SID}.jsonl" ]; then
    SESSION_ID="$PROMETHEUS_SID"
elif [ -n "$PROMETHEUS_SID" ]; then
    # フォールバック: ファイルサイズ最大のJSONLファイル
    SESSION_ID=$(ls -S "$SESSION_LOG_DIR"/*.jsonl 2>/dev/null | head -1 | xargs basename | sed 's/.jsonl$//')
else
    # フォールバック: 最新mtime方式
    SESSION_ID=$(ls -t "$SESSION_LOG_DIR"/*.jsonl 2>/dev/null | head -1 | xargs basename | sed 's/.jsonl$//')
fi

if [ -z "$SESSION_ID" ]; then
    echo "エラー: セッションログが見つかりません" >&2
    exit 1
fi

LATEST_JSONL="$SESSION_LOG_DIR/${SESSION_ID}.jsonl"

# セッションディレクトリ作成・メインセッションのコピー・変換
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
SESSION_OUT_DIR="/workspace/target_repo/session_${TIMESTAMP}"
mkdir -p "$SESSION_OUT_DIR"

cp "$LATEST_JSONL" "$SESSION_OUT_DIR/main.jsonl"

python3 /workspace/gaido/tools/convert_conversation.py \
    "$SESSION_OUT_DIR/main.jsonl" \
    "$SESSION_OUT_DIR/main.md"

echo "メインセッション: $SESSION_OUT_DIR/main.jsonl / .md"

# サブエージェントのコピー・変換
SUBAGENT_DIR="$SESSION_LOG_DIR/$SESSION_ID/subagents"
if [ -d "$SUBAGENT_DIR" ]; then
    for AGENT_JSONL in "$SUBAGENT_DIR"/agent-*.jsonl; do
        [ -f "$AGENT_JSONL" ] || continue
        AGENT_ID=$(basename "$AGENT_JSONL" .jsonl)
        cp "$AGENT_JSONL" "$SESSION_OUT_DIR/${AGENT_ID}.jsonl"
        python3 /workspace/gaido/tools/convert_conversation.py \
            "$SESSION_OUT_DIR/${AGENT_ID}.jsonl" \
            "$SESSION_OUT_DIR/${AGENT_ID}.md"
        echo "サブエージェント: $SESSION_OUT_DIR/${AGENT_ID}.jsonl / .md"
    done
fi

echo "エクスポート完了: $SESSION_OUT_DIR"
