/**
 * DataAgent ルートコンポーネント
 *
 * アプリケーション全体のレイアウトを定義する最上位コンポーネント。
 * 後続PBIで機能コンポーネント（チャット、グラフ、サイドバー等）をここに追加する。
 */
function App() {
  return (
    <div className="app-container">
      {/* アプリケーションヘッダー */}
      <header className="app-header">
        {/* PBI 1.1 受入条件: 「DataAgent」見出しが表示されること */}
        <h1>DataAgent</h1>
        <p className="app-subtitle">自然言語でデータベースに問い合わせ、グラフで可視化するシステム</p>
      </header>

      {/* メインコンテンツ領域（後続PBIで機能を実装） */}
      <main className="app-main">
        <div className="placeholder-content">
          <p>チャット機能は後続のPBIで実装予定です。</p>
        </div>
      </main>
    </div>
  )
}

export default App
