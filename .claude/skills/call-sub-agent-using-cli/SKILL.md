---
name: call-sub-agent-using-cli
description: SubAgentから別のagentをclaude -pで逐次実行する。SubAgentからSubAgentを呼べない制限の回避策。
user-invocable: false
---

# SubAgentからのagent呼び出し（逐次）

SubAgentからSubAgentを直接起動できない制限を、`claude -p` CLI呼び出しで回避します。

## 使い方

このスキルを呼び出す際、以下の形式で引数を渡してください。

```
/call-sub-agent-using-cli --model <モデル名> <プロンプト>
```

- `--model <モデル名>`: 使用するモデルを指定（例: `sonnet`, `opus`）。省略時はデフォルトモデル（指定なし）
- `<プロンプト>`: `claude -p` に渡すプロンプト本文

使用例:
```
/call-sub-agent-using-cli --model sonnet あなたは existing-source-analysis-filestructure-apidoc agentです。...
```

## 実行手順

1. 引数から `--model` オプションとプロンプトを分離する
2. `claude -p` にプロンプトとオプションを渡して実行する
3. 実行結果を呼び出し元に返却する

```bash
# --model指定ありの場合
IS_SANDBOX=1 claude -p "<プロンプト>" --model <モデル名> --permission-mode bypassPermissions

# --model指定なしの場合
IS_SANDBOX=1 claude -p "<プロンプト>" --permission-mode bypassPermissions
```

## オプション

- `--model <モデル名>`: 呼び出し側が引数で指定した場合に付与。省略時は `claude -p` のデフォルトモデルが使われる
- `--permission-mode bypassPermissions`: 非対話実行のため必須
- タイムアウト: Bashツールのtimeoutを600000（10分）に設定すること

## 注意事項

- `claude -p` で起動されたプロセスはメインAgent扱いとなり、Agent toolやその他のツールを使用可能
- 呼び出し元のSubAgentのコンテキストは `claude -p` 側に引き継がれない（コンテキスト分離される）
- 実行が完了するまでブロックされる（逐次実行）
- 大量の出力がある場合は、ファイルに書き出してパスを返す方式も検討すること

## デバッグ・検証方法

### stream-jsonによる実行ログ取得

```bash
IS_SANDBOX=1 claude -p "<プロンプト>" --permission-mode bypassPermissions \
  --output-format stream-json --verbose \
  > /tmp/stream-output.jsonl 2>/dev/null
```

注意: `--output-format stream-json` には `--verbose` が必須。省略するとエラーで即終了する。

### 並列実行の判定方法

stream-jsonでは同一レスポンス内の複数tool_useが**別行で出力される**ため、行番号だけ見ると逐次に見える。並列かどうかの判定には `msg_id` を使うこと。

```python
import json
from collections import defaultdict

msg_tools = defaultdict(list)
with open('/tmp/stream-output.jsonl') as f:
    for i, line in enumerate(f):
        obj = json.loads(line)
        if obj.get('type') == 'assistant':
            msg = obj.get('message', {})
            msg_id = msg.get('id', '')
            for c in msg.get('content', []):
                if c.get('type') == 'tool_use':
                    msg_tools[msg_id].append((i, c.get('name'), c.get('id', '')))

for mid, tools in msg_tools.items():
    if len(tools) >= 2:
        print(f'並列実行: msg_id={mid[-20:]}')
        for line_num, name, tool_id in tools:
            print(f'  Line {line_num}: {name}')
```

- **同一 `msg_id` 内に複数tool_use** → 並列実行
- **異なる `msg_id`** → 逐次実行
