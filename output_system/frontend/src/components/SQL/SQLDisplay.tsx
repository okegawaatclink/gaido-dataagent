/**
 * SQLDisplay コンポーネント
 *
 * LLMが生成したSQL文をコードブロックで表示するコンポーネント。
 * SQL内容はコピーボタン付きで提示する（透明性確保のため）。
 *
 * XSS対策:
 * - SQLテキストはReactの自動エスケープに任せる（dangerouslySetInnerHTML禁止）
 * - シンタックスハイライトは本PBIではプレーンテキスト表示（後続PBIで拡張可能）
 */

import { useState, useCallback, type FC } from 'react'

/**
 * SQLDisplay コンポーネントの Props
 *
 * @property sql - 表示するSQL文字列
 */
interface SQLDisplayProps {
  sql: string
}

/**
 * SQL表示コンポーネント
 *
 * 生成されたSQLをコードブロック形式で表示する。
 * コピーボタンでクリップボードへのコピーも可能。
 *
 * @param props - SQLDisplayProps
 */
const SQLDisplay: FC<SQLDisplayProps> = ({ sql }) => {
  // コピー完了フラグ（ボタンラベルの一時的な変更に使用）
  const [copied, setCopied] = useState(false)

  /**
   * SQLをクリップボードにコピーする
   * コピー成功後、2秒間「コピー済み」表示に切り替える
   */
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(sql)
      setCopied(true)
      // 2秒後に「コピー済み」表示を解除
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // クリップボードAPIが使えない環境ではサイレントに失敗
      console.warn('[SQLDisplay] clipboard copy failed')
    }
  }, [sql])

  return (
    <div className="sql-display">
      {/* ヘッダー: ラベル + コピーボタン */}
      <div className="sql-header">
        <span className="sql-label">生成されたSQL</span>
        <button
          className="sql-copy-btn"
          onClick={handleCopy}
          type="button"
          aria-label="SQLをコピー"
          title="クリップボードにコピー"
        >
          {copied ? '✓ コピー済み' : 'コピー'}
        </button>
      </div>
      {/* コードブロック: XSSはReact自動エスケープで防止 */}
      <pre className="sql-code-block">
        <code className="sql-code">{sql}</code>
      </pre>
    </div>
  )
}

export default SQLDisplay
