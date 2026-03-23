import { useEffect, useState } from 'react'
import { AppProvider, useApp } from './core/AppContext'
import { useAppFont } from './core/hooks/useAppFont'
import { useThemePalette } from './core/hooks/useThemePalette'
import { Sidebar } from './core/components/Sidebar'
import { TabBar } from './core/components/TabBar'
import { CommandPalette } from './core/components/CommandPalette'
import { GlobalSearch } from './core/components/GlobalSearch'
import { StatusBar } from './core/components/StatusBar'
import { TitleBar } from './core/components/TitleBar'
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
  useThemePalette()   // applies persisted color palette on mount

  // ── Open file from OS (double-click / "Open with") ───────────────────────
  useEffect(() => {
    const off = window.api.on('open-file', (filePath: unknown) => {
      if (typeof filePath === 'string') {
        dispatch({ type: 'OPEN_IN_EDITOR', path: filePath })
      }
    })
    return off
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
      <TitleBar />
      <Sidebar />
      <CommandPalette />
      <GlobalSearch />

      {/* Main content — offset matches sidebar width */}
      <main className={`flex-1 flex flex-col h-screen overflow-hidden transition-all duration-200 ${state.sidebarCollapsed ? 'ml-[68px]' : 'ml-56'}`}>
        <div className="mt-8">
          <TabBar />
        </div>

        {/* Plugin content area — all tabs stay mounted, inactive ones are hidden */}
        <div className="flex-1 overflow-hidden mb-6 relative">
          {state.openTabs.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <span
                  className="material-symbols-outlined text-on-surface-variant mb-4 block"
                  style={{ fontSize: '48px' }}
                >
                  grid_view
                </span>
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
                  <Component />
                </div>
              )
            })
          )}
        </div>
      </main>

      <StatusBar />
      <KeyboardShortcuts open={shortcuts.open} onClose={shortcuts.close} />

      {/* Update banner */}
      {updateStatus && (
        <div className="fixed bottom-8 right-4 z-[500] flex items-center gap-3 bg-surface-container-high border border-outline-variant/30 rounded-xl shadow-2xl px-4 py-3 text-sm">
          <span className="material-symbols-outlined text-accent" style={{ fontSize: '18px' }}>system_update</span>
          {updateStatus.type === 'available' ? (
            <>
              <span className="text-on-surface">Update <span className="font-semibold">{updateStatus.version}</span> available</span>
              <button
                onClick={() => { void window.api.invoke('updater:download') }}
                className="px-3 py-1 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:opacity-90 transition-opacity"
              >
                Download
              </button>
            </>
          ) : (
            <>
              <span className="text-on-surface">Ready to install <span className="font-semibold">{updateStatus.version}</span></span>
              <button
                onClick={() => window.api.send('updater:install')}
                className="px-3 py-1 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:opacity-90 transition-opacity"
              >
                Restart & Install
              </button>
            </>
          )}
          <button onClick={() => setUpdateStatus(null)} className="text-on-surface-variant hover:text-on-surface transition-colors ml-1">
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>close</span>
          </button>
        </div>
      )}
    </div>
  )
}

export function App(): JSX.Element {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  )
}
