---
name: record-costs
description: コスト・トークン消費量を記録。フェーズ開始・終了時に使用。
---

# Record Costs

## 概要

Claude Codeのコスト・トークン消費量をPrometheusメトリクスから取得し、`cost_metrics.jsonl`に記録します。

## 前提条件

- 環境変数が設定されていること:
  - `CLAUDE_CODE_ENABLE_TELEMETRY=1`
  - `OTEL_METRICS_EXPORTER=prometheus`
  - `OTEL_EXPORTER_PROMETHEUS_PORT=9464`
- Claude Codeセッションが開始されていること

## 使い方

```
/record-costs <フェーズ名>
```

### フェーズ名一覧

以下のフェーズ名を使用すること（`rules/phase-workflow.md` と一致）:

| フェーズ名 | 記録タイミング |
|-----------|---------------|
| 壁打ちフェーズ | `/analyze` 実行前 |
| 要件確認フェーズ | Task(phase-backlog) 呼出前 |
| 実装フェーズ | Task(phase-develop) 呼出前 |
| テスト設計フェーズ | Task(phase-test-design) 呼出前 |
| テスト実装フェーズ | Task(phase-test-run) 呼出前 |
| 成果まとめフェーズ | Task(phase-finalize) 呼出前 |
| 完了 | コストレポート生成時（自動） |

## 手順

1. 引数からフェーズ名を取得
2. `record_cost.py` を実行してメトリクスをcost_metrics.jsonlに記録
3. cost_metrics.jsonlが生成されていることを確認

```bash
python3 .claude/skills/record-costs/scripts/record_cost.py \
    "<フェーズ名>" \
    cost_metrics.jsonl
```

## 出力

`cost_metrics.jsonl` に1行追記されます:

```json
{
  "timestamp": "2026-01-23T10:00:00+09:00",
  "phase": "要件定義フェーズ",
  "session_id": "52d225d2-...",
  "total_cost_usd": 1.54,
  "active_time_seconds": {"user": 3.8, "cli": 55.4},
  "models": {
    "claude-haiku-4-5": {"input": 38100, "output": 6200, "cache_read": 0, "cache_write": 0, "cost_usd": 0.12},
    "claude-opus-4-6": {"input": 170, "output": 9800, "cache_read": 581900, "cache_write": 140700, "cost_usd": 1.42}
  }
}
```

## 注意事項

- メトリクスはセッション開始からの累積値です
- フェーズ間の差分はコストレポート生成時に計算します
- セッションIDの特定はセッションログエクスポートと同じロジックを使用しています

## 自動実行

各フェーズオーケストレーター（`/analyze`, `/backlog`, `/develop` 等）の冒頭で自動的に実行されます。
