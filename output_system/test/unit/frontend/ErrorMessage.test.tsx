/**
 * ErrorMessage コンポーネントのユニットテスト
 *
 * テスト対象: frontend/src/components/common/ErrorMessage.tsx
 * - エラーメッセージの表示
 * - デフォルトガイドメッセージ
 * - カスタムガイドメッセージ
 * - role="alert" によるアクセシビリティ
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ErrorMessage from '../../../frontend/src/components/common/ErrorMessage'

describe('ErrorMessage', () => {
  /**
   * 【テスト対象】ErrorMessage
   * 【テスト内容】エラーメッセージが表示されること
   * 【期待結果】message プロパティの内容がDOMに存在すること
   */
  it('should render the error message text', () => {
    render(<ErrorMessage message="データベース接続に失敗しました" />)
    expect(screen.getByText('データベース接続に失敗しました')).toBeInTheDocument()
  })

  /**
   * 【テスト対象】ErrorMessage
   * 【テスト内容】guide 省略時にデフォルトガイドが表示されること
   * 【期待結果】デフォルトガイドテキストが表示されること
   */
  it('should render default guide when guide prop is omitted', () => {
    render(<ErrorMessage message="エラー発生" />)
    expect(screen.getByText('質問を変えるか、しばらく待ってから再試行してください。')).toBeInTheDocument()
  })

  /**
   * 【テスト対象】ErrorMessage
   * 【テスト内容】カスタムガイドメッセージが表示されること
   * 【期待結果】guide プロパティの内容が表示されること
   */
  it('should render custom guide message', () => {
    render(<ErrorMessage message="エラー" guide="管理者にお問い合わせください" />)
    expect(screen.getByText('管理者にお問い合わせください')).toBeInTheDocument()
  })

  /**
   * 【テスト対象】ErrorMessage
   * 【テスト内容】role="alert" が設定されていること
   * 【期待結果】alert ロールのDOM要素が存在すること
   */
  it('should have role="alert" for accessibility', () => {
    render(<ErrorMessage message="テストエラー" />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  /**
   * 【テスト対象】ErrorMessage
   * 【テスト内容】エラーアイコンが表示されること
   * 【期待結果】aria-hidden のエラーアイコンが存在すること
   */
  it('should render error icon', () => {
    const { container } = render(<ErrorMessage message="エラー" />)
    const icon = container.querySelector('.error-icon')
    expect(icon).toBeInTheDocument()
    expect(icon).toHaveAttribute('aria-hidden', 'true')
  })
})
