import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { SnippetPicker } from './plugins/snippets/SnippetPicker'
import { applyPaletteImmediate } from './core/hooks/useThemePalette'
import './styles/globals.css'

// Apply persisted theme + palette before first paint to avoid a gray flash.
// (AppContext also syncs the `dark` class; the palette store re-applies on every class change.)
;(() => {
  const stored = localStorage.getItem('app-theme')
  const mode = localStorage.getItem('app-theme-mode')
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  // Modo "Sistema" (Ajustes → Apariencia): resolver antes del primer pintado para evitar el parpadeo
  const isDark = mode === 'system' ? prefersDark : (stored === 'dark' || (stored === null && prefersDark))
  if (mode === 'system') localStorage.setItem('app-theme', isDark ? 'dark' : 'light')
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

// Ventana flotante del atajo global de snippets (electron/core/snippet-picker.ts):
// mismo bundle, sin el shell ni la pantalla de apertura, con fondo transparente.
const isSnippetPicker = window.location.hash === '#snippet-picker'
if (isSnippetPicker) {
  document.getElementById('splash')?.remove()
  document.documentElement.style.background = 'transparent'
  document.body.style.background = 'transparent'
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {isSnippetPicker ? <SnippetPicker /> : <App />}
  </React.StrictMode>
)

// Pantalla de apertura (index.html): se desvanece cuando React ya pintó,
// respetando un mínimo para que el logo se alcance a ver sin parpadeo.
;(() => {
  const splash = document.getElementById('splash')
  if (!splash || isSnippetPicker) return
  const MIN_VISIBLE_MS = 1200
  const elapsed = performance.now()
  const hide = (): void => {
    splash.classList.add('hide')
    setTimeout(() => splash.remove(), 500)
  }
  // La ventana se muestra recién en ready-to-show: garantizar ~0.8 s visibles igual.
  requestAnimationFrame(() => setTimeout(hide, Math.max(800, MIN_VISIBLE_MS - elapsed)))
})()
