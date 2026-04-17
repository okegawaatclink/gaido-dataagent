/**
 * ChartRenderer コンポーネント
 *
 * chart_type（'bar' | 'line' | 'pie' | 'table'）に応じて適切なグラフコンポーネントを
 * ディスパッチするコンテナコンポーネント。
 *
 * 機能:
 * - LLM推奨の chart_type に基づいてデフォルトのタブを選択する
 * - タブUIでユーザーが手動切替できる（受入条件4）
 * - DataTable.tsx を 'table' として統合する
 * - 数値系列がない場合は canRender=false となり table にフォールバックする
 *
 * タブの表示順: bar → line → pie → table
 *
 * XSS対策:
 * - chart_type の値は固定の文字列リテラルと比較するだけで、DOMに直接挿入しない
 * - 各子コンポーネント内でも dangerouslySetInnerHTML は使用しない
 */

import { useState, useMemo, type FC } from 'react'
import type { QueryResult, ChartType } from '../../types'
import BarChart from './BarChart'
import LineChart from './LineChart'
import PieChart from './PieChart'
import DataTable from './DataTable'
import { transformQueryResult } from './chartUtils'

/**
 * ChartRenderer コンポーネントの Props
 *
 * @property result    - クエリ実行結果（columns + rows + chartType）
 * @property chartType - LLMが推奨したグラフ種類（null の場合は 'table' を使用）
 */
interface ChartRendererProps {
  result: QueryResult
  chartType: ChartType | null
}

/**
 * タブの定義
 * 表示ラベルとdataTestIdを管理する
 */
const TAB_DEFINITIONS: { type: ChartType; label: string }[] = [
  { type: 'bar', label: '棒グラフ' },
  { type: 'line', label: '折れ線グラフ' },
  { type: 'pie', label: '円グラフ' },
  { type: 'table', label: 'テーブル' },
]

/**
 * グラフ/テーブルをchart_typeに応じてディスパッチするコンポーネント
 *
 * LLM推奨の chart_type をデフォルトタブとして選択し、
 * ユーザーがタブで任意に切り替えられるUIを提供する。
 *
 * @param props - ChartRendererProps
 */
const ChartRenderer: FC<ChartRendererProps> = ({ result, chartType }) => {
  // データが数値系列を含むか確認する（含まない場合はグラフタブを無効化）
  const { canRender: canShowChart } = useMemo(
    () => transformQueryResult(result),
    [result],
  )

  // デフォルトタブ:
  // LLM推奨のchart_typeが有効で、かつ数値系列がある場合はそのタブを使用する
  // それ以外は 'table' にフォールバックする
  const defaultTab: ChartType = useMemo(() => {
    if (chartType && chartType !== 'table' && canShowChart) {
      return chartType
    }
    return 'table'
  }, [chartType, canShowChart])

  const [activeTab, setActiveTab] = useState<ChartType>(defaultTab)

  return (
    <div className="chart-renderer" role="region" aria-label="クエリ結果ビューア">
      {/* タブナビゲーション */}
      <div className="chart-renderer__tabs" role="tablist" aria-label="グラフ種別切替">
        {TAB_DEFINITIONS.map(({ type, label }) => {
          // グラフタブは数値系列がない場合は無効化する
          const isDisabled = type !== 'table' && !canShowChart
          const isActive = activeTab === type

          return (
            <button
              key={type}
              role="tab"
              aria-selected={isActive}
              aria-controls={`chart-panel-${type}`}
              id={`chart-tab-${type}`}
              className={[
                'chart-renderer__tab',
                isActive ? 'chart-renderer__tab--active' : '',
                isDisabled ? 'chart-renderer__tab--disabled' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => !isDisabled && setActiveTab(type)}
              disabled={isDisabled}
              // 無効化理由をスクリーンリーダー向けに提供する
              aria-label={
                isDisabled ? `${label}（数値データが必要です）` : label
              }
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* タブパネル（アクティブなタイプのみ表示） */}
      <div
        id={`chart-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`chart-tab-${activeTab}`}
        className="chart-renderer__panel"
      >
        {activeTab === 'bar' && <BarChart result={result} />}
        {activeTab === 'line' && <LineChart result={result} />}
        {activeTab === 'pie' && <PieChart result={result} />}
        {activeTab === 'table' && <DataTable result={result} />}
      </div>
    </div>
  )
}

export default ChartRenderer
