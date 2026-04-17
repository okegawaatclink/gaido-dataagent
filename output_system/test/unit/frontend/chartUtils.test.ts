/**
 * chartUtils のユニットテスト
 *
 * QueryResult → Recharts データ変換ロジックを網羅的にテストする。
 * エッジケース（空データ・1列のみ・全列非数値・混在）も検証する。
 */

import { describe, it, expect } from 'vitest'
import {
  isNumericValue,
  isNumericColumn,
  transformQueryResult,
} from '../../../frontend/src/components/Chart/chartUtils'
import type { QueryResult } from '../../../frontend/src/types'

// ---------------------------------------------------------------------------
// isNumericValue テスト
// ---------------------------------------------------------------------------

describe('isNumericValue', () => {
  /**
   * 【テスト対象】isNumericValue
   * 【テスト内容】数値・数値文字列は true を返すこと
   * 【期待結果】true
   */
  it('should return true for numeric values', () => {
    expect(isNumericValue(0)).toBe(true)
    expect(isNumericValue(42)).toBe(true)
    expect(isNumericValue(-3.14)).toBe(true)
    expect(isNumericValue('123')).toBe(true)
    expect(isNumericValue('0')).toBe(true)
  })

  /**
   * 【テスト対象】isNumericValue
   * 【テスト内容】null / undefined / 空文字 / 非数値文字列は false を返すこと
   * 【期待結果】false
   */
  it('should return false for non-numeric values', () => {
    expect(isNumericValue(null)).toBe(false)
    expect(isNumericValue(undefined)).toBe(false)
    expect(isNumericValue('')).toBe(false)
    expect(isNumericValue('abc')).toBe(false)
    expect(isNumericValue(NaN)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isNumericColumn テスト
// ---------------------------------------------------------------------------

describe('isNumericColumn', () => {
  /**
   * 【テスト対象】isNumericColumn
   * 【テスト内容】全行が数値の列は true を返すこと
   * 【期待結果】true
   */
  it('should return true when all rows have numeric values for the column', () => {
    const rows = [
      { value: 10 },
      { value: 20 },
      { value: 30 },
    ]
    expect(isNumericColumn(rows, 'value')).toBe(true)
  })

  /**
   * 【テスト対象】isNumericColumn
   * 【テスト内容】1行でも非数値が含まれる列は false を返すこと
   * 【期待結果】false
   */
  it('should return false when any row has a non-numeric value', () => {
    const rows = [
      { value: 10 },
      { value: 'abc' },
      { value: 30 },
    ]
    expect(isNumericColumn(rows, 'value')).toBe(false)
  })

  /**
   * 【テスト対象】isNumericColumn
   * 【テスト内容】行が0件の場合は false を返すこと
   * 【期待結果】false
   */
  it('should return false for empty rows', () => {
    expect(isNumericColumn([], 'value')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// transformQueryResult テスト
// ---------------------------------------------------------------------------

describe('transformQueryResult', () => {
  /**
   * 【テスト対象】transformQueryResult
   * 【テスト内容】正常な2列データ（カテゴリ+数値）で変換できること
   * 【期待結果】canRender=true、xKey=1列目、valueKeys=[2列目]
   */
  it('should transform valid 2-column data correctly', () => {
    const result: QueryResult = {
      columns: ['month', 'sales'],
      rows: [
        { month: 'Jan', sales: 100 },
        { month: 'Feb', sales: 200 },
        { month: 'Mar', sales: 150 },
      ],
      chartType: 'bar',
    }

    const chartData = transformQueryResult(result)

    expect(chartData.canRender).toBe(true)
    expect(chartData.xKey).toBe('month')
    expect(chartData.valueKeys).toEqual(['sales'])
    expect(chartData.data).toHaveLength(3)
    expect(chartData.data[0]).toEqual({ month: 'Jan', sales: 100 })
    expect(chartData.data[1]).toEqual({ month: 'Feb', sales: 200 })
  })

  /**
   * 【テスト対象】transformQueryResult
   * 【テスト内容】3列以上（カテゴリ+複数数値系列）で複数valueKeysになること
   * 【期待結果】canRender=true、valueKeys に複数の列が含まれる
   */
  it('should handle multiple numeric value columns', () => {
    const result: QueryResult = {
      columns: ['category', 'a', 'b'],
      rows: [
        { category: 'X', a: 10, b: 20 },
        { category: 'Y', a: 30, b: 40 },
      ],
      chartType: 'line',
    }

    const chartData = transformQueryResult(result)

    expect(chartData.canRender).toBe(true)
    expect(chartData.valueKeys).toEqual(['a', 'b'])
    expect(chartData.data[0]).toEqual({ category: 'X', a: 10, b: 20 })
  })

  /**
   * 【テスト対象】transformQueryResult
   * 【テスト内容】空配列（rows=[]）の場合は canRender=false になること
   * 【期待結果】canRender=false
   */
  it('should return canRender=false for empty rows', () => {
    const result: QueryResult = {
      columns: ['name', 'value'],
      rows: [],
      chartType: null,
    }

    const chartData = transformQueryResult(result)

    expect(chartData.canRender).toBe(false)
    expect(chartData.data).toHaveLength(0)
  })

  /**
   * 【テスト対象】transformQueryResult
   * 【テスト内容】列が0件の場合は canRender=false になること
   * 【期待結果】canRender=false
   */
  it('should return canRender=false when columns is empty', () => {
    const result: QueryResult = {
      columns: [],
      rows: [{ value: 10 }],
      chartType: null,
    }

    const chartData = transformQueryResult(result)

    expect(chartData.canRender).toBe(false)
  })

  /**
   * 【テスト対象】transformQueryResult
   * 【テスト内容】1列のみ（数値系列なし）の場合は canRender=false になること
   * 【期待結果】canRender=false、valueKeys=[]
   */
  it('should return canRender=false when only 1 column exists', () => {
    const result: QueryResult = {
      columns: ['name'],
      rows: [{ name: 'Alice' }],
      chartType: null,
    }

    const chartData = transformQueryResult(result)

    expect(chartData.canRender).toBe(false)
    expect(chartData.valueKeys).toHaveLength(0)
  })

  /**
   * 【テスト対象】transformQueryResult
   * 【テスト内容】全列が非数値の場合は canRender=false にフォールバックすること
   * 【期待結果】canRender=false
   */
  it('should return canRender=false when no numeric columns exist', () => {
    const result: QueryResult = {
      columns: ['name', 'description'],
      rows: [
        { name: 'Alice', description: 'Engineer' },
        { name: 'Bob', description: 'Designer' },
      ],
      chartType: null,
    }

    const chartData = transformQueryResult(result)

    expect(chartData.canRender).toBe(false)
    expect(chartData.valueKeys).toHaveLength(0)
  })

  /**
   * 【テスト対象】transformQueryResult
   * 【テスト内容】数値と非数値が混在する列（非数値）はvalueKeysから除外されること
   * 【期待結果】混在列がvalueKeysに含まれない
   */
  it('should exclude mixed columns from valueKeys', () => {
    const result: QueryResult = {
      columns: ['category', 'numeric_col', 'mixed_col'],
      rows: [
        { category: 'A', numeric_col: 100, mixed_col: 'N/A' },
        { category: 'B', numeric_col: 200, mixed_col: 300 },
      ],
      chartType: null,
    }

    const chartData = transformQueryResult(result)

    // mixed_col は一部が非数値なので除外される
    expect(chartData.canRender).toBe(true)
    expect(chartData.valueKeys).toEqual(['numeric_col'])
  })

  /**
   * 【テスト対象】transformQueryResult
   * 【テスト内容】数値文字列（'123' など）も数値列として変換されること
   * 【期待結果】Number()変換されてdata内で数値型になる
   */
  it('should convert numeric string values to numbers', () => {
    const result: QueryResult = {
      columns: ['label', 'count'],
      rows: [
        { label: 'A', count: '42' },
        { label: 'B', count: '88' },
      ],
      chartType: 'bar',
    }

    const chartData = transformQueryResult(result)

    expect(chartData.canRender).toBe(true)
    expect(chartData.data[0]).toEqual({ label: 'A', count: 42 })
    expect(chartData.data[1]).toEqual({ label: 'B', count: 88 })
  })

  /**
   * 【テスト対象】transformQueryResult
   * 【テスト内容】xKey のカテゴリ値は文字列として保持されること
   * 【期待結果】data の xKey 値は String() 変換済みの文字列
   */
  it('should convert xKey values to strings', () => {
    const result: QueryResult = {
      columns: ['year', 'revenue'],
      rows: [
        { year: 2022, revenue: 500 },
        { year: 2023, revenue: 700 },
      ],
      chartType: 'line',
    }

    const chartData = transformQueryResult(result)

    // year は数値だが xKey として文字列に変換される
    expect(typeof chartData.data[0]['year']).toBe('string')
    expect(chartData.data[0]['year']).toBe('2022')
  })
})
