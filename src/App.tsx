import { useEffect } from 'react'
import { LayoutGrid } from 'lucide-react'
import { AppProvider, useApp } from './core/AppContext'
import { useAppFont } from './core/hooks/useAppFont'
import { useThemePalette } from './core/hooks/useThemePalette'
import { Sidebar } from './core/components/Sidebar'
import { TabBar } from './core/components/TabBar'
import { CommandPalette } from './core/components/CommandPalette'
import { GlobalSearch } from './core/components/GlobalSearch'
import { StatusBar } from './core/components/StatusBar'
import { TitleBar } from './core/components/TitleBar'
import { ErrorBoundary } from './core/components/ErrorBoundary'
import { ToastProvider } from './core/components/Toast'
import { getPlugin } from './core/plugin-registry'

function AppShell(): JSX.Element {
  const { state, dispatch } = useApp()
  useAppFont()        // applies persisted font prefs to DOM on mount
  useThemePalette()   // applies persisted color palette on mount

  // ── Open file from OS (double-click / "Open with") ───────────────────────
  useEffect(() => {
    const off = window.api.on('open-file', (filePath: unknown) => {
      if (typeof filePath === 'string') {
        // Authorize the file's parent directory for write operations in this session.
        const parentDir = filePath.replace(/[/\\][^/\\]+$/, '')
        window.api.send('editor:authorize-root', parentDir)
        dispatch({ type: 'OPEN_IN_EDITOR', path: filePath })
      }
    })
    return off
  }, [dispatch])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-on-surface font-sans">
      <TitleBar />
      <Sidebar />
      <CommandPalette />
      <GlobalSearch />

      {/* Main content — offset matches sidebar width */}
      <main className={`flex-1 flex flex-col h-screen overflow-hidden transition-all duration-200 ${state.sidebarCollapsed ? 'ml-[76px]' : 'ml-[224px]'}`}>

        {/* Floating card — sits below TitleBar, above floating StatusBar */}
        <div
          className="flex flex-col flex-1 overflow-hidden"
          style={{
            margin: '40px 8px 44px 6px',
            borderRadius: 18,
            background: 'rgb(var(--c-background))',
            boxShadow: '0 4px 24px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.07)',
          }}
        >
          <TabBar />

          {/* Plugin content — all tabs stay mounted, inactive ones are hidden */}
          <div className="flex-1 overflow-hidden relative">
            {state.openTabs.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <LayoutGrid size={48} className="text-on-surface-variant mb-4 block" />
                  <p className="text-on-surface-variant text-sm">Select a tool from the sidebar</p>
                </div>
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
                  >
                    <ErrorBoundary label={plugin.name}>
                      <Component />
                    </ErrorBoundary>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </main>

      <StatusBar />
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
