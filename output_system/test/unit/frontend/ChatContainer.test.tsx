/**
 * ChatContainer コンポーネントのユニットテスト
 *
 * テスト対象: frontend/src/components/Chat/ChatContainer.tsx
 * - ウェルカムメッセージ表示
 * - メッセージリスト表示
 * - ローディング状態
 * - ChatInput との統合
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ChatContainer from '../../../frontend/src/components/Chat/ChatContainer'
import type { ChatMessage as ChatMessageType } from '../../../frontend/src/types'

// ChartRenderer をモック（Recharts依存を回避）
vi.mock('../../../frontend/src/components/Chart/ChartRenderer', () => ({
  default: () => <div data-testid="chart-renderer">ChartRenderer</div>,
}))

/**
 * テスト用のメッセージオブジェクトを生成するヘルパー
 */
function createMessage(overrides: Partial<ChatMessageType> = {}): ChatMessageType {
  return {
    id: 'msg-1',
    role: 'user',
    content: 'テスト質問',
    sql: null,
    chartType: null,
    result: null,
    error: null,
    analysis: null,
    isStreaming: false,
    createdAt: new Date(),
    ...overrides,
  }
}

describe('ChatContainer', () => {
  /**
   * 【テスト対象】ChatContainer
   * 【テスト内容】メッセージが0件の場合にウェルカムメッセージが表示されること
   * 【期待結果】「DataAgent へようこそ」テキストが存在すること
   */
  it('should show welcome message when no messages', () => {
    render(
      <ChatContainer messages={[]} isLoading={false} onSend={vi.fn()} />
    )
    expect(screen.getByText('DataAgent へようこそ')).toBeInTheDocument()
  })

  /**
   * 【テスト対象】ChatContainer
   * 【テスト内容】質問例が表示されること
   * 【期待結果】例文がリストに存在すること
   */
  it('should show example questions in welcome message', () => {
    render(
      <ChatContainer messages={[]} isLoading={false} onSend={vi.fn()} />
    )
    expect(screen.getByText('今月の売上トップ10を教えて')).toBeInTheDocument()
  })

  /**
   * 【テスト対象】ChatContainer
   * 【テスト内容】メッセージがある場合にウェルカムメッセージが非表示であること
   * 【期待結果】「DataAgent へようこそ」が存在しないこと
   */
  it('should not show welcome message when messages exist', () => {
    const messages = [createMessage()]
    render(
      <ChatContainer messages={messages} isLoading={false} onSend={vi.fn()} />
    )
    expect(screen.queryByText('DataAgent へようこそ')).not.toBeInTheDocument()
  })

  /**
   * 【テスト対象】ChatContainer
   * 【テスト内容】メッセージリストが表示されること
   * 【期待結果】各メッセージのコンテンツが表示されること
   */
  it('should render message list', () => {
    const messages = [
      createMessage({ id: 'msg-1', role: 'user', content: '質問1' }),
      createMessage({ id: 'msg-2', role: 'assistant', content: '回答1' }),
    ]
    render(
      <ChatContainer messages={messages} isLoading={false} onSend={vi.fn()} />
    )
    expect(screen.getByText('質問1')).toBeInTheDocument()
    expect(screen.getByText('回答1')).toBeInTheDocument()
  })

  /**
   * 【テスト対象】ChatContainer
   * 【テスト内容】ローディング中にLoading要素が表示されること（奇数メッセージ時）
   * 【期待結果】「SQLを生成しています...」が表示されること
   */
  it('should show loading indicator when isLoading and odd messages', () => {
    const messages = [
      createMessage({ id: 'msg-1', role: 'user', content: '質問' }),
    ]
    render(
      <ChatContainer messages={messages} isLoading={true} onSend={vi.fn()} />
    )
    expect(screen.getByText('SQLを生成しています...')).toBeInTheDocument()
  })

  /**
   * 【テスト対象】ChatContainer
   * 【テスト内容】偶数メッセージ数の場合にLoading要素が表示されないこと
   * 【期待結果】「SQLを生成しています...」が存在しないこと
   */
  it('should not show loading when even number of messages', () => {
    const messages = [
      createMessage({ id: 'msg-1', role: 'user', content: '質問' }),
      createMessage({ id: 'msg-2', role: 'assistant', content: '回答' }),
    ]
    render(
      <ChatContainer messages={messages} isLoading={true} onSend={vi.fn()} />
    )
    expect(screen.queryByText('SQLを生成しています...')).not.toBeInTheDocument()
  })

  /**
   * 【テスト対象】ChatContainer
   * 【テスト内容】ChatInput が表示されること
   * 【期待結果】テキストエリアが存在すること
   */
  it('should render ChatInput', () => {
    render(
      <ChatContainer messages={[]} isLoading={false} onSend={vi.fn()} />
    )
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  /**
   * 【テスト対象】ChatContainer
   * 【テスト内容】チャットエリアのアクセシビリティ属性が正しいこと
   * 【期待結果】role="log" と aria-label が存在すること
   */
  it('should have accessibility attributes on chat area', () => {
    render(
      <ChatContainer messages={[]} isLoading={false} onSend={vi.fn()} />
    )
    expect(screen.getByRole('log')).toHaveAttribute('aria-label', 'チャット履歴')
  })

  /**
   * 【テスト対象】ChatContainer
   * 【テスト内容】isLoading 中かつメッセージ0件の場合にウェルカムが非表示であること
   * 【期待結果】isLoading=true かつ messages=[] の場合ウェルカムメッセージが表示されないこと
   */
  it('should not show welcome when isLoading with no messages', () => {
    render(
      <ChatContainer messages={[]} isLoading={true} onSend={vi.fn()} />
    )
    expect(screen.queryByText('DataAgent へようこそ')).not.toBeInTheDocument()
  })
})
