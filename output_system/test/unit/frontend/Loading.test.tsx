/**
 * Loading コンポーネントのユニットテスト
 *
 * テスト対象: frontend/src/components/common/Loading.tsx
 * - デフォルトメッセージ表示
 * - カスタムメッセージ表示
 * - role="status" アクセシビリティ
 * - ドットアニメーション要素の存在
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Loading from '../../../frontend/src/components/common/Loading'

describe('Loading', () => {
  /**
   * 【テスト対象】Loading
   * 【テスト内容】デフォルトメッセージ「考え中...」が表示されること
   * 【期待結果】デフォルトテキストがDOMに存在すること
   */
  it('should render default message', () => {
    render(<Loading />)
    expect(screen.getByText('考え中...')).toBeInTheDocument()
  })

  /**
   * 【テスト対象】Loading
   * 【テスト内容】カスタムメッセージが表示されること
   * 【期待結果】message プロパティの内容が表示されること
   */
  it('should render custom message', () => {
    render(<Loading message="SQLを生成しています..." />)
    expect(screen.getByText('SQLを生成しています...')).toBeInTheDocument()
  })

  /**
   * 【テスト対象】Loading
   * 【テスト内容】role="status" が設定されていること
   * 【期待結果】status ロールのDOM要素が存在すること
   */
  it('should have role="status" for accessibility', () => {
    render(<Loading />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  /**
   * 【テスト対象】Loading
   * 【テスト内容】3つのドット要素が存在すること
   * 【期待結果】loading-dot クラスの要素が3つ存在すること
   */
  it('should render three loading dots', () => {
    const { container } = render(<Loading />)
    const dots = container.querySelectorAll('.loading-dot')
    expect(dots).toHaveLength(3)
  })
})
