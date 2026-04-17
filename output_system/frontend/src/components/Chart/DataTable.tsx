/**
 * DataTable コンポーネント（Epic 3 PBI 3.2 本実装）
 *
 * クエリ実行結果JSONをテーブル形式で表示するコンポーネント。
 * スクロール閲覧・ヘッダー固定・ゼブラストライプなど、
 * 実用的なテーブル閲覧に必要な機能を実装する。
 *
 * 機能一覧:
 * - 縦・横スクロール対応（最大高さ500px、横幅はコンテナに合わせる）
 * - テーブルヘッダー固定（sticky header）
 * - ゼブラストライプ（交互に背景色）
 * - 行数表示（例: 「全 1,234 件中、500 件を表示」）
 * - 最大500行制限（大量データ時のパフォーマンス対策）
 * - NULL値の視覚的区別（"NULL" グレー表示）
 * - 数値列の右寄せ（文字列列は左寄せ）
 * - 日付型の適切なフォーマット表示
 * - データ0件・列0件のエッジケース表示
 * - コピー機能（セルクリックでクリップボードにコピー）
 *
 * XSS対策:
 * - すべてのセル値はReactの自動エスケープで安全に表示される
 * - dangerouslySetInnerHTML は使用しない
 *
 * パフォーマンス対策:
 * - 500行を超える場合は先頭500行のみ表示
 * - React.memo でメモ化（結果が変わらない限り再レンダリングしない）
 */

import { memo, useMemo, useCallback, useState, type FC } from 'react'
import type { QueryResult } from '../../types'

/**
 * DataTable コンポーネントの Props
 *
 * @property result - クエリ実行結果（columns + rows）
 */
interface DataTableProps {
  result: QueryResult
}

/** 表示する最大行数（パフォーマンス対策） */
const MAX_DISPLAY_ROWS = 500

/**
 * 日付文字列かどうかを判定するヘルパー
 *
 * ISO 8601 形式（YYYY-MM-DD、YYYY-MM-DDTHH:mm:ss等）の文字列を検出する。
 *
 * @param value - 判定対象の値
 * @returns 日付文字列であればtrue
 */
function isDateString(value: unknown): boolean {
  if (typeof value !== 'string') return false
  // ISO 8601 日付形式のパターン
  const isoDatePattern = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/
  return isoDatePattern.test(value)
}

/**
 * 日付文字列を表示用にフォーマットするヘルパー
 *
 * ISO 8601 日付文字列を日本語ロケールの表示形式に変換する。
 * - 日付のみ: YYYY年M月D日
 * - 日時: YYYY年M月D日 HH:mm:ss
 *
 * @param value - ISO 8601 形式の日付文字列
 * @returns フォーマット済みの日付文字列
 */
function formatDateValue(value: string): string {
  try {
    const date = new Date(value)
    if (isNaN(date.getTime())) return value

    // 日付のみ（時刻情報なし）の場合
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return date.toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC', // UTC として解釈してタイムゾーンのずれを防ぐ
      })
    }

    // 日時の場合
    return date.toLocaleString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return value
  }
}

/**
 * 値が数値型かどうかを判定するヘルパー
 *
 * number型またはnumberに変換可能な文字列（空文字除く）を数値とみなす。
 *
 * @param value - 判定対象の値
 * @returns 数値であればtrue
 */
function isNumericValue(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false
  if (typeof value === 'number') return !isNaN(value)
  if (typeof value === 'string') {
    const num = Number(value)
    return !isNaN(num)
  }
  return false
}

/**
 * 列全体が数値列かどうかを判定するヘルパー
 *
 * NULL/undefined以外の全行の値が数値に変換可能な場合にtrueを返す。
 * 行が0件またはNULLのみの場合はfalse。
 *
 * @param rows   - データ行の配列
 * @param colKey - 判定対象の列名
 * @returns 数値列であればtrue
 */
function isNumericColumn(rows: Record<string, unknown>[], colKey: string): boolean {
  if (rows.length === 0) return false
  // NULL/undefinedを除いた行で判定（全部NULLなら数値列と見なさない）
  const nonNullRows = rows.filter((row) => row[colKey] !== null && row[colKey] !== undefined)
  if (nonNullRows.length === 0) return false
  return nonNullRows.every((row) => isNumericValue(row[colKey]))
}

/**
 * セル値を表示用文字列に変換するヘルパー
 *
 * null/undefined は "NULL" として表示する（後でグレー表示スタイルを適用）。
 * 日付文字列は適切なフォーマットで表示する。
 * オブジェクトや配列は JSON 文字列に変換する。
 *
 * @param value - セルの値（unknown型）
 * @returns 表示用の文字列
 */
function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'NULL'
  }
  if (isDateString(value)) {
    return formatDateValue(value as string)
  }
  if (typeof value === 'object') {
    return JSON.stringify(value)
  }
  return String(value)
}

/**
 * セルがNULL値かどうかを判定するヘルパー
 *
 * @param value - セルの値
 * @returns NULL/undefinedであればtrue
 */
function isNullValue(value: unknown): boolean {
  return value === null || value === undefined
}

/**
 * クリップボードに値をコピーするユーティリティ
 *
 * Clipboard API が利用できない環境ではフォールバックとして
 * document.execCommand('copy') を使用する。
 *
 * @param text - コピーするテキスト
 * @returns コピー成功でtrue
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
    // フォールバック（HTTP環境等）
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const success = document.execCommand('copy')
    document.body.removeChild(textarea)
    return success
  } catch {
    return false
  }
}

/**
 * クエリ結果テーブルコンポーネント（PBI 3.2 本実装）
 *
 * 上位500行までをHTML tableとして描画する。
 * セルクリックでクリップボードへのコピーが可能。
 *
 * @param props - DataTableProps
 */
const DataTable: FC<DataTableProps> = memo(({ result }) => {
  const { columns, rows } = result

  // コピー通知用の状態（コピーされたセルの識別子）
  // 形式: "rowIndex-colIndex"
  const [copiedCell, setCopiedCell] = useState<string | null>(null)

  // 表示行数の制限（500行超はカット）
  // useMemo で毎回 slice しないようにメモ化
  const displayRows = useMemo(() => {
    return rows.length > MAX_DISPLAY_ROWS ? rows.slice(0, MAX_DISPLAY_ROWS) : rows
  }, [rows])

  // 数値列かどうかをメモ化（列ごとに計算）
  // 数値列は右寄せ表示するために使用する
  const numericColumns = useMemo(() => {
    const map: Record<string, boolean> = {}
    for (const col of columns) {
      map[col] = isNumericColumn(rows, col)
    }
    return map
  }, [columns, rows])

  /**
   * セルクリック時のコピーハンドラー
   *
   * クリックされたセルの値をクリップボードにコピーし、
   * 一時的にコピー完了状態を表示する（1.5秒後に元に戻す）
   */
  const handleCellClick = useCallback(
    async (value: unknown, rowIndex: number, colIndex: number) => {
      const cellId = `${rowIndex}-${colIndex}`
      const textToCopy = isNullValue(value) ? '' : formatCellValue(value)
      const success = await copyToClipboard(textToCopy)
      if (success) {
        setCopiedCell(cellId)
        setTimeout(() => setCopiedCell(null), 1500)
      }
    },
    [],
  )

  // 列が0件のエッジケース
  if (columns.length === 0) {
    return (
      <div className="data-table-empty" role="status" aria-label="列なし">
        <span className="data-table-empty__icon" aria-hidden="true">📭</span>
        <p className="data-table-empty__text">列の定義がありません</p>
      </div>
    )
  }

  // データが0件の場合
  if (rows.length === 0) {
    return (
      <div className="data-table-empty" role="status" aria-label="データなし">
        <span className="data-table-empty__icon" aria-hidden="true">📭</span>
        <p className="data-table-empty__text">結果がありません</p>
      </div>
    )
  }

  const isTruncated = rows.length > MAX_DISPLAY_ROWS

  return (
    <div className="data-table-wrapper">
      {/* 行数サマリー */}
      <div className="data-table-summary" aria-live="polite">
        {isTruncated ? (
          // 500行超の場合: 「全 N 件中、500 件を表示」形式
          <span className="data-table-summary__truncated-info">
            全 <strong>{rows.length.toLocaleString('ja-JP')}</strong> 件中、
            <strong>{MAX_DISPLAY_ROWS.toLocaleString('ja-JP')}</strong> 件を表示
            <span className="data-table-summary__truncated-note">（上位{MAX_DISPLAY_ROWS}行に制限）</span>
          </span>
        ) : (
          // 500行以下の場合: 「N 件の結果」形式
          <span className="data-table-summary__total">
            全 <strong>{rows.length.toLocaleString('ja-JP')}</strong> 件
          </span>
        )}
        {/* コピーヒント */}
        <span className="data-table-summary__copy-hint">
          セルをクリックでコピー
        </span>
      </div>

      {/* スクロール可能なテーブルコンテナ */}
      {/* overflow-x: auto で横スクロール、max-height + overflow-y: auto で縦スクロール */}
      <div
        className="data-table-scroll"
        role="region"
        aria-label="クエリ結果テーブル"
      >
        <table className="data-table" aria-label="クエリ実行結果">
          {/* テーブルヘッダー（sticky で固定） */}
          <thead className="data-table__head">
            <tr>
              {/* 行番号列 */}
              <th
                className="data-table__th data-table__th--row-num"
                scope="col"
                aria-label="行番号"
              >
                #
              </th>
              {columns.map((col) => (
                <th
                  key={col}
                  className={[
                    'data-table__th',
                    numericColumns[col] ? 'data-table__th--numeric' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  scope="col"
                  title={col}
                >
                  {/* 列名はReactが自動エスケープ（XSS防止） */}
                  {col}
                </th>
              ))}
            </tr>
          </thead>

          {/* テーブルボディ（データ行） */}
          <tbody className="data-table__body">
            {displayRows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className={
                  rowIndex % 2 === 0
                    ? 'data-table__row'
                    : 'data-table__row data-table__row--odd'
                }
              >
                {/* 行番号（1始まり） */}
                <td className="data-table__td data-table__td--row-num">
                  {rowIndex + 1}
                </td>
                {columns.map((col, colIndex) => {
                  const rawValue = row[col]
                  const isNull = isNullValue(rawValue)
                  const displayValue = formatCellValue(rawValue)
                  const cellId = `${rowIndex}-${colIndex}`
                  const isCopied = copiedCell === cellId

                  return (
                    <td
                      key={col}
                      className={[
                        'data-table__td',
                        isNull ? 'data-table__td--null' : '',
                        numericColumns[col] ? 'data-table__td--numeric' : '',
                        isCopied ? 'data-table__td--copied' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      title={isCopied ? 'コピーしました！' : displayValue}
                      onClick={() => handleCellClick(rawValue, rowIndex, colIndex)}
                      // キーボード操作でもコピーできるようにする
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          handleCellClick(rawValue, rowIndex, colIndex)
                        }
                      }}
                      tabIndex={0}
                      role="gridcell"
                      aria-label={
                        isNull
                          ? `${col}: NULL値`
                          : `${col}: ${displayValue}`
                      }
                    >
                      {/* セル値はReactが自動エスケープ（XSS防止） */}
                      {isCopied ? (
                        <span className="data-table__td-copied-label">✓ コピー済み</span>
                      ) : (
                        displayValue
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
})

// デバッグ用の表示名を設定
DataTable.displayName = 'DataTable'

export default DataTable
