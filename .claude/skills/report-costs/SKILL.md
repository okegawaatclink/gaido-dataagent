---
name: report-costs
description: コスト集計レポートを生成しREADME.mdに追記。全作業完了後に使用。
---

# コストレポート生成

## 概要

cost_metrics.jsonl に記録されたフェーズ別メトリクスを集計し、README.md の末尾にレポートを追記します。

## 前提条件

- `/record-costs` で複数のフェーズが記録済みであること
- `cost_metrics.jsonl` が存在すること

## 手順

1. `/record-costs "完了"` を呼び出して最終メトリクスを記録
2. `report_cost.py` を実行してレポートを生成・追記

```bash
# 1. 最終メトリクスを記録
python3 .claude/skills/record-costs/scripts/record_cost.py \
    "完了" \
    cost_metrics.jsonl

# 2. レポート生成・追記
python3 .claude/skills/report-costs/scripts/report_cost.py \
    cost_metrics.jsonl \
    README.md
```

## 出力

README.md の末尾に以下のセクションが追記されます:

- **コスト・時間サマリー**: 総コスト、総API時間
- **フェーズ別内訳**: 各フェーズのコスト、時間、トークン数
- **モデル別使用量**: モデルごとのコストと割合
- **キャッシュ効率**: キャッシュ読み取り/書き込み、ヒット率

## 注意事項

- 既存の「開発メトリクス」セクションがある場合は上書きされます
- フェーズ間の差分を計算するため、2つ以上のレコードが必要です
