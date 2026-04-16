#!/usr/bin/env python3
"""GitHub Tasklist構築スクリプト.

Epic/PBI/Task Issueの親子関係（Tasklist）をGitHub Issue上に構築する。

Usage:
    python3 build_tasklist.py [--dry-run]

前提:
    - ai_generated/issues.json: Epic/PBI/Task定義
    - ai_generated/issue_numbers.json: ID→Issue番号マッピング
    - gh CLI がインストール・認証済み
"""

import argparse
import json
import re
import subprocess
import sys
from collections import defaultdict
from typing import Any


def load_json(path: str) -> Any:
    """JSONファイルを読み込む.

    Args:
        path: JSONファイルのパス

    Returns:
        パース済みのJSONデータ
    """
    with open(path, "r") as f:
        return json.load(f)


def build_relationships(issues: list[dict]) -> tuple[dict[str, list[str]], dict[str, list[str]]]:
    """Epic→PBI、PBI→Taskの親子関係を構築する.

    Args:
        issues: Issue定義のリスト

    Returns:
        (epic_to_pbis, pbi_to_tasks) のタプル
    """
    epic_to_pbis: dict[str, list[str]] = defaultdict(list)
    pbi_to_tasks: dict[str, list[str]] = defaultdict(list)

    for issue in issues:
        if issue["type"] == "pbi":
            epic_to_pbis[issue["parent_id"]].append(issue["id"])
        elif issue["type"] == "task":
            pbi_to_tasks[issue["parent_id"]].append(issue["id"])

    return dict(epic_to_pbis), dict(pbi_to_tasks)


def get_issue_body(issue_number: int) -> str:
    """GitHub Issueの本文を取得する.

    Args:
        issue_number: Issue番号

    Returns:
        Issue本文
    """
    result = subprocess.run(
        ["gh", "issue", "view", str(issue_number), "--json", "body", "-q", ".body"],
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def update_issue_body(issue_number: int, new_body: str) -> None:
    """GitHub Issueの本文を更新する.

    Args:
        issue_number: Issue番号
        new_body: 新しい本文
    """
    subprocess.run(
        ["gh", "issue", "edit", str(issue_number), "--body", new_body],
    )


def replace_or_append_section(
    body: str, section_title: str, new_content: str
) -> str:
    """既存セクションを置換、または末尾に追記する.

    Args:
        body: Issue本文
        section_title: セクションタイトル（例: "含まれるPBI"）
        new_content: セクション配下に設定する新しい内容

    Returns:
        更新後のIssue本文
    """
    pattern = rf"(## {re.escape(section_title)}\n).*?(?=\n## |\Z)"
    if re.search(pattern, body, re.DOTALL):
        return re.sub(pattern, rf"\1{new_content}", body, count=1, flags=re.DOTALL)
    return body + f"\n\n## {section_title}\n{new_content}"


def add_tasklist(
    parent_id_to_children: dict[str, list[str]],
    id_to_number: dict[str, int],
    section_title: str,
    dry_run: bool = False,
) -> None:
    """親Issueに子IssueのTasklistを追加する.

    Args:
        parent_id_to_children: 親ID→子IDリストのマッピング
        id_to_number: ID→Issue番号のマッピング
        section_title: Tasklistセクションのタイトル（例: "含まれるPBI"）
        dry_run: Trueの場合、実際の更新を行わない
    """
    for parent_id, child_ids in parent_id_to_children.items():
        parent_number = id_to_number[parent_id]

        # Tasklist構築
        tasklist_content = ""
        for child_id in child_ids:
            child_number = id_to_number[child_id]
            tasklist_content += f"- [ ] #{child_number}\n"

        if dry_run:
            print(f"  #{parent_number}: {section_title} に {len(child_ids)}件追加予定")
            for child_id in child_ids:
                print(f"    - #{id_to_number[child_id]}")
        else:
            body = get_issue_body(parent_number)
            new_body = replace_or_append_section(body, section_title, tasklist_content)
            update_issue_body(parent_number, new_body)
            print(f"  #{parent_number}: {section_title} 追加完了 ({len(child_ids)}件)")


def resolve_dependencies(
    issues: list[dict],
    id_to_number: dict[str, int],
    dry_run: bool = False,
) -> None:
    """PBI Issueの依存関係セクションのPBI参照をIssue番号に解決する.

    PBI Issue本文の「## 依存関係」セクション内の「PBI X.Y」形式の参照を
    「#Issue番号」形式に置換する。

    Args:
        issues: Issue定義のリスト
        id_to_number: ID→Issue番号のマッピング
        dry_run: Trueの場合、実際の更新を行わない
    """
    # PBI番号文字列 → Issue番号のマッピングを構築
    pbi_ref_to_number: dict[str, int] = {}
    for issue in issues:
        if issue["type"] == "pbi":
            match = re.match(r"(PBI \d+\.\d+):", issue["title"])
            if match:
                pbi_ref_to_number[match.group(1)] = id_to_number[issue["id"]]

    # 各PBI Issueの依存関係セクション内を更新
    for issue in issues:
        if issue["type"] != "pbi":
            continue
        number = id_to_number[issue["id"]]
        body = get_issue_body(number)

        # 「## 依存関係」セクションを抽出して置換
        dep_match = re.search(
            r"(## 依存関係\n)(.+?)(?=\n## |\Z)", body, re.DOTALL
        )
        if not dep_match:
            continue

        dep_section = dep_match.group(2)
        new_dep_section = dep_section
        for pbi_ref, issue_num in pbi_ref_to_number.items():
            if pbi_ref in new_dep_section and f"#{issue_num}" not in new_dep_section:
                new_dep_section = new_dep_section.replace(pbi_ref, f"#{issue_num}")

        updated = dep_section != new_dep_section

        if updated:
            new_body = body.replace(dep_section, new_dep_section)
            if dry_run:
                print(f"  #{number}: 依存関係を解決予定")
            else:
                update_issue_body(number, new_body)
                print(f"  #{number}: 依存関係を解決完了")


def main() -> None:
    """メイン処理."""
    parser = argparse.ArgumentParser(description="GitHub Tasklist構築スクリプト")
    parser.add_argument("--dry-run", action="store_true", help="実際の更新を行わない")
    args = parser.parse_args()

    # データ読み込み
    try:
        issues = load_json("ai_generated/issues.json")
        id_to_number = load_json("ai_generated/issue_numbers.json")
    except FileNotFoundError as e:
        print(f"エラー: {e}", file=sys.stderr)
        print("Issue登録（Register）を先に実行してください。", file=sys.stderr)
        sys.exit(1)

    # 親子関係を構築
    epic_to_pbis, pbi_to_tasks = build_relationships(issues)

    if args.dry_run:
        print("*** ドライランモード: 実際には更新しません ***\n")

    # Epic → PBI
    print("Epic IssueにPBI Tasklistを追加:")
    add_tasklist(epic_to_pbis, id_to_number, "含まれるPBI", args.dry_run)

    # PBI → Task
    print("\nPBI IssueにTask Tasklistを追加:")
    add_tasklist(pbi_to_tasks, id_to_number, "タスク", args.dry_run)

    # 依存関係のIssue番号解決
    print("\nPBI Issueの依存関係を解決:")
    resolve_dependencies(issues, id_to_number, args.dry_run)

    print("\n完了")


if __name__ == "__main__":
    main()
