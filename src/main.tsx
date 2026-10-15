import React from 'react'
import ReactDOM from 'react-dom/client'
import { applyPaletteImmediate } from './core/hooks/useThemePalette'
import { applyFontImmediate } from './core/hooks/useAppFont'
// Inter Variable incluida en la app (sin depender de Google Fonts): pesos 100–900 y
// tamaños ópticos (los títulos grandes usan el corte "Display", más fino y apretado).
import '@fontsource-variable/inter/opsz.css'
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
  applyFontImmediate()
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
// Lo mismo para la barra flotante de la derecha (electron/core/dock.ts).
const isSnippetPicker = window.location.hash === '#snippet-picker'
const isDock = window.location.hash === '#dock'
if (isSnippetPicker || isDock) {
  document.getElementById('splash')?.remove()
  document.documentElement.style.background = 'transparent'
  document.body.style.background = 'transparent'
}

// Cada ventana carga sólo su código: la barra y el selector no arrastran toda la
// app (editor, terminal, plugins), que es lo que más memoria ocupa por ventana.
const Root = isSnippetPicker
  ? import('./plugins/snippets/SnippetPicker').then((m) => m.SnippetPicker)
  : isDock ? import('./dock/Dock').then((m) => m.Dock) : import('./App').then((m) => m.App)
void Root.then((Component) => {
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <Component />
    </React.StrictMode>
  )
  hideSplash()
})

// Pantalla de apertura (index.html): se desvanece cuando React ya pintó,
// respetando un mínimo para que el logo se alcance a ver sin parpadeo.
function hideSplash(): void {
  const splash = document.getElementById('splash')
  if (!splash || isSnippetPicker || isDock) return
  // La espera larga la cubre la ventanita nativa de main (startup-splash.ts): acá sólo un fundido.
  const MIN_VISIBLE_MS = 0
  const elapsed = performance.now()
  const hide = (): void => {
    splash.classList.add('hide')
    setTimeout(() => splash.remove(), 500)
  }
  // Un instante para que el fundido no parezca un salto.
  requestAnimationFrame(() => setTimeout(hide, Math.max(120, MIN_VISIBLE_MS - elapsed)))
}
