#!/usr/bin/env python3
"""box_client.py のユニットテスト。

Box APIへの通信はすべてモックし、ロジックのみを検証する。
"""

from __future__ import annotations

import io
import json
import os
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any
from unittest import TestCase, main
from unittest.mock import MagicMock, patch

# テスト対象のモジュールをインポート
import sys

sys.path.insert(0, os.path.dirname(__file__))
from box_client import BoxApiError, BoxClient


def _create_credentials(tmp_dir: str, extra: dict[str, Any] | None = None) -> str:
    """テスト用のcredentials.jsonを作成し、パスを返す。

    Args:
        tmp_dir: 一時ディレクトリのパス
        extra: 追加のキー（base_folder_id等）

    Returns:
        credentials.jsonのパス
    """
    creds_dir = os.path.join(tmp_dir, ".box")
    os.makedirs(creds_dir, exist_ok=True)
    creds_path = os.path.join(creds_dir, "credentials.json")
    data = {
        "client_id": "test_client_id",
        "client_secret": "test_client_secret",
        "refresh_token": "test_refresh_token",
    }
    if extra:
        data.update(extra)
    with open(creds_path, "w") as f:
        json.dump(data, f)
    return creds_path


def _make_http_error(code: int, body: str) -> urllib.error.HTTPError:
    """テスト用のHTTPErrorを作成する。

    Args:
        code: HTTPステータスコード
        body: レスポンスボディ

    Returns:
        HTTPError
    """
    resp = io.BytesIO(body.encode())
    return urllib.error.HTTPError(
        url="https://api.box.com/test",
        code=code,
        msg=f"HTTP {code}",
        hdrs={},  # type: ignore[arg-type]
        fp=resp,
    )


def _mock_token_response() -> MagicMock:
    """トークンリフレッシュ成功時のレスポンスモックを返す。

    Returns:
        urlopenの戻り値モック
    """
    resp = MagicMock()
    resp.read.return_value = json.dumps(
        {"access_token": "new_access_token", "refresh_token": "new_refresh_token"}
    ).encode()
    resp.__enter__ = lambda s: s
    resp.__exit__ = MagicMock(return_value=False)
    return resp


class TestBoxClientInit(TestCase):
    """BoxClient初期化のテスト。"""

    def test_credentials_not_found(self) -> None:
        """credentials.json が存在しない場合、BoxApiErrorが発生する。"""
        with self.assertRaises(BoxApiError) as ctx:
            BoxClient("/nonexistent/path/credentials.json")
        self.assertIn("認証情報ファイル", str(ctx.exception))
        self.assertIn("GAiDoアプリのStep 4", str(ctx.exception))

    def test_credentials_loaded(self) -> None:
        """credentials.json が正常に読み込まれる。"""
        with tempfile.TemporaryDirectory() as tmp:
            creds_path = _create_credentials(tmp)
            client = BoxClient(creds_path)
            self.assertEqual(client._client_id, "test_client_id")
            self.assertEqual(client._client_secret, "test_client_secret")
            self.assertEqual(client._refresh_token, "test_refresh_token")
            self.assertEqual(client._base_folder_id, "0")

    def test_base_folder_id_loaded(self) -> None:
        """base_folder_id が credentials.json から読み込まれる。"""
        with tempfile.TemporaryDirectory() as tmp:
            creds_path = _create_credentials(tmp, {"base_folder_id": "12345"})
            client = BoxClient(creds_path)
            self.assertEqual(client._base_folder_id, "12345")


class TestFriendlyErrorMessage(TestCase):
    """_friendly_error_message のテスト。"""

    def test_403_message(self) -> None:
        """403エラーでアクセス権限のメッセージが返る。"""
        msg = BoxClient._friendly_error_message("ダウンロード失敗", 403, "")
        self.assertIn("アクセス権限がありません", msg)
        self.assertIn("共有設定を確認", msg)
        self.assertIn("HTTP 403", msg)

    def test_404_message(self) -> None:
        """404エラーでID不在のメッセージが返る。"""
        msg = BoxClient._friendly_error_message("ダウンロード失敗", 404, "")
        self.assertIn("存在しません", msg)
        self.assertIn("IDが正しいか確認", msg)
        self.assertIn("HTTP 404", msg)

    def test_429_message(self) -> None:
        """429エラーでレート制限のメッセージが返る。"""
        msg = BoxClient._friendly_error_message("API呼び出し", 429, "")
        self.assertIn("リクエストが多すぎました", msg)
        self.assertIn("HTTP 429", msg)

    def test_unknown_status_code(self) -> None:
        """未知のステータスコードで予期しないエラーのメッセージが返る。"""
        msg = BoxClient._friendly_error_message("テスト", 500, "")
        self.assertIn("予期しないエラー", msg)
        self.assertIn("HTTP 500", msg)

    def test_prefix_included(self) -> None:
        """プレフィックスがメッセージに含まれる。"""
        msg = BoxClient._friendly_error_message("ファイルダウンロードに失敗", 404, "")
        self.assertIn("ファイルダウンロードに失敗", msg)


class TestRefreshAccessToken(TestCase):
    """_refresh_access_token のテスト。"""

    @patch("urllib.request.urlopen")
    def test_invalid_grant_error(self, mock_urlopen: MagicMock) -> None:
        """refresh_token失効時（invalid_grant）にユーザーフレンドリーなメッセージが出る。"""
        with tempfile.TemporaryDirectory() as tmp:
            creds_path = _create_credentials(tmp)
            client = BoxClient(creds_path)

            mock_urlopen.side_effect = _make_http_error(
                400, '{"error": "invalid_grant"}'
            )

            with self.assertRaises(BoxApiError) as ctx:
                client._refresh_access_token()

            self.assertIn("接続認証の有効期限が切れています", str(ctx.exception))
            self.assertIn("GAiDoアプリのStep 4", str(ctx.exception))
            self.assertIn("60日間", str(ctx.exception))
            self.assertEqual(ctx.exception.status_code, 400)

    @patch("urllib.request.urlopen")
    def test_other_token_error(self, mock_urlopen: MagicMock) -> None:
        """invalid_grant以外のトークンエラーは汎用メッセージ。"""
        with tempfile.TemporaryDirectory() as tmp:
            creds_path = _create_credentials(tmp)
            client = BoxClient(creds_path)

            mock_urlopen.side_effect = _make_http_error(
                400, '{"error": "invalid_client"}'
            )

            with self.assertRaises(BoxApiError) as ctx:
                client._refresh_access_token()

            self.assertIn("トークン取得に失敗", str(ctx.exception))
            self.assertNotIn("有効期限", str(ctx.exception))

    @patch("urllib.request.urlopen")
    def test_token_refresh_saves_new_token(self, mock_urlopen: MagicMock) -> None:
        """トークンリフレッシュ成功時に新しいrefresh_tokenがファイルに保存される。"""
        with tempfile.TemporaryDirectory() as tmp:
            creds_path = _create_credentials(tmp)
            client = BoxClient(creds_path)

            mock_urlopen.return_value = _mock_token_response()
            client._refresh_access_token()

            self.assertEqual(client._access_token, "new_access_token")
            self.assertEqual(client._refresh_token, "new_refresh_token")

            with open(creds_path) as f:
                saved = json.load(f)
            self.assertEqual(saved["refresh_token"], "new_refresh_token")


class TestExecuteWithRetry(TestCase):
    """_execute_with_retry のテスト。"""

    def _make_client(self, tmp: str) -> BoxClient:
        """テスト用のクライアントをトークン取得済みの状態で返す。

        Args:
            tmp: 一時ディレクトリのパス

        Returns:
            BoxClient
        """
        creds_path = _create_credentials(tmp)
        client = BoxClient(creds_path)
        client._access_token = "test_token"
        return client

    @patch("urllib.request.urlopen")
    def test_401_retry_success(self, mock_urlopen: MagicMock) -> None:
        """401エラー後にトークンリフレッシュしてリトライ成功する。"""
        with tempfile.TemporaryDirectory() as tmp:
            client = self._make_client(tmp)

            success_resp = MagicMock()
            success_resp.read.return_value = b'{"ok": true}'
            success_resp.__enter__ = lambda s: s
            success_resp.__exit__ = MagicMock(return_value=False)

            # 1回目: 401エラー、2回目: トークンリフレッシュ成功、3回目: リトライ成功
            mock_urlopen.side_effect = [
                _make_http_error(401, "Unauthorized"),
                _mock_token_response(),
                success_resp,
            ]

            def build_req(token: str) -> urllib.request.Request:
                return urllib.request.Request(
                    "https://api.box.com/test",
                    headers={"Authorization": f"Bearer {token}"},
                )

            resp = client._execute_with_retry(build_req, "テスト")
            self.assertEqual(resp.read(), b'{"ok": true}')

    @patch("urllib.request.urlopen")
    def test_404_error_friendly_message(self, mock_urlopen: MagicMock) -> None:
        """404エラーでfriendlyメッセージ付きのBoxApiErrorが発生する。"""
        with tempfile.TemporaryDirectory() as tmp:
            client = self._make_client(tmp)

            mock_urlopen.side_effect = _make_http_error(404, "Not Found")

            def build_req(token: str) -> urllib.request.Request:
                return urllib.request.Request("https://api.box.com/test")

            with self.assertRaises(BoxApiError) as ctx:
                client._execute_with_retry(build_req, "ファイルダウンロードに失敗")

            self.assertIn("存在しません", str(ctx.exception))
            self.assertEqual(ctx.exception.status_code, 404)

    @patch("urllib.request.urlopen")
    def test_403_error_friendly_message(self, mock_urlopen: MagicMock) -> None:
        """403エラーでアクセス権限メッセージ付きのBoxApiErrorが発生する。"""
        with tempfile.TemporaryDirectory() as tmp:
            client = self._make_client(tmp)

            mock_urlopen.side_effect = _make_http_error(403, "Forbidden")

            def build_req(token: str) -> urllib.request.Request:
                return urllib.request.Request("https://api.box.com/test")

            with self.assertRaises(BoxApiError) as ctx:
                client._execute_with_retry(build_req, "API呼び出しに失敗")

            self.assertIn("アクセス権限がありません", str(ctx.exception))
            self.assertEqual(ctx.exception.status_code, 403)

    @patch("urllib.request.urlopen")
    def test_url_error_network(self, mock_urlopen: MagicMock) -> None:
        """ネットワークエラー（URLError）で接続エラーメッセージが発生する。"""
        with tempfile.TemporaryDirectory() as tmp:
            client = self._make_client(tmp)

            mock_urlopen.side_effect = urllib.error.URLError("Connection refused")

            def build_req(token: str) -> urllib.request.Request:
                return urllib.request.Request("https://api.box.com/test")

            with self.assertRaises(BoxApiError) as ctx:
                client._execute_with_retry(build_req, "ファイルダウンロードに失敗")

            self.assertIn("接続できません", str(ctx.exception))
            self.assertIn("インターネット接続", str(ctx.exception))


class TestDownloadFile(TestCase):
    """download_file のテスト。"""

    @patch.object(BoxClient, "_api_request_binary")
    @patch.object(BoxClient, "get_file_info")
    def test_download_with_auto_filename(
        self, mock_info: MagicMock, mock_binary: MagicMock
    ) -> None:
        """output_path未指定時、Box上のファイル名でai_generated/input/に保存される。"""
        with tempfile.TemporaryDirectory() as tmp:
            creds_path = _create_credentials(tmp)
            client = BoxClient(creds_path)
            client._access_token = "test_token"

            mock_info.return_value = {"name": "test_doc.pdf", "id": "123"}
            mock_binary.return_value = b"PDF content here"

            original_cwd = os.getcwd()
            os.chdir(tmp)
            try:
                result = client.download_file("123")
                self.assertEqual(result, Path("ai_generated/input/test_doc.pdf"))
                self.assertTrue(result.exists())
                self.assertEqual(result.read_bytes(), b"PDF content here")
            finally:
                os.chdir(original_cwd)

    @patch.object(BoxClient, "_api_request_binary")
    def test_download_with_explicit_path(self, mock_binary: MagicMock) -> None:
        """output_path指定時、指定パスに保存される。"""
        with tempfile.TemporaryDirectory() as tmp:
            creds_path = _create_credentials(tmp)
            client = BoxClient(creds_path)
            client._access_token = "test_token"

            mock_binary.return_value = b"file content"
            output = os.path.join(tmp, "custom", "output.txt")

            result = client.download_file("456", output)
            self.assertEqual(result, Path(output))
            self.assertTrue(result.exists())
            self.assertEqual(result.read_bytes(), b"file content")

    @patch.object(BoxClient, "get_file_info")
    @patch.object(BoxClient, "_api_request_binary")
    def test_download_fallback_filename(
        self, mock_binary: MagicMock, mock_info: MagicMock
    ) -> None:
        """Box上のファイル名が取得できない場合、fallbackファイル名が使われる。"""
        with tempfile.TemporaryDirectory() as tmp:
            creds_path = _create_credentials(tmp)
            client = BoxClient(creds_path)
            client._access_token = "test_token"

            mock_info.return_value = {}  # nameキーなし
            mock_binary.return_value = b"data"

            original_cwd = os.getcwd()
            os.chdir(tmp)
            try:
                result = client.download_file("789")
                self.assertIn("box_file_789", str(result))
            finally:
                os.chdir(original_cwd)


class TestDownloadFolder(TestCase):
    """download_folder のテスト。"""

    @patch.object(BoxClient, "download_file")
    @patch.object(BoxClient, "list_items")
    def test_recursive_download(
        self, mock_list: MagicMock, mock_download: MagicMock
    ) -> None:
        """フォルダ内のファイルとサブフォルダを再帰的にダウンロードする。"""
        with tempfile.TemporaryDirectory() as tmp:
            creds_path = _create_credentials(tmp)
            client = BoxClient(creds_path)
            client._access_token = "test_token"

            # ルートフォルダ: ファイル1つ + サブフォルダ1つ
            mock_list.side_effect = [
                [
                    {"type": "file", "name": "doc.pdf", "id": "f1"},
                    {"type": "folder", "name": "sub", "id": "d1"},
                ],
                # サブフォルダ: ファイル1つ
                [
                    {"type": "file", "name": "img.png", "id": "f2"},
                ],
            ]

            output_dir = os.path.join(tmp, "output")
            files = client.download_folder("root_id", output_dir)

            self.assertEqual(len(files), 2)
            self.assertEqual(files[0], Path(output_dir) / "doc.pdf")
            self.assertEqual(files[1], Path(output_dir) / "sub" / "img.png")

            # download_fileが正しいパスで呼ばれたか確認
            self.assertEqual(mock_download.call_count, 2)
            mock_download.assert_any_call("f1", str(Path(output_dir) / "doc.pdf"))
            mock_download.assert_any_call(
                "f2", str(Path(output_dir) / "sub" / "img.png")
            )

    @patch.object(BoxClient, "list_items")
    def test_empty_folder(self, mock_list: MagicMock) -> None:
        """空フォルダの場合、空リストが返る。"""
        with tempfile.TemporaryDirectory() as tmp:
            creds_path = _create_credentials(tmp)
            client = BoxClient(creds_path)
            client._access_token = "test_token"

            mock_list.return_value = []

            files = client.download_folder("empty_id", os.path.join(tmp, "out"))
            self.assertEqual(files, [])


class TestGetFileInfo(TestCase):
    """get_file_info のテスト。"""

    @patch.object(BoxClient, "_api_request")
    def test_returns_file_info(self, mock_api: MagicMock) -> None:
        """ファイル情報のdictが返る。"""
        with tempfile.TemporaryDirectory() as tmp:
            creds_path = _create_credentials(tmp)
            client = BoxClient(creds_path)
            client._access_token = "test_token"

            mock_api.return_value = {
                "id": "123",
                "name": "test.pdf",
                "size": 1024,
            }

            result = client.get_file_info("123")
            self.assertEqual(result["name"], "test.pdf")
            mock_api.assert_called_once_with(
                "GET", "https://api.box.com/2.0/files/123"
            )


class TestBoxApiError(TestCase):
    """BoxApiError のテスト。"""

    def test_error_attributes(self) -> None:
        """status_codeとresponse_bodyが保持される。"""
        err = BoxApiError("test error", 404, '{"code": "not_found"}')
        self.assertEqual(str(err), "test error")
        self.assertEqual(err.status_code, 404)
        self.assertEqual(err.response_body, '{"code": "not_found"}')

    def test_error_without_optional_fields(self) -> None:
        """オプションフィールドなしでも動作する。"""
        err = BoxApiError("simple error")
        self.assertEqual(str(err), "simple error")
        self.assertIsNone(err.status_code)
        self.assertIsNone(err.response_body)


if __name__ == "__main__":
    main()
