# 参考資料フォーマット

分析で参照した資料の記載フォーマット。

---

## 記載形式

### 外部URL

```markdown
- [タイトル](URL) - 概要説明
```

### 書籍

```markdown
- 『書籍名』著者名, 出版社, 出版年 - 参照箇所
```

### 社内ドキュメント

```markdown
- [ドキュメント名](相対パスまたはリンク) - 概要
```

### API/技術ドキュメント

```markdown
- [APIドキュメント名](URL) - バージョン: X.X
```

---

## テンプレート

```markdown
## 参考資料

### 技術ドキュメント

- [資料名](URL) - 概要

### 設計参考

- [資料名](URL) - 概要

### 社内資料

- [資料名](パス) - 概要

### その他

- 参照元の説明
```

---

## 記入例

```markdown
## 参考資料

### 技術ドキュメント

- [React公式ドキュメント](https://react.dev/) - Hooks APIリファレンス
- [TypeScript Handbook](https://www.typescriptlang.org/docs/) - ジェネリクス
- [PostgreSQL Documentation](https://www.postgresql.org/docs/15/) - JSON関数

### 設計参考

- [Martin Fowler - Strangler Fig Pattern](https://martinfowler.com/bliki/StranglerFigApplication.html) - 移行戦略
- [Microsoft - Cloud Design Patterns](https://docs.microsoft.com/en-us/azure/architecture/patterns/) - Circuit Breaker

### 社内資料

- [API設計ガイドライン](./docs/api-guidelines.md) - RESTful設計規約
- [認証基盤仕様書](./docs/auth-spec.md) - OAuth2.0フロー

### 書籍

- 『Clean Architecture』Robert C. Martin, KADOKAWA, 2018 - 第22章 クリーンアーキテクチャ
- 『データ指向アプリケーションデザイン』Martin Kleppmann, O'Reilly, 2019 - 第7章 トランザクション
```

---

## 注意事項

- URLは可能な限り永続的なリンクを使用する
- バージョン依存の情報は、参照したバージョンを明記する
- 社内資料は相対パスで記載し、外部公開時に注意する
- 参照日が重要な場合は `(参照: YYYY-MM-DD)` を追記

---

**End of reference_format.md**
