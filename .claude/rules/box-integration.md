# Box連携

`tools/box_client.py` を使ってBoxのファイル取得・書き込み・アップロードが可能。
Boxに情報を読み書きする必要がある場合は、このツールを積極的に活用すること。

## 認証情報

`.box/credentials.json` に以下を保存：

```json
{
  "client_id": "...",
  "client_secret": "...",
  "refresh_token": "...",
  "base_folder_id": "0"
}
```

- `base_folder_id`: パス操作の起点フォルダID（企業Boxではルート `"0"` への書き込みが制限される場合があるため設定）
- 認証情報が存在しない場合はBox連携未設定を意味する → GAiDoアプリのStep 4で設定済みか確認すること
- refresh_tokenは60日未使用で失効する。失効した場合はStep4で再設定が必要

## CLIコマンド

```bash
# ファイルをアップロード（フォルダパス自動作成）
python3 tools/box_client.py upload <ファイルパス> --folder-path <Boxフォルダパス>

# ファイルをダウンロード（デフォルト保存先: ai_generated/input/）
python3 tools/box_client.py download <ファイルID> [--output <保存先パス>]

# フォルダを再帰的にダウンロード（フォルダID指定）
python3 tools/box_client.py download-folder <フォルダID> [--output-dir <保存先ディレクトリ>]

# フォルダを再帰的にダウンロード（パス指定）
python3 tools/box_client.py download-folder-by-path <フォルダパス> [--output-dir <保存先ディレクトリ>]

# フォルダ作成
python3 tools/box_client.py mkdir <フォルダ名> [--parent-id <ID>]

# フォルダ内一覧
python3 tools/box_client.py list [--folder-id <ID>]
```

## Pythonから使う場合

```python
from tools.box_client import BoxClient

client = BoxClient()  # .box/credentials.json を読み込む

# アップロード（フォルダ自動作成）
client.upload_to_path("local/file.pdf", "GAiDo/案件名/proposal")

# ダウンロード（ファイルID指定）
path = client.download_file("12345678", output_path="ai_generated/input/file.pdf")

# フォルダをダウンロード
paths = client.download_folder("87654321", output_dir="ai_generated/input")

# フォルダ内一覧
items = client.list_items("87654321")
```

## 主なメソッド

| メソッド | 用途 |
|---------|------|
| `upload_to_path(local_path, box_folder_path)` | パス指定でアップロード（フォルダ自動作成） |
| `upload_file(local_path, folder_id)` | フォルダID指定でアップロード（50MB以下） |
| `download_file(file_id, output_path)` | ファイルIDでダウンロード |
| `download_folder(folder_id, output_dir)` | フォルダIDで再帰ダウンロード |
| `list_items(folder_id)` | フォルダ内アイテム一覧取得 |
| `create_folder(name, parent_id)` | フォルダ作成（同名既存時は既存を返す） |
| `ensure_folder_path(folder_path)` | パスを再帰的に作成しフォルダIDを返す |
| `resolve_folder_path(folder_path)` | パスからフォルダIDを解決（読み取り専用） |

## エラーハンドリング

- **認証情報ファイルなし**: Box連携未設定のメッセージが出る。GAiDoアプリのStep 4で設定を促す
- **401**: 自動でトークンリフレッシュしてリトライする
- **403**: アクセス権限なし → Box上の共有設定を確認するようユーザーに伝える
- **404**: ファイル/フォルダIDが存在しない → IDが正しいか確認するようユーザーに伝える
- **60日失効**: `invalid_grant` エラー → GAiDoアプリのStep 4で再設定するようユーザーに伝える
