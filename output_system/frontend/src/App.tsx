/**
 * DataAgent ルートコンポーネント
 *
 * アプリケーション全体のレイアウトを定義する最上位コンポーネント。
 *
 * レイアウト構成（screens.md ワイヤーフレーム準拠）:
 * - Header: DataAgentロゴ + DB選択ドロップダウン + 管理ボタン + 新しい会話ボタン
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
 *
 * PBI #148 更新（DB接続先管理UI）:
 * - ヘッダーに「管理」ボタンを追加（DB管理モーダルを開く）
 * - DbManagementModal コンポーネントを統合
 * - isDbModalOpen state でモーダルの開閉を管理
 *
 * PBI #149 更新（自然言語SQL生成・実行）:
 * - ヘッダーに DB接続先選択ドロップダウンを追加
 * - selectedDbConnectionId state で選択中のDB接続先IDを管理
 * - send() に dbConnectionId を渡すよう ChatContainer の onSend を更新
 * - 接続先が未選択の場合はチャット入力を無効化
 *
 * PBI #151 更新（DB別会話履歴管理）:
 * - useHistory に selectedDbConnectionId を渡してDB別フィルタリングを有効化
 * - DB切替時に useHistory の dbConnectionId が変わり自動で履歴がリフレッシュされる
 * - DB切替時にチャットエリアをクリアして前DBの会話が残らないようにする
 * - App.tsx 完了条件 (Task 4.1.4):
 *   - ヘッダー + サイドバー + メインエリアの3カラムレイアウト ✓
 *   - DB選択→サイドバー更新→チャット表示のフロー ✓
 *   - 全コンポーネント間の状態連携 ✓
 *
 * PBI #152 更新（初回起動ガイド）:
 * - DB接続先が0件の場合にチャット画面の代わりに WelcomeGuide を表示
 * - DB接続先が1件以上ある場合は通常のチャット画面を表示
 * - WelcomeGuide の「DB接続先を登録する」ボタンで DB 管理モーダルを開く
 * - DB登録してモーダルを閉じると connections が更新され、自動的にチャット画面に遷移する
 */

import { useState, useCallback, useEffect, useRef, type FC } from 'react'
import ChatContainer from './components/Chat/ChatContainer'
import Sidebar from './components/Sidebar/Sidebar'
import DbManagementModal from './components/DbManagement/DbManagementModal'
import WelcomeGuide from './components/Welcome/WelcomeGuide'
import { useChat } from './hooks/useChat'
import { useHistory } from './hooks/useHistory'
import { useDbConnections } from './hooks/useDbConnections'

/**
 * DataAgent アプリケーション ルートコンポーネント
 *
 * ヘッダー + サイドバー + チャットエリアの3カラムレイアウトを構成する。
 * useChat と useHistory を統合し、会話選択・削除・リフレッシュを管理する。
 * useDbConnections でDB接続先一覧を管理し、選択中のDB接続先をチャットに渡す。
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

  // DB接続先一覧（PBI #149 追加: 選択中DB接続先の管理）
  const { connections, fetchConnections } = useDbConnections()

  // DB管理モーダルの開閉状態（PBI #148 追加）
  const [isDbModalOpen, setIsDbModalOpen] = useState(false)

  /**
   * 選択中のDB接続先ID（PBI #149 追加）
   *
   * チャット送信時にバックエンドへ渡し、スキーマ取得・クエリ実行先を指定する。
   * null = 未選択（チャット入力が無効）
   *
   * PBI #151: useHistory に渡すことでDB別の会話履歴フィルタリングにも使用する
   */
  const [selectedDbConnectionId, setSelectedDbConnectionId] = useState<string | null>(null)

  // 会話履歴（一覧取得・リフレッシュ）
  // PBI #151: selectedDbConnectionId を渡してDB別にフィルタリングする
  // DB切替時は useHistory 内の useEffect が自動で再実行されてサイドバーが更新される
  const {
    conversations,
    isLoading: historyLoading,
    error: historyError,
    refreshHistory,
    loadConversation,
  } = useHistory(selectedDbConnectionId)

  /**
   * 前回の isLoading 値を保持するref
   * isLoading が true → false に変わった（送信完了）タイミングを検出するために使用
   */
  const prevIsLoadingRef = useRef<boolean>(false)

  /**
   * 前回の selectedDbConnectionId を保持するref
   * 初回マウント時（null → 最初のID）とDB切替（ID → 別ID）を区別するために使用
   */
  const prevDbConnectionIdRef = useRef<string | null>(null)

  /**
   * 接続先一覧が変化したとき、選択中IDが存在しない場合はデフォルト選択する
   *
   * isLastUsed = true の接続先を優先し、なければ先頭を選択する。
   * ただし既に有効な選択がある場合は変更しない。
   */
  useEffect(() => {
    if (connections.length === 0) {
      // 接続先がなくなった場合は選択解除
      setSelectedDbConnectionId(null)
      return
    }

    // 既に有効な選択がある場合はそのまま維持
    if (selectedDbConnectionId && connections.some((c) => c.id === selectedDbConnectionId)) {
      return
    }

    // isLastUsed = true の接続先を優先してデフォルト選択
    const lastUsed = connections.find((c) => c.isLastUsed)
    const defaultConnection = lastUsed ?? connections[0]
    setSelectedDbConnectionId(defaultConnection.id)
  }, [connections, selectedDbConnectionId])

  /**
   * DB接続先が切り替わったとき、チャットエリアをクリアする（PBI #151 追加）
   *
   * 異なるDB接続先を選択したとき（DB切替）に、現在表示中の会話をクリアする。
   * これにより、前のDBの会話が新しいDBで表示され続けることを防ぐ。
   *
   * 初回マウント時（null → 最初のID の遷移）はクリアしない（起動直後にチャットを消さない）。
   */
  useEffect(() => {
    const prevId = prevDbConnectionIdRef.current
    // prevId が null でない場合（=初回選択ではなく、DB切替の場合）にチャットをクリア
    if (prevId !== null && prevId !== selectedDbConnectionId) {
      clearMessages()
    }
    prevDbConnectionIdRef.current = selectedDbConnectionId
  }, [selectedDbConnectionId, clearMessages])

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

  /**
   * DB管理モーダルを閉じるハンドラ（PBI #149 追加: モーダル閉時に接続先一覧を再取得）
   *
   * モーダルで接続先の追加・更新・削除が行われた可能性があるため、
   * モーダルを閉じるたびに接続先一覧を再取得して最新状態に保つ。
   */
  const handleDbModalClose = useCallback(async () => {
    setIsDbModalOpen(false)
    // モーダル閉時に接続先一覧を再取得（追加・更新・削除が反映されるよう）
    await fetchConnections()
  }, [fetchConnections])

  /**
   * チャット送信ハンドラ（PBI #149 追加: dbConnectionId を含めて送信）
   *
   * ChatContainer の onSend は (message: string) のシグネチャだが、
   * useChat.send() は (message: string, dbConnectionId: string) を必要とする。
   * ここでラップして selectedDbConnectionId を注入する。
   *
   * dbConnectionId が未選択の場合は送信しない（UI側で入力を無効化済みだが念のため）。
   *
   * @param message - ユーザーが入力した質問テキスト
   */
  const handleSend = useCallback(
    async (message: string): Promise<void> => {
      if (!selectedDbConnectionId) {
        // DB接続先が未選択の場合は送信しない
        console.warn('[App] Cannot send message: no DB connection selected')
        return
      }
      await send(message, selectedDbConnectionId)
    },
    [send, selectedDbConnectionId],
  )

  return (
    <div className="app-container">
      {/* ヘッダー: DataAgentロゴ + DB接続先選択 + DB管理ボタン + 新しい会話ボタン */}
      <header className="app-header">
        <div className="app-header__left">
          {/* DataAgent ロゴ */}
          <span className="app-header__logo" aria-hidden="true">🤖</span>
          {/* PBI 1.1 受入条件: 「DataAgent」見出しが表示されること */}
          <h1 className="app-header__title">DataAgent</h1>
        </div>
        <div className="app-header__right">
          {/* DB接続先選択ドロップダウン（PBI #149 追加） */}
          {connections.length > 0 ? (
            <select
              className="app-header__db-select"
              value={selectedDbConnectionId ?? ''}
              onChange={(e) => setSelectedDbConnectionId(e.target.value || null)}
              aria-label="DB接続先を選択"
              title="チャットで使用するDB接続先を選択"
            >
              {connections.map((conn) => (
                <option key={conn.id} value={conn.id}>
                  {conn.name} ({conn.dbType})
                </option>
              ))}
            </select>
          ) : (
            /* 接続先が未登録の場合は案内テキストを表示 */
            <span className="app-header__no-db-notice" role="status">
              DB接続先を登録してください
            </span>
          )}

          {/* DB管理ボタン（PBI #148 追加: DB接続先管理モーダルを開く） */}
          <button
            className="app-header__manage-btn"
            onClick={() => setIsDbModalOpen(true)}
            type="button"
            aria-label="DB接続先を管理"
            aria-haspopup="dialog"
          >
            管理
          </button>
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

      {/* DB接続先管理モーダル（PBI #148 追加） */}
      <DbManagementModal
        isOpen={isDbModalOpen}
        onClose={handleDbModalClose}
      />

      {/*
       * メインコンテンツ領域
       *
       * PBI #152: DB接続先の件数によって表示を切り替える
       *   - 0件: WelcomeGuide（初回起動ガイド）を全幅で表示
       *   - 1件以上: サイドバー + チャットエリアの通常レイアウトを表示
       *
       * connections が更新されると React が再レンダリングし、自動的に切り替わる。
       * DB管理モーダルで接続先を登録して handleDbModalClose が呼ばれると
       * fetchConnections() で connections が更新されるため、遷移がシームレスに行われる。
       */}
      <div className="app-content">
        {connections.length === 0 ? (
          /*
           * DB接続先が0件の場合: 初回起動ガイドを表示（PBI #152）
           * WelcomeGuide 内の「DB接続先を登録する」ボタンで DB 管理モーダルを開く。
           * モーダルで接続先を登録して閉じると handleDbModalClose が呼ばれ、
           * fetchConnections() で connections が更新されてチャット画面に遷移する。
           */
          <WelcomeGuide onOpenDbModal={() => setIsDbModalOpen(true)} />
        ) : (
          /*
           * DB接続先が1件以上ある場合: 通常のチャット画面を表示
           */
          <>
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
                onSend={handleSend}
                isDbConnectionSelected={!!selectedDbConnectionId}
              />
            </main>
          </>
        )}
      </div>
    </div>
  )
}

export default App
