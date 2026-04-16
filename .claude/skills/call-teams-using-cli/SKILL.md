---
name: call-teams-using-cli
description: SubAgentから複数agentをclaude -pで並列実行する。SubAgentからSubAgentを呼べない制限の回避策。
user-invocable: false
---

# SubAgentからの複数agent並列呼び出し

SubAgentからSubAgentを直接起動できない制限を、`claude -p` CLI呼び出しで回避します。
渡されたプロンプトに含まれる複数agentを、Agent toolの並列起動機能で同時実行します。

## 使い方

このスキルを呼び出す際、以下の形式で引数を渡してください。

```
/call-teams-using-cli --model <モデル名> <プロンプト>
```

- `--model <モデル名>`: 使用するモデルを指定（例: `sonnet`, `opus`）。省略時はデフォルトモデル（指定なし）
- `<プロンプト>`: `claude -p` に渡すプロンプト本文

使用例:
```
/call-teams-using-cli --model sonnet 以下の4つのagentを1レスポンスで並列実行してください。
すべてのagentの処理が終わったら各処理結果をレポートしてください。

1. existing-source-analysis-db: DB構造を解析し db.md を生成
2. existing-source-analysis-screens: 画面構成を解析し screens.md を生成
3. existing-source-analysis-architecture: アーキテクチャを解析し architecture.md を生成
4. existing-source-analysis-openapi: WebAPI定義を解析し openapi.yaml を生成
```

## 実行手順

1. 引数から `--model` オプションとプロンプトを分離する
2. `claude -p` にプロンプトとオプションを渡して実行する
3. `claude -p` 内のAgentがAgent toolを1レスポンスで複数並列起動する
4. 全agentの完了後、結果レポートを呼び出し元に返却する

```bash
# --model指定ありの場合
IS_SANDBOX=1 claude -p "<プロンプト>" --model <モデル名> --permission-mode bypassPermissions

# --model指定なしの場合
IS_SANDBOX=1 claude -p "<プロンプト>" --permission-mode bypassPermissions
```

## オプション

- `--permission-mode bypassPermissions`: 非対話実行のため必須
- タイムアウト: Bashツールのtimeoutを600000（10分）に設定すること

## 注意事項

- `claude -p` で起動されたプロセスはメインAgent扱いとなり、Agent toolを並列で使用可能
- 呼び出し元のSubAgentのコンテキストは `claude -p` 側に引き継がれない（コンテキスト分離される）
- 並列実行される各agentは互いのコンテキストを共有しない
- 全agentの処理が完了するまでブロックされる

## デバッグ・検証方法

### stream-jsonによる実行ログ取得

```bash
IS_SANDBOX=1 claude -p "<プロンプト>" --permission-mode bypassPermissions \
  --output-format stream-json --verbose \
  > /tmp/stream-output.jsonl 2>/dev/null
```

注意: `--output-format stream-json` には `--verbose` が必須。省略するとエラーで即終了する。

### 進捗確認（バックグラウンド実行時）

```bash
IS_SANDBOX=1 claude -p "<プロンプト>" --permission-mode bypassPermissions \
  --output-format stream-json --verbose \
  > /tmp/stream-output.jsonl 2>/dev/null &
BGPID=$!

# ポーリングで進捗確認
while kill -0 $BGPID 2>/dev/null; do
  sleep 2
  wc -l /tmp/stream-output.jsonl
  tail -3 /tmp/stream-output.jsonl
done
```

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
