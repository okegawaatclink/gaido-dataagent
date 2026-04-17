/**
 * DataAgent ルートコンポーネント
 *
 * アプリケーション全体のレイアウトを定義する最上位コンポーネント。
 *
 * レイアウト構成（screens.md ワイヤーフレーム準拠）:
 * - Header: DataAgentロゴ + 新しい会話ボタン
 * - Content:
 *   - Sidebar（左 250px）: 検索ボックス + 履歴一覧
 *   - Main（残り幅）: ChatContainer
 *
 * PBI #13 更新（Epic 4 - 履歴管理）:
 * - useHistory フックで会話一覧を管理（GET /api/history）
 * - useChat の conversationId と Sidebar の activeConversationId を連携
 * - 会話選択時に GET /api/history/:id でメッセージを復元
 * - 会話削除後に履歴リフレッシュ + 削除した会話がアクティブならクリア
 * - チャット送信後（SSE done イベント後）に履歴自動リフレッシュ
 */

import { useCallback, useEffect, useRef, type FC } from 'react'
import ChatContainer from './components/Chat/ChatContainer'
import Sidebar from './components/Sidebar/Sidebar'
import { useChat } from './hooks/useChat'
import { useHistory } from './hooks/useHistory'

/**
 * DataAgent アプリケーション ルートコンポーネント
 *
 * ヘッダー + サイドバー + チャットエリアの3カラムレイアウトを構成する。
 * useChat と useHistory を統合し、会話選択・削除・リフレッシュを管理する。
 */
const App: FC = () => {
  // チャット状態（メッセージ、ローディング、conversationId）
  const {
    messages,
    isLoading,
    conversationId,
    send,
    clearMessages,
    restoreConversation,
  } = useChat()

  // 会話履歴（一覧取得・リフレッシュ）
  const {
    conversations,
    isLoading: historyLoading,
    error: historyError,
    refreshHistory,
    loadConversation,
  } = useHistory()

  /**
   * 前回の isLoading 値を保持するref
   * isLoading が true → false に変わった（送信完了）タイミングを検出するために使用
   */
  const prevIsLoadingRef = useRef<boolean>(false)

  /**
   * チャット送信完了後に履歴を自動リフレッシュする
   *
   * isLoading が true → false に変化したとき（done イベント受信後）に
   * refreshHistory を呼び出して会話一覧を最新化する。
   * これにより、新しく作成された会話がサイドバーに即座に表示される。
   */
  useEffect(() => {
    // isLoading が true → false に変化したとき（送信完了）
    if (prevIsLoadingRef.current && !isLoading) {
      // 送信完了: 履歴をリフレッシュ（新しい会話がサイドバーに表示される）
      refreshHistory()
    }
    prevIsLoadingRef.current = isLoading
  }, [isLoading, refreshHistory])

  /**
   * 新しい会話を開始する
   *
   * useChat.clearMessages() で現在の会話メッセージと conversationId をリセットする。
   * 履歴はサイドバーに残る（削除しない）。
   */
  const handleNewChat = useCallback(() => {
    clearMessages()
  }, [clearMessages])

  /**
   * 会話を選択して復元する
   *
   * GET /api/history/:id でメッセージを取得し、チャットエリアに表示する。
   * restoreConversation() ラッパー経由で messages と conversationId を一括設定することで、
   * useChat の内部 setState（React.Dispatch）を App.tsx に露出させない。
   * 会話が見つからない場合（404）はアラートを表示する。
   *
   * @param id - 選択する会話のID
   */
  const handleSelectConversation = useCallback(async (id: string) => {
    try {
      const loadedMessages = await loadConversation(id)
      // restoreConversation() で messages と conversationId を一括設定する
      // （React.Dispatch を直接呼ぶ代わりに専用ラッパーを使用）
      restoreConversation(id, loadedMessages)
    } catch (err) {
      const message = err instanceof Error ? err.message : '会話の取得に失敗しました'
      if (message === '会話が見つかりません') {
        alert('会話が見つかりません。履歴から削除された可能性があります。')
        refreshHistory()
      } else {
        alert(`会話の読み込みに失敗しました: ${message}`)
      }
    }
  }, [loadConversation, restoreConversation, refreshHistory])

  /**
   * 履歴リフレッシュコールバック（Sidebar の onHistoryRefresh）
   *
   * 削除後にアクティブ会話が一覧から消えたかどうかの判定は、
   * refreshHistory() 完了後に conversations が更新されるため、
   * 下記の useEffect（conversations 変化時）で行う。
   * この関数では単純に履歴一覧を最新化するだけでよく、
   * deletedId パラメータは不要。
   */
  const handleHistoryRefresh = useCallback(() => {
    refreshHistory()
  }, [refreshHistory])

  /**
   * 会話一覧が更新された後、アクティブ会話が存在しなくなった場合はクリア
   * conversations は useHistory からの依存値
   */
  useEffect(() => {
    if (conversationId && conversations.length > 0) {
      const stillExists = conversations.some((c) => c.id === conversationId)
      if (!stillExists) {
        // 現在の会話が削除されたためクリア
        clearMessages()
      }
    }
  }, [conversations, conversationId, clearMessages])

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
        <Sidebar
          conversations={conversations}
          isLoading={historyLoading}
          historyError={historyError}
          activeConversationId={conversationId}
          onNewChat={handleNewChat}
          onSelectConversation={handleSelectConversation}
          onHistoryRefresh={handleHistoryRefresh}
        />

        {/* チャットメインエリア */}
        <main className="app-main" role="main" aria-label="チャットエリア">
          <ChatContainer
            messages={messages}
            isLoading={isLoading}
            onSend={send}
          />
        </main>
      </div>
    </div>
  )
}

export default App
