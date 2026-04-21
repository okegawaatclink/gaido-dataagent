/**
 * DbManagementModal コンポーネント
 *
 * DB接続先管理モーダルのルートコンポーネント。
 * 接続先一覧（DbConnectionList）と登録・編集フォーム（DbConnectionForm）の
 * 表示切り替えを管理する。
 *
 * 機能:
 * - モーダルダイアログ（オーバーレイ + 中央配置）
 * - ヘッダー（「DB接続先管理」タイトル + 閉じるボタン）
 * - 接続先一覧と登録・編集フォームの表示切り替え
 * - useDbConnections フックでCRUD操作を実行
 * - 接続テスト結果・CRUD操作結果をToastで通知
 *
 * 表示モード:
 * - 'list': 接続先一覧（DbConnectionList）を表示
 * - 'add': 新規登録フォーム（DbConnectionForm）を表示
 * - 'edit': 編集フォーム（DbConnectionForm）を表示
 *
 * 設計方針:
 * - Escキーでモーダルを閉じる（アクセシビリティ）
 * - オーバーレイクリックでモーダルを閉じる
 * - モーダル表示中はbodyのスクロールを無効化
 * - フォーカストラップは簡易実装（閉じるボタンへのフォーカス）
 *
 * 参考: screens.md DB管理モーダル ワイヤーフレーム
 *
 * PBI #148 追加
 */

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  type FC,
  type KeyboardEvent,
} from 'react'
import type { DbConnection, DbConnectionInput } from '../../types'
import { useDbConnections } from '../../hooks/useDbConnections'
import { useToast, ToastContainer } from '../common/Toast'
import DbConnectionList from './DbConnectionList'
import DbConnectionForm from './DbConnectionForm'

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/**
 * DbManagementModal の Props
 *
 * @property isOpen   - モーダルが開いているかどうか
 * @property onClose  - モーダルを閉じるコールバック
 */
interface DbManagementModalProps {
  isOpen: boolean
  onClose: () => void
}

/**
 * モーダル内の表示モード
 * - 'list': DB接続先一覧
 * - 'add': 新規登録フォーム
 * - 'edit': 編集フォーム
 */
type ModalView = 'list' | 'add' | 'edit'

// ---------------------------------------------------------------------------
// DbManagementModal コンポーネント
// ---------------------------------------------------------------------------

/**
 * DB接続先管理モーダルコンポーネント
 *
 * @param props - DbManagementModalProps
 */
const DbManagementModal: FC<DbManagementModalProps> = ({ isOpen, onClose }) => {
  // 現在の表示モード（list / add / edit）
  const [view, setView] = useState<ModalView>('list')

  // 編集対象の接続先（editモード時のみ設定される）
  const [editingConnection, setEditingConnection] = useState<DbConnection | null>(null)

  // 保存中かどうか（フォームのボタン無効化に使用）
  const [isSaving, setIsSaving] = useState(false)

  // DB接続先管理フック
  const {
    connections,
    isLoading,
    error,
    fetchConnections,
    createConnection,
    updateConnection,
    deleteConnection,
    testConnection,
  } = useDbConnections()

  // Toast通知フック
  const { toasts, showToast, removeToast } = useToast()

  // 閉じるボタンへのref（モーダルオープン時にフォーカスを移動するため）
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  /**
   * モーダルが開いたとき:
   * - 接続先一覧を表示するモードにリセット
   * - 閉じるボタンにフォーカスを移動（アクセシビリティ）
   */
  useEffect(() => {
    if (isOpen) {
      setView('list')
      setEditingConnection(null)
      // 次のフレームでフォーカスを移動（レンダリング完了後）
      requestAnimationFrame(() => {
        closeButtonRef.current?.focus()
      })
    }
  }, [isOpen])

  /**
   * Escキーでモーダルを閉じる（アクセシビリティ対応）
   *
   * @param e - キーボードイベント
   */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        onClose()
      }
    },
    [onClose],
  )

  /**
   * オーバーレイ（背景）クリックでモーダルを閉じる
   *
   * モーダル本体のクリックはバブリングしないよう stopPropagation で制御する。
   */
  const handleOverlayClick = useCallback(() => {
    onClose()
  }, [onClose])

  // ---------------------------------------------------------------------------
  // 表示モード切り替えハンドラ
  // ---------------------------------------------------------------------------

  /**
   * 新規登録フォームに切り替える
   */
  const handleAdd = useCallback(() => {
    setEditingConnection(null)
    setView('add')
  }, [])

  /**
   * 編集フォームに切り替える
   *
   * @param connection - 編集対象の接続先
   */
  const handleEdit = useCallback((connection: DbConnection) => {
    setEditingConnection(connection)
    setView('edit')
  }, [])

  /**
   * 一覧表示に戻る
   */
  const handleCancelForm = useCallback(() => {
    setEditingConnection(null)
    setView('list')
  }, [])

  // ---------------------------------------------------------------------------
  // CRUD操作ハンドラ
  // ---------------------------------------------------------------------------

  /**
   * 新規接続先を保存する（DbConnectionFormのonSaveに渡す）
   *
   * @param input - フォームの入力値
   */
  const handleSaveCreate = useCallback(
    async (input: DbConnectionInput) => {
      setIsSaving(true)
      try {
        await createConnection(input)
        showToast(`「${input.name}」を登録しました`, 'success')
        // 登録成功後は一覧に戻る
        setView('list')
        setEditingConnection(null)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'DB接続先の登録に失敗しました'
        showToast(message, 'error')
      } finally {
        setIsSaving(false)
      }
    },
    [createConnection, showToast],
  )

  /**
   * 既存接続先を更新する（DbConnectionFormのonSaveに渡す）
   *
   * @param input - フォームの入力値
   */
  const handleSaveUpdate = useCallback(
    async (input: DbConnectionInput) => {
      if (!editingConnection) return

      setIsSaving(true)
      try {
        await updateConnection(editingConnection.id, input)
        showToast(`「${input.name}」を更新しました`, 'success')
        // 更新成功後は一覧に戻る
        setView('list')
        setEditingConnection(null)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'DB接続先の更新に失敗しました'
        showToast(message, 'error')
      } finally {
        setIsSaving(false)
      }
    },
    [editingConnection, updateConnection, showToast],
  )

  /**
   * 接続先を削除する（DbConnectionListのonDeleteに渡す）
   *
   * @param id - 削除する接続先のID
   */
  const handleDelete = useCallback(
    async (id: string) => {
      const target = connections.find((c) => c.id === id)
      const name = target?.name ?? id
      try {
        await deleteConnection(id)
        showToast(`「${name}」を削除しました`, 'success')
      } catch (err) {
        const message = err instanceof Error ? err.message : 'DB接続先の削除に失敗しました'
        showToast(message, 'error')
      }
    },
    [connections, deleteConnection, showToast],
  )

  /**
   * 接続テストを実行してToastで結果を表示する
   *
   * @param input - テストする接続情報
   */
  const handleTestConnection = useCallback(
    async (input: DbConnectionInput) => {
      try {
        const result = await testConnection(input)
        if (result.success) {
          showToast(result.message || '接続に成功しました', 'success')
        } else {
          showToast(result.message || '接続に失敗しました', 'error')
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : '接続テストに失敗しました'
        showToast(message, 'error')
      }
    },
    [testConnection, showToast],
  )

  // モーダルが閉じている場合はレンダリングしない
  if (!isOpen) return null

  // 現在の表示モードに応じて onSave を切り替える
  const handleSave = view === 'edit' ? handleSaveUpdate : handleSaveCreate

  return (
    <>
      {/* モーダルオーバーレイ（背景の暗転） */}
      <div
        className="modal-overlay"
        onClick={handleOverlayClick}
        aria-hidden="true"
      />

      {/* モーダル本体 */}
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="db-modal-title"
        onKeyDown={handleKeyDown}
        tabIndex={-1}
      >
        {/* モーダルヘッダー */}
        <div className="modal__header">
          <h2 id="db-modal-title" className="modal__title">
            DB接続先管理
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            className="modal__close"
            onClick={onClose}
            aria-label="モーダルを閉じる"
          >
            ×
          </button>
        </div>

        {/* モーダルコンテンツ */}
        <div className="modal__content" onClick={(e) => e.stopPropagation()}>
          {/* エラー表示（一覧取得失敗時） */}
          {error && view === 'list' && (
            <div className="modal__error" role="alert">
              <span aria-hidden="true">⚠️</span> {error}
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => void fetchConnections()}
                style={{ marginLeft: '0.5rem' }}
              >
                再取得
              </button>
            </div>
          )}

          {/* 接続先一覧 */}
          {view === 'list' && (
            <DbConnectionList
              connections={connections}
              isLoading={isLoading}
              onAdd={handleAdd}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          )}

          {/* 登録・編集フォーム */}
          {(view === 'add' || view === 'edit') && (
            <DbConnectionForm
              connection={editingConnection}
              isSaving={isSaving}
              onSave={handleSave}
              onCancel={handleCancelForm}
              onTestConnection={handleTestConnection}
            />
          )}
        </div>
      </div>

      {/* Toast通知コンテナ */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  )
}

export default DbManagementModal
