/**
 * Vitest セットアップファイル
 *
 * @testing-library/jest-dom のカスタムマッチャー（toBeInTheDocument等）を
 * グローバルに使用できるようにする。
 *
 * jsdom 環境での補完:
 * - ResizeObserver: Recharts の ResponsiveContainer が使用する。jsdom に未実装のため stub を提供する
 * - matchMedia: Recharts が参照する場合があるため stub を提供する
 */
import '@testing-library/jest-dom'

// ---------------------------------------------------------------------------
// ResizeObserver スタブ
// Recharts の ResponsiveContainer は ResizeObserver を使用して親要素のサイズ変化を監視する。
// jsdom にはこの API が実装されていないため、最低限の動作をするスタブを提供する。
// ---------------------------------------------------------------------------
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    /** コールバックは何もしない（テスト環境では不要） */
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// ---------------------------------------------------------------------------
// matchMedia スタブ
// jsdom に matchMedia が未実装の場合、Recharts 等が参照するときにエラーになる可能性があるため stub を提供する。
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Element.prototype.scrollIntoView スタブ
// ChatContainer が useEffect 内で scrollIntoView を呼ぶが、jsdom には未実装のためスタブを提供する。
// ---------------------------------------------------------------------------
if (typeof Element.prototype.scrollIntoView === 'undefined') {
  Element.prototype.scrollIntoView = () => {}
}

if (typeof globalThis.matchMedia === 'undefined') {
  Object.defineProperty(globalThis, 'matchMedia', {
    writable: true,
    value: (_query: string) => ({
      matches: false,
      media: _query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}
