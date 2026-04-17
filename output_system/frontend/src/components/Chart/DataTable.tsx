/**
 * DataTable コンポーネント（暫定実装）
 *
 * クエリ実行結果JSONを簡易テーブル形式で表示するコンポーネント。
 * Epic 3 の本格的な ChartRenderer への置き換えを前提とした暫定実装。
 *
 * 仕様（Task 2.3.3）:
 * - 結果の列名と行を表形式で描画する
 * - 行数が多い場合でもブラウザが固まらない（上位500行表示）
 * - 空配列時は「結果がありません」を表示
 * - Epic 3 で DataTable コンポーネントとして置き換えられる
 *
 * パフォーマンス対策:
 * - 500行を超える場合は先頭500行のみ表示し、件数を通知する
 * - React.memo でメモ化（結果が変わらない限り再レンダリングしない）
 *
 * XSS対策:
 * - すべてのセル値はReactの自動エスケープで安全に表示される
 * - dangerouslySetInnerHTML は使用しない
 */

import { memo, useMemo, type FC } from 'react'
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
 * セル値を表示用文字列に変換するヘルパー
 *
 * null/undefined は空文字として表示する。
 * オブジェクトや配列は JSON 文字列に変換する。
 *
 * @param value - セルの値（unknown型）
 * @returns 表示用の文字列
 */
function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }
  if (typeof value === 'object') {
    return JSON.stringify(value)
  }
  return String(value)
}

/**
 * クエリ結果テーブルコンポーネント（暫定実装）
 *
 * 上位500行までをHTML tableとして描画する。
 * Epic 3 の ChartRenderer/DataTable に置き換える際は、このコンポーネントを
 * 差し替えるだけで済むようにコンポーネントを分離している。
 *
 * @param props - DataTableProps
 */
const DataTable: FC<DataTableProps> = memo(({ result }) => {
  const { columns, rows } = result

  // 表示行数の制限（500行超はカット）
  // useMemo で毎回 slice しないようにメモ化
  const displayRows = useMemo(() => {
    return rows.length > MAX_DISPLAY_ROWS ? rows.slice(0, MAX_DISPLAY_ROWS) : rows
  }, [rows])

  // 結果が空の場合
  if (rows.length === 0) {
    return (
      <div className="data-table-empty" role="status">
        <span className="data-table-empty__icon" aria-hidden="true">📭</span>
        <p className="data-table-empty__text">結果がありません</p>
      </div>
    )
  }

  return (
    <div className="data-table-wrapper">
      {/* 件数サマリー */}
      <div className="data-table-summary">
        <span className="data-table-summary__total">
          {rows.length.toLocaleString()} 件の結果
        </span>
        {/* 500行超の場合は切り捨てを通知 */}
        {rows.length > MAX_DISPLAY_ROWS && (
          <span className="data-table-summary__truncated">
            （先頭 {MAX_DISPLAY_ROWS.toLocaleString()} 行を表示）
          </span>
        )}
      </div>

      {/* スクロール可能なテーブルコンテナ */}
      <div className="data-table-scroll" role="region" aria-label="クエリ結果テーブル">
        <table className="data-table" aria-label="クエリ実行結果">
          {/* テーブルヘッダー（列名） */}
          <thead className="data-table__head">
            <tr>
              {/* 行番号列 */}
              <th className="data-table__th data-table__th--row-num" scope="col" aria-label="行番号">
                #
              </th>
              {columns.map((col) => (
                <th
                  key={col}
                  className="data-table__th"
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
                className={rowIndex % 2 === 0 ? 'data-table__row' : 'data-table__row data-table__row--odd'}
              >
                {/* 行番号 */}
                <td className="data-table__td data-table__td--row-num">
                  {rowIndex + 1}
                </td>
                {columns.map((col) => (
                  <td
                    key={col}
                    className="data-table__td"
                    title={formatCellValue(row[col])}
                  >
                    {/* セル値はReactが自動エスケープ（XSS防止） */}
                    {formatCellValue(row[col])}
                  </td>
                ))}
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
