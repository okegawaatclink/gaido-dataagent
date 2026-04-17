/**
 * 【モジュール】frontend/src/components/Chart/BarChart, LineChart, PieChart, ChartRenderer
 *
 * 各グラフコンポーネントのユニットテスト。
 * - 正常データで SVG 要素が描画されること
 * - 空データで「表示するデータがありません」が表示されること
 * - ChartRenderer が chart_type に応じてコンポーネントを切り替えること
 * - ChartRenderer のタブ切替が機能すること
 */

import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import BarChart from '../../../frontend/src/components/Chart/BarChart'
import LineChart from '../../../frontend/src/components/Chart/LineChart'
import PieChart from '../../../frontend/src/components/Chart/PieChart'
import ChartRenderer from '../../../frontend/src/components/Chart/ChartRenderer'
import type { QueryResult } from '../../../frontend/src/types'

// ---------------------------------------------------------------------------
// Recharts ResponsiveContainer モック
//
// jsdom 環境では親コンテナのサイズが 0 のため、ResponsiveContainer が
// 内部の SVG を描画しない。テスト用に「幅・高さを固定した div で子要素をレンダリング」
// するモックに差し替えることで、グラフ SVG の描画を確認できるようにする。
//
// vi.mock は vitest によって自動的にホイストされるためトップレベルに記述する。
// ---------------------------------------------------------------------------
import { vi } from 'vitest'
vi.mock('recharts', async (importOriginal) => {
  const original = await importOriginal<typeof import('recharts')>()
  return {
    ...original,
    /**
     * ResponsiveContainer をシンプルな div に置き換える
     * width/height props は div のスタイルに反映するだけで良い
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', { 'data-testid': 'recharts-responsive-container' }, children),
  }
})

// ---------------------------------------------------------------------------
// テスト用データ
// ---------------------------------------------------------------------------

/**
 * 正常な数値系列を含む QueryResult（グラフ描画可能）
 */
const validResult: QueryResult = {
  columns: ['month', 'sales'],
  rows: [
    { month: 'Jan', sales: 100 },
    { month: 'Feb', sales: 200 },
    { month: 'Mar', sales: 150 },
  ],
  chartType: 'bar',
}

/**
 * 空データ（グラフ描画不可）
 */
const emptyResult: QueryResult = {
  columns: ['month', 'sales'],
  rows: [],
  chartType: null,
}

/**
 * 非数値のみのデータ（グラフ描画不可）
 */
const nonNumericResult: QueryResult = {
  columns: ['name', 'role'],
  rows: [
    { name: 'Alice', role: 'Engineer' },
    { name: 'Bob', role: 'Designer' },
  ],
  chartType: 'table',
}

// ---------------------------------------------------------------------------
// BarChart テスト
// ---------------------------------------------------------------------------

describe('BarChart', () => {
  /**
   * 【テスト対象】BarChart コンポーネント
   * 【テスト内容】正常データで ResponsiveContainer（グラフのラッパー）が描画されること
   * 【期待結果】recharts-responsive-container の data-testid が DOM に存在する
   *
   * 補足: jsdom 環境では Recharts の SVG は描画されないため、
   * ResponsiveContainer のモックを data-testid で確認する。
   */
  it('should render SVG element for valid data', () => {
    render(<BarChart result={validResult} />)
    expect(screen.getByTestId('recharts-responsive-container')).toBeInTheDocument()
  })

  /**
   * 【テスト対象】BarChart コンポーネント
   * 【テスト内容】空データで「表示するデータがありません」が表示されること
   * 【期待結果】プレースホルダテキストが表示される
   */
  it('should show empty placeholder for empty data', () => {
    render(<BarChart result={emptyResult} />)
    expect(screen.getByText('表示するデータがありません')).toBeInTheDocument()
  })

  /**
   * 【テスト対象】BarChart コンポーネント
   * 【テスト内容】全列が非数値の場合にプレースホルダが表示されること
   * 【期待結果】「表示するデータがありません」が表示される
   */
  it('should show empty placeholder when no numeric columns', () => {
    render(<BarChart result={nonNumericResult} />)
    expect(screen.getByText('表示するデータがありません')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// LineChart テスト
// ---------------------------------------------------------------------------

describe('LineChart', () => {
  /**
   * 【テスト対象】LineChart コンポーネント
   * 【テスト内容】正常データで ResponsiveContainer（グラフのラッパー）が描画されること
   * 【期待結果】recharts-responsive-container の data-testid が DOM に存在する
   *
   * 補足: jsdom 環境では Recharts の SVG は描画されないため、
   * ResponsiveContainer のモックを data-testid で確認する。
   */
  it('should render SVG element for valid data', () => {
    render(<LineChart result={validResult} />)
    expect(screen.getByTestId('recharts-responsive-container')).toBeInTheDocument()
  })

  /**
   * 【テスト対象】LineChart コンポーネント
   * 【テスト内容】空データで「表示するデータがありません」が表示されること
   * 【期待結果】プレースホルダテキストが表示される
   */
  it('should show empty placeholder for empty data', () => {
    render(<LineChart result={emptyResult} />)
    expect(screen.getByText('表示するデータがありません')).toBeInTheDocument()
  })

  /**
   * 【テスト対象】LineChart コンポーネント
   * 【テスト内容】1列のみ（数値系列なし）の場合にプレースホルダが表示されること
   * 【期待結果】「表示するデータがありません」が表示される
   */
  it('should show empty placeholder when only category column exists', () => {
    const singleColResult: QueryResult = {
      columns: ['name'],
      rows: [{ name: 'Alice' }],
      chartType: null,
    }
    render(<LineChart result={singleColResult} />)
    expect(screen.getByText('表示するデータがありません')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// PieChart テスト
// ---------------------------------------------------------------------------

describe('PieChart', () => {
  /**
   * 【テスト対象】PieChart コンポーネント
   * 【テスト内容】正常データで ResponsiveContainer（グラフのラッパー）が描画されること
   * 【期待結果】recharts-responsive-container の data-testid が DOM に存在する
   *
   * 補足: jsdom 環境では Recharts の SVG は描画されないため、
   * ResponsiveContainer のモックを data-testid で確認する。
   */
  it('should render SVG element for valid data', () => {
    render(<PieChart result={validResult} />)
    expect(screen.getByTestId('recharts-responsive-container')).toBeInTheDocument()
  })

  /**
   * 【テスト対象】PieChart コンポーネント
   * 【テスト内容】空データで「表示するデータがありません」が表示されること
   * 【期待結果】プレースホルダテキストが表示される
   */
  it('should show empty placeholder for empty data', () => {
    render(<PieChart result={emptyResult} />)
    expect(screen.getByText('表示するデータがありません')).toBeInTheDocument()
  })

  /**
   * 【テスト対象】PieChart コンポーネント
   * 【テスト内容】全列が非数値の場合にプレースホルダが表示されること
   * 【期待結果】「表示するデータがありません」が表示される
   */
  it('should show empty placeholder when no numeric columns', () => {
    render(<PieChart result={nonNumericResult} />)
    expect(screen.getByText('表示するデータがありません')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// ChartRenderer テスト
// ---------------------------------------------------------------------------

describe('ChartRenderer', () => {
  /**
   * 【テスト対象】ChartRenderer コンポーネント
   * 【テスト内容】chart_type='bar' の時に棒グラフタブがアクティブになること
   * 【期待結果】棒グラフタブの aria-selected が true
   */
  it('should activate bar tab when chartType is bar', () => {
    render(<ChartRenderer result={validResult} chartType="bar" />)
    const barTab = screen.getByRole('tab', { name: '棒グラフ' })
    expect(barTab).toHaveAttribute('aria-selected', 'true')
  })

  /**
   * 【テスト対象】ChartRenderer コンポーネント
   * 【テスト内容】chart_type='line' の時に折れ線グラフタブがアクティブになること
   * 【期待結果】折れ線グラフタブの aria-selected が true
   */
  it('should activate line tab when chartType is line', () => {
    render(<ChartRenderer result={validResult} chartType="line" />)
    const lineTab = screen.getByRole('tab', { name: '折れ線グラフ' })
    expect(lineTab).toHaveAttribute('aria-selected', 'true')
  })

  /**
   * 【テスト対象】ChartRenderer コンポーネント
   * 【テスト内容】chart_type='pie' の時に円グラフタブがアクティブになること
   * 【期待結果】円グラフタブの aria-selected が true
   */
  it('should activate pie tab when chartType is pie', () => {
    render(<ChartRenderer result={validResult} chartType="pie" />)
    const pieTab = screen.getByRole('tab', { name: '円グラフ' })
    expect(pieTab).toHaveAttribute('aria-selected', 'true')
  })

  /**
   * 【テスト対象】ChartRenderer コンポーネント
   * 【テスト内容】chart_type='table' の時にテーブルタブがアクティブになること
   * 【期待結果】テーブルタブの aria-selected が true
   */
  it('should activate table tab when chartType is table', () => {
    render(<ChartRenderer result={validResult} chartType="table" />)
    const tableTab = screen.getByRole('tab', { name: 'テーブル' })
    expect(tableTab).toHaveAttribute('aria-selected', 'true')
  })

  /**
   * 【テスト対象】ChartRenderer コンポーネント
   * 【テスト内容】chart_type=null の時はデフォルトでテーブルタブがアクティブになること
   * 【期待結果】テーブルタブの aria-selected が true
   */
  it('should default to table tab when chartType is null', () => {
    render(<ChartRenderer result={validResult} chartType={null} />)
    const tableTab = screen.getByRole('tab', { name: 'テーブル' })
    expect(tableTab).toHaveAttribute('aria-selected', 'true')
  })

  /**
   * 【テスト対象】ChartRenderer コンポーネント
   * 【テスト内容】非数値データの場合にグラフタブが無効化されること
   * 【期待結果】棒グラフ・折れ線グラフ・円グラフタブが disabled
   */
  it('should disable chart tabs when no numeric data', () => {
    render(<ChartRenderer result={nonNumericResult} chartType="bar" />)

    const barTab = screen.getByRole('tab', { name: /棒グラフ/ })
    const lineTab = screen.getByRole('tab', { name: /折れ線グラフ/ })
    const pieTab = screen.getByRole('tab', { name: /円グラフ/ })
    const tableTab = screen.getByRole('tab', { name: 'テーブル' })

    // グラフタブは無効化される
    expect(barTab).toBeDisabled()
    expect(lineTab).toBeDisabled()
    expect(pieTab).toBeDisabled()

    // テーブルタブは有効のまま
    expect(tableTab).not.toBeDisabled()
  })

  /**
   * 【テスト対象】ChartRenderer コンポーネント
   * 【テスト内容】タブクリックでグラフ種を手動切替できること
   * 【期待結果】クリックしたタブの aria-selected が true になる
   */
  it('should switch active tab on click', () => {
    render(<ChartRenderer result={validResult} chartType="bar" />)

    // 最初は bar タブがアクティブ
    const barTab = screen.getByRole('tab', { name: '棒グラフ' })
    expect(barTab).toHaveAttribute('aria-selected', 'true')

    // line タブをクリックして切替
    const lineTab = screen.getByRole('tab', { name: '折れ線グラフ' })
    fireEvent.click(lineTab)

    expect(lineTab).toHaveAttribute('aria-selected', 'true')
    expect(barTab).toHaveAttribute('aria-selected', 'false')
  })

  /**
   * 【テスト対象】ChartRenderer コンポーネント
   * 【テスト内容】全タブが存在すること（タブナビゲーションの完全性）
   * 【期待結果】棒グラフ・折れ線グラフ・円グラフ・テーブルの4タブが存在する
   */
  it('should render all 4 tabs', () => {
    render(<ChartRenderer result={validResult} chartType="bar" />)

    expect(screen.getByRole('tab', { name: '棒グラフ' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '折れ線グラフ' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '円グラフ' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'テーブル' })).toBeInTheDocument()
  })
})
