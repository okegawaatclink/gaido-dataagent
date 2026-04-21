/**
 * SQLDisplay コンポーネントのユニットテスト
 *
 * テスト対象: frontend/src/components/SQL/SQLDisplay.tsx
 * - SQL文の表示
 * - コピーボタンの動作
 * - コピー済み状態の切り替え
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SQLDisplay from '../../../frontend/src/components/SQL/SQLDisplay'

describe('SQLDisplay', () => {
  beforeEach(() => {
    // navigator.clipboard のモック
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
  })

  /**
   * 【テスト対象】SQLDisplay
   * 【テスト内容】SQL文が表示されること
   * 【期待結果】渡したSQL文がコードブロック内に存在すること
   */
  it('should render SQL text in code block', () => {
    render(<SQLDisplay sql="SELECT * FROM users" />)
    expect(screen.getByText('SELECT * FROM users')).toBeInTheDocument()
  })

  /**
   * 【テスト対象】SQLDisplay
   * 【テスト内容】「生成されたSQL」ラベルが表示されること
   * 【期待結果】ヘッダーラベルがDOMに存在すること
   */
  it('should render SQL label', () => {
    render(<SQLDisplay sql="SELECT 1" />)
    expect(screen.getByText('生成されたSQL')).toBeInTheDocument()
  })

  /**
   * 【テスト対象】SQLDisplay
   * 【テスト内容】コピーボタンが表示されること
   * 【期待結果】「SQLをコピー」aria-labelのボタンが存在すること
   */
  it('should render copy button', () => {
    render(<SQLDisplay sql="SELECT 1" />)
    expect(screen.getByRole('button', { name: 'SQLをコピー' })).toBeInTheDocument()
  })

  /**
   * 【テスト対象】SQLDisplay
   * 【テスト内容】コピーボタンクリック時にクリップボードにコピーされること
   * 【期待結果】navigator.clipboard.writeText がSQL文で呼ばれること
   */
  it('should copy SQL to clipboard on button click', async () => {
    render(<SQLDisplay sql="SELECT id FROM orders" />)

    const copyBtn = screen.getByRole('button', { name: 'SQLをコピー' })
    fireEvent.click(copyBtn)

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('SELECT id FROM orders')
  })

  /**
   * 【テスト対象】SQLDisplay
   * 【テスト内容】コピー後に「コピー済み」表示になること
   * 【期待結果】ボタンテキストが一時的に変わること
   */
  it('should show "copied" state after copying', async () => {
    render(<SQLDisplay sql="SELECT 1" />)

    const copyBtn = screen.getByRole('button', { name: 'SQLをコピー' })
    fireEvent.click(copyBtn)

    await waitFor(() => {
      expect(screen.getByText(/コピー済み/)).toBeInTheDocument()
    })
  })

  /**
   * 【テスト対象】SQLDisplay
   * 【テスト内容】clipboard API がエラーの場合にサイレントに失敗すること
   * 【期待結果】例外がスローされないこと
   */
  it('should handle clipboard error silently', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error('Not allowed')),
      },
    })

    render(<SQLDisplay sql="SELECT 1" />)

    const copyBtn = screen.getByRole('button', { name: 'SQLをコピー' })
    fireEvent.click(copyBtn)

    await waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith('[SQLDisplay] clipboard copy failed')
    })

    warnSpy.mockRestore()
  })
})
