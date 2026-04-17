/**
 * BarChart コンポーネント
 *
 * QueryResult を受け取り、Recharts の BarChart で棒グラフとして描画する。
 *
 * 描画ルール:
 * - 1列目をX軸（カテゴリ）、2列目以降の数値列を系列として描画する
 * - 数値列が複数ある場合はグループ棒グラフになる
 * - データが空または数値列がない場合は「表示するデータがありません」を表示する
 *
 * XSS対策:
 * - Rechartsは内部でSVGを生成するため、ユーザー入力による危険なHTMLは挿入されない
 * - dangerouslySetInnerHTMLは使用しない
 */

import { memo, type FC } from 'react'
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { QueryResult } from '../../types'
import { transformQueryResult, CHART_COLORS } from './chartUtils'

/**
 * BarChart コンポーネントの Props
 *
 * @property result - クエリ実行結果（columns + rows）
 */
interface BarChartProps {
  result: QueryResult
}

/**
 * 棒グラフコンポーネント
 *
 * QueryResult の数値列を系列として描画する。
 * データが空または描画不可の場合はプレースホルダを表示する。
 *
 * @param props - BarChartProps
 */
const BarChart: FC<BarChartProps> = memo(({ result }) => {
  const { data, xKey, valueKeys, canRender } = transformQueryResult(result)

  // データが空または数値系列がない場合
  if (!canRender || data.length === 0) {
    return (
      <div className="chart-empty" role="status" aria-label="データなし">
        <p className="chart-empty__text">表示するデータがありません</p>
      </div>
    )
  }

  return (
    <div className="chart-wrapper bar-chart-wrapper">
      {/* ResponsiveContainerで親要素の幅に追従させる */}
      <ResponsiveContainer width="100%" height={360}>
        <RechartsBarChart
          data={data}
          margin={{ top: 16, right: 24, left: 0, bottom: 8 }}
        >
          {/* グリッド線 */}
          <CartesianGrid strokeDasharray="3 3" />

          {/* X軸: 1列目（カテゴリ） */}
          <XAxis
            dataKey={xKey}
            tick={{ fontSize: 12 }}
            // 長い文字列は truncate
            tickFormatter={(v) => String(v).length > 12 ? String(v).slice(0, 12) + '…' : String(v)}
          />

          {/* Y軸: 数値軸 */}
          <YAxis tick={{ fontSize: 12 }} />

          {/* ツールチップ（ホバー時の詳細値表示） */}
          <Tooltip />

          {/* 凡例（複数系列がある場合に有効） */}
          {valueKeys.length > 1 && <Legend />}

          {/* 系列ごとに Bar を描画する */}
          {valueKeys.map((vk, index) => (
            <Bar
              key={vk}
              dataKey={vk}
              // カラーパレットを循環して割り当てる
              fill={CHART_COLORS[index % CHART_COLORS.length]}
            />
          ))}
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  )
})

BarChart.displayName = 'BarChart'

export default BarChart
