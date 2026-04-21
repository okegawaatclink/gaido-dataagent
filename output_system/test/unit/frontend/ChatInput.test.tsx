/**
 * ChatInput コンポーネントのユニットテスト
 *
 * テスト対象: frontend/src/components/Chat/ChatInput.tsx
 * - テキスト入力と送信
 * - Enter で送信、Shift+Enter で改行
 * - 空メッセージの送信防止
 * - ローディング中の入力無効化
 * - disabled プロパティによる無効化
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChatInput from '../../../frontend/src/components/Chat/ChatInput'

describe('ChatInput', () => {
  /**
   * 【テスト対象】ChatInput
   * 【テスト内容】テキストエリアと送信ボタンが表示されること
   * 【期待結果】テキストエリアと送信ボタンのDOM要素が存在すること
   */
  it('should render textarea and send button', () => {
    render(<ChatInput onSend={vi.fn()} isLoading={false} />)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '送信' })).toBeInTheDocument()
  })

  /**
   * 【テスト対象】ChatInput
   * 【テスト内容】テキスト入力後に送信ボタンクリックで送信されること
   * 【期待結果】onSend がトリムされたテキストで呼ばれ、入力がクリアされること
   */
  it('should call onSend with trimmed text when send button is clicked', async () => {
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} isLoading={false} />)

    const textarea = screen.getByRole('textbox')
    await userEvent.type(textarea, '売上を教えて')

    const sendBtn = screen.getByRole('button', { name: '送信' })
    await userEvent.click(sendBtn)

    expect(onSend).toHaveBeenCalledWith('売上を教えて')
    // 送信後にテキストエリアがクリアされること
    expect(textarea).toHaveValue('')
  })

  /**
   * 【テスト対象】ChatInput
   * 【テスト内容】Enter キーで送信されること
   * 【期待結果】onSend が呼ばれること
   */
  it('should submit on Enter key press', async () => {
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} isLoading={false} />)

    const textarea = screen.getByRole('textbox')
    // fireEvent で直接値を設定してからEnterを押す
    fireEvent.change(textarea, { target: { value: 'テスト質問' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    expect(onSend).toHaveBeenCalledWith('テスト質問')
  })

  /**
   * 【テスト対象】ChatInput
   * 【テスト内容】Shift+Enter では送信されないこと
   * 【期待結果】onSend が呼ばれないこと
   */
  it('should not submit on Shift+Enter', () => {
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} isLoading={false} />)

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'テスト' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })

    expect(onSend).not.toHaveBeenCalled()
  })

  /**
   * 【テスト対象】ChatInput
   * 【テスト内容】空メッセージが送信されないこと
   * 【期待結果】onSend が呼ばれないこと
   */
  it('should not submit empty message', () => {
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} isLoading={false} />)

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: '   ' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    expect(onSend).not.toHaveBeenCalled()
  })

  /**
   * 【テスト対象】ChatInput
   * 【テスト内容】isLoading=true の場合にテキストエリアが無効化されること
   * 【期待結果】テキストエリアが disabled であること
   */
  it('should disable textarea when isLoading is true', () => {
    render(<ChatInput onSend={vi.fn()} isLoading={true} />)
    expect(screen.getByRole('textbox')).toBeDisabled()
  })

  /**
   * 【テスト対象】ChatInput
   * 【テスト内容】isLoading=true の場合に送信ボタンが無効化されること
   * 【期待結果】送信ボタンが disabled であること
   */
  it('should disable send button when isLoading is true', () => {
    render(<ChatInput onSend={vi.fn()} isLoading={true} />)
    expect(screen.getByRole('button', { name: '送信' })).toBeDisabled()
  })

  /**
   * 【テスト対象】ChatInput
   * 【テスト内容】isLoading=true の場合にプレースホルダーが変わること
   * 【期待結果】「応答を待っています...」が表示されること
   */
  it('should show loading placeholder when isLoading is true', () => {
    render(<ChatInput onSend={vi.fn()} isLoading={true} />)
    expect(screen.getByPlaceholderText('応答を待っています...')).toBeInTheDocument()
  })

  /**
   * 【テスト対象】ChatInput
   * 【テスト内容】disabled=true の場合にテキストエリアが無効化されること
   * 【期待結果】テキストエリアが disabled であること
   */
  it('should disable textarea when disabled prop is true', () => {
    render(<ChatInput onSend={vi.fn()} isLoading={false} disabled={true} />)
    expect(screen.getByRole('textbox')).toBeDisabled()
  })

  /**
   * 【テスト対象】ChatInput
   * 【テスト内容】入力欄が空の場合に送信ボタンが無効化されること
   * 【期待結果】送信ボタンが disabled であること
   */
  it('should disable send button when input is empty', () => {
    render(<ChatInput onSend={vi.fn()} isLoading={false} />)
    expect(screen.getByRole('button', { name: '送信' })).toBeDisabled()
  })

  /**
   * 【テスト対象】ChatInput
   * 【テスト内容】isLoading=true の場合にスピナーアイコンが表示されること
   * 【期待結果】ローディング用CSSクラスが存在すること
   */
  it('should show loading icon in send button when isLoading is true', () => {
    const { container } = render(<ChatInput onSend={vi.fn()} isLoading={true} />)
    const btn = container.querySelector('.chat-input-send-btn--loading')
    expect(btn).toBeInTheDocument()
  })
})
