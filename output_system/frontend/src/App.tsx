/**
 * DataAgent ルートコンポーネント
 *
 * アプリケーション全体のレイアウトを定義する最上位コンポーネント。
 *
 * レイアウト構成（screens.md ワイヤーフレーム準拠）:
 * - Header: DataAgentロゴ + 新しい会話ボタン
 * - Content:
 *   - Sidebar（左 250px）: 検索ボックス + 履歴一覧プレースホルダー
 *   - Main（残り幅）: ChatContainer
 */

import { useCallback, type FC } from 'react'
import ChatContainer from './components/Chat/ChatContainer'
import Sidebar from './components/Sidebar/Sidebar'

/**
 * DataAgent アプリケーション ルートコンポーネント
 *
 * ヘッダー + サイドバー + チャットエリアの3カラムレイアウトを構成する。
 * 新しい会話ボタンは将来的に会話リセット処理に接続する（Epic 4）。
 */
const App: FC = () => {
  /**
   * 新しい会話ボタンのクリックハンドラ
   * Epic 4 で会話リセット + 履歴保存を実装する
   * 現時点ではページリロードで会話をリセットする
   */
  const handleNewChat = useCallback(() => {
    // TODO: Epic 4 で useChat.clearMessages() + 履歴API保存を実装
    window.location.reload()
  }, [])

  return (
    <div className="app-container">
      {/* ヘッダー: DataAgentロゴ + 新しい会話ボタン */}
      <header className="app-header">
        <div className="app-header__left">
          {/* DataAgent ロゴ */}
          <span className="app-header__logo" aria-hidden="true">🤖</span>
          {/* PBI 1.1 受入条件: 「DataAgent」見出しが表示されること */}
          <h1 className="app-header__title">DataAgent</h1>
        </div>
        <div className="app-header__right">
          {/* 新しい会話ボタン */}
          <button
            className="app-header__new-chat-btn"
            onClick={handleNewChat}
            type="button"
            aria-label="新しい会話を開始"
          >
            ＋ 新しい会話
          </button>
        </div>
      </header>

      {/* メインコンテンツ領域（サイドバー + チャットエリア） */}
      <div className="app-content">
        {/* 左サイドバー（幅250px・screens.md準拠） */}
        <Sidebar onNewChat={handleNewChat} />

        {/* チャットメインエリア */}
        <main className="app-main" role="main" aria-label="チャットエリア">
          <ChatContainer />
        </main>
      </div>
    </div>
  )
}

export default App
