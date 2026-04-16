/**
 * Loading コンポーネント
 *
 * LLMの応答待ち中にチャットエリアに表示するローディングインジケーター。
 * 3つのドットがアニメーションするシンプルなデザイン。
 */

import type { FC } from 'react'

/**
 * Loading コンポーネントの Props
 *
 * @property message - 表示するメッセージ（省略時は「考え中...」）
 */
interface LoadingProps {
  message?: string
}

/**
 * ローディングインジケーター
 *
 * SSEストリーミング開始前（応答待ち中）の状態を視覚的に示す。
 * チャットエリアの下部、入力フィールドの上に表示される。
 *
 * @param props - LoadingProps
 */
const Loading: FC<LoadingProps> = ({ message = '考え中...' }) => {
  return (
    <div className="loading-indicator" aria-label="ローディング中" role="status">
      {/* 3つのドットアニメーション */}
      <div className="loading-dots" aria-hidden="true">
        <span className="loading-dot" />
        <span className="loading-dot" />
        <span className="loading-dot" />
      </div>
      {/* ローディングメッセージ */}
      <span className="loading-text">{message}</span>
    </div>
  )
}

export default Loading
