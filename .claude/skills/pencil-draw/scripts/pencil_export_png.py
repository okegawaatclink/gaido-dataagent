"""Pencil MCP HTTP serverからget_screenshotを呼び出し、PNGファイルとして保存するスクリプト。

Usage:
    python3 pencil_export_png.py <node_id> <output_path> [--port PORT]

前提条件:
    - Pencil App（Electron）が起動済みであること
    - 呼び出し元（Claude Code）がMCP経由で対象の.penファイルを既にopen_documentで開いていること
    - ノードIDは呼び出し元がget_editor_state等で事前に取得済みであること
    このスクリプトはドキュメントのオープンやノードIDの取得は行わない。
    現在Pencil Appで開かれているドキュメントに対してget_screenshotを実行するのみ。

環境変数:
    PENCIL_MCP_BINARY: MCP serverバイナリのパス（省略時はPATHから検索）
"""
import subprocess
import requests
import json
import base64
import sys
import time
import os
import shutil


def find_mcp_binary() -> str:
    """MCP serverバイナリのパスを検出する。

    環境変数 PENCIL_MCP_BINARY が設定されていればそれを使用。
    未設定の場合は PATH 上の mcp-server-linux-x64 を検索。

    Returns:
        MCP serverバイナリのパス

    Raises:
        FileNotFoundError: バイナリが見つからない場合
    """
    env_path = os.environ.get("PENCIL_MCP_BINARY", "")
    if env_path and os.path.isfile(env_path):
        return env_path

    path_binary = shutil.which("mcp-server-linux-x64")
    if path_binary:
        return path_binary

    raise FileNotFoundError(
        "MCP server binary not found. "
        "Set PENCIL_MCP_BINARY environment variable or add mcp-server-linux-x64 to PATH."
    )


def start_mcp_http_server(mcp_binary: str, port: int) -> subprocess.Popen:
    """MCP HTTP serverをバックグラウンドで起動する。

    --app desktopフラグにより、起動中のPencil AppのWebSocket Serverに接続する。

    Args:
        mcp_binary: MCP serverバイナリのパス
        port: HTTPポート番号

    Returns:
        起動したプロセス
    """
    proc = subprocess.Popen(
        [mcp_binary, "--app", "desktop", "--http", "--http-port", str(port)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )
    time.sleep(2)
    if proc.poll() is not None:
        stderr = proc.stderr.read().decode()
        raise RuntimeError(f"MCP server failed to start: {stderr}")
    return proc


def mcp_request(endpoint: str, method: str, params: dict | None = None,
                req_id: int | None = None, session_id: str | None = None) -> tuple[dict | None, str | None]:
    """MCP HTTP serverにJSON-RPCリクエストを送信する。

    Args:
        endpoint: MCP HTTPエンドポイントURL
        method: JSON-RPCメソッド名
        params: リクエストパラメータ
        req_id: リクエストID（通知の場合はNone）
        session_id: MCPセッションID

    Returns:
        (レスポンスボディ, セッションID) のタプル
    """
    payload: dict = {"jsonrpc": "2.0", "method": method}
    if params:
        payload["params"] = params
    if req_id is not None:
        payload["id"] = req_id

    headers = {"Content-Type": "application/json"}
    if session_id:
        headers["Mcp-Session-Id"] = session_id

    resp = requests.post(endpoint, json=payload, headers=headers, timeout=30)

    new_session_id = resp.headers.get("Mcp-Session-Id", session_id)

    if resp.status_code == 202 or not resp.content:
        return None, new_session_id

    return resp.json(), new_session_id


def export_screenshot(node_id: str, output_path: str,
                      mcp_binary: str = "", port: int = 18083) -> bool:
    """現在開かれているドキュメントの指定ノードのスクリーンショットをPNGファイルとして保存する。

    呼び出し前にClaude CodeのMCP経由でopen_documentが実行され、
    対象ドキュメントがPencil Appで開かれている必要がある。

    Args:
        node_id: スクリーンショット対象のノードID
        output_path: 出力PNGファイルパス
        mcp_binary: MCP serverバイナリのパス（省略時は自動検出）
        port: HTTPポート番号

    Returns:
        成功した場合True
    """
    if not mcp_binary:
        mcp_binary = find_mcp_binary()

    endpoint = f"http://localhost:{port}/mcp"
    proc = None

    try:
        # 1. MCP HTTP server起動（Pencil AppのWebSocketに接続）
        print(f"Starting MCP HTTP server on port {port}...")
        proc = start_mcp_http_server(mcp_binary, port)
        print("MCP HTTP server started")

        # 2. Initialize
        print("Initializing MCP session...")
        init_resp, session_id = mcp_request(
            endpoint, "initialize",
            params={
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "pencil-screenshot-export", "version": "1.0.0"}
            },
            req_id=1
        )
        print(f"Session ID: {session_id}")

        # 3. Initialized notification
        mcp_request(endpoint, "notifications/initialized", session_id=session_id)

        # 4. get_screenshot（現在開かれているドキュメントに対して実行）
        print(f"Getting screenshot for node: {node_id}...")
        screenshot_resp, _ = mcp_request(
            endpoint, "tools/call",
            params={"name": "get_screenshot", "arguments": {"nodeId": node_id}},
            req_id=2,
            session_id=session_id
        )

        if not screenshot_resp:
            print("Error: Empty response from get_screenshot")
            return False

        # 5. レスポンスから画像データを抽出
        if "error" in screenshot_resp:
            print(f"Error: {json.dumps(screenshot_resp['error'], indent=2)}")
            return False

        content = screenshot_resp.get("result", {}).get("content", [])
        for item in content:
            if item.get("type") == "image":
                mime_type = item.get("mimeType", "unknown")
                b64_data = item.get("data", "")
                print(f"Image found: mimeType={mime_type}, base64 length={len(b64_data)}")

                # 6. base64デコードしてPNG保存
                image_bytes = base64.b64decode(b64_data)
                os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
                with open(output_path, "wb") as f:
                    f.write(image_bytes)
                print(f"PNG saved: {output_path} ({len(image_bytes)} bytes)")
                return True
            elif item.get("type") == "text":
                print(f"Text content: {item.get('text', '')[:200]}")

        print("No image content found in response")
        print(f"Response content types: {[item.get('type') for item in content]}")
        return False

    except Exception as e:
        print(f"Error: {e}")
        return False
    finally:
        if proc:
            proc.terminate()
            try:
                proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                proc.kill()
            print("MCP HTTP server stopped")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(
        description="Export Pencil screenshot as PNG",
        epilog="前提条件:\n"
               "  呼び出し前にClaude CodeのMCP経由でopen_documentを実行し、\n"
               "  対象ドキュメントがPencil Appで開かれている必要がある。\n"
               "  ノードIDはget_editor_state等で事前に取得すること。\n",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("node_id", help="Node ID to screenshot")
    parser.add_argument("output", help="Output PNG file path")
    parser.add_argument("--port", type=int, default=18083, help="HTTP port (default: 18083)")
    parser.add_argument("--mcp-binary", default="", help="MCP server binary path")
    args = parser.parse_args()

    success = export_screenshot(
        args.node_id, args.output,
        mcp_binary=args.mcp_binary,
        port=args.port
    )
    sys.exit(0 if success else 1)
