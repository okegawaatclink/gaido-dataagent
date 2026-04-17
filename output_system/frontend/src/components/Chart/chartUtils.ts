/**
 * Recharts データ変換ユーティリティ
 *
 * QueryResult（{columns: string[], rows: Record<string, unknown>[]}）を
 * Rechartsが扱えるフラットなオブジェクト配列に変換するヘルパー群。
 *
 * 変換戦略:
 * - 1列目をカテゴリ（X軸ラベル / Pieのname）として扱う
 * - 2列目以降を数値系列（dataKey）として扱う
 * - 数値に変換できない列はスキップし、全系列が非数値の場合はフォールバック
 *
 * XSS対策:
 * - 変換後のデータはすべてReactの自動エスケープで安全に描画される
 * - dangerouslySetInnerHTMLは一切使用しない
 */

import type { QueryResult } from '../../types'

/**
 * Rechartsに渡すデータポイントの型
 * キーが列名、値がカテゴリ文字列または数値
 */
export type ChartDataPoint = Record<string, string | number>

/**
 * グラフ描画に必要な変換済みデータ構造
 *
 * @property data     - Rechartsに渡すデータ配列
 * @property xKey    - X軸（カテゴリ）のdataKey
 * @property valueKeys - 数値系列のdataKey配列（bar/line用）
 * @property canRender - グラフ描画が可能かどうか
 */
export interface ChartData {
  data: ChartDataPoint[]
  xKey: string
  valueKeys: string[]
  canRender: boolean
}

/**
 * 値が数値に変換可能かどうかを判定する
 *
 * null/undefined/空文字は数値変換不可として扱う。
 * '123'のような数値文字列は変換可能と判定する。
 *
 * @param value - 判定対象の値
 * @returns 数値変換可能ならtrue
 */
export function isNumericValue(value: unknown): boolean {
  if (value === null || value === undefined || value === '') {
    return false
  }
  const num = Number(value)
  return !isNaN(num)
}

/**
 * 列全体が数値系列かどうかを判定する
 *
 * 全行の当該列値が数値変換可能な場合にtrueを返す。
 * 行が0件の場合はfalse（グラフ化できないため）。
 *
 * @param rows   - QueryResultのrowsデータ
 * @param colKey - 判定対象の列名
 * @returns 列全体が数値ならtrue
 */
export function isNumericColumn(
  rows: Record<string, unknown>[],
  colKey: string,
): boolean {
  if (rows.length === 0) return false
  return rows.every((row) => isNumericValue(row[colKey]))
}

/**
 * QueryResult をRechartsで描画可能なデータ形式に変換する
 *
 * 変換戦略:
 * 1. columns[0] をX軸キー（カテゴリ）とする
 * 2. columns[1..] のうち数値列をvalueKeysとする
 * 3. 数値列が1列もない場合は canRender=false でフォールバック
 *
 * エッジケース:
 * - データ0件: canRender=false
 * - 1列のみ: canRender=false（数値系列なし）
 * - 全列非数値: canRender=false
 *
 * @param result - クエリ実行結果
 * @returns グラフ描画用データ
 */
export function transformQueryResult(result: QueryResult): ChartData {
  const { columns, rows } = result

  // データが空の場合
  if (rows.length === 0 || columns.length === 0) {
    return {
      data: [],
      xKey: '',
      valueKeys: [],
      canRender: false,
    }
  }

  // 1列のみの場合は数値系列がないためグラフ化不可
  if (columns.length < 2) {
    return {
      data: [],
      xKey: columns[0] ?? '',
      valueKeys: [],
      canRender: false,
    }
  }

  const xKey = columns[0]

  // 2列目以降の数値列を抽出する
  const valueKeys = columns.slice(1).filter((col) => isNumericColumn(rows, col))

  // 数値列が1列もない場合はフォールバック
  if (valueKeys.length === 0) {
    return {
      data: [],
      xKey,
      valueKeys: [],
      canRender: false,
    }
  }

  // Rechartsに渡すデータポイント配列を構築する
  // セル値はすべてstring | numberに正規化する
  const data: ChartDataPoint[] = rows.map((row) => {
    const point: ChartDataPoint = {
      [xKey]: String(row[xKey] ?? ''),
    }
    for (const vk of valueKeys) {
      point[vk] = Number(row[vk])
    }
    return point
  })

  return {
    data,
    xKey,
    valueKeys,
    canRender: true,
  }
}

/**
 * Rechartsのデフォルトカラーパレット
 *
 * 複数系列を描画するときのデフォルト色配列。
 * valueKeysのindex順で割り当てる。
 */
export const CHART_COLORS = [
  '#8884d8',
  '#82ca9d',
  '#ffc658',
  '#ff7300',
  '#0088fe',
  '#00C49F',
  '#FFBB28',
  '#FF8042',
] as const
