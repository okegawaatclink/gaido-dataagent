# 実装の振り返り（problems.md） - 複数DB接続先管理機能拡張フェーズ

## 概要

| 項目 | 値 |
|------|-----|
| プロジェクト名 | DataAgent |
| 記録項目数 | 4件 |
| 記録日 | 2026-04-17 |

## 一覧

| # | 項目名 | 苦労度 | 深刻度 | 原因カテゴリ | 影響範囲 |
|---|--------|--------|--------|-------------|---------|
| 1 | Dockerfile内のNode.jsモジュール管理の複雑性 | ★★★☆☆ | ★★★☆☆ | テンプレート不足 | ルール改善で予防可能 |
| 2 | Express + SSE（Server-Sent Events）の実装パターン | ★★★☆☆ | ★★☆☆☆ | テンプレート不足 | Output System固有 |
| 3 | Playwright E2Eテストの非同期処理とストリーミング対応 | ★★★★☆ | ★★★☆☆ | テンプレート不足 | Output System固有 |
| 4 | SQLiteでの会話コンテキスト管理（会話履歴の構造化） | ★★☆☆☆ | ★★☆☆☆ | ルール不足 | ルール改善で予防可能 |

## 各項目の詳細

### 1. Dockerfile内のNode.jsモジュール管理の複雑性

- **苦労度**: ★★★☆☆（3/5）
- **深刻度**: ★★★☆☆（3/5）
- **原因カテゴリ**: テンプレート不足
- **影響範囲**: ルール改善で予防可能

#### 何が起きたか

DataAgentはフロントエンド（React）とバックエンド（Node.js/Express）を同じコンテナ内で実行する構成だが、Dockerfileでの `npm install` をどのタイミングで、どのディレクトリで実行するかが不明確だった。

- `output_system/package.json` はワークスペース定義なのか？
- `output_system/frontend/` と `output_system/backend/` で独立した `package.json` を持つべきか？
- `npm run build:frontend && npm run build:backend` のようなスクリプトをどこに定義するか？

初期実装ではDockerfileで `RUN npm install` を一度だけ実行しており、その後 `npm run start:all` でfrontend・backendの両方を起動する設計だったが、package-lock.jsonの同期やビルド成果物の配置が曖昧だった。

#### 原因

CLAUDE.mdの「Docker設定」セクションには基本的なDockerfile記述方法のみ記載があり、**複数パッケージマネージャ/複数ディレクトリ構成での具体的な実装パターン（monorepo構成）**がテンプレート化されていなかった。

#### どう解決したか

最終的には以下の構成を採用した：

1. `output_system/` をworkspaceルートとし、`package.json` でworkspace定義
2. Dockerfile内で `npm install --workspaces` を実行
3. `output_system/package.json` に `start:all` スクリプトを定義
4. `npm run start:all` でfrontend devサーバー（:5173）とbackendサーバー（:3002）を並行起動

```bash
# output_system/package.json
{
  "scripts": {
    "start:all": "npm run start --workspaces",
    "build": "npm run build --workspaces"
  },
  "workspaces": ["frontend", "backend"]
}
```

#### 改善提案

| 項目 | 内容 |
|------|------|
| 対象ファイル | `.claude/rules/constraints.md` |
| 変更種別 | 既存修正（Docker設定セクション拡張） |

**具体的な変更内容:**

以下のセクションを「## Docker設定」の後に追加する:

> ### monorepo（複数パッケージマネージャ）構成でのDockerfile実装パターン
>
> frontend + backendのような複数ディレクトリで `package.json` を分けている場合、以下のパターンで対応する。
>
> **1. npm workspacesを使う場合**
>
> ルートの `output_system/package.json` で workspace定義：
>
> ```json
> {
>   "workspaces": ["frontend", "backend"],
>   "scripts": {
>     "start:all": "npm run start --workspaces",
>     "build": "npm run build --workspaces"
>   }
> }
> ```
>
> Dockerfile:
>
> ```dockerfile
> COPY output_system/package*.json ./
> COPY output_system/frontend/package*.json ./frontend/
> COPY output_system/backend/package*.json ./backend/
> RUN npm install --workspaces
>
> # start:allスクリプトで並行起動
> CMD npm run start:all
> ```
>
> **2. 独立したビルドプロセスが必要な場合**
>
> 各ディレクトリで独立して `npm install` + `npm run build` を実行し、成果物をまとめる：
>
> ```dockerfile
> # Backend build
> WORKDIR /app/backend
> COPY output_system/backend/package*.json ./
> RUN npm install
> RUN npm run build
>
> # Frontend build
> WORKDIR /app/frontend
> COPY output_system/frontend/package*.json ./
> RUN npm install
> RUN npm run build
>
> # Runtime
> WORKDIR /app
> COPY output_system/package.json ./
> RUN npm install --production
> CMD npm run start:all
> ```
>
> **注意**: ビルドステージを分ける場合は multi-stage build (FROM ... AS builder) で最終イメージサイズを削減する。

---

### 2. Express + SSE（Server-Sent Events）の実装パターン

- **苦労度**: ★★★☆☆（3/5）
- **深刻度**: ★★☆☆☆（2/5）
- **原因カテゴリ**: テンプレート不足
- **影響範囲**: Output System固有

#### 何が起きたか

DataAgentの `/api/chat` エンドポイントは Server-Sent Events (SSE) で複数のイベントをストリーミングする必要があった：
- conversation（会話ID）
- message（テキスト応答のチャンク）
- sql（生成されたSQL）
- chart_type（グラフ種類）
- result（クエリ結果）
- analysis（AI分析コメント）
- error（エラー）
- done（完了）

初期実装では以下の問題が発生した：

1. Express.jsでSSEを送信する際、`res.write()` で複数回データを送信するが、フロントエンド側でイベント受信のタイミングが不規則
2. Claude API の streaming (for await...of) と Express の SSE の組み合わせでデータが重複・欠落する
3. エラーハンドリング（途中でエラーが発生した場合）でクライアント側での処理が複雑になる

#### 原因

SSEの実装パターンがNode.js/Express固有で、テンプレートが用意されていなかった。RFC 7231、MDN Web Docsを参照してレスポンスヘッダやイベント形式の正確な仕様を確認する必要があった。

#### どう解決したか

最終的な実装：

```typescript
// backend/src/routes/chat.ts
router.post('/chat', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const sendEvent = (eventType: string, data: any) => {
    res.write(`event: ${eventType}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const conversationId = req.body.conversationId || generateUUID();
    sendEvent('conversation', { id: conversationId });

    // SQL生成（ストリーミング）
    let fullSql = '';
    const stream = await llm.generateSQL(req.body.message, context);
    
    for await (const chunk of stream) {
      fullSql += chunk.text;
      sendEvent('message', { content: chunk.text });
    }

    sendEvent('sql', { sql: fullSql });

    // SQL実行
    const result = await db.execute(fullSql);
    sendEvent('result', result);

    // AI分析
    for await (const chunk of llm.analyzeResult(result)) {
      sendEvent('analysis', { content: chunk.text });
    }

    sendEvent('done', { success: true });
  } catch (error) {
    sendEvent('error', { message: error.message });
  } finally {
    res.end();
  }
});
```

フロントエンド側：

```typescript
// frontend/src/services/chatService.ts
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message })
});

const reader = response.body!.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const text = decoder.decode(value);
  const lines = text.split('\n\n');

  for (const line of lines) {
    if (!line) continue;
    
    const eventMatch = line.match(/event: (.+)/);
    const dataMatch = line.match(/data: (.+)/);

    if (eventMatch && dataMatch) {
      const eventType = eventMatch[1];
      const eventData = JSON.parse(dataMatch[1]);

      switch (eventType) {
        case 'conversation':
          setConversationId(eventData.id);
          break;
        case 'message':
          appendToMessage(eventData.content);
          break;
        case 'sql':
          setGeneratedSql(eventData.sql);
          break;
        // ... 他のイベント処理
      }
    }
  }
}
```

#### 改善提案

| 項目 | 内容 |
|------|------|
| 対象ファイル | `.claude/skills/develop-operations/references/` (新規ファイル) |
| 変更種別 | 新規追加 |

**具体的な変更内容:**

新規ファイル `.claude/skills/develop-operations/references/sse-streaming-patterns.md` を作成し、以下の内容を含める：

> # Express.js + Server-Sent Events (SSE) 実装パターン
>
> データのストリーミング（SQL生成、LLM応答など）が必要な場合の実装例。
>
> ## 基本的なSSE実装
>
> ### サーバー側（Express）
>
> ```typescript
> import express from 'express';
>
> const app = express();
>
> app.post('/api/stream', async (req, res) => {
>   // SSEヘッダ設定
>   res.setHeader('Content-Type', 'text/event-stream');
>   res.setHeader('Cache-Control', 'no-cache');
>   res.setHeader('Connection', 'keep-alive');
>   res.setHeader('Access-Control-Allow-Origin', '*');
>
>   // イベント送信ヘルパー関数
>   const sendEvent = (eventType: string, data: any) => {
>     res.write(`event: ${eventType}\n`);
>     res.write(`data: ${JSON.stringify(data)}\n\n`);
>   };
>
>   try {
>     // 例: 複数のイベントを順番に送信
>     sendEvent('start', { message: '処理開始' });
>
>     // LLMストリーミング処理
>     for await (const chunk of llmStream) {
>       sendEvent('chunk', { content: chunk });
>     }
>
>     // 完了通知
>     sendEvent('done', { success: true });
>   } catch (error) {
>     sendEvent('error', { message: error.message });
>   } finally {
>     res.end();
>   }
> });
> ```
>
> ### クライアント側（React）
>
> ```typescript
> const handleStream = async () => {
>   const response = await fetch('/api/stream', {
>     method: 'POST',
>     headers: { 'Content-Type': 'application/json' },
>     body: JSON.stringify({ /* payload */ })
>   });
>
>   if (!response.body) throw new Error('No response body');
>
>   const reader = response.body.getReader();
>   const decoder = new TextDecoder();
>   let buffer = '';
>
>   try {
>     while (true) {
>       const { done, value } = await reader.read();
>       if (done) break;
>
>       buffer += decoder.decode(value);
>       const lines = buffer.split('\n\n');
>       buffer = lines.pop() || '';
>
>       for (const line of lines) {
>         if (!line) continue;
>
>         const eventMatch = line.match(/event: (.+)/);
>         const dataMatch = line.match(/data: (.+)/);
>
>         if (eventMatch && dataMatch) {
>           const eventType = eventMatch[1];
>           const eventData = JSON.parse(dataMatch[1]);
>           handleEvent(eventType, eventData);
>         }
>       }
>     }
>   } finally {
>     reader.releaseLock();
>   }
> };
> ```

---

### 3. Playwright E2Eテストの非同期処理とストリーミング対応

- **苦労度**: ★★★★☆（4/5）
- **深刻度**: ★★★☆☆（3/5）
- **原因カテゴリ**: テンプレート不足
- **影響範囲**: Output System固有

#### 何が起きたか

DataAgentのチャット機能のE2Eテストを書く際、以下の課題が発生した：

1. **ストリーミング応答の待機が困難**: チャットメッセージを送信すると複数のSSEイベント（message, sql, result, analysis等）が非同期に到達する。テストで「すべてのイベントが到達したことを確認する」のが難しい
2. **非同期待機のタイムアウト**: `page.waitForSelector()` や `page.waitForNavigation()` では、ストリーミングデータの完了待機ができない
3. **グラフレンダリング確認**: Rechartsによるグラフが非同期でDOMに追加されるが、タイミングが不規則

具体例：
```typescript
// 初期実装（失敗）
test('チャット送信', async ({ page }) => {
  await page.fill('input[placeholder="質問"]', '今月の売上は？');
  await page.click('button:has-text("送信")');

  // ここでどう待つ？
  // await page.waitForSelector('[data-testid="result"]'); // すぐに現れない

  const result = await page.textContent('[data-testid="result"]');
  expect(result).toBeTruthy();
});
```

#### 原因

PlaywrightのE2Eテストは同期的なナビゲーション・DOM更新を想定した設計。SSEによるストリーミングレスポンスは**イベント駆動**であり、**通常のDOM更新と異なるタイミング**で発生する。Playwrightのテンプレートには、このようなストリーミング対応の実装例がなかった。

#### どう解決したか

最終実装では以下の工夫を施した：

```typescript
// test/e2e/chat.spec.ts
test('チャット送信とストリーミング応答', async ({ page }) => {
  await page.goto('http://localhost:3001');

  // チャット入力
  const input = page.locator('input[placeholder="質問を入力"]');
  await input.fill('今月の売上トップ10を教えて');
  await page.click('button:has-text("送信")');

  // ストリーミング完了を待機（タイムアウト30秒）
  // 最後のイベント（'done'）が送信されるまで待機
  const doneSignal = page.evaluate(() => {
    return new Promise<void>((resolve) => {
      window.__streamingDone = false;
      const originalFetch = window.fetch;
      window.fetch = async (...args) => {
        const response = await originalFetch.apply(window, args);
        if (response.headers.get('content-type')?.includes('event-stream')) {
          const reader = response.body!.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const text = new TextDecoder().decode(value);
            if (text.includes('event: done')) {
              window.__streamingDone = true;
              resolve();
              break;
            }
          }
        }
        return response;
      };
    });
  });

  await Promise.race([
    doneSignal,
    page.waitForTimeout(30000)
  ]);

  // 結果確認
  const message = page.locator('[data-testid="assistant-message"]').last();
  await expect(message).toBeVisible();

  const sql = page.locator('[data-testid="generated-sql"]');
  await expect(sql).toContainText('SELECT');

  const chart = page.locator('[data-testid="result-chart"]');
  await expect(chart).toBeVisible();
});
```

より簡単な別アプローチ（UI側でマーカー要素を使う）：

```typescript
test('チャット送信とストリーミング応答（簡易版）', async ({ page }) => {
  await page.goto('http://localhost:3001');

  // チャット送信
  await page.fill('input[placeholder="質問"]', 'test query');
  await page.click('button:has-text("送信")');

  // ストリーミング完了マーカーを待機
  // フロントエンド側で、全イベント受信後に特定のDOMマーカーを追加する設計
  const streamingDone = page.locator('[data-streaming-done="true"]');
  await expect(streamingDone).toBeVisible({ timeout: 30000 });

  // 結果検証
  const result = page.locator('[data-testid="query-result"]');
  await expect(result).toBeVisible();
});
```

#### 改善提案

| 項目 | 内容 |
|------|------|
| 対象ファイル | `.claude/skills/test-run-operations/references/` |
| 変更種別 | 新規追加 |

**具体的な変更内容:**

新規ファイル `.claude/skills/test-run-operations/references/streaming-e2e-test-patterns.md` を作成し、以下を含める：

> # Playwright E2Eテスト：ストリーミングレスポンス対応パターン
>
> Server-Sent Events (SSE) や WebSocket でリアルタイムデータを受信するアプリケーションの E2E テスト方法。
>
> ## パターン 1: UI側でマーカー要素を使う（推奨）
>
> **利点**: 実装が簡単。フロントエンド側で `[data-streaming-done="true"]` のようなマーカー要素を追加するだけ。
>
> サーバー側：
>
> ```typescript
> const sendEvent = (type: string, data: any) => {
>   res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
> };
>
> // ストリーミング完了時
> sendEvent('done', { success: true });
> ```
>
> フロントエンド側：
>
> ```typescript
> const handleSSEComplete = () => {
>   // すべてのイベント受信後、マーカー要素を追加
>   const marker = document.createElement('div');
>   marker.setAttribute('data-streaming-done', 'true');
>   document.body.appendChild(marker);
> };
> ```
>
> テスト側：
>
> ```typescript
> test('ストリーミングレスポンス待機', async ({ page }) => {
>   await page.goto('http://localhost:3001');
>   await page.click('button:has-text("送信")');
>
>   // マーカー要素の出現を待機
>   const marker = page.locator('[data-streaming-done="true"]');
>   await expect(marker).toBeVisible({ timeout: 30000 });
> });
> ```

---

### 4. SQLiteでの会話コンテキスト管理（会話履歴の構造化）

- **苦労度**: ★★☆☆☆（2/5）
- **深刻度**: ★★☆☆☆（2/5）
- **原因カテゴリ**: ルール不足
- **影響範囲**: ルール改善で予防可能

#### 何が起きたか

DataAgentはクエリ履歴をSQLiteで管理し、同一会話内の過去メッセージをLLMに渡す必要がある。初期実装では以下の問題があった：

1. 「会話」と「メッセージ」の関係が不明確。会話タイトルは誰が、どのタイミングで生成するのか？
2. 過去メッセージをLLMに渡す際、件数制限（直近10往復）や内容フィルター（SQL除外など）のルールがなかった
3. メッセージテーブルのカラム（sql, chart_type, query_result, error, analysis）の値が、どのタイミングで入力されるのか曖昧だった

#### 原因

CLAUDE.mdやrules/には、SQLiteを使った会話・メッセージ構造の詳細設計パターンが記載されていなかった。

#### どう解決したか

最終実装では以下の設計を採用：

```sql
-- conversations テーブル
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,      -- 最初のユーザーメッセージから自動生成
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- messages テーブル
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content TEXT NOT NULL,           -- ユーザー入力またはAI応答テキスト
  sql TEXT,                        -- 生成されたSQL（assistant のみ）
  chart_type TEXT,                 -- グラフ種類（assistant のみ）
  query_result TEXT,               -- クエリ結果JSON（assistant のみ）
  error TEXT,                      -- エラー内容（エラー発生時のみ）
  analysis TEXT,                   -- AI分析コメント（assistant のみ）
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

会話タイトル生成ロジック：

```typescript
// backend/src/services/historyDb.ts
async function createConversation(firstMessage: string): Promise<string> {
  const conversationId = generateUUID();
  
  // 最初のメッセージを要約してタイトル生成
  // （実際にはLLMで要約することもできるが、初期実装では単純化）
  const title = firstMessage.length > 50 
    ? firstMessage.substring(0, 50) + '...' 
    : firstMessage;

  await db.run(
    'INSERT INTO conversations (id, title) VALUES (?, ?)',
    [conversationId, title]
  );

  return conversationId;
}
```

過去メッセージをLLMに渡す際：

```typescript
async function getConversationContext(conversationId: string): Promise<MessageRole[]> {
  const messages = await db.all(
    `SELECT role, content FROM messages 
     WHERE conversation_id = ? 
     ORDER BY created_at ASC 
     LIMIT 20`,  // 直近20件（10往復）
    [conversationId]
  );

  // user/assistantの content のみを抽出
  // （sql, query_result等はLLMコンテキストに含めない）
  return messages.map(msg => ({
    role: msg.role,
    content: msg.content
  }));
}
```

#### 改善提案

| 項目 | 内容 |
|------|------|
| 対象ファイル | `.claude/rules/constraints.md` |
| 変更種別 | 既存修正（新規セクション追加） |

**具体的な変更内容:**

「## Docker設定」と同じ階層に以下を追加：

> ## SQLiteでの会話・メッセージ管理パターン
>
> LLMベースのチャットアプリで会話履歴を永続化する際のSQLite設計パターン。
>
> ### テーブル設計
>
> conversations テーブル（会話単位）：
>
> ```sql
> CREATE TABLE conversations (
>   id TEXT PRIMARY KEY,
>   title TEXT NOT NULL,                    -- タイトル（最初のメッセージから自動生成）
>   created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
>   updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
> );
> ```
>
> messages テーブル（個別メッセージ）：
>
> ```sql
> CREATE TABLE messages (
>   id TEXT PRIMARY KEY,
>   conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
>   role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
>   content TEXT NOT NULL,                  -- メッセージの本体（ユーザー/AI応答）
>   metadata TEXT,                          -- JSON: SQL, chart_type, query_result等
>   created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
> );
> ```
>
> 注：sql, chart_type, query_result, error, analysis をメタデータJSONに統約すると、スキーマ変更が容易。
>
> ### LLMへの会話コンテキスト渡し方
>
> 過去メッセージをLLMに渡す際は、以下のルールに従う：
>
> 1. **件数制限**: 直近20件（10往復程度）まで。コンテキスト消費量削減のため
> 2. **内容フィルター**: SQL、クエリ結果等の技術情報は除外。user/assistantの `content` フィールドのみ
> 3. **メタデータは別途提供**: グラフ種類やSQLは、会話コンテキストではなく「現在のクエリ結果」として別途LLMに渡す
>
> ```typescript
> // 良い例
> const context = messages.map(msg => ({
>   role: msg.role,
>   content: msg.content  // テキスト内容のみ
> }));
>
> // 悪い例（不要な情報が含まれる）
> const context = messages.map(msg => ({
>   role: msg.role,
>   content: msg.content,
>   sql: msg.metadata.sql,              // LLMに渡す必要なし
>   query_result: msg.metadata.result   // LLMに渡す必要なし
> }));
> ```

---

## まとめ

DataAgentの実装を通じて、以下のテンプレート・ルール不足が明らかになった：

1. **Docker Compose内での複数ディレクトリ・複数package.jsonの管理パターン** → 今後のmonorepo構成プロジェクトで再利用可能
2. **Express.js + SSEのストリーミング実装パターン** → Node.js/Express でのストリーミング対応が必要な他プロジェクトで活用可能
3. **Playwright E2Eテストでのストリーミングレスポンス対応** → 非同期処理が多いアプリケーションのテスト設計に応用可能
4. **SQLiteでの会話履歴管理** → LLMベースのチャットアプリ全般で応用可能な設計パターン

これらの実装パターンをCLAUDE.mdやrulesに追加することで、次の同様なプロジェクトでの開発効率が向上する。
