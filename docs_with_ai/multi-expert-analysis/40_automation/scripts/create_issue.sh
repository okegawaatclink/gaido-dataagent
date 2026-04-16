#!/bin/bash
#
# create_issue.sh - MarkdownファイルからGitHub Issueを作成
#
# Usage: ./create_issue.sh <markdown_file>
#
# 出力: 作成されたIssue番号（stdout）

set -e

# 引数チェック
if [ -z "$1" ]; then
    echo "Usage: $0 <markdown_file>" >&2
    exit 1
fi

MD_FILE="$1"

if [ ! -f "$MD_FILE" ]; then
    echo "Error: File not found: $MD_FILE" >&2
    exit 1
fi

# 設定
REPO="${GITHUB_REPO:-}"  # 環境変数または自動検出

# リポジトリ自動検出
if [ -z "$REPO" ]; then
    REPO=$(gh repo view --json nameWithOwner -q '.nameWithOwner' 2>/dev/null || echo "")
    if [ -z "$REPO" ]; then
        echo "Error: Could not detect repository. Set GITHUB_REPO environment variable." >&2
        exit 1
    fi
fi

# Markdownからタイトルを抽出（最初のH1）
TITLE=$(grep -m1 '^# ' "$MD_FILE" | sed 's/^# //')

if [ -z "$TITLE" ]; then
    echo "Error: Could not extract title from $MD_FILE" >&2
    exit 1
fi

# 階層を判定（ファイル名またはディレクトリから）
detect_level() {
    local file="$1"
    local basename=$(basename "$file" .md)
    local dirname=$(dirname "$file")

    if [[ "$basename" == epic* ]] || [[ "$dirname" == *epic* ]]; then
        echo "Epic"
    elif [[ "$basename" == pbi* ]] || [[ "$dirname" == *pbi* ]]; then
        echo "PBI"
    elif [[ "$basename" == task* ]] || [[ "$dirname" == *task* ]]; then
        echo "Task"
    else
        # デフォルトはPBI
        echo "PBI"
    fi
}

LEVEL=$(detect_level "$MD_FILE")

# Issue本文を生成
generate_body() {
    local file="$1"
    local level="$2"

    # フロントマター（もしあれば）を除去してコンテンツを取得
    local content=$(sed '/^---$/,/^---$/d' "$file" | tail -n +2)

    # 本文生成
    cat <<EOF
$content

---

📄 Source: \`$file\`
EOF
}

BODY=$(generate_body "$MD_FILE" "$LEVEL")

# ラベル存在チェック（警告のみ）
check_label() {
    local label="$1"
    if ! gh label list --repo "$REPO" --json name -q '.[].name' | grep -q "^${label}$"; then
        echo "Warning: Label '$label' not found. Creating issue without it." >&2
        return 1
    fi
    return 0
}

# Issue作成
create_issue() {
    local title="$1"
    local body="$2"
    local label="$3"

    local label_opt=""
    if check_label "$label"; then
        label_opt="--label $label"
    fi

    # Issue作成（リトライ付き）
    local max_retries=3
    local retry=0
    local issue_url=""

    while [ $retry -lt $max_retries ]; do
        issue_url=$(gh issue create \
            --repo "$REPO" \
            --title "$title" \
            --body "$body" \
            $label_opt \
            2>/dev/null) && break

        retry=$((retry + 1))
        echo "Retry $retry/$max_retries..." >&2
        sleep 2
    done

    if [ -z "$issue_url" ]; then
        echo "Error: Failed to create issue after $max_retries retries" >&2
        exit 1
    fi

    # Issue番号を抽出
    echo "$issue_url" | grep -oE '[0-9]+$'
}

# メイン処理
ISSUE_NUMBER=$(create_issue "$TITLE" "$BODY" "$LEVEL")

echo "$ISSUE_NUMBER"
