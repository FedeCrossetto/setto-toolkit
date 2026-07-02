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

// Capture renderer-side errors into the main-process log (app.log) so failures
// in packaged builds leave a trace. ErrorBoundary only covers render errors —
// this catches async handlers, event listeners, and unhandled promise rejections.
const reportRendererError = (kind: string, message: string, stack?: string): void => {
  try { window.api.send('app:renderer-error', { kind, message, stack: stack?.slice(0, 4000) }) } catch { /* preload unavailable */ }
}
window.addEventListener('error', (e) => {
  reportRendererError('error', e.message, e.error instanceof Error ? e.error.stack : undefined)
})
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason
  reportRendererError('unhandledrejection', r instanceof Error ? r.message : String(r), r instanceof Error ? r.stack : undefined)
})

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
