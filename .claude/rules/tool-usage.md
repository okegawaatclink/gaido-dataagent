# ツール呼び出しルール

## AskUserQuestion

### questionsパラメータの形式

`questions` パラメータは必ず **配列（`list[dict]`）** として渡すこと。
JSON 文字列（`'[{"question":...}]'` のような文字列）を渡してはならない。

**NG（禁止）**:
```
questions: '[{"question": "...", "header": "...", "options": [...], "multiSelect": false}]'
```

**OK（正しい形式）**:
```
questions: [{"question": "...", "header": "...", "options": [...], "multiSelect": false}]
```

### なぜ重要か

- JSON 文字列を渡すとツールのスキーマ検証（`type: array`）でエラーになる
- エラー後も同じ誤りを繰り返すケースがある
- セッションログ（JSONL）に誤った形式が記録されると、`convert_conversation.py` での MD 変換が AttributeError で失敗する（problems.md Problem 6 参照）

### 呼び出し例

```
AskUserQuestion(
  questions=[
    {
      "question": "どの方式で実装しますか？",
      "header": "実装方式",
      "multiSelect": false,
      "options": [
        {"label": "方式A", "description": "説明A"},
        {"label": "方式B", "description": "説明B"}
      ]
    }
  ]
)
```
