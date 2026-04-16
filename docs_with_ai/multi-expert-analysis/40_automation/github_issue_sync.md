# GitHub Issue 同期仕様

Markdown からGitHub Issueへの同期仕様を定義する。

---

## 同期方針

### 基本方針

| 項目 | 方針 |
|------|------|
| 同期方向 | Markdown → Issue（一方向） |
| 逆同期 | 行わない |
| Taskの扱い | 一時的な情報（永続化不要） |

### 理由

- Markdownをマスターデータとして扱う
- Issue側の変更追跡の複雑さを回避
- Taskは作業中のみ必要な情報

---

## 階層表現

### Sub-issues + Tasklist 方式

```
Epic (Issue)
  └── [Tasklist] PBI一覧
        ├── PBI-1 (Sub-issue)
        │     └── [Tasklist] Task一覧
        │           ├── Task-1 (Sub-issue)
        │           └── Task-2 (Sub-issue)
        └── PBI-2 (Sub-issue)
```

### Tasklist記法

```markdown
### 子アイテム

- [ ] #123  <!-- Sub-issueとして関連付け -->
- [ ] #124
```

---

## ラベル体系

### 階層ラベル

| ラベル | 色 | 説明 |
|--------|-----|------|
| `Epic` | #7057ff | Epic階層 |
| `PBI` | #0075ca | PBI階層 |
| `Task` | #008672 | Task階層 |

### ステータスラベル（オプション）

| ラベル | 色 | 説明 |
|--------|-----|------|
| `status:ready` | #0e8a16 | 着手可能 |
| `status:in-progress` | #fbca04 | 作業中 |
| `status:blocked` | #d93f0b | ブロック中 |

---

## Markdown → Issue マッピング

### Epic

| Markdown | Issue |
|----------|-------|
| タイトル（H1） | Issue タイトル |
| 目的セクション | Issue 本文 |
| スコープセクション | Issue 本文 |
| PBI一覧 | Tasklist（作成後に更新） |

### PBI

| Markdown | Issue |
|----------|-------|
| タイトル（H1） | Issue タイトル |
| 概要 | Issue 本文 |
| 受入条件 | Issue 本文 |
| 完成の定義 | Issue 本文 |
| Task一覧 | Tasklist（作成後に更新） |

### Task

| Markdown | Issue |
|----------|-------|
| タイトル（H1） | Issue タイトル |
| 作業内容 | Issue 本文 |
| 完了条件 | Issue 本文 |
| 見積もり | Issue 本文 |

---

## Issue本文テンプレート

### Epic

```markdown
## 目的

{目的セクションの内容}

## スコープ

### 含む

{含むリスト}

### 含まない

{含まないリスト}

## PBI一覧

<!-- PBI作成後に自動更新 -->

---

📄 Source: `{mdファイルパス}`
```

### PBI

```markdown
## 概要

{概要}

## 受入条件

{Given-When-Then形式の受入条件}

## 完成の定義（DoD）

{DoDリスト}

## Task一覧

<!-- Task作成後に自動更新 -->

---

📄 Source: `{mdファイルパス}`
```

### Task

```markdown
## 作業内容

{作業内容}

## 完了条件

{完了条件}

## 見積もり

{見積もり時間}

---

📄 Source: `{mdファイルパス}`
```

---

## 処理フロー

### Issue作成フロー

```
1. Markdownファイルを読み込む
2. 階層を判定（Epic/PBI/Task）
3. 適切なラベルを付与
4. Issue本文を生成
5. `gh issue create` で作成
6. Issue番号を取得
7. Markdownに番号を書き戻し
8. 親Issueがあれば Tasklist を更新
```

### 親Tasklist更新フロー

```
1. 親Issue番号と子Issue番号を受け取る
2. 親Issueの本文を取得
3. Tasklistセクションに子Issueを追加
4. `gh issue edit` で更新
```

---

## エラーハンドリング

| エラー | 対処 |
|--------|------|
| Markdown解析エラー | エラーメッセージを出力して終了 |
| Issue作成失敗 | リトライ（最大3回） |
| 親Issue未存在 | 警告を出力して継続 |
| ラベル未存在 | ラベルなしで作成、警告を出力 |

---

## 書き戻しフォーマット

Markdownへの書き戻し形式：

```markdown
---
issue_number: 123
issue_url: https://github.com/owner/repo/issues/123
created_at: 2024-01-15T10:30:00Z
---

# タイトル
...
```

---

**End of github_issue_sync.md**
