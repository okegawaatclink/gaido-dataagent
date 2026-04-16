/**
 * StreamingText コンポーネント
 *
 * ストリーミング受信中のテキストを逐次表示するコンポーネント。
 * isStreaming が true の場合はカーソルアニメーション（|）を末尾に付ける。
 *
 * XSS対策: テキストはReactの自動エスケープに任せる（dangerouslySetInnerHTML禁止）。
 * 改行（\n）のみ <br> タグに変換して表示する。
 */

import type { FC } from 'react'

/**
 * StreamingText コンポーネントの Props
 *
 * @property text        - 表示するテキスト（ストリーミングで逐次追加される）
 * @property isStreaming - ストリーミング受信中かどうか（カーソル表示の制御）
 */
interface StreamingTextProps {
  text: string
  isStreaming: boolean
}

/**
 * ストリーミングテキスト表示コンポーネント
 *
 * テキストの改行（\n）を <br> に変換して表示する。
 * ストリーミング中はカーソルアニメーションを表示する。
 *
 * 実装の注意:
 * - split + map パターンで改行を安全に処理する（dangerouslySetInnerHTML不使用）
 * - Reactはテキストノードを自動エスケープするのでXSSリスクなし
 *
 * @param props - StreamingTextProps
 */
const StreamingText: FC<StreamingTextProps> = ({ text, isStreaming }) => {
  // テキストを改行で分割して各行を <span> + <br> で表示する
  // dangerouslySetInnerHTML を使わずに改行を安全に処理する
  const lines = text.split('\n')

  return (
    <span className="streaming-text">
      {lines.map((line, index) => (
        // key はインデックスで許容（順序が変わらないため）
        <span key={index}>
          {/* テキストはReactが自動エスケープ（XSS防止） */}
          {line}
          {/* 最後の行以外は改行を挿入 */}
          {index < lines.length - 1 && <br />}
        </span>
      ))}
      {/* ストリーミング中はカーソルアニメーションを表示 */}
      {isStreaming && (
        <span className="streaming-cursor" aria-hidden="true">
          |
        </span>
      )}
    </span>
  )
}

export default StreamingText
