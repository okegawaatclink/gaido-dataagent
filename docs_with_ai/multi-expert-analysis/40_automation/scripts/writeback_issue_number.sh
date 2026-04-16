#!/bin/bash
#
# writeback_issue_number.sh - Issue番号をMarkdownファイルに書き戻す
#
# Usage: ./writeback_issue_number.sh <markdown_file> <issue_number>
#

set -e

# 引数チェック
if [ -z "$1" ] || [ -z "$2" ]; then
    echo "Usage: $0 <markdown_file> <issue_number>" >&2
    exit 1
fi

MD_FILE="$1"
ISSUE_NUM="$2"

if [ ! -f "$MD_FILE" ]; then
    echo "Error: File not found: $MD_FILE" >&2
    exit 1
fi

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

# Issue URLを構築
ISSUE_URL="https://github.com/$REPO/issues/$ISSUE_NUM"

# 現在時刻
CREATED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# フロントマターが既に存在するかチェック
has_frontmatter() {
    head -1 "$1" | grep -q '^---$'
}

# フロントマターを追加/更新
update_frontmatter() {
    local file="$1"
    local issue_num="$2"
    local issue_url="$3"
    local created_at="$4"

    local temp_file=$(mktemp)

    if has_frontmatter "$file"; then
        # 既存のフロントマターを更新
        awk -v issue_num="$issue_num" -v issue_url="$issue_url" -v created_at="$created_at" '
            BEGIN { in_frontmatter = 0; frontmatter_done = 0 }
            /^---$/ && !in_frontmatter {
                in_frontmatter = 1
                print
                next
            }
            /^---$/ && in_frontmatter {
                # フロントマター終了前にissue情報を追加/更新
                if (!frontmatter_done) {
                    print "issue_number: " issue_num
                    print "issue_url: " issue_url
                    print "synced_at: " created_at
                    frontmatter_done = 1
                }
                in_frontmatter = 0
                print
                next
            }
            in_frontmatter && /^issue_number:/ { next }  # 既存のissue_numberを削除
            in_frontmatter && /^issue_url:/ { next }     # 既存のissue_urlを削除
            in_frontmatter && /^synced_at:/ { next }     # 既存のsynced_atを削除
            in_frontmatter && /^created_at:/ { next }    # 既存のcreated_atを削除
            { print }
        ' "$file" > "$temp_file"
    else
        # 新規にフロントマターを追加
        cat <<EOF > "$temp_file"
---
issue_number: $issue_num
issue_url: $issue_url
synced_at: $created_at
---

EOF
        cat "$file" >> "$temp_file"
    fi

    # 元ファイルを更新
    mv "$temp_file" "$file"
}

# メイン処理
update_frontmatter "$MD_FILE" "$ISSUE_NUM" "$ISSUE_URL" "$CREATED_AT"

echo "Updated $MD_FILE with issue #$ISSUE_NUM"
