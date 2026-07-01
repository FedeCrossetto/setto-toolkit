import { Suspense, useEffect, useState } from 'react'
import { LayoutGrid, ArrowDownToLine, X } from 'lucide-react'
import { AppProvider, useApp } from './core/AppContext'
import { useAppFont } from './core/hooks/useAppFont'
import { useUiScale } from './core/hooks/useUiScale'
import { useThemePalette } from './core/hooks/useThemePalette'
import { Sidebar } from './core/components/Sidebar'
import { TabBar } from './core/components/TabBar'
import { CommandPalette } from './core/components/CommandPalette'
import { KeyboardShortcutsModal } from './core/components/KeyboardShortcutsModal'
import { EmptyState } from './core/components/EmptyState'
import { PluginLoadingFallback } from './core/components/Skeleton'
import { GlobalSearch } from './core/components/GlobalSearch'
import { StatusBar } from './core/components/StatusBar'
import { TitleBar } from './core/components/TitleBar'
import { ErrorBoundary } from './core/components/ErrorBoundary'
import { ToastProvider } from './core/components/Toast'
import { KeyboardShortcuts, useKeyboardShortcutsModal } from './core/components/KeyboardShortcuts'
import { getPlugin } from './core/plugin-registry'

type UpdaterStatus =
  | { type: 'available'; version: string }
  | { type: 'ready'; version: string }
  | null

function AppShell(): JSX.Element {
  const { state, dispatch } = useApp()
  const shortcuts = useKeyboardShortcutsModal()
  const [updateStatus, setUpdateStatus] = useState<UpdaterStatus>(null)
  useAppFont()        // applies persisted font prefs to DOM on mount
  useUiScale()         // applies persisted window zoom (Settings → Escala de la interfaz)
  useThemePalette()   // applies persisted color palette on mount

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
    <div className="flex h-screen w-screen overflow-hidden bg-background text-on-surface font-sans">
      {/* Dot grid — very subtle texture overlay */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage: 'radial-gradient(circle, rgb(var(--c-on-surface) / 0.045) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />
      {/* Ambient glow — two blurred blobs behind everything, palette-aware */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div style={{
          position: 'absolute',
          top: '-10%', left: '-5%',
          width: '50%', height: '60%',
          background: 'radial-gradient(ellipse, rgb(var(--c-primary) / 0.07) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }} />
        <div style={{
          position: 'absolute',
          bottom: '-15%', right: '-5%',
          width: '45%', height: '55%',
          background: 'radial-gradient(ellipse, rgb(var(--c-accent) / 0.06) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }} />
      </div>
      <TitleBar />
      <Sidebar />
      <CommandPalette />
      <KeyboardShortcutsModal />
      <GlobalSearch />

      {/* Main content — offset matches sidebar width */}
      <main className={`flex-1 flex flex-col h-screen overflow-hidden transition-all duration-200 ${state.sidebarCollapsed ? 'ml-[70px]' : 'ml-[172px]'}`}>

        {/* Floating card — sits below TitleBar, above floating StatusBar */}
        {/* Wrapper provides the gradient top-border via padding-top trick */}
        <div
          style={{
            margin: '40px 8px 44px 6px',
            borderRadius: 18,
            padding: '1.5px 0 0 0',
            background: 'linear-gradient(90deg, #FF7A00, #FF00D6, #5C00FF, #FF7A00)',
            backgroundSize: '300% 300%',
            animation: 'gradient-border-shift 6s ease infinite',
            boxShadow: '0 2px 12px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
          }}
          className="flex flex-col flex-1 overflow-hidden dark:shadow-[0_4px_24px_rgba(0,0,0,0.28),0_1px_4px_rgba(0,0,0,0.14)]"
        >
        <div
          className="flex flex-col flex-1 overflow-hidden"
          style={{
            borderRadius: '0 0 17px 17px',
            background: 'rgb(var(--c-surface))',
            minHeight: 0,
          }}
        >
          <TabBar />

          {/* Plugin content — all tabs stay mounted, inactive ones are hidden */}
          <div className="flex-1 overflow-hidden relative">
            {state.openTabs.length === 0 ? (
              <div className="flex items-center justify-center h-full min-h-[200px]">
                <EmptyState
                  mascot
                  icon={LayoutGrid}
                  title="Ninguna herramienta abierta"
                  description="Elegí una herramienta en la barra lateral o presioná Ctrl+K para buscar."
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
                    style={active ? { animation: 'fadeSlideUp 0.18s cubic-bezier(0.34,1,0.64,1) both' } : undefined}
                  >
                    <ErrorBoundary label={plugin.name}>
                      <Suspense fallback={<PluginLoadingFallback />}>
                        <Component />
                      </Suspense>
                    </ErrorBoundary>
                  </div>
                )
              })
            )}
          </div>
        </div>
        </div>
      </main>

      <StatusBar />
      <KeyboardShortcuts open={shortcuts.open} onClose={shortcuts.close} />

      {/* Update banner */}
      {updateStatus && (
        <div className="fixed bottom-8 right-4 z-[500] flex items-center gap-3 bg-surface-container-high border border-outline-variant/30 rounded-xl shadow-2xl px-4 py-3 text-sm">
          <ArrowDownToLine size={18} className="text-accent" />
          {updateStatus.type === 'available' ? (
            <>
              <span className="text-on-surface">Actualización <span className="font-semibold">{updateStatus.version}</span> disponible</span>
              <button
                onClick={() => { void window.api.invoke('updater:download') }}
                className="px-3 py-1 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:opacity-90 transition-opacity"
              >
                Descargar
              </button>
            </>
          ) : (
            <>
              <span className="text-on-surface">Lista para instalar <span className="font-semibold">{updateStatus.version}</span></span>
              <button
                onClick={() => window.api.send('updater:install')}
                className="px-3 py-1 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:opacity-90 transition-opacity"
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
    <AppProvider>
      <ToastProvider>
        <AppShell />
      </ToastProvider>
    </AppProvider>
  )
}
