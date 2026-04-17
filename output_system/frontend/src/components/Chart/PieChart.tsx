/**
 * PieChart コンポーネント
 *
 * QueryResult を受け取り、Recharts の PieChart で円グラフとして描画する。
 *
 * 描画ルール:
 * - 1列目をセクターの名前（nameKey）として扱う
 * - 2列目（最初の数値列）をセクターの値（dataKey）として描画する
 * - データが空または数値列がない場合は「表示するデータがありません」を表示する
 *
 * 円グラフは1つの数値系列のみを扱う（複数系列は最初の1列のみ使用）。
 *
 * XSS対策:
 * - RechartsはSVGを生成するため、ユーザー入力による危険なHTMLは挿入されない
 * - dangerouslySetInnerHTMLは使用しない
 */

import { memo, type FC } from 'react'
import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { QueryResult } from '../../types'
import { transformQueryResult, CHART_COLORS } from './chartUtils'

/**
 * PieChart コンポーネントの Props
 *
 * @property result - クエリ実行結果（columns + rows）
 */
interface PieChartProps {
  result: QueryResult
}

/**
 * 円グラフコンポーネント
 *
 * QueryResult の最初の数値列を値として円グラフを描画する。
 * データが空または描画不可の場合はプレースホルダを表示する。
 *
 * @param props - PieChartProps
 */
const PieChart: FC<PieChartProps> = memo(({ result }) => {
  const { data, xKey, valueKeys, canRender } = transformQueryResult(result)

  // データが空または数値系列がない場合
  if (!canRender || data.length === 0) {
    return (
      <div className="chart-empty" role="status" aria-label="データなし">
        <p className="chart-empty__text">表示するデータがありません</p>
      </div>
    )
  }

  // 円グラフは最初の数値列のみを使用する
  const valueKey = valueKeys[0]

  return (
    <div className="chart-wrapper pie-chart-wrapper">
      {/* ResponsiveContainerで親要素の幅に追従させる */}
      <ResponsiveContainer width="100%" height={360}>
        <RechartsPieChart margin={{ top: 16, right: 24, left: 24, bottom: 8 }}>
          <Pie
            data={data}
            dataKey={valueKey}
            nameKey={xKey}
            cx="50%"
            cy="50%"
            outerRadius={130}
            // ラベルにパーセンテージを表示する
            label={({ name, percent }) =>
              `${String(name).length > 10 ? String(name).slice(0, 10) + '…' : name} (${(percent * 100).toFixed(1)}%)`
            }
          >
            {/* セクターごとにカラーパレットから色を割り当てる */}
            {data.map((_entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={CHART_COLORS[index % CHART_COLORS.length]}
              />
            ))}
          </Pie>

          {/* ツールチップ（ホバー時の詳細値表示） */}
          <Tooltip formatter={(value) => [value, valueKey]} />

          {/* 凡例 */}
          <Legend />
        </RechartsPieChart>
      </ResponsiveContainer>
    </div>
  )
})

PieChart.displayName = 'PieChart'

export default PieChart
