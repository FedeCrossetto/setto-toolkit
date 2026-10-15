import { Suspense, useEffect, useState } from 'react'
import { MotionConfig } from 'framer-motion'
import { LayoutGrid, ArrowDownToLine, X } from 'lucide-react'
import { AppProvider, useApp } from './core/AppContext'
import { useAppFont } from './core/hooks/useAppFont'
import { useUiScale } from './core/hooks/useUiScale'
import { Sidebar } from './core/components/Sidebar'
import { TabBar } from './core/components/TabBar'
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
import { getPlugin } from './core/plugin-registry'
import { useNotificationClicks } from './core/notify'
import { useGastosReminders } from './plugins/gastos/useGastosReminders'
import { useNoteReminders } from './plugins/notes/reminders'

type UpdaterStatus =
  | { type: 'available'; version: string }
  | { type: 'ready'; version: string }
  | null

function AppShell(): JSX.Element {
  const { state, dispatch } = useApp()
  const [updateStatus, setUpdateStatus] = useState<UpdaterStatus>(null)
  useAppFont()        // applies persisted font prefs to DOM on mount
  useUiScale()         // applies persisted window zoom (Settings → Escala de la interfaz)
  useNotificationClicks()   // clic en una notificación del sistema → abre el módulo
  useGastosReminders(!state.disabledPlugins.includes('gastos'))   // avisos de vencimientos
  useNoteReminders(!state.disabledPlugins.includes('notes'))      // recordatorios de notas

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

  // ── Auto-updater notifications ────────────────────────────────────────────
  useEffect(() => {
    const off = window.api.on('updater:status', (status: unknown) => {
      const s = status as { type: string; version?: string }
      if (s.type === 'available' || s.type === 'ready') {
        setUpdateStatus({ type: s.type as 'available' | 'ready', version: s.version ?? '' })
      }
    })
    return off
  }, [])

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background text-on-surface font-sans">
      <TabBar />
      <div className="flex flex-1 min-h-0">
      <Sidebar />
      <CommandPalette />
      <QuickCapture />
      <KeyboardShortcutsModal />
      <GlobalSearch />
      <GlobalTooltip />

      {/* Contenido: toolbar unificada + módulo activo */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden bg-background">

        {/* Plugin content — all tabs stay mounted, inactive ones are hidden */}
        <div className="flex-1 overflow-hidden relative">
          {state.openTabs.length === 0 ? (
            <div className="flex items-center justify-center h-full min-h-[200px]">
              <EmptyState
                icon={LayoutGrid}
                title="Ninguna pestaña abierta"
                description="Elegí un módulo en la barra lateral o presioná Ctrl+K para buscar."
              />
            </div>
          ) : (
            state.openTabs.map((tab) => {
              const plugin = getPlugin(tab.pluginId)
              if (!plugin) return null
              const Component = plugin.component
              const active = state.activeTabId === tab.tabId
              return (
                <div
                  key={tab.tabId}
                  className={`absolute inset-0 w-full h-full overflow-auto ${active ? '' : 'hidden'}`}
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


      {/* Update banner */}
      {updateStatus && (
        <div className="fixed bottom-4 right-4 z-500 flex items-center gap-3 mac-popover hairline px-4 py-2.5 t-body">
          <ArrowDownToLine size={18} className="text-accent" />
          {updateStatus.type === 'available' ? (
            <>
              <span className="text-on-surface">Actualización <span className="font-semibold">{updateStatus.version}</span> disponible</span>
              <button
                onClick={() => { void window.api.invoke('updater:download') }}
                className="ui-btn ui-btn-primary ui-btn-sm"
              >
                Descargar
              </button>
            </>
          ) : (
            <>
              <span className="text-on-surface">Lista para instalar <span className="font-semibold">{updateStatus.version}</span></span>
              <button
                onClick={() => window.api.send('updater:install')}
                className="ui-btn ui-btn-primary ui-btn-sm"
              >
                Reiniciar e instalar
              </button>
            </>
          )}
          <button onClick={() => setUpdateStatus(null)} aria-label="Descartar" className="text-on-surface-variant hover:text-on-surface transition-colors ml-1">
            <X size={14} />
          </button>
        </div>
      )}
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
