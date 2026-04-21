/**
 * ChatMessage コンポーネントのユニットテスト
 *
 * テスト対象: frontend/src/components/Chat/ChatMessage.tsx
 * - user/assistant ロール表示
 * - StreamingText / SQLDisplay / ErrorMessage の条件付きレンダリング
 * - アクセシビリティ属性
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ChatMessage from '../../../frontend/src/components/Chat/ChatMessage'
import type { ChatMessage as ChatMessageType } from '../../../frontend/src/types'

// ChartRenderer をモック（Recharts依存を回避）
vi.mock('../../../frontend/src/components/Chart/ChartRenderer', () => ({
  default: ({ result }: { result: unknown }) => (
    <div data-testid="chart-renderer">ChartRenderer mock</div>
  ),
}))

/**
 * テスト用のメッセージオブジェクトを生成するヘルパー
 */
function createMessage(overrides: Partial<ChatMessageType> = {}): ChatMessageType {
  return {
    id: 'msg-1',
    role: 'user',
    content: '',
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

describe('ChatMessage', () => {
  /**
   * 【テスト対象】ChatMessage
   * 【テスト内容】ユーザーメッセージが正しく表示されること
   * 【期待結果】user ロールのスタイルとラベルが適用されること
   */
  it('should render user message with correct style', () => {
    const message = createMessage({ role: 'user', content: 'こんにちは' })
    const { container } = render(<ChatMessage message={message} />)

    expect(container.querySelector('.chat-message--user')).toBeInTheDocument()
    expect(screen.getByText('あなた')).toBeInTheDocument()
    expect(screen.getByText('こんにちは')).toBeInTheDocument()
  })

  /**
   * 【テスト対象】ChatMessage
   * 【テスト内容】アシスタントメッセージが正しく表示されること
   * 【期待結果】assistant ロールのスタイルとラベルが適用されること
   */
  it('should render assistant message with correct style', () => {
    const message = createMessage({ role: 'assistant', content: '回答です' })
    const { container } = render(<ChatMessage message={message} />)

    expect(container.querySelector('.chat-message--assistant')).toBeInTheDocument()
    expect(screen.getByText('DataAgent')).toBeInTheDocument()
  })

  /**
   * 【テスト対象】ChatMessage
   * 【テスト内容】SQLがある場合にSQLDisplayが表示されること
   * 【期待結果】sql-display クラスの要素が存在すること
   */
  it('should render SQLDisplay when sql is present in assistant message', () => {
    const message = createMessage({
      role: 'assistant',
      content: 'SQLを生成しました',
      sql: 'SELECT * FROM users',
    })
    const { container } = render(<ChatMessage message={message} />)

    expect(container.querySelector('.chat-message__sql')).toBeInTheDocument()
  })

  /**
   * 【テスト対象】ChatMessage
   * 【テスト内容】SQLがない場合にSQLDisplayが表示されないこと
   * 【期待結果】chat-message__sql クラスの要素が存在しないこと
   */
  it('should not render SQLDisplay when sql is null', () => {
    const message = createMessage({ role: 'assistant', content: 'テキストのみ' })
    const { container } = render(<ChatMessage message={message} />)

    expect(container.querySelector('.chat-message__sql')).not.toBeInTheDocument()
  })

  /**
   * 【テスト対象】ChatMessage
   * 【テスト内容】結果がある場合にChartRendererが表示されること
   * 【期待結果】chart-renderer テストIDの要素が存在すること
   */
  it('should render ChartRenderer when result is present', () => {
    const message = createMessage({
      role: 'assistant',
      content: '結果です',
      result: { columns: ['id'], rows: [{ id: 1 }], chartType: 'table' },
    })
    render(<ChatMessage message={message} />)

    expect(screen.getByTestId('chart-renderer')).toBeInTheDocument()
  })

  /**
   * 【テスト対象】ChatMessage
   * 【テスト内容】エラーがある場合にErrorMessageが表示されること
   * 【期待結果】error-message クラスの要素が存在すること
   */
  it('should render ErrorMessage when error is present', () => {
    const message = createMessage({
      role: 'assistant',
      content: '',
      error: 'SQLの実行に失敗しました',
    })
    render(<ChatMessage message={message} />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('SQLの実行に失敗しました')).toBeInTheDocument()
  })

  /**
   * 【テスト対象】ChatMessage
   * 【テスト内容】ストリーミング中でコンテンツが空の場合にカーソルが表示されること
   * 【期待結果】streaming-cursor が表示されること
   */
  it('should show cursor when streaming with empty content', () => {
    const message = createMessage({
      role: 'assistant',
      content: '',
      isStreaming: true,
    })
    const { container } = render(<ChatMessage message={message} />)

    expect(container.querySelector('.streaming-cursor')).toBeInTheDocument()
  })

  /**
   * 【テスト対象】ChatMessage
   * 【テスト内容】アクセシビリティ属性が正しく設定されていること
   * 【期待結果】role="article" と aria-label が存在すること
   */
  it('should have proper accessibility attributes for user message', () => {
    const message = createMessage({ role: 'user', content: 'テスト' })
    render(<ChatMessage message={message} />)

    expect(screen.getByRole('article')).toHaveAttribute(
      'aria-label',
      'ユーザーのメッセージ'
    )
  })

  /**
   * 【テスト対象】ChatMessage
   * 【テスト内容】アシスタントメッセージの aria-label が正しいこと
   * 【期待結果】aria-label に「アシスタントのメッセージ」が設定されること
   */
  it('should have proper accessibility attributes for assistant message', () => {
    const message = createMessage({ role: 'assistant', content: '応答' })
    render(<ChatMessage message={message} />)

    expect(screen.getByRole('article')).toHaveAttribute(
      'aria-label',
      'アシスタントのメッセージ'
    )
  })

  /**
   * 【テスト対象】ChatMessage
   * 【テスト内容】analysis がある場合にAI分析セクションが表示されること
   * 【期待結果】analysis-header と analysis テキストが存在すること
   */
  it('should render analysis section when analysis is present', () => {
    const message = createMessage({
      role: 'assistant',
      content: 'SQLを実行しました',
      analysis: '売上が前月比120%増加しています',
    })
    const { container } = render(<ChatMessage message={message} />)

    expect(container.querySelector('.chat-message__analysis')).toBeInTheDocument()
    expect(screen.getByText('AIの分析')).toBeInTheDocument()
  })

  /**
   * 【テスト対象】ChatMessage
   * 【テスト内容】user ロールではSQLやエラーが表示されないこと
   * 【期待結果】sql, result, error セクションが存在しないこと
   */
  it('should not render sql/result/error for user messages', () => {
    const message = createMessage({
      role: 'user',
      content: 'テスト',
      sql: 'SELECT 1',
      error: 'エラー',
    })
    const { container } = render(<ChatMessage message={message} />)

    expect(container.querySelector('.chat-message__sql')).not.toBeInTheDocument()
    expect(container.querySelector('.chat-message__error')).not.toBeInTheDocument()
  })
})
