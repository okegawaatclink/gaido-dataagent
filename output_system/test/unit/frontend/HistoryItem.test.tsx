/**
 * HistoryItem コンポーネントのユニットテスト
 *
 * テスト対象: frontend/src/components/Sidebar/HistoryItem.tsx
 * - クリックで会話選択
 * - 削除ボタンのconfirmダイアログ
 * - アクティブ状態のハイライト
 * - キーボードアクセシビリティ
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import HistoryItem from '../../../frontend/src/components/Sidebar/HistoryItem'

describe('HistoryItem', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  /**
   * 【テスト対象】HistoryItem
   * 【テスト内容】タイトルが表示されること
   * 【期待結果】title プロパティの内容がDOMに存在すること
   */
  it('should render the title', () => {
    render(<HistoryItem id="conv-1" title="売上を教えて" />)
    expect(screen.getByText('売上を教えて')).toBeInTheDocument()
  })

  /**
   * 【テスト対象】HistoryItem
   * 【テスト内容】クリックでonClickが呼ばれること
   * 【期待結果】onClick が会話IDとともに呼ばれること
   */
  it('should call onClick with id when clicked', () => {
    const onClick = vi.fn()
    render(<HistoryItem id="conv-1" title="テスト" onClick={onClick} />)

    fireEvent.click(screen.getByRole('button', { name: /会話: テスト/ }))
    expect(onClick).toHaveBeenCalledWith('conv-1')
  })

  /**
   * 【テスト対象】HistoryItem
   * 【テスト内容】削除ボタンクリック時にconfirmダイアログが表示されること
   * 【期待結果】window.confirm が呼ばれること
   */
  it('should show confirm dialog when delete button is clicked', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const onDelete = vi.fn()

    render(<HistoryItem id="conv-1" title="テスト会話" onDelete={onDelete} />)

    const deleteBtn = screen.getByRole('button', { name: /削除/ })
    fireEvent.click(deleteBtn)

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('テスト会話'))
    expect(onDelete).not.toHaveBeenCalled()
  })

  /**
   * 【テスト対象】HistoryItem
   * 【テスト内容】confirm で承認された場合にonDeleteが呼ばれること
   * 【期待結果】onDelete が会話IDとともに呼ばれること
   */
  it('should call onDelete when confirm is accepted', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const onDelete = vi.fn()

    render(<HistoryItem id="conv-1" title="テスト" onDelete={onDelete} />)

    const deleteBtn = screen.getByRole('button', { name: /削除/ })
    fireEvent.click(deleteBtn)

    expect(onDelete).toHaveBeenCalledWith('conv-1')
  })

  /**
   * 【テスト対象】HistoryItem
   * 【テスト内容】削除ボタンクリックがアイテム本体のクリックに伝播しないこと
   * 【期待結果】onClickが呼ばれないこと
   */
  it('should not propagate delete click to item click', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const onClick = vi.fn()
    const onDelete = vi.fn()

    render(
      <HistoryItem id="conv-1" title="テスト" onClick={onClick} onDelete={onDelete} />
    )

    const deleteBtn = screen.getByRole('button', { name: /削除/ })
    fireEvent.click(deleteBtn)

    expect(onDelete).toHaveBeenCalled()
    expect(onClick).not.toHaveBeenCalled()
  })

  /**
   * 【テスト対象】HistoryItem
   * 【テスト内容】isActive=true の場合にアクティブクラスが付与されること
   * 【期待結果】history-item--active クラスが存在すること
   */
  it('should apply active class when isActive is true', () => {
    const { container } = render(
      <HistoryItem id="conv-1" title="テスト" isActive={true} />
    )
    expect(container.querySelector('.history-item--active')).toBeInTheDocument()
  })

  /**
   * 【テスト対象】HistoryItem
   * 【テスト内容】isActive=false の場合にアクティブクラスが付与されないこと
   * 【期待結果】history-item--active クラスが存在しないこと
   */
  it('should not apply active class when isActive is false', () => {
    const { container } = render(
      <HistoryItem id="conv-1" title="テスト" isActive={false} />
    )
    expect(container.querySelector('.history-item--active')).not.toBeInTheDocument()
  })

  /**
   * 【テスト対象】HistoryItem
   * 【テスト内容】aria-current がアクティブ時に設定されること
   * 【期待結果】aria-current="page" が存在すること
   */
  it('should set aria-current when active', () => {
    render(<HistoryItem id="conv-1" title="テスト" isActive={true} />)
    expect(screen.getByRole('button', { name: /会話: テスト/ })).toHaveAttribute(
      'aria-current',
      'page'
    )
  })

  /**
   * 【テスト対象】HistoryItem
   * 【テスト内容】Enter キーでonClickが呼ばれること
   * 【期待結果】キーボードでの操作が正しく動作すること
   */
  it('should call onClick on Enter key press', () => {
    const onClick = vi.fn()
    render(<HistoryItem id="conv-1" title="テスト" onClick={onClick} />)

    const item = screen.getByRole('button', { name: /会話: テスト/ })
    fireEvent.keyDown(item, { key: 'Enter' })

    expect(onClick).toHaveBeenCalledWith('conv-1')
  })

  /**
   * 【テスト対象】HistoryItem
   * 【テスト内容】Space キーでonClickが呼ばれること
   * 【期待結果】キーボードでの操作が正しく動作すること
   */
  it('should call onClick on Space key press', () => {
    const onClick = vi.fn()
    render(<HistoryItem id="conv-1" title="テスト" onClick={onClick} />)

    const item = screen.getByRole('button', { name: /会話: テスト/ })
    fireEvent.keyDown(item, { key: ' ' })

    expect(onClick).toHaveBeenCalledWith('conv-1')
  })
})
