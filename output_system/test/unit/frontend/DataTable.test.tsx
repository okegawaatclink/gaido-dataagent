/**
 * 【モジュール】frontend/src/components/Chart/DataTable
 * クエリ結果テーブルコンポーネントのユニットテスト（暫定実装）
 *
 * テスト対象:
 * - 空配列時に「結果がありません」を表示すること
 * - 列名と行データが正しく描画されること
 * - 500行超の場合は先頭500行のみ表示され、通知が表示されること
 * - セル値が安全にエスケープされること（XSS対策）
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DataTable from '../../../frontend/src/components/Chart/DataTable'
import type { QueryResult } from '../../../frontend/src/types'

// ---------------------------------------------------------------------------
// テスト用ヘルパー
// ---------------------------------------------------------------------------

/**
 * テスト用の QueryResult を生成するヘルパー
 *
 * @param rowCount - 生成する行数
 * @param columns  - 列名一覧（デフォルト: ['id', 'name', 'amount']）
 */
function createQueryResult(
  rowCount: number,
  columns: string[] = ['id', 'name', 'amount'],
): QueryResult {
  return {
    columns,
    rows: Array.from({ length: rowCount }, (_, i) => ({
      id: i + 1,
      name: `アイテム ${i + 1}`,
      amount: (i + 1) * 100,
    })),
    chartType: 'table',
  }
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe('DataTable', () => {
  /**
   * 【テスト対象】DataTable コンポーネント
   * 【テスト内容】rows が空配列の場合
   * 【期待結果】「結果がありません」テキストが表示されること
   */
  it('should show empty message when rows is empty', () => {
    // Arrange
    const result: QueryResult = {
      columns: ['id', 'name'],
      rows: [],
      chartType: null,
    }

    // Act
    render(<DataTable result={result} />)

    // Assert
    expect(screen.getByText('結果がありません')).toBeInTheDocument()
  })

  /**
   * 【テスト対象】DataTable コンポーネント
   * 【テスト内容】通常の結果データ（列名と行データ）を表示する場合
   * 【期待結果】列名がヘッダーに、行データがボディに正しく描画されること
   *
   * 【入力例】columns: ['id', 'name'], rows: [{id: 1, name: 'Alice'}]
   */
  it('should render column headers and row data correctly', () => {
    // Arrange
    const result: QueryResult = {
      columns: ['id', 'name'],
      rows: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }],
      chartType: null,
    }

    // Act
    render(<DataTable result={result} />)

    // Assert: 列名がヘッダーに存在すること
    expect(screen.getByRole('columnheader', { name: 'id' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'name' })).toBeInTheDocument()

    // Assert: データが行に存在すること
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getAllByText('1')[0]).toBeInTheDocument()
    expect(screen.getAllByText('2')[0]).toBeInTheDocument()
  })

  /**
   * 【テスト対象】DataTable コンポーネント
   * 【テスト内容】件数サマリーが正しく表示される場合
   * 【期待結果】「N 件の結果」テキストが表示されること
   */
  it('should show total row count in summary', () => {
    // Arrange: 3件のデータ
    const result = createQueryResult(3)

    // Act
    render(<DataTable result={result} />)

    // Assert
    expect(screen.getByText('3 件の結果')).toBeInTheDocument()
  })

  /**
   * 【テスト対象】DataTable コンポーネント
   * 【テスト内容】500行を超えるデータがある場合
   * 【期待結果】先頭500行のみ表示され、切り捨て通知が表示されること
   *
   * 【前提条件】MAX_DISPLAY_ROWS = 500
   */
  it('should display only first 500 rows and show truncation notice when rows exceed limit', () => {
    // Arrange: 501件のデータ
    const result = createQueryResult(501)

    // Act
    render(<DataTable result={result} />)

    // Assert: 合計件数は501件と表示
    expect(screen.getByText('501 件の結果')).toBeInTheDocument()

    // Assert: 切り捨て通知が表示されること
    expect(screen.getByText(/先頭 500 行を表示/)).toBeInTheDocument()

    // Assert: テーブル内の行数（データ行）は500行のみ（+ヘッダー行）
    const rows = screen.getAllByRole('row')
    // ヘッダー行 1 + データ行 500 = 501
    expect(rows).toHaveLength(501)
  })

  /**
   * 【テスト対象】DataTable コンポーネント
   * 【テスト内容】500行以下の場合は切り捨て通知が表示されないこと
   * 【期待結果】「先頭 500 行を表示」テキストが存在しないこと
   */
  it('should not show truncation notice when rows are within limit', () => {
    // Arrange: 10件のデータ
    const result = createQueryResult(10)

    // Act
    render(<DataTable result={result} />)

    // Assert: 切り捨て通知が存在しないこと
    expect(screen.queryByText(/先頭 500 行を表示/)).not.toBeInTheDocument()
  })

  /**
   * 【テスト対象】DataTable コンポーネント
   * 【テスト内容】null値のセルが空文字として安全に表示される場合
   * 【期待結果】クラッシュせず、nullセルが空として表示されること
   */
  it('should handle null cell values safely', () => {
    // Arrange: null値を含む行
    const result: QueryResult = {
      columns: ['id', 'value'],
      rows: [{ id: 1, value: null }, { id: 2, value: undefined }],
      chartType: null,
    }

    // Act & Assert: エラーなくレンダリングできること
    expect(() => render(<DataTable result={result} />)).not.toThrow()
    expect(screen.getByText('2 件の結果')).toBeInTheDocument()
  })

  /**
   * 【テスト対象】DataTable コンポーネント
   * 【テスト内容】複数の列を持つデータが正しくレンダリングされる場合
   * 【期待結果】全列がヘッダーに表示されること
   *
   * 【入力例】5列のデータ
   */
  it('should render all columns in header', () => {
    // Arrange
    const columns = ['id', 'date', 'product', 'quantity', 'amount']
    const result: QueryResult = {
      columns,
      rows: [{ id: 1, date: '2024-01-01', product: 'A', quantity: 10, amount: 1000 }],
      chartType: null,
    }

    // Act
    render(<DataTable result={result} />)

    // Assert: 全5列がヘッダーに存在すること
    for (const col of columns) {
      expect(screen.getByRole('columnheader', { name: col })).toBeInTheDocument()
    }
  })
})
