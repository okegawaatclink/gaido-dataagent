#!/usr/bin/env python3
"""Box APIクライアント。

OAuth 2.0のrefresh_tokenを使ってBox APIを呼び出し、
ファイルのアップロード・ダウンロード、フォルダの作成・一覧取得を行う。

使用方法:
    python3 tools/box_client.py upload <ファイルパス> --folder-path <Boxフォルダパス>
    python3 tools/box_client.py download <ファイルID> [--output <保存先パス>]
    python3 tools/box_client.py download-folder <フォルダID> [--output-dir <保存先ディレクトリ>]
    python3 tools/box_client.py mkdir <フォルダ名> [--parent-id <ID>]
    python3 tools/box_client.py list [--folder-id <ID>]

参考:
    - ファイルアップロード: https://developer.box.com/reference/post-files-content/
    - ファイルダウンロード: https://developer.box.com/reference/get-files-id-content/
    - フォルダ作成: https://developer.box.com/reference/post-folders/
    - フォルダ一覧: https://developer.box.com/reference/get-folders-id-items/
    - トークン取得: https://developer.box.com/reference/post-oauth2-token/
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from http.client import HTTPResponse
from pathlib import Path
from typing import Any, Callable

# デバッグログ用フラグ（環境変数 BOX_CLIENT_DEBUG=1 で有効化）
_DEBUG = os.environ.get("BOX_CLIENT_DEBUG", "") == "1"


def _dbg(msg: str) -> None:
    """デバッグメッセージをstderrに出力する。"""
    if _DEBUG:
        print(f"[box_client] {msg}", file=sys.stderr, flush=True)


class BoxApiError(Exception):
    """Box API呼び出しエラー。

    Args:
        message: エラーメッセージ
        status_code: HTTPステータスコード
        response_body: レスポンスボディ
    """

    def __init__(
        self, message: str, status_code: int | None = None, response_body: str | None = None
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.response_body = response_body


class BoxClient:
    """Box APIクライアント。

    refresh_tokenからaccess_tokenを取得し、Box APIを呼び出す。
    access_tokenは60分有効。refresh_tokenは使用ごとに更新され、
    新しいrefresh_tokenがcredentials.jsonに保存される。

    Args:
        credentials_path: 認証情報JSONファイルのパス
    """

    TOKEN_URL = "https://api.box.com/oauth2/token"
    API_BASE = "https://api.box.com/2.0"
    UPLOAD_URL = "https://upload.box.com/api/2.0/files/content"

    def __init__(self, credentials_path: str = ".box/credentials.json") -> None:
        self._credentials_path = Path(credentials_path)
        self._access_token: str | None = None

        if not self._credentials_path.exists():
            raise BoxApiError(
                f"Box連携の認証情報ファイル（{self._credentials_path}）が見つかりません。\n"
                "Box連携が未設定です。GAiDoアプリのStep 4でBox連携を設定してください。"
            )

        with open(self._credentials_path) as f:
            creds = json.load(f)

        self._client_id: str = creds["client_id"]
        self._client_secret: str = creds["client_secret"]
        self._refresh_token: str = creds["refresh_token"]
        self._base_folder_id: str = creds.get("base_folder_id", "0")

    def _refresh_access_token(self) -> None:
        """refresh_tokenを使ってaccess_tokenを取得し、新しいrefresh_tokenを保存する。

        Raises:
            BoxApiError: トークン取得に失敗した場合
        """
        data = urllib.parse.urlencode(
            {
                "client_id": self._client_id,
                "client_secret": self._client_secret,
                "grant_type": "refresh_token",
                "refresh_token": self._refresh_token,
            }
        ).encode()

        req = urllib.request.Request(
            self.TOKEN_URL,
            data=data,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

        old_token_prefix = self._refresh_token[:12] if self._refresh_token else "(none)"
        _dbg(f"token refresh start: old={old_token_prefix}... path={self._credentials_path.resolve()}")

        try:
            with urllib.request.urlopen(req) as resp:
                result = json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            body = e.read().decode()
            if e.code == 400 and "invalid_grant" in body:
                raise BoxApiError(
                    "Boxとの接続認証の有効期限が切れています。"
                    "GAiDoアプリのStep 4でBox連携を再設定してください。"
                    "（60日間Boxを使わないと認証が失効します）",
                    e.code,
                    body,
                ) from e
            raise BoxApiError(f"トークン取得に失敗: {e.code} {body}", e.code, body) from e

        self._access_token = result["access_token"]
        self._refresh_token = result["refresh_token"]
        new_token_prefix = self._refresh_token[:12] if self._refresh_token else "(none)"
        rotated = old_token_prefix != new_token_prefix
        _dbg(f"token refresh ok: new={new_token_prefix}... rotated={rotated}")

        # 新しいrefresh_tokenを保存（base_folder_idも維持する）
        creds = {
            "client_id": self._client_id,
            "client_secret": self._client_secret,
            "refresh_token": self._refresh_token,
            "base_folder_id": self._base_folder_id,
        }
        self._credentials_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self._credentials_path, "w") as f:
            json.dump(creds, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        _dbg(f"credentials written: {self._credentials_path.resolve()}")

    def _ensure_token(self) -> None:
        """access_tokenが取得済みでなければ取得する。"""
        if self._access_token is None:
            self._refresh_access_token()

    @staticmethod
    def _friendly_error_message(prefix: str, status_code: int, body: str) -> str:
        """HTTPステータスコードからユーザー向けエラーメッセージを生成する。

        Args:
            prefix: エラーメッセージのプレフィックス
            status_code: HTTPステータスコード
            body: レスポンスボディ

        Returns:
            ユーザー向けエラーメッセージ
        """
        messages = {
            403: (
                "指定したBoxのファイルまたはフォルダへのアクセス権限がありません。"
                "Box上で対象の共有設定を確認してください"
            ),
            404: (
                "指定したBoxのファイルIDまたはフォルダIDが存在しません。"
                "IDが正しいか確認してください"
            ),
            429: (
                "Box APIへの短時間のリクエストが多すぎました。"
                "しばらく待ってからもう一度試してください"
            ),
        }
        hint = messages.get(status_code, "")
        if hint:
            return f"{prefix}: {hint}（HTTP {status_code}）"
        return f"{prefix}: 予期しないエラーが発生しました（HTTP {status_code}）"

    def _execute_with_retry(
        self,
        build_request: Callable[[str], urllib.request.Request],
        error_message: str,
    ) -> HTTPResponse:
        """401エラー時にトークンを更新してリトライする共通処理。

        Args:
            build_request: アクセストークンを受け取りRequestオブジェクトを返す関数
            error_message: エラー時のメッセージプレフィックス

        Returns:
            HTTPレスポンスオブジェクト（コンテキストマネージャとしてwith文で使用可能）

        Raises:
            BoxApiError: API呼び出しに失敗した場合
        """
        self._ensure_token()

        try:
            return urllib.request.urlopen(build_request(self._access_token))
        except urllib.error.HTTPError as e:
            body = e.read().decode()
            if e.code == 401:
                self._access_token = None
                self._refresh_access_token()
                try:
                    return urllib.request.urlopen(build_request(self._access_token))
                except urllib.error.HTTPError as e2:
                    body2 = e2.read().decode()
                    message2 = self._friendly_error_message(error_message, e2.code, body2)
                    raise BoxApiError(message2, e2.code, body2) from e2
            message = self._friendly_error_message(error_message, e.code, body)
            raise BoxApiError(message, e.code, body) from e
        except urllib.error.URLError as e:
            raise BoxApiError(
                f"{error_message}: Boxのサーバーに接続できません。インターネット接続を確認してください"
            ) from e

    def _api_request(
        self, method: str, url: str, data: bytes | None = None, headers: dict[str, str] | None = None
    ) -> dict[str, Any]:
        """Box APIリクエストを実行する。

        Args:
            method: HTTPメソッド
            url: リクエストURL
            data: リクエストボディ
            headers: 追加ヘッダー

        Returns:
            レスポンスJSON

        Raises:
            BoxApiError: API呼び出しに失敗した場合
        """
        def build_request(token: str) -> urllib.request.Request:
            """リクエストオブジェクトを構築する。"""
            req_headers = {"Authorization": f"Bearer {token}"}
            if headers:
                req_headers.update(headers)
            return urllib.request.Request(url, data=data, headers=req_headers, method=method)

        with self._execute_with_retry(build_request, "API呼び出しに失敗") as resp:
            if resp.status == 204:
                return {}
            return json.loads(resp.read().decode())

    def _api_request_binary(self, url: str) -> bytes:
        """Box APIリクエストを実行し、バイナリレスポンスを返す。

        ファイルダウンロード用。302リダイレクトはurllibが自動追跡する。
        参考: https://developer.box.com/reference/get-files-id-content/

        Args:
            url: リクエストURL

        Returns:
            レスポンスボディ（バイナリ）

        Raises:
            BoxApiError: API呼び出しに失敗した場合
        """
        def build_request(token: str) -> urllib.request.Request:
            """リクエストオブジェクトを構築する。"""
            return urllib.request.Request(
                url, headers={"Authorization": f"Bearer {token}"}, method="GET"
            )

        with self._execute_with_retry(build_request, "ファイルダウンロードに失敗") as resp:
            return resp.read()

    def upload_file(
        self, local_path: str, folder_id: str = "0", filename: str | None = None
    ) -> dict[str, Any]:
        """ファイルをアップロードする（50MB以下）。

        Args:
            local_path: アップロードするローカルファイルのパス
            folder_id: アップロード先のBoxフォルダID ("0"はルート)
            filename: Box上でのファイル名 (Noneならローカルファイル名を使用)

        Returns:
            アップロードされたファイル情報

        Raises:
            BoxApiError: API呼び出しに失敗した場合
            FileNotFoundError: ローカルファイルが存在しない場合
        """
        path = Path(local_path)
        if not path.exists():
            raise FileNotFoundError(f"ファイルが見つかりません: {local_path}")

        name = filename or path.name

        # multipart/form-dataを手動で構築
        # 参考: https://developer.box.com/reference/post-files-content/
        boundary = f"----BoxUploadBoundary{os.urandom(16).hex()}"
        attributes = json.dumps({"name": name, "parent": {"id": folder_id}})

        file_data = path.read_bytes()

        body = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="attributes"\r\n'
            f"Content-Type: application/json\r\n\r\n"
            f"{attributes}\r\n"
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="file"; filename="{name}"\r\n'
            f"Content-Type: application/octet-stream\r\n\r\n"
        ).encode() + file_data + f"\r\n--{boundary}--\r\n".encode()

        def build_request(token: str) -> urllib.request.Request:
            """リクエストオブジェクトを構築する。"""
            return urllib.request.Request(
                self.UPLOAD_URL,
                data=body,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": f"multipart/form-data; boundary={boundary}",
                },
                method="POST",
            )

        with self._execute_with_retry(build_request, "ファイルアップロードに失敗") as resp:
            return json.loads(resp.read().decode())

    def create_folder(self, name: str, parent_id: str = "0") -> dict[str, Any]:
        """フォルダを作成する。

        Args:
            name: フォルダ名
            parent_id: 親フォルダID ("0"はルート)

        Returns:
            作成されたフォルダ情報。既存フォルダがある場合は409エラー

        Raises:
            BoxApiError: API呼び出しに失敗した場合
        """
        data = json.dumps({"name": name, "parent": {"id": parent_id}}).encode()
        try:
            return self._api_request(
                "POST",
                f"{self.API_BASE}/folders",
                data=data,
                headers={"Content-Type": "application/json"},
            )
        except BoxApiError as e:
            # 409: 同名フォルダが既に存在 → 既存フォルダのIDを返す
            # 注: Box APIはconflictsを配列またはオブジェクトで返す既知の不整合がある
            # 参考: https://forum.box.com/t/api-conflict-error-inconsistent-data-type-for-conflicts-as-array-or-single-object/2353
            if e.status_code == 409 and e.response_body:
                try:
                    conflict = json.loads(e.response_body)
                    existing = conflict.get("context_info", {}).get("conflicts")
                    if isinstance(existing, list) and existing:
                        return existing[0]
                    elif isinstance(existing, dict) and "id" in existing:
                        return existing
                except (json.JSONDecodeError, KeyError, IndexError):
                    pass
            raise

    def ensure_folder_path(self, folder_path: str) -> str:
        """フォルダパスを再帰的に作成し、最終フォルダのIDを返す。

        企業Boxではルートフォルダ(ID: 0)への書き込みが制限されている場合があるため、
        credentials.jsonのbase_folder_idをルートとして使用する。

        Args:
            folder_path: スラッシュ区切りのフォルダパス (例: "案件名/提案書")

        Returns:
            最終フォルダのID
        """
        parts = [p.strip() for p in folder_path.split("/") if p.strip()]
        current_id = self._base_folder_id

        for part in parts:
            result = self.create_folder(part, current_id)
            current_id = result["id"]

        return current_id

    def resolve_folder_path(self, folder_path: str) -> str:
        """フォルダパスからフォルダIDを解決する（読み取り専用）。

        ensure_folder_pathとは異なり、フォルダが存在しない場合は作成せずエラーにする。
        credentials.jsonのbase_folder_idをルートとして使用する。

        Args:
            folder_path: スラッシュ区切りのフォルダパス (例: "GAiDo/feedback/analysis")

        Returns:
            str: 最終フォルダのID

        Raises:
            BoxApiError: フォルダが存在しない場合
        """
        parts = [p.strip() for p in folder_path.split("/") if p.strip()]
        current_id = self._base_folder_id

        for part in parts:
            items = self.list_items(current_id)
            found = False
            for item in items:
                if item.get("type") == "folder" and item.get("name") == part:
                    current_id = item["id"]
                    found = True
                    break
            if not found:
                raise BoxApiError(
                    f"フォルダが見つかりません: '{part}'（パス: {folder_path}）",
                    404,
                    "",
                )

        return current_id

    def list_items(self, folder_id: str = "0") -> list[dict[str, Any]]:
        """フォルダ内のアイテム一覧を取得する。

        Args:
            folder_id: フォルダID ("0"はルート)

        Returns:
            アイテム一覧（ファイル、フォルダ、Webリンク）
        """
        result = self._api_request("GET", f"{self.API_BASE}/folders/{folder_id}/items?limit=100")
        return result.get("entries", [])

    def upload_to_path(
        self, local_path: str, box_folder_path: str, filename: str | None = None
    ) -> dict[str, Any]:
        """指定パスにアップロード（フォルダ自動作成付き）。

        Args:
            local_path: ローカルファイルパス
            box_folder_path: Box上のフォルダパス (例: "GAiDo/案件名/proposal")
            filename: Box上でのファイル名 (Noneならローカルファイル名を使用)

        Returns:
            アップロードされたファイル情報
        """
        folder_id = self.ensure_folder_path(box_folder_path)
        result = self.upload_file(local_path, folder_id, filename)

        # アップロード結果からURLを取得して表示
        entries = result.get("entries", [])
        if entries:
            file_info = entries[0]
            file_id = file_info.get("id", "")
            file_name = file_info.get("name", "")
            print(f"アップロード完了: {file_name}")
            print(f"  Box URL: https://app.box.com/file/{file_id}")

        return result

    def get_file_info(self, file_id: str) -> dict[str, Any]:
        """ファイルのメタ情報を取得する。

        Args:
            file_id: BoxファイルID

        Returns:
            ファイル情報（name, size等）

        Raises:
            BoxApiError: API呼び出しに失敗した場合
        """
        # 参考: https://developer.box.com/reference/get-files-id/
        return self._api_request("GET", f"{self.API_BASE}/files/{file_id}")

    def download_file(self, file_id: str, output_path: str | None = None) -> Path:
        """ファイルをダウンロードする。

        302リダイレクトはurllibが自動追跡する。
        参考: https://developer.box.com/reference/get-files-id-content/

        Args:
            file_id: BoxファイルID
            output_path: 保存先パス (Noneの場合はBox上のファイル名でai_generated/input/に保存)

        Returns:
            保存したファイルのパス

        Raises:
            BoxApiError: API呼び出しに失敗した場合
        """
        if output_path is None:
            file_info = self.get_file_info(file_id)
            filename = file_info.get("name", f"box_file_{file_id}")
            output_path = f"ai_generated/input/{filename}"

        content = self._api_request_binary(f"{self.API_BASE}/files/{file_id}/content")

        dest = Path(output_path)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(content)

        return dest

    def download_folder(self, folder_id: str, output_dir: str = "ai_generated/input") -> list[Path]:
        """フォルダ内のファイルを再帰的にダウンロードする。

        フォルダ構造を維持してローカルにダウンロードする。
        参考: https://developer.box.com/reference/get-folders-id-items/

        Args:
            folder_id: BoxフォルダID
            output_dir: 保存先ディレクトリパス

        Returns:
            ダウンロードしたファイルのパスリスト

        Raises:
            BoxApiError: API呼び出しに失敗した場合
        """
        downloaded: list[Path] = []
        self._download_folder_recursive(folder_id, Path(output_dir), downloaded)
        return downloaded

    def _download_folder_recursive(
        self, folder_id: str, local_dir: Path, downloaded: list[Path]
    ) -> None:
        """フォルダを再帰的に走査してファイルをダウンロードする。

        Args:
            folder_id: BoxフォルダID
            local_dir: ローカル保存先ディレクトリ
            downloaded: ダウンロード済みファイルパスのリスト（破壊的に更新）
        """
        items = self.list_items(folder_id)

        for item in items:
            item_type = item.get("type", "")
            item_name = item.get("name", "")
            item_id = item.get("id", "")

            if item_type == "file":
                dest = local_dir / item_name
                print(f"  ダウンロード中: {dest}")
                self.download_file(item_id, str(dest))
                downloaded.append(dest)
            elif item_type == "folder":
                sub_dir = local_dir / item_name
                self._download_folder_recursive(item_id, sub_dir, downloaded)


def main() -> None:
    """メインエントリポイント。CLIコマンドを処理する。"""
    parser = argparse.ArgumentParser(description="Box APIクライアント")
    parser.add_argument(
        "--credentials",
        default=".box/credentials.json",
        help="認証情報ファイルのパス (デフォルト: .box/credentials.json)",
    )

    subparsers = parser.add_subparsers(dest="command", help="実行するコマンド")

    # upload コマンド
    upload_parser = subparsers.add_parser("upload", help="ファイルをアップロード")
    upload_parser.add_argument("file", help="アップロードするファイルのパス")
    upload_parser.add_argument("--folder-id", default="0", help="アップロード先フォルダID")
    upload_parser.add_argument("--folder-path", help="アップロード先フォルダパス（自動作成）")
    upload_parser.add_argument("--filename", help="Box上でのファイル名")

    # download コマンド
    download_parser = subparsers.add_parser("download", help="ファイルをダウンロード")
    download_parser.add_argument("file_id", help="ダウンロードするファイルのBox ID")
    download_parser.add_argument("--output", help="保存先パス（省略時はBox上のファイル名）")

    # download-folder コマンド
    dl_folder_parser = subparsers.add_parser(
        "download-folder", help="フォルダ内ファイルを再帰的にダウンロード"
    )
    dl_folder_parser.add_argument("folder_id", help="ダウンロード対象のBoxフォルダID")
    dl_folder_parser.add_argument(
        "--output-dir", default="ai_generated/input",
        help="保存先ディレクトリ（デフォルト: ai_generated/input）",
    )

    # download-folder-by-path コマンド
    dl_folder_path_parser = subparsers.add_parser(
        "download-folder-by-path", help="パス指定でフォルダ内ファイルを再帰的にダウンロード"
    )
    dl_folder_path_parser.add_argument("folder_path", help="Box上のフォルダパス (例: GAiDo/feedback/analysis)")
    dl_folder_path_parser.add_argument(
        "--output-dir", default="ai_generated/input",
        help="保存先ディレクトリ（デフォルト: ai_generated/input）",
    )

    # mkdir コマンド
    mkdir_parser = subparsers.add_parser("mkdir", help="フォルダを作成")
    mkdir_parser.add_argument("name", help="フォルダ名")
    mkdir_parser.add_argument("--parent-id", default="0", help="親フォルダID")

    # list コマンド
    list_parser = subparsers.add_parser("list", help="フォルダ内一覧を表示")
    list_parser.add_argument("--folder-id", default="0", help="フォルダID")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    try:
        client = BoxClient(args.credentials)

        if args.command == "upload":
            if args.folder_path:
                result = client.upload_to_path(args.file, args.folder_path, args.filename)
            else:
                result = client.upload_file(args.file, args.folder_id, args.filename)
                entries = result.get("entries", [])
                if entries:
                    file_info = entries[0]
                    print(f"アップロード完了: {file_info.get('name', '')}")
                    print(f"  Box URL: https://app.box.com/file/{file_info.get('id', '')}")

        elif args.command == "download":
            dest = client.download_file(args.file_id, args.output)
            print(f"ダウンロード完了: {dest}")

        elif args.command == "download-folder":
            print(f"フォルダ {args.folder_id} のダウンロードを開始...")
            files = client.download_folder(args.folder_id, args.output_dir)
            print(f"\nダウンロード完了: {len(files)} ファイル")
            for f in files:
                print(f"  {f}")

        elif args.command == "download-folder-by-path":
            print(f"パス '{args.folder_path}' のフォルダIDを解決中...")
            folder_id = client.resolve_folder_path(args.folder_path)
            print(f"フォルダID: {folder_id} のダウンロードを開始...")
            files = client.download_folder(folder_id, args.output_dir)
            print(f"\nダウンロード完了: {len(files)} ファイル")
            for f in files:
                print(f"  {f}")

        elif args.command == "mkdir":
            result = client.create_folder(args.name, args.parent_id)
            print(f"フォルダ作成: {result.get('name', args.name)} (ID: {result.get('id', '')})")

        elif args.command == "list":
            items = client.list_items(args.folder_id)
            if not items:
                print("（空のフォルダ）")
            else:
                for item in items:
                    item_type = item.get("type", "unknown")
                    icon = "📁" if item_type == "folder" else "📄"
                    print(f"  {icon} {item.get('name', '')} (ID: {item.get('id', '')})")

    except BoxApiError as e:
        print(f"エラー: {e}", file=sys.stderr)
        if e.response_body:
            print(f"詳細: {e.response_body}", file=sys.stderr)
        sys.exit(1)
    except FileNotFoundError as e:
        print(f"エラー: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
