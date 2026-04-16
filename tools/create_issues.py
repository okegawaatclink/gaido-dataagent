#!/usr/bin/env python3
"""
GitHub Issue一括作成ツール

skillsで生成されたEpic/PBI/Task形式のIssueをGitHubリポジトリに一括登録します。

使用方法:
    python3 tools/create_issues.py <リポジトリURL> <JSONファイル> [オプション]

引数:
    repo_url    対象リポジトリのURL
    json_file   Issue定義JSONファイルのパス

オプション:
    --yes, -y   確認プロンプトをスキップする
    --dry-run   実際には作成せず、作成内容を表示する

例:
    # 基本的な使い方
    python3 tools/create_issues.py \\
        https://github.com/TS3-SE4/my-project \\
        issues.json

    # 確認プロンプトをスキップ
    python3 tools/create_issues.py \\
        https://github.com/TS3-SE4/my-project \\
        issues.json --yes

    # ドライラン（作成内容の確認のみ）
    python3 tools/create_issues.py \\
        https://github.com/TS3-SE4/my-project \\
        issues.json --dry-run

必要な環境変数:
    - GITHUB_TOKEN: GitHub Personal Access Token (Fine-grained)
      - Issues: Read and write が必要

JSONファイル形式:
    [
      {
        "title": "Epic 1: ユーザーが安全にログインできる",
        "body": "## ユーザーストーリー\\n\\n...",
        "labels": ["epic"]
      },
      {
        "title": "PBI 1.1: ログインできる",
        "body": "## 親Epic\\n\\n#1\\n\\n...",
        "labels": ["pbi"]
      },
      {
        "title": "Task 1.1.1: DBスキーマを作成する",
        "body": "## 親PBI\\n\\n#2\\n\\n...",
        "labels": ["task"]
      }
    ]

注意:
    - ラベルが存在しない場合は自動的に作成されます
    - Issue番号は作成順に割り当てられます
    - JSONファイル内のIssue参照（#番号）は事前に正しく設定してください
"""

import argparse
import json
import os
import re
import subprocess
import sys
from typing import Any

# ラベルのデフォルト色定義
LABEL_COLORS: dict[str, str] = {
    "epic": "0052CC",
    "pbi": "00CC52",
    "task": "CC5200",
    "spike": "FF6B6B",
    "test-case": "8B5CF6",
}


def get_env_var(name: str) -> str:
    """
    環境変数を取得する。

    指定された環境変数の値を取得し、未設定の場合はエラーメッセージを表示して
    プログラムを終了する。

    Args:
        name: 取得する環境変数の名前

    Returns:
        str: 環境変数の値

    Raises:
        SystemExit: 環境変数が未設定の場合
    """
    value = os.environ.get(name)
    if not value:
        print(f"エラー: 環境変数 {name} が設定されていません", file=sys.stderr)
        sys.exit(1)
    return value


def parse_repo_url(url: str) -> tuple[str, str]:
    """
    リポジトリURLからowner/repoを抽出する。

    GitHub リポジトリの URL を解析し、オーナー名とリポジトリ名を抽出する。
    無効な URL の場合はエラーメッセージを表示してプログラムを終了する。

    Args:
        url: GitHub リポジトリの URL (例: https://github.com/owner/repo)

    Returns:
        tuple[str, str]: (オーナー名, リポジトリ名) のタプル

    Raises:
        SystemExit: 無効な URL の場合
    """
    match = re.match(r"https://github\.com/([^/]+)/([^/]+?)(?:\.git)?$", url)
    if not match:
        print(f"エラー: 無効なリポジトリURL: {url}", file=sys.stderr)
        sys.exit(1)
    return match.group(1), match.group(2)


def run_command(
    cmd: list[str],
    env: dict[str, str] | None = None,
    capture: bool = True,
    check: bool = True,
) -> subprocess.CompletedProcess:
    """
    コマンドを実行する。

    指定されたコマンドをサブプロセスとして実行し、結果を返す。
    check=True の場合、コマンドが失敗するとエラーメッセージを表示して終了する。

    Args:
        cmd: 実行するコマンドとその引数のリスト
        env: 追加の環境変数（既存の環境変数にマージされる）
        capture: True の場合、stdout/stderr をキャプチャする
        check: True の場合、コマンド失敗時にプログラムを終了する

    Returns:
        subprocess.CompletedProcess: コマンドの実行結果

    Raises:
        SystemExit: check=True でコマンドが失敗した場合
    """
    merged_env = os.environ.copy()
    if env:
        merged_env.update(env)

    result = subprocess.run(
        cmd,
        capture_output=capture,
        text=True,
        env=merged_env,
    )

    if check and result.returncode != 0:
        print(f"エラー: コマンド実行に失敗しました", file=sys.stderr)
        print(f"コマンド: {' '.join(cmd)}", file=sys.stderr)
        if result.stderr:
            print(f"stderr: {result.stderr}", file=sys.stderr)
        sys.exit(1)

    return result


def run_gh_command(
    args: list[str],
    token: str,
    check: bool = True,
) -> subprocess.CompletedProcess:
    """
    ghコマンドを実行する。

    GitHub CLI (gh) コマンドを指定されたトークンで実行する。

    Args:
        args: gh コマンドに渡す引数のリスト
        token: GitHub Personal Access Token
        check: True の場合、コマンド失敗時にプログラムを終了する

    Returns:
        subprocess.CompletedProcess: コマンドの実行結果
    """
    return run_command(["gh"] + args, env={"GH_TOKEN": token}, check=check)


def check_repo_exists(owner: str, repo: str, token: str) -> bool:
    """
    リポジトリが存在するか確認する。

    指定されたリポジトリが GitHub 上に存在するかどうかを確認する。

    Args:
        owner: リポジトリのオーナー名
        repo: リポジトリ名
        token: GitHub Personal Access Token

    Returns:
        bool: リポジトリが存在する場合は True、存在しない場合は False
    """
    result = run_gh_command(
        ["repo", "view", f"{owner}/{repo}"],
        token,
        check=False,
    )
    return result.returncode == 0


def load_issues_from_json(json_file: str) -> list[dict[str, Any]]:
    """
    JSONファイルからIssue定義を読み込む。

    Args:
        json_file: JSONファイルのパス

    Returns:
        list[dict[str, Any]]: Issue定義のリスト

    Raises:
        SystemExit: ファイルが存在しない、または不正なJSON形式の場合
    """
    if not os.path.exists(json_file):
        print(f"エラー: ファイルが見つかりません: {json_file}", file=sys.stderr)
        sys.exit(1)

    try:
        with open(json_file, "r", encoding="utf-8") as f:
            issues = json.load(f)
    except json.JSONDecodeError as e:
        print(f"エラー: JSONの解析に失敗しました: {e}", file=sys.stderr)
        sys.exit(1)

    if not isinstance(issues, list):
        print("エラー: JSONはIssueの配列である必要があります", file=sys.stderr)
        sys.exit(1)

    return issues


def validate_issues(issues: list[dict[str, Any]]) -> list[str]:
    """
    Issue定義を検証する。

    Args:
        issues: Issue定義のリスト

    Returns:
        list[str]: エラーメッセージのリスト（エラーがない場合は空）
    """
    errors = []
    for i, issue in enumerate(issues):
        if not isinstance(issue, dict):
            errors.append(f"Issue {i + 1}: オブジェクトである必要があります")
            continue

        if "title" not in issue or not issue["title"]:
            errors.append(f"Issue {i + 1}: titleが必要です")

        if "body" not in issue:
            errors.append(f"Issue {i + 1}: bodyが必要です")

        if "labels" in issue and not isinstance(issue["labels"], list):
            errors.append(f"Issue {i + 1}: labelsは配列である必要があります")

    return errors


def ensure_labels_exist(
    owner: str,
    repo: str,
    labels: set[str],
    token: str,
) -> None:
    """
    ラベルが存在することを確認し、存在しない場合は作成する。

    Args:
        owner: リポジトリのオーナー名
        repo: リポジトリ名
        labels: 確認するラベルのセット
        token: GitHub Personal Access Token
    """
    print("\n=== ラベルの確認 ===")

    for label in sorted(labels):
        color = LABEL_COLORS.get(label, "CCCCCC")
        result = run_gh_command(
            [
                "label",
                "create",
                label,
                "-R",
                f"{owner}/{repo}",
                "--color",
                color,
            ],
            token,
            check=False,
        )

        if result.returncode == 0:
            print(f"  作成: {label}")
        else:
            print(f"  確認済み: {label}")


def create_issue(
    owner: str,
    repo: str,
    title: str,
    body: str,
    labels: list[str],
    token: str,
) -> int | None:
    """
    GitHub Issueを作成する。

    Args:
        owner: リポジトリのオーナー名
        repo: リポジトリ名
        title: Issueのタイトル
        body: Issueの本文
        labels: ラベルのリスト
        token: GitHub Personal Access Token

    Returns:
        int | None: 作成されたIssue番号、失敗した場合はNone
    """
    cmd = [
        "issue",
        "create",
        "-R",
        f"{owner}/{repo}",
        "--title",
        title,
        "--body",
        body,
    ]

    for label in labels:
        cmd.extend(["--label", label])

    result = run_gh_command(cmd, token, check=False)

    if result.returncode != 0:
        return None

    # URLからIssue番号を抽出
    url = result.stdout.strip()
    match = re.search(r"/issues/(\d+)", url)
    if match:
        return int(match.group(1))
    return None


def create_issues(
    owner: str,
    repo: str,
    issues: list[dict[str, Any]],
    token: str,
    dry_run: bool = False,
) -> list[tuple[int, str]]:
    """
    複数のIssueを作成する。

    Args:
        owner: リポジトリのオーナー名
        repo: リポジトリ名
        issues: Issue定義のリスト
        token: GitHub Personal Access Token
        dry_run: Trueの場合、実際には作成せず内容を表示のみ

    Returns:
        list[tuple[int, str]]: 作成されたIssueの(番号, タイトル)リスト
    """
    print(f"\n=== Issue作成 ({len(issues)}件) ===")

    created = []
    for i, issue in enumerate(issues, 1):
        title = issue["title"]
        body = issue.get("body", "")
        labels = issue.get("labels", [])

        print(f"\n[{i}/{len(issues)}] {title}")
        print(f"  ラベル: {', '.join(labels) if labels else '(なし)'}")

        if dry_run:
            print("  -> (ドライラン: スキップ)")
            created.append((0, title))
            continue

        issue_number = create_issue(owner, repo, title, body, labels, token)

        if issue_number:
            print(f"  -> Issue #{issue_number} 作成完了")
            created.append((issue_number, title))
        else:
            print(f"  -> エラー: 作成に失敗しました")

    return created


def main() -> None:
    """
    メイン処理を実行する。

    コマンドライン引数を解析し、JSONファイルからIssueを読み込んで
    GitHubリポジトリに一括登録する。
    """
    parser = argparse.ArgumentParser(
        description="GitHub Issue一括作成ツール（skillsで生成されたIssueを登録）"
    )
    parser.add_argument(
        "repo_url",
        help="対象リポジトリのURL (例: https://github.com/TS3-SE4/my-project)",
    )
    parser.add_argument(
        "json_file",
        help="Issue定義JSONファイルのパス",
    )
    parser.add_argument(
        "--yes",
        "-y",
        action="store_true",
        help="確認プロンプトをスキップする",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="実際には作成せず、作成内容を表示する",
    )

    args = parser.parse_args()

    token = get_env_var("GITHUB_TOKEN")

    owner, repo = parse_repo_url(args.repo_url)

    # JSONファイルを読み込み
    issues = load_issues_from_json(args.json_file)

    # 検証
    errors = validate_issues(issues)
    if errors:
        print("エラー: Issue定義に問題があります:", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        sys.exit(1)

    # 全ラベルを収集
    all_labels: set[str] = set()
    for issue in issues:
        all_labels.update(issue.get("labels", []))

    # 概要表示
    print("=" * 60)
    print("GitHub Issue一括作成ツール")
    print("=" * 60)
    print(f"対象リポジトリ: {owner}/{repo}")
    print(f"JSONファイル: {args.json_file}")
    print(f"Issue数: {len(issues)}件")
    print(f"ラベル: {', '.join(sorted(all_labels)) if all_labels else '(なし)'}")
    if args.dry_run:
        print("\n*** ドライランモード: 実際には作成しません ***")
    print()

    # Issue一覧を表示
    print("作成するIssue:")
    for i, issue in enumerate(issues, 1):
        labels_str = f" [{', '.join(issue.get('labels', []))}]" if issue.get("labels") else ""
        print(f"  {i}. {issue['title']}{labels_str}")
    print()

    if not args.yes and not args.dry_run:
        confirm = input("続行しますか? (yes/no): ")
        if confirm.lower() != "yes":
            print("キャンセルしました")
            sys.exit(0)

    # リポジトリの存在確認
    if not args.dry_run:
        print(f"\n=== リポジトリの確認 ===")
        if not check_repo_exists(owner, repo, token):
            print(
                f"エラー: リポジトリが見つかりません: {owner}/{repo}",
                file=sys.stderr,
            )
            sys.exit(1)
        print(f"リポジトリを確認しました: {owner}/{repo}")

        # ラベルの確認・作成
        if all_labels:
            ensure_labels_exist(owner, repo, all_labels, token)

    # Issue作成
    created = create_issues(owner, repo, issues, token, args.dry_run)

    # 結果表示
    print()
    print("=" * 60)
    if args.dry_run:
        print("ドライラン完了")
    else:
        print("完了しました")
    print("=" * 60)
    print(f"作成したIssue: {len(created)}件")

    if created and not args.dry_run:
        print("\n作成されたIssue:")
        for number, title in created:
            print(f"  #{number}: {title}")

    print(f"\nリポジトリ: https://github.com/{owner}/{repo}/issues")


if __name__ == "__main__":
    main()
