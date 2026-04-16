# サンプル検証マトリクステンプレート

テストサンプル（good例/bad例）の検証結果を記録するためのテンプレート。

---

## 使い方

1. bad例で検出すべき観点を定義
2. good例で検出されるべきでない条件を定義
3. 検証を実行し結果を記録
4. 検出率を計算して品質を判定

---

## テンプレート

### bad例の検証

```markdown
| サンプルファイル | 検出すべき観点ID | 検出結果 | 検出率 | 許容誤検知率 |
|-----------------|-----------------|----------|--------|-------------|
| samples/bad/sample-1.{ext} | ID-001, ID-002 | | | < 20% |
| samples/bad/sample-2.{ext} | ID-003, ID-004 | | | < 20% |
| samples/bad/sample-3.{ext} | ID-005 | | | < 20% |
```

### good例の検証

```markdown
| サンプルファイル | 検証方法 | 結果 |
|-----------------|---------|------|
| samples/good/sample-1.{ext} | error/warning が0件 | |
| samples/good/sample-2.{ext} | 重大な指摘がない | |
```

---

## 観点ID定義

```markdown
## 検出観点一覧

| ID | 観点 | 重要度 | 説明 |
|----|------|--------|------|
| ID-001 | | High/Med/Low | |
| ID-002 | | | |
| ID-003 | | | |
```

---

## 合格基準

| 指標 | 基準 |
|------|------|
| bad例の検出率 | ≥ 80% |
| good例の誤検知 | 0件（error/warning） |
| 許容誤検知率 | < 20%（info/hint レベル） |

---

## 記入例

### 観点定義

```markdown
## 検出観点一覧：コードレビュー

| ID | 観点 | 重要度 | 説明 |
|----|------|--------|------|
| ID-001 | SQLインジェクション | High | 文字列結合によるSQL構築 |
| ID-002 | ハードコード秘密情報 | High | APIキー、パスワードの直書き |
| ID-003 | 未使用変数 | Low | 宣言後使用されない変数 |
| ID-004 | 長すぎる関数 | Med | 100行超の関数 |
| ID-005 | マジックナンバー | Low | 意味不明な数値リテラル |
```

### bad例の検証結果

```markdown
| サンプルファイル | 検出すべき観点ID | 検出結果 | 検出率 | 許容誤検知率 |
|-----------------|-----------------|----------|--------|-------------|
| samples/bad/sql-injection.py | ID-001 | ○ 検出 | 100% | < 20% |
| samples/bad/hardcoded-key.py | ID-002 | ○ 検出 | 100% | < 20% |
| samples/bad/unused-vars.py | ID-003, ID-005 | △ ID-003のみ | 50% | < 20% |
| samples/bad/long-function.py | ID-004 | ○ 検出 | 100% | < 20% |
```

### good例の検証結果

```markdown
| サンプルファイル | 検証方法 | 結果 |
|-----------------|---------|------|
| samples/good/clean-code.py | error/warning が0件 | ○ Pass |
| samples/good/well-structured.py | 重大な指摘がない | ○ Pass |
```

---

## 自動検証スクリプト例

```bash
#!/bin/bash
# サンプル検証実行

echo "=== bad例の検証 ==="
for file in samples/bad/*.py; do
  echo "Checking: $file"
  # 検証ツール実行
  result=$(your-linter "$file" 2>&1)
  # 期待観点の検出率を計算
  # ...
done

echo "=== good例の検証 ==="
for file in samples/good/*.py; do
  echo "Checking: $file"
  result=$(your-linter "$file" 2>&1)
  # error/warning が0件であることを確認
  if echo "$result" | grep -q "error\|warning"; then
    echo "FAIL: $file"
  else
    echo "PASS: $file"
  fi
done
```

---

**End of sample_verification.md**
