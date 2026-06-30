import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { applyPaletteImmediate } from './core/hooks/useThemePalette'
import './styles/globals.css'

// Apply persisted theme + palette before first paint to avoid a gray flash.
// (AppContext also syncs the `dark` class, and useThemePalette re-applies on mount.)
;(() => {
  const stored = localStorage.getItem('app-theme')
  const isDark = stored === 'dark' || (stored === null && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', isDark)
  applyPaletteImmediate()
})()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
