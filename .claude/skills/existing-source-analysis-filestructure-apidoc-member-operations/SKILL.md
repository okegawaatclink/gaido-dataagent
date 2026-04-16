---
name: existing-source-analysis-filestructure-apidoc-member-operations
description: ソースコメント付与のメンバー手順。1ファイルを受け取り、コメント・ドキュメントを追加する。
user-invocable: false
---

# メンバー手順: ソースファイルコメント付与

あなたはチームメンバーです。指定された1ファイルにコメント・ドキュメントを追加してください。

## 共通ルール

- すべての出力（コメント、ドキュメント）は**日本語**で記述する。英語禁止。コード例・変数名・型名はそのまま
- すべてのコメントに `AUTO_GENERATED:` プレフィックスを付ける
- **既存コメントの内容は一切変更・削除しない**（既存コメントはAIコメントより正確）
- コメントは新しい行に追加する（既存コードの末尾ではなく）
- コードから自明でない「Why」を重視するが、関数ドキュメントは「What」も含む（引数・返り値の説明は必須）
- **コメント付与率100%が目標。すべての公開関数・メソッドにドキュメントコメントを付けること。例外なし**

## 処理手順

### 1. ファイルを読み込む

指定されたファイルをReadツールで読み込む。

### 2. 処理内コメント追加

関数やメソッドの内部に、処理の要所ごとにコメントを追加する。大局的な処理構造・なぜそういう処理になったのかを重視する。

### 3. 関数・メソッドドキュメント追加（最重要）

**すべての公開関数・メソッドに、言語ごとの標準ドキュメント構文でコメントを付けること。例外なし。**

既存コメントの状態に応じて対応を分ける:

**ケースA: ドキュメントコメントが全くない関数**
→ `AUTO_GENERATED:` プレフィックス付きでフルのドキュメントコメントを追加する

**ケースB: 既存コメントはあるが、`@param`/`@returns` 等のフォーマットが欠けている関数**
→ 既存コメントはそのまま残し、`AUTO_GENERATED:` プレフィックス付きで `@param`/`@returns` を**補完する**

**ケースC: 既存コメントに `@param`/`@returns` も含めて十分なドキュメントがある関数**
→ 追加しない

記載必須項目:
- 処理の概要（1〜2文）
- 引数ごとの型・内容の概要・サンプル値
- 返り値の型・内容の概要・サンプル値

### 4. クラス・ファイル単位ドキュメント追加

ファイルの先頭に、そのファイル・クラスが行っている処理の概要と使われ方をドキュメントコメントとして追加する。

### 5. 完了報告

チームリードに処理結果を報告する。

## コメント書式ルール（厳守）

**`AUTO_GENERATED:` はコメントブロック1つにつき先頭行に1回だけ付ける。`@param`/`@returns`/引数・返り値の行には付けない。**

**コメントブロックの先頭行は必ず関数・クラス・型の概要説明とする。`@param` や引数説明から始めてはならない。**

**ブロックコメントを2つ並べられない言語（Python等）のケースBでは、既存ブロックコメント末尾に空行2つを追加し、その中に `AUTO_GENERATED:` から始まるコメントを追記する。**

### TypeScript — 必ず `/** */` ブロックコメントを使用すること

**`//` 行コメントは禁止。TypeDocが認識しないため。**

ケースA（コメントなし → フルのTSDocを追加）:
```typescript
/**
 * AUTO_GENERATED: セッションを新規作成し、WebSocket経由でサーバーに登録する。
 * @param title - セッションのタイトル（例: "新しいチャット"）
 * @param agentRoleId - 使用するエージェントロールのID（例: "role-abc-123"）
 * @returns 作成されたセッションのメタデータ（SessionMeta型、id・title・createdAtを含む）
 */
function createSession(title: string, agentRoleId: string): SessionMeta {
```

ケースB（既存コメントはあるが@paramがない → 補完）:
```typescript
/** Formats the date for display */
/**
 * AUTO_GENERATED: 日付を表示用の文字列に変換する。
 * ロケールに応じたフォーマットでDate型またはISO文字列を人間可読な形式に変換する。
 * @param date - フォーマット対象の日付。Date型またはISO 8601文字列（例: new Date('2026-01-01')）
 * @param locale - ロケール文字列（例: 'ja-JP'）。省略時は 'ja-JP'
 * @returns フォーマット済み文字列（例: '2026年1月1日'）
 */
function formatDate(date: Date | string, locale?: string): string {
```

**NG例（絶対に使わないこと）:**
```typescript
// AUTO_GENERATED: セッション管理フック ← TypeDocが無視する。禁止！
// @param sessionId - セッションID ← TypeDocが無視する。禁止！

/**
 * AUTO_GENERATED: @param date - ... ← 概要説明なしでいきなり@paramから始めている。禁止！
 * AUTO_GENERATED: @returns ... ← AUTO_GENERATED:が複数行にある。禁止！
 */
```

### Go — `//` 行コメントまたは `/* */` ブロックコメントを使用

GoDocの標準形式に従う。

ケースA（コメントなし → フルのGoDocを追加）:
```go
// AUTO_GENERATED: Start はAIエージェントプロセスを起動し、Sessionを返す。
// プロセスはコンテキストがキャンセルされるかCloseが呼ばれるまで生存する。
//
// 引数:
//   - ctx: コンテキスト（キャンセルでプロセス終了）
//   - opts: 起動オプション（WorkDir: 作業ディレクトリ（例: "/workspace"）、SessionID: セッションID（例: "sess-abc-123"））
//
// 返り値:
//   - Session: エージェントセッション（メッセージ送受信・権限応答に使用）
//   - error: 起動失敗時のエラー（プロセス起動失敗、バイナリ不在等）
func Start(ctx context.Context, opts Options) (Session, error) {
```

ケースB（既存コメントはあるが引数説明がない → 補完）:
```go
// handleConnection manages WebSocket connections
//
// AUTO_GENERATED: クライアントからのWebSocket接続を受け付け、メッセージの読み書きループを開始する。
// Hubに登録後、goroutineでメッセージ読み取りループを開始し、切断時にHubから登録解除する。
// 引数:
//   - conn: WebSocket接続オブジェクト。クライアントからの接続確立時にhttp.Handlerから渡される
//   - hub: メッセージブロードキャスト用のHub。全接続のライフサイクルを管理する
// 返り値: エラー時はWebSocketのCloseMessageを送信してnilを返す
func handleConnection(conn *websocket.Conn, hub *Hub) {
```

### Python — docstring `"""..."""` を使用

ケースA（docstringなし → フルのdocstringを追加）:
```python
def create_session(title: str, agent_role_id: str) -> SessionMeta:
    """AUTO_GENERATED: セッションを新規作成し、サーバーに登録する。

    Args:
        title: セッションのタイトル（例: "新しいチャット"）
        agent_role_id: 使用するエージェントロールのID（例: "role-abc-123"）

    Returns:
        作成されたセッションのメタデータ（id・title・createdAtを含む）
    """
```

ケースB（docstringはあるがArgs/Returnsがない → 既存docstring内に追記）:

Pythonはdocstringを1関数に2つ並べられない（2つ目はドキュメントツールが認識しない）。そのため、既存docstringの末尾に空行2つを追加し、その中にAUTO_GENERATED:ブロックを追記する。

```python
def process_data(raw_data: bytes, encoding: str = "utf-8") -> dict:
    """Process raw data into structured format.


    AUTO_GENERATED: バイナリデータを指定エンコーディングでパースし、構造化された辞書に変換する。

    Args:
        raw_data: 処理対象のバイナリデータ（例: b'{"key": "value"}'）
        encoding: エンコーディング（例: "utf-8"）。省略時は "utf-8"

    Returns:
        パース済みの辞書（例: {"key": "value"}）
    """
```
