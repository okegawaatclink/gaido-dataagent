/**
 * StreamingText コンポーネントのユニットテスト
 *
 * テスト対象: frontend/src/components/Chat/StreamingText.tsx
 * - テキスト表示
 * - 改行の <br> 変換
 * - ストリーミング中のカーソル表示
 * - ストリーミング完了後のカーソル非表示
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StreamingText from '../../../frontend/src/components/Chat/StreamingText'

describe('StreamingText', () => {
  /**
   * 【テスト対象】StreamingText
   * 【テスト内容】テキストが表示されること
   * 【期待結果】渡したテキストがDOMに存在すること
   */
  it('should render text content', () => {
    render(<StreamingText text="こんにちは" isStreaming={false} />)
    expect(screen.getByText('こんにちは')).toBeInTheDocument()
  })

  /**
   * 【テスト対象】StreamingText
   * 【テスト内容】改行を含むテキストが複数行で表示されること
   * 【期待結果】<br> タグが挿入されること
   */
  it('should split text by newlines with br elements', () => {
    const { container } = render(
      <StreamingText text={'行1\n行2\n行3'} isStreaming={false} />
    )
    const brs = container.querySelectorAll('br')
    expect(brs).toHaveLength(2)
  })

  /**
   * 【テスト対象】StreamingText
   * 【テスト内容】ストリーミング中にカーソルが表示されること
   * 【期待結果】streaming-cursor クラスの要素が存在すること
   */
  it('should show cursor when streaming', () => {
    const { container } = render(
      <StreamingText text="応答中" isStreaming={true} />
    )
    const cursor = container.querySelector('.streaming-cursor')
    expect(cursor).toBeInTheDocument()
    expect(cursor).toHaveAttribute('aria-hidden', 'true')
  })

  /**
   * 【テスト対象】StreamingText
   * 【テスト内容】ストリーミング完了後にカーソルが非表示になること
   * 【期待結果】streaming-cursor クラスの要素が存在しないこと
   */
  it('should not show cursor when not streaming', () => {
    const { container } = render(
      <StreamingText text="完了" isStreaming={false} />
    )
    const cursor = container.querySelector('.streaming-cursor')
    expect(cursor).not.toBeInTheDocument()
  })

  /**
   * 【テスト対象】StreamingText
   * 【テスト内容】空テキストの場合にカーソルのみ表示されること
   * 【期待結果】テキストは空でカーソルが存在すること
   */
  it('should show only cursor with empty text when streaming', () => {
    const { container } = render(
      <StreamingText text="" isStreaming={true} />
    )
    const cursor = container.querySelector('.streaming-cursor')
    expect(cursor).toBeInTheDocument()
  })
})
