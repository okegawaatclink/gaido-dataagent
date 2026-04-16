#!/bin/bash
#
# update_parent_tasklist.sh - 親IssueのTasklistに子Issueを追加
#
# Usage: ./update_parent_tasklist.sh <parent_issue_number> <child_issue_number>
#

set -e

# 引数チェック
if [ -z "$1" ] || [ -z "$2" ]; then
    echo "Usage: $0 <parent_issue_number> <child_issue_number>" >&2
    exit 1
fi

PARENT_NUM="$1"
CHILD_NUM="$2"

# 設定
REPO="${GITHUB_REPO:-}"

# リポジトリ自動検出
if [ -z "$REPO" ]; then
    REPO=$(gh repo view --json nameWithOwner -q '.nameWithOwner' 2>/dev/null || echo "")
    if [ -z "$REPO" ]; then
        echo "Error: Could not detect repository. Set GITHUB_REPO environment variable." >&2
        exit 1
    fi
fi

# 親Issueの本文を取得
PARENT_BODY=$(gh issue view "$PARENT_NUM" --repo "$REPO" --json body -q '.body')

if [ -z "$PARENT_BODY" ]; then
    echo "Error: Could not fetch parent issue #$PARENT_NUM" >&2
    exit 1
fi

# 子Issueのタイトルを取得
CHILD_TITLE=$(gh issue view "$CHILD_NUM" --repo "$REPO" --json title -q '.title')

# Tasklistセクションを探して追加
# パターン: "## Task一覧" または "## PBI一覧" の後に追加

add_to_tasklist() {
    local body="$1"
    local child_num="$2"
    local child_title="$3"

    # 既に追加済みかチェック
    if echo "$body" | grep -q "#$child_num"; then
        echo "Child issue #$child_num already in tasklist" >&2
        echo "$body"
        return
    fi

    # Tasklistセクションを探す
    # "## Task一覧" または "## PBI一覧" の次の行に追加
    local section_pattern="^## (Task一覧|PBI一覧|子アイテム)"

    if echo "$body" | grep -qE "$section_pattern"; then
        # セクションが見つかった場合、その次の行に追加
        echo "$body" | awk -v child_num="$child_num" -v child_title="$child_title" '
            /^## (Task一覧|PBI一覧|子アイテム)/ {
                print
                print ""
                print "- [ ] #" child_num " " child_title
                next
            }
            { print }
        '
    else
        # セクションがない場合、末尾に追加
        cat <<EOF
$body

## 子アイテム

- [ ] #$child_num $child_title
EOF
    fi
}

NEW_BODY=$(add_to_tasklist "$PARENT_BODY" "$CHILD_NUM" "$CHILD_TITLE")

# 変更がある場合のみ更新
if [ "$PARENT_BODY" != "$NEW_BODY" ]; then
    # 一時ファイルに本文を保存
    TEMP_FILE=$(mktemp)
    echo "$NEW_BODY" > "$TEMP_FILE"

    # Issue更新
    gh issue edit "$PARENT_NUM" --repo "$REPO" --body-file "$TEMP_FILE"

    # 一時ファイル削除
    rm -f "$TEMP_FILE"

    echo "Updated parent issue #$PARENT_NUM with child #$CHILD_NUM"
else
    echo "No update needed for parent issue #$PARENT_NUM"
fi
