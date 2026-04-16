# 専門家定義

このディレクトリには、多視点分析に参加する専門家の定義が格納されています。

---

## ディレクトリ構成

```
05_experts/
├─ README.md          ← このファイル
├─ core/              ← 常に参加する専門家
│   ├─ po.md
│   ├─ architect.md
│   ├─ qa.md
│   └─ security.md
└─ optional/          ← 案件タイプで選択する専門家
    └─ data_architect.md
```

---

## 専門家一覧

### Core（常に参加）

| ファイル | 専門家 | 役割 |
|----------|--------|------|
| `po.md` | PO（プロダクトオーナー） | 価値最大化、優先順決定、YAGNI |
| `architect.md` | Architect（アーキテクト） | 技術設計、構造決定、拡張性 |
| `qa.md` | QA（品質保証） | DoD策定、狩野モデル、テスト戦略 |
| `security.md` | Security（セキュリティ） | 脅威モデリング、STRIDE、データ保護 |

### Optional（案件タイプで選択）

| ファイル | 専門家 | 追加条件 |
|----------|--------|----------|
| `data_architect.md` | Data Architect（データアーキテクト） | data_pipeline パターン時 |

---

## 使い方

### 基本（全Core専門家が参加）

`10_project/context.md` で以下を指定：

```yaml
experts:
  core: all
```

### Optional専門家を追加

```yaml
experts:
  core: all
  optional:
    - data_architect
```

### 特定のCore専門家のみ（非推奨）

```yaml
experts:
  core:
    - po
    - architect
  optional: []
```

---

## 専門家の拡張

新しい専門家を追加する場合：

1. `core/` または `optional/` に新しいmdファイルを作成
2. 既存の専門家ファイルと同じ形式で記述
3. この README.md を更新

### 拡張例

```
optional/
├─ data_architect.md
├─ ml_engineer.md        ← NEW: 機械学習案件用
├─ devops.md             ← NEW: インフラ案件用
└─ ux_designer.md        ← NEW: UX重視案件用
```

---

## 専門家ファイルのテンプレート

```markdown
# {役割名}（{英語名}）

## 役割
{この専門家が担う責務の説明}

## 思考スタイル
- {思考の特徴1}
- {思考の特徴2}
- ...

## 重視する観点
- {観点1}
- {観点2}
- ...

## 分析時の問いかけ例
- 「{質問1}」
- 「{質問2}」
- ...

## 階層別の関心事
| 階層 | 主な関心 |
|------|---------|
| Epic | {Epicでの関心事} |
| PBI | {PBIでの関心事} |
| Task | {Taskでの関心事} |
```

---

**End of README.md**
