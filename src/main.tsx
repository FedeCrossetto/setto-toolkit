import React from 'react'
import ReactDOM from 'react-dom/client'
import { applyPaletteImmediate } from './core/hooks/useThemePalette'
import { applyFontImmediate } from './core/hooks/useAppFont'
// Inter Variable incluida en la app (sin depender de Google Fonts): pesos 100–900 y
// tamaños ópticos (los títulos grandes usan el corte "Display", más fino y apretado).
import '@fontsource-variable/inter/opsz.css'
// JetBrains Mono (editor, diff, snippets, código) también local: 'JetBrains Mono Variable'
// y, vía fonts.css, el alias 'JetBrains Mono' que usan los stacks y las preferencias guardadas.
import '@fontsource-variable/jetbrains-mono/wght.css'
import './styles/fonts.css'
import './styles/globals.css'
import { ErrorBoundary } from './core/components/ErrorBoundary'
import { isChunkLoadError, reportRendererError } from './core/components/error-report'

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
window.addEventListener('error', (e) => {
  reportRendererError('error', e.error instanceof Error ? e.error : e.message)
})
window.addEventListener('unhandledrejection', (e) => {
  reportRendererError('unhandledrejection', e.reason)
})
// Vite avisa cuando no pudo precargar un chunk (archivo de la app dañado o reemplazado
// por una actualización a medias). Se registra; una sola recarga automática por sesión.
window.addEventListener('vite:preloadError', (e) => {
  const err = (e as Event & { payload?: unknown }).payload
  reportRendererError('preload', err)
  try {
    if (!sessionStorage.getItem('setto:preload-reloaded')) {
      sessionStorage.setItem('setto:preload-reloaded', '1')
      e.preventDefault()
      window.location.reload()
    }
  } catch { /* sin sessionStorage: que lo maneje el boundary */ }
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
const rootLabel = isSnippetPicker ? 'El selector de snippets' : isDock ? 'La barra flotante' : 'Setto'
const reactRoot = ReactDOM.createRoot(document.getElementById('root') as HTMLElement)
void Root.then((Component) => {
  reactRoot.render(
    <React.StrictMode>
      <ErrorBoundary variant="root" label={rootLabel}>
        <Component />
      </ErrorBoundary>
    </React.StrictMode>
  )
  hideSplash()
}).catch((err: unknown) => {
  // No cargó el código de la ventana (import dinámico fallido): pantalla con "Recargar".
  reportRendererError(isChunkLoadError(err) ? 'root-import' : 'root-load', err)
  const Fail = (): JSX.Element => { throw err instanceof Error ? err : new Error(String(err)) }
  reactRoot.render(
    <ErrorBoundary variant="root" label={rootLabel}>
      <Fail />
    </ErrorBoundary>
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
