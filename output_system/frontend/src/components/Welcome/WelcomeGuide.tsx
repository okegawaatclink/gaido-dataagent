/**
 * WelcomeGuide コンポーネント
 *
 * DB接続先が1件も登録されていない場合に表示される初回起動ガイド。
 * screens.md「初回起動ガイド」ワイヤーフレームに準拠。
 *
 * レイアウト（上から順）:
 *   - DataAgent アイコン（絵文字）
 *   - 「DataAgent へようこそ」タイトル
 *   - 「まずDB接続先を登録してください」説明文
 *   - 「DB接続先を登録する」ボタン → クリックで DB 管理モーダルを開く
 *
 * PBI #152 / Task #172
 */

import type { FC } from 'react'

/**
 * WelcomeGuide コンポーネントのプロパティ
 */
interface WelcomeGuideProps {
  /**
   * 「DB接続先を登録する」ボタンクリック時のコールバック。
   * App.tsx で DB 管理モーダルを開くハンドラを渡す。
   */
  onOpenDbModal: () => void
}

/**
 * 初回起動ガイドコンポーネント
 *
 * DB接続先が0件の状態でアプリにアクセスしたとき、チャット画面の代わりに表示される。
 * 「DB接続先を登録する」ボタンで DB 管理モーダルを開き、接続先登録を促す。
 * 登録してモーダルを閉じると、App.tsx 側で接続先一覧が更新されて
 * 条件分岐が切り替わり、自動的にチャット画面へ遷移する。
 *
 * @param props - {@link WelcomeGuideProps}
 */
const WelcomeGuide: FC<WelcomeGuideProps> = ({ onOpenDbModal }) => {
  return (
    <div className="welcome-guide" role="main" aria-label="初回起動ガイド">
      {/* DataAgent アイコン */}
      <span className="welcome-guide__icon" aria-hidden="true">🤖</span>

      {/* タイトル */}
      <h2 className="welcome-guide__title">DataAgent へようこそ</h2>

      {/* 説明文 */}
      <p className="welcome-guide__message">
        まずDB接続先を登録してください
      </p>

      {/* DB接続先登録ボタン */}
      <button
        className="welcome-guide__register-btn btn btn--primary"
        type="button"
        onClick={onOpenDbModal}
        aria-haspopup="dialog"
      >
        DB接続先を登録する
      </button>
    </div>
  )
}

export default WelcomeGuide
