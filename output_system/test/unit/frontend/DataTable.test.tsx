/**
 * 【モジュール】frontend/src/components/Chart/DataTable
 * クエリ結果テーブルコンポーネントのユニットテスト（PBI 3.2 本実装）
 *
 * テスト対象:
 * - 空行データ時に「結果がありません」を表示すること
 * - 列0件時に「列の定義がありません」を表示すること
 * - 列名と行データが正しく描画されること
 * - 500行超の場合は先頭500行のみ表示され、「全N件中M件を表示」が表示されること
 * - NULL値が "NULL" のグレー表示で表示されること
 * - 数値列が右寄せになること
 * - 日付文字列が日本語フォーマットで表示されること
 * - セルクリックでコピー完了状態に変わること
 * - XSS対策: セル値が安全にエスケープされること
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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
   * 【テスト内容】columns が空配列の場合
   * 【期待結果】「列の定義がありません」テキストが表示されること
   */
  it('should show no-columns message when columns array is empty', () => {
    // Arrange
    const result: QueryResult = {
      columns: [],
      rows: [],
      chartType: null,
    }

    // Act
    render(<DataTable result={result} />)

    // Assert
    expect(screen.getByText('列の定義がありません')).toBeInTheDocument()
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
  })

  /**
   * 【テスト対象】DataTable コンポーネント
   * 【テスト内容】件数サマリーが正しく表示される場合（500行以下）
   * 【期待結果】「全 N 件」テキストが表示されること
   */
  it('should show total row count in summary for small datasets', () => {
    // Arrange: 3件のデータ
    const result = createQueryResult(3)

    // Act
    render(<DataTable result={result} />)

    // Assert: 「全 3 件」テキストが表示されること
    // サマリー内にある strong 要素内の「3」と隣接テキストで構成される
    const summary = document.querySelector('.data-table-summary__total')
    expect(summary).toBeTruthy()
    expect(summary?.textContent).toContain('3')
  })

  /**
   * 【テスト対象】DataTable コンポーネント
   * 【テスト内容】500行を超えるデータがある場合
   * 【期待結果】先頭500行のみ表示され、「全N件中、500件を表示」通知が表示されること
   *
   * 【前提条件】MAX_DISPLAY_ROWS = 500
   */
  it('should display only first 500 rows and show truncation notice when rows exceed limit', () => {
    // Arrange: 501件のデータ
    const result = createQueryResult(501)

    // Act
    render(<DataTable result={result} />)

    // Assert: 「全 501 件中」テキストが存在すること
    const truncatedInfo = document.querySelector('.data-table-summary__truncated-info')
    expect(truncatedInfo).toBeTruthy()
    expect(truncatedInfo?.textContent).toContain('501')
    expect(truncatedInfo?.textContent).toContain('500')

    // Assert: テーブル内の行数（データ行）は500行のみ（+ヘッダー行）
    const rows = screen.getAllByRole('row')
    // ヘッダー行 1 + データ行 500 = 501
    expect(rows).toHaveLength(501)
  })

  /**
   * 【テスト対象】DataTable コンポーネント
   * 【テスト内容】500行以下の場合は切り捨て通知が表示されないこと
   * 【期待結果】「truncated-info」クラスの要素が存在しないこと
   */
  it('should not show truncation notice when rows are within limit', () => {
    // Arrange: 10件のデータ
    const result = createQueryResult(10)

    // Act
    render(<DataTable result={result} />)

    // Assert: 切り捨て通知が存在しないこと
    expect(document.querySelector('.data-table-summary__truncated-info')).toBeNull()
  })

  /**
   * 【テスト対象】DataTable コンポーネント
   * 【テスト内容】null値のセルが "NULL" として表示される場合
   * 【期待結果】NULLテキストが表示され、null用のCSSクラスが付与されること
   */
  it('should display null cell values as "NULL" with null style', () => {
    // Arrange: null値を含む行
    const result: QueryResult = {
      columns: ['id', 'value'],
      rows: [{ id: 1, value: null }],
      chartType: null,
    }

    // Act
    render(<DataTable result={result} />)

    // Assert: "NULL" テキストが表示されること
    expect(screen.getByText('NULL')).toBeInTheDocument()

    // Assert: null用CSSクラスが付与されていること
    const nullCells = document.querySelectorAll('.data-table__td--null')
    expect(nullCells.length).toBeGreaterThan(0)
  })

  /**
   * 【テスト対象】DataTable コンポーネント
   * 【テスト内容】undefined値のセルも "NULL" として表示される場合
   * 【期待結果】NULLテキストが表示されること
   */
  it('should display undefined cell values as "NULL"', () => {
    // Arrange: undefined値を含む行
    const result: QueryResult = {
      columns: ['id', 'value'],
      rows: [{ id: 1, value: undefined }],
      chartType: null,
    }

    // Act
    render(<DataTable result={result} />)

    // Assert: "NULL" テキストが表示されること
    expect(screen.getByText('NULL')).toBeInTheDocument()
  })

  /**
   * 【テスト対象】DataTable コンポーネント
   * 【テスト内容】数値列が右寄せCSSクラスを持つ場合
   * 【期待結果】数値列のセルに data-table__td--numeric クラスが付与されること
   */
  it('should apply numeric class to cells in numeric columns', () => {
    // Arrange: 数値列を含むデータ
    const result: QueryResult = {
      columns: ['name', 'amount'],
      rows: [
        { name: 'A', amount: 100 },
        { name: 'B', amount: 200 },
      ],
      chartType: null,
    }

    // Act
    render(<DataTable result={result} />)

    // Assert: 数値ヘッダーに numeric クラスが付与されること
    const numericHeader = document.querySelector('.data-table__th--numeric')
    expect(numericHeader).toBeTruthy()
    expect(numericHeader?.textContent).toBe('amount')

    // Assert: 数値セルに numeric クラスが付与されること
    const numericCells = document.querySelectorAll('.data-table__td--numeric')
    // amount列の2行分 = 2セル
    expect(numericCells.length).toBe(2)
  })

  /**
   * 【テスト対象】DataTable コンポーネント
   * 【テスト内容】文字列列が左寄せ（numeric クラスなし）になること
   * 【期待結果】文字列列のセルに data-table__td--numeric クラスが付与されないこと
   */
  it('should not apply numeric class to cells in string columns', () => {
    // Arrange: 文字列のみの列
    const result: QueryResult = {
      columns: ['name', 'category'],
      rows: [{ name: 'Alice', category: 'A' }],
      chartType: null,
    }

    // Act
    render(<DataTable result={result} />)

    // Assert: 数値クラスが付与されたセルがないこと
    const numericCells = document.querySelectorAll('.data-table__td--numeric')
    expect(numericCells.length).toBe(0)
  })

  /**
   * 【テスト対象】DataTable コンポーネント
   * 【テスト内容】ISO 8601 日付文字列が日本語形式でフォーマットされること
   * 【期待結果】"2024-01-01" が "2024年1月1日" の形式で表示されること
   */
  it('should format ISO date strings in Japanese locale format', () => {
    // Arrange: 日付文字列を含む行
    const result: QueryResult = {
      columns: ['id', 'date'],
      rows: [{ id: 1, date: '2024-01-15' }],
      chartType: null,
    }

    // Act
    render(<DataTable result={result} />)

    // Assert: 日本語形式の日付が表示されること
    // toLocaleDateString('ja-JP') の出力は「2024年1月15日」形式
    const dateText = screen.getByText(/2024年/)
    expect(dateText).toBeInTheDocument()
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

  /**
   * 【テスト対象】DataTable コンポーネント
   * 【テスト内容】XSS攻撃文字列がセルに含まれる場合
   * 【期待結果】HTMLとして解釈されずテキストとして安全に表示されること
   */
  it('should safely escape HTML special characters in cell values (XSS prevention)', () => {
    // Arrange: XSS攻撃パターンを含むデータ
    const result: QueryResult = {
      columns: ['name'],
      rows: [{ name: '<script>alert("xss")</script>' }],
      chartType: null,
    }

    // Act
    render(<DataTable result={result} />)

    // Assert: scriptタグが実行されずテキストとして存在すること
    // DOMにscript要素が挿入されていないことを確認
    expect(document.querySelector('script[data-xss]')).toBeNull()

    // Reactが自動エスケープするのでテキストとして取得できること
    const cell = screen.getByText('<script>alert("xss")</script>')
    expect(cell).toBeInTheDocument()
  })

  /**
   * 【テスト対象】DataTable コンポーネント
   * 【テスト内容】セルクリック時にコピー完了状態に変わること
   * 【期待結果】クリックしたセルに data-table__td--copied クラスが付与されること
   *
   * 【前提条件】navigator.clipboard.writeText をモックする
   */
  it('should show copied state when cell is clicked', async () => {
    // Arrange: クリップボードAPIをモック
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    })
    // window.isSecureContext = true にして Clipboard API を使用させる
    Object.defineProperty(window, 'isSecureContext', {
      value: true,
      writable: true,
      configurable: true,
    })

    const result: QueryResult = {
      columns: ['name'],
      rows: [{ name: 'テストデータ' }],
      chartType: null,
    }

    // Act
    render(<DataTable result={result} />)

    // セルを取得してクリック
    const cell = screen.getByText('テストデータ')
    fireEvent.click(cell)

    // Assert: コピー完了ラベルが表示されること
    await waitFor(() => {
      expect(screen.getByText('✓ コピー済み')).toBeInTheDocument()
    })

    // Assert: clipboard.writeText が正しい値で呼ばれたこと
    expect(writeTextMock).toHaveBeenCalledWith('テストデータ')
  })

  /**
   * 【テスト対象】DataTable コンポーネント
   * 【テスト内容】テーブルのスクロールコンテナが適切なaria属性を持つこと
   * 【期待結果】role="region" と aria-label が設定されていること
   */
  it('should have proper aria attributes for accessibility', () => {
    // Arrange
    const result: QueryResult = {
      columns: ['id'],
      rows: [{ id: 1 }],
      chartType: null,
    }

    // Act
    render(<DataTable result={result} />)

    // Assert: スクロールコンテナにアクセシビリティ属性が存在すること
    const scrollContainer = screen.getByRole('region', { name: 'クエリ結果テーブル' })
    expect(scrollContainer).toBeInTheDocument()
  })

  /**
   * 【テスト対象】DataTable コンポーネント
   * 【テスト内容】ゼブラストライプが正しく適用される場合
   * 【期待結果】偶数行（0-indexed）に data-table__row クラス、奇数行に data-table__row--odd クラスが付与されること
   */
  it('should apply zebra striping to alternating rows', () => {
    // Arrange: 3行のデータ
    const result: QueryResult = {
      columns: ['name'],
      rows: [
        { name: 'Row 1' },
        { name: 'Row 2' },
        { name: 'Row 3' },
      ],
      chartType: null,
    }

    // Act
    render(<DataTable result={result} />)

    // Assert: 偶数インデックス行（0, 2）はベースクラスのみ、奇数インデックス行（1）は--oddクラスも持つ
    const tableRows = document.querySelectorAll('tbody tr')
    expect(tableRows[0]).toHaveClass('data-table__row')
    expect(tableRows[0]).not.toHaveClass('data-table__row--odd')

    expect(tableRows[1]).toHaveClass('data-table__row')
    expect(tableRows[1]).toHaveClass('data-table__row--odd')

    expect(tableRows[2]).toHaveClass('data-table__row')
    expect(tableRows[2]).not.toHaveClass('data-table__row--odd')
  })

  /**
   * 【テスト対象】DataTable コンポーネント
   * 【テスト内容】コピーヒントテキストが表示されること
   * 【期待結果】「セルをクリックでコピー」テキストが表示されること
   */
  it('should display copy hint text', () => {
    // Arrange
    const result: QueryResult = {
      columns: ['name'],
      rows: [{ name: 'test' }],
      chartType: null,
    }

    // Act
    render(<DataTable result={result} />)

    // Assert
    expect(screen.getByText('セルをクリックでコピー')).toBeInTheDocument()
  })
})
