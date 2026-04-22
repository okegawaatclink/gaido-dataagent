/**
 * SQLDisplay コンポーネント
 *
 * LLMが生成したSQL文またはGraphQLクエリをコードブロックで表示するコンポーネント。
 * クエリ内容はコピーボタン付きで提示する（透明性確保のため）。
 *
 * PBI #201 更新:
 * - label プロパティを追加し、「生成されたSQL」「生成されたGraphQLクエリ」を切り替え可能にした
 * - GraphQL 接続先の場合は ChatMessage から label="生成されたGraphQLクエリ" が渡される
 *
 * XSS対策:
 * - クエリテキストはReactの自動エスケープに任せる（dangerouslySetInnerHTML禁止）
 * - シンタックスハイライトは本PBIではプレーンテキスト表示（後続PBIで拡張可能）
 */

import { useState, useCallback, type FC } from 'react'

/**
 * SQLDisplay コンポーネントの Props
 *
 * @property sql   - 表示するSQL文字列またはGraphQLクエリ文字列
 * @property label - ヘッダーに表示するラベル（省略時: "生成されたSQL"）
 *                   GraphQL接続先の場合は "生成されたGraphQLクエリ" を渡す
 */
interface SQLDisplayProps {
  sql: string
  /** ヘッダーラベル。省略時は "生成されたSQL"（GraphQL時は "生成されたGraphQLクエリ"） */
  label?: string
}

/** デフォルトのラベル（SQL 接続の場合） */
const DEFAULT_LABEL = '生成されたSQL'

/**
 * SQL/GraphQL クエリ表示コンポーネント
 *
 * 生成されたSQL（またはGraphQLクエリ）をコードブロック形式で表示する。
 * label プロパティで表示ラベルを切り替えられる（DB接続: SQL、GraphQL接続: GraphQL）。
 * コピーボタンでクリップボードへのコピーも可能。
 *
 * @param props - SQLDisplayProps
 */
const SQLDisplay: FC<SQLDisplayProps> = ({ sql, label = DEFAULT_LABEL }) => {
  // コピー完了フラグ（ボタンラベルの一時的な変更に使用）
  const [copied, setCopied] = useState(false)

  /**
   * クエリをクリップボードにコピーする
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
        {/* DB接続: "生成されたSQL" / GraphQL接続: "生成されたGraphQLクエリ" */}
        <span className="sql-label">{label}</span>
        <button
          className="sql-copy-btn"
          onClick={handleCopy}
          type="button"
          aria-label={`${label}をコピー`}
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
