/**
 * DataAgent フロントエンド エントリポイント
 *
 * ReactアプリをDOMにマウントする起点。
 * React 18の新しいcreateRootAPIを使用してStrictModeで初期化する。
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/global.css'

// マウントポイントを取得（index.html の <div id="root"> に対応）
const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element not found. Make sure index.html has <div id="root">.')
}

// React 18のcreateRootを使用してマウント
// StrictModeで副作用の検出を強化（開発環境でコンポーネントを2回レンダリングしてバグを早期発見）
createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
