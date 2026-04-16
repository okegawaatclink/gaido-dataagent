# HANDOVER作成手順

## 概要

PBI実装完了後、プロジェクト累積知識（HANDOVER.md）とPBI Issueへの構造化引き継ぎコメントを作成・更新します。

## 1. HANDOVER.md の更新（静的・累積）

`ai_generated/HANDOVER.md` を更新する（200行以内）:

```markdown
# HANDOVER

## 技術スタック
- 言語/フレームワーク: (例: Next.js 15 App Router, TypeScript)
- DB: (例: PostgreSQL + Prisma)
- テスト: (例: Vitest + Playwright)

## ディレクトリ構成
(output_system/ 配下のtree形式で主要ファイルのみ)

## ビルド・起動方法
(docker compose up 等のコマンド)

## 設計判断
(採用した方針と却下した選択肢の理由。次PBIが同じ失敗を繰り返さないために重要)
- [判断]: [採用理由]。[却下した選択肢]は[却下理由]のため不採用

## はまりポイント
(環境固有のトラップのみ)
- [問題]: [解決方法]

## 実装済み機能
- PBI #N: [概要]
```

## 2. PBI Issueへの引き継ぎコメント投稿（動的・PBI単位）

自分のPBI Issueに以下の構造化コメントを投稿する。
`<!-- HANDOVER-NOTE -->` マーカーは必須（後続PBIが読み取る際の識別に使用）:

```bash
gh issue comment <pbi_number> --body "$(cat <<'HANDOVER_EOF'
<!-- HANDOVER-NOTE -->
# PBI #N 引き継ぎノート

## やったこと
- [実装内容と進捗]

## 主な変更ファイル
- [ファイルパス]: [変更概要]

## 使ったパターン・参考にすべきファイル
- [パターン]: [ファイルパス]

## 設計判断・捨てた選択肢
- [採用した方針]: [理由]
- [試して不採用にしたこと]: [理由]

## 後続（依存元）PBIへの注意点
- [注意点]
HANDOVER_EOF
)"
```

## 完了後

HANDOVER作成後、メインのフローに戻り、サマリ返却を行う。
