/**
 * DbConnectionList コンポーネント
 *
 * DB接続先の一覧を表示するコンポーネント。
 * 各接続先に「編集」「削除」ボタンを提供し、「新規登録」ボタンで登録フォームを開く。
 *
 * 機能:
 * - 接続先一覧の表示（接続名、DB種別、ホスト:ポート/DB名）
 * - 「編集」ボタン: onEdit を呼び出してフォームに切り替える
 * - 「削除」ボタン: 確認ダイアログを表示してから onDelete を呼び出す
 * - 「新規登録」ボタン: onAdd を呼び出してフォームに切り替える
 * - 接続先が0件の場合は「接続先がありません」メッセージを表示
 *
 * 設計方針:
 * - 削除は window.confirm で確認ダイアログを表示する（シンプルな実装）
 * - 削除中は全ボタンを無効化して操作ミスを防ぐ
 *
 * 参考: screens.md DB管理モーダル ワイヤーフレーム
 *
 * PBI #148 追加
 */

import { useState, useCallback, type FC } from 'react'
import type { DbConnection } from '../../types'

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/**
 * DbConnectionList の Props
 *
 * @property connections - 表示するDB接続先一覧
 * @property isLoading   - 一覧取得中かどうか
 * @property onAdd       - 「新規登録」ボタン押下時のコールバック
 * @property onEdit      - 「編集」ボタン押下時のコールバック（対象接続先を渡す）
 * @property onDelete    - 削除確認後のコールバック（対象接続先IDを渡す）
 */
interface DbConnectionListProps {
  connections: DbConnection[]
  isLoading: boolean
  onAdd: () => void
  onEdit: (connection: DbConnection) => void
  onDelete: (id: string) => Promise<void>
}

// ---------------------------------------------------------------------------
// DbConnectionList コンポーネント
// ---------------------------------------------------------------------------

/**
 * DB接続先一覧コンポーネント
 *
 * @param props - DbConnectionListProps
 */
const DbConnectionList: FC<DbConnectionListProps> = ({
  connections,
  isLoading,
  onAdd,
  onEdit,
  onDelete,
}) => {
  // 削除中の接続先ID（削除処理中はボタンを無効化するため）
  const [deletingId, setDeletingId] = useState<string | null>(null)

  /**
   * 削除ボタンのハンドラ
   *
   * window.confirm で確認ダイアログを表示し、ユーザーが「OK」した場合のみ削除を実行する。
   * 削除中は deletingId を設定してボタンを無効化する。
   *
   * @param connection - 削除対象の接続先
   */
  const handleDelete = useCallback(
    async (connection: DbConnection) => {
      // 確認ダイアログを表示（シンプルな削除確認）
      const confirmed = window.confirm(
        `「${connection.name}」を削除しますか？\n関連する会話履歴もすべて削除されます。`,
      )

      if (!confirmed) return

      setDeletingId(connection.id)
      try {
        await onDelete(connection.id)
      } finally {
        setDeletingId(null)
      }
    },
    [onDelete],
  )

  /**
   * DB種別の表示ラベルを返す
   *
   * @param dbType - DB種別（'mysql' | 'postgresql'）
   * @returns 表示用ラベル
   */
  const getDbTypeLabel = (dbType: string): string => {
    switch (dbType) {
      case 'mysql':
        return 'MySQL'
      case 'postgresql':
        return 'PostgreSQL'
      default:
        return dbType
    }
  }

  return (
    <div className="db-connection-list">
      {/* ヘッダー: タイトル + 新規登録ボタン */}
      <div className="db-connection-list__header">
        <h3 className="db-connection-list__title">接続先一覧</h3>
        <button
          type="button"
          className="btn btn--primary btn--sm"
          onClick={onAdd}
          disabled={isLoading || deletingId !== null}
          aria-label="新しい接続先を登録"
        >
          ＋ 新規登録
        </button>
      </div>

      {/* ローディング中 */}
      {isLoading && (
        <div className="db-connection-list__loading" aria-live="polite">
          <span className="loading-spinner" aria-hidden="true" />
          <span>読み込み中...</span>
        </div>
      )}

      {/* 接続先が0件 */}
      {!isLoading && connections.length === 0 && (
        <div className="db-connection-list__empty">
          <p className="db-connection-list__empty-message">
            接続先が登録されていません。
          </p>
          <p className="db-connection-list__empty-hint">
            「＋ 新規登録」ボタンから接続先を追加してください。
          </p>
        </div>
      )}

      {/* 接続先一覧 */}
      {!isLoading && connections.length > 0 && (
        <ul className="db-connection-list__items" aria-label="DB接続先一覧">
          {connections.map((conn) => {
            const isDeleting = deletingId === conn.id
            const isAnyDeleting = deletingId !== null

            return (
              <li
                key={conn.id}
                className={`db-connection-item${isDeleting ? ' db-connection-item--deleting' : ''}`}
              >
                {/* 接続先情報 */}
                <div className="db-connection-item__info">
                  {/* 接続名 + 最終使用バッジ */}
                  <div className="db-connection-item__name-row">
                    <span className="db-connection-item__name">{conn.name}</span>
                    {conn.isLastUsed && (
                      <span
                        className="db-connection-item__badge"
                        aria-label="最後に使用した接続先"
                      >
                        最終使用
                      </span>
                    )}
                  </div>
                  {/* 接続詳細（DB種別 / ホスト:ポート / DB名） */}
                  <div className="db-connection-item__detail">
                    <span className="db-connection-item__db-type">
                      {getDbTypeLabel(conn.dbType)}
                    </span>
                    <span className="db-connection-item__separator" aria-hidden="true">
                      /
                    </span>
                    <span className="db-connection-item__host">
                      {conn.host}:{conn.port}
                    </span>
                    <span className="db-connection-item__separator" aria-hidden="true">
                      /
                    </span>
                    <span className="db-connection-item__db-name">{conn.databaseName}</span>
                  </div>
                </div>

                {/* アクションボタン */}
                <div className="db-connection-item__actions" aria-label={`${conn.name}の操作`}>
                  {/* 編集ボタン */}
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => onEdit(conn)}
                    disabled={isAnyDeleting}
                    aria-label={`${conn.name}を編集`}
                  >
                    編集
                  </button>

                  {/* 削除ボタン */}
                  <button
                    type="button"
                    className="btn btn--danger btn--sm"
                    onClick={() => void handleDelete(conn)}
                    disabled={isAnyDeleting}
                    aria-busy={isDeleting}
                    aria-label={`${conn.name}を削除`}
                  >
                    {isDeleting ? '削除中...' : '削除'}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default DbConnectionList
