import { Suspense, lazy, useEffect, useState } from 'react'
import { MotionConfig } from 'framer-motion'
import { LayoutGrid } from 'lucide-react'
import { AppProvider, useApp } from './core/AppContext'
import { useAppFont } from './core/hooks/useAppFont'
import { useUiScale } from './core/hooks/useUiScale'
import { Sidebar } from './core/components/Sidebar'
import { TopBar } from './core/components/TopBar'
import { FocusBar } from './core/components/FocusBar'
import { ModuleSwitcher } from './core/components/ModuleSwitcher'
import { Onboarding } from './core/components/Onboarding'
import { CommandPalette } from './core/components/CommandPalette'
import { KeyboardShortcutsModal } from './core/components/KeyboardShortcutsModal'
import { GlobalTooltip } from './core/components/GlobalTooltip'
import { EmptyState } from './core/components/EmptyState'
import { PluginLoadingFallback } from './core/components/Skeleton'
import { GlobalSearch } from './core/components/GlobalSearch'
import { ConfirmProvider } from './core/components/Modal'
import { QuickCapture } from './core/components/QuickCapture'
import { ErrorBoundary } from './core/components/ErrorBoundary'
import { ToastProvider } from './core/components/Toast'
import { UpdateBanner } from './core/components/UpdateBanner'
import { allPlugins, getPlugin } from './core/plugin-registry'
import { useNotificationClicks } from './core/notify'
import { useGastosReminders } from './plugins/gastos/useGastosReminders'
import { useNoteReminders } from './plugins/notes/reminders'

// Novedades: trae el CHANGELOG, marked y DOMPurify (~130 KB) — no hacen falta para el primer pintado.
const WhatsNew = lazy(() => import('./core/components/WhatsNew').then((m) => ({ default: m.WhatsNew })))

const pluginIndex = (id: string): number => allPlugins.findIndex((p) => p.id === id)

function AppShell(): JSX.Element {
  const { state, dispatch } = useApp()
  useAppFont()        // applies persisted font prefs to DOM on mount
  useUiScale()         // applies persisted window zoom (Settings → Escala de la interfaz)
  useNotificationClicks()   // clic en una notificación del sistema → abre el módulo
  useGastosReminders(!state.disabledPlugins.includes('gastos'))   // avisos de vencimientos
  useNoteReminders(!state.disabledPlugins.includes('notes'))      // recordatorios de notas

  // ── Modo foco (F11): sólo el contenido, sin barra lateral ni encabezado ──
  const [focusMode, setFocusMode] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'F11' && !e.ctrlKey && !e.altKey) { e.preventDefault(); setFocusMode((v) => !v) }
    }
    const onToggle = (): void => setFocusMode((v) => !v)
    window.addEventListener('keydown', onKey)
    window.addEventListener('setto:toggle-focus', onToggle)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('setto:toggle-focus', onToggle) }
  }, [])

  // ── Open file from OS (double-click / "Open with") ───────────────────────
  useEffect(() => {
    function openFromPath(filePath: string): void {
      const parentDir = filePath.replace(/[/\\][^/\\]+$/, '')
      window.api.send('editor:authorize-root', parentDir)
      dispatch({ type: 'OPEN_IN_EDITOR', path: filePath })
    }

    // Pull: fetch any file queued before this renderer was ready.
    // On macOS, open-file can fire after app.whenReady() (after the window is created
    // but before React mounts). We retry a few times with increasing delays to cover
    // the case where open-file arrives at the main process after our first poll.
    let cancelled = false
    const DELAYS = [0, 600, 1500]   // ms after mount to retry
    DELAYS.forEach((delay) => {
      setTimeout(() => {
        if (cancelled) return
        window.api.invoke<string | null>('app:pending-file').then((filePath) => {
          if (cancelled) return
          if (typeof filePath === 'string') {
            cancelled = true   // got a file — no need for further retries
            openFromPath(filePath)
          }
        })
      }, delay)
    })

    // Push: handles files opened while the app is already running.
    const off = window.api.on('open-file', (filePath: unknown) => {
      if (typeof filePath === 'string') {
        cancelled = true
        openFromPath(filePath)
      }
    })

    return () => {
      cancelled = true
      off()
    }
  }, [dispatch])

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-sidebar text-on-surface font-sans">
      <div className="flex flex-1 min-h-0">
      {!focusMode && <Sidebar />}
      <CommandPalette />
      <QuickCapture />
      <KeyboardShortcutsModal />
      <GlobalSearch />
      <GlobalTooltip />
      <ModuleSwitcher />
      <Onboarding />
      <Suspense fallback={null}><WhatsNew /></Suspense>

      {/* Contenido: toolbar unificada + módulo activo */}
      {/* Panel de contenido flotante: borde fino, esquinas redondeadas, sobre el fondo de la barra lateral */}
      {/* El encabezado es parte del marco (mismo fondo que la barra lateral, a la altura del
          logo) y el panel flotante, debajo, sólo lleva el contenido. */}
      <div className="flex-1 min-w-0 flex flex-col">
      {!focusMode && <TopBar />}
      <main className={`flex-1 min-w-0 flex flex-col overflow-hidden bg-background relative ${focusMode ? '' : 'app-panel mb-2 mr-2'}`}>
        {focusMode && <FocusBar onExit={() => setFocusMode(false)} />}

        {/* Un módulo visible a la vez; los usados hace poco quedan montados y
            ocultos (LRU en AppContext / navigation.ts) para conservar su estado. */}
        <div className="flex-1 overflow-hidden relative">
          {state.openTabs.length === 0 ? (
            <div className="flex items-center justify-center h-full min-h-[200px]">
              <EmptyState
                icon={LayoutGrid}
                title="Ningún módulo abierto"
                description="Elegí un módulo en la barra lateral o presioná Ctrl+K para buscar."
              />
            </div>
          ) : (
            // Orden estable (el del registro), no el del LRU: si React moviera los
            // nodos al cambiar de módulo, se perdería el scroll y se recargarían iframes.
            [...state.openTabs].sort((a, b) => pluginIndex(a.pluginId) - pluginIndex(b.pluginId)).map((tab) => {
              const plugin = getPlugin(tab.pluginId)
              if (!plugin) return null
              const Component = plugin.component
              const active = state.activeTabId === tab.tabId
              return (
                <div
                  key={tab.tabId}
                  className={`absolute inset-0 w-full h-full overflow-auto ${active ? '' : 'hidden'}`}
                  data-module={tab.pluginId}
                  aria-hidden={active ? undefined : true}
                  // Sin fill-mode `both`: un transform residual rompería los `position: fixed` del módulo.
                  style={active ? { animation: 'tabIn 0.18s var(--ease-mac) backwards' } : undefined}
                >
                  <ErrorBoundary label={plugin.name}>
                    <Suspense fallback={<PluginLoadingFallback />}>
                      <div className="h-full w-full">
                        <Component />
                      </div>
                    </Suspense>
                  </ErrorBoundary>
                </div>
              )
            })
          )}
        </div>
      </main>
      </div>
      </div>


      <UpdateBanner />
    </div>
  )
}

export function App(): JSX.Element {
  return (
    <MotionConfig reducedMotion="user">
      <AppProvider>
        <ToastProvider>
          <ConfirmProvider>
            <AppShell />
          </ConfirmProvider>
        </ToastProvider>
      </AppProvider>
    </MotionConfig>
  )
}
