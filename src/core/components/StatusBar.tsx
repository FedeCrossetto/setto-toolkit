import { useApp } from '../AppContext'
import { getPlugin } from '../plugin-registry'

export function StatusBar(): JSX.Element {
  const { state, dispatch } = useApp()
  const activePlugin = state.activeTabId ? getPlugin(state.activeTabId) : null
  const leftEdge = state.sidebarCollapsed ? 76 : 224

  const dirtyCount = Object.values(state.dirtyPlugins).filter(Boolean).length

  return (
    <footer
      className="fixed flex items-center px-4 justify-between z-50 transition-all duration-200"
      style={{
        bottom: 8,
        left: leftEdge + 6,
        right: 8,
        height: 28,
        borderRadius: 12,
        background: 'rgb(var(--c-surface-container))',
        boxShadow: '0 4px 24px rgba(0,0,0,0.14), 0 1px 4px rgba(0,0,0,0.10)',
      }}
    >
      <div className="flex items-center gap-4 text-[10px] uppercase tracking-widest">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-accent status-dot-pulse" />
          <span className="text-accent font-bold">Listo</span>
        </div>
        {activePlugin && (
          <span className="text-on-surface-variant">{activePlugin.name}</span>
        )}
        {dirtyCount > 0 && (
          <span className="flex items-center gap-1.5 text-warning" title="Cambios sin guardar">
            <span className="w-1.5 h-1.5 rounded-full bg-warning" />
            {dirtyCount} sin guardar
          </span>
        )}
      </div>
      <div className="flex gap-6 text-[10px] uppercase tracking-widest items-center">
        <button
          type="button"
          className="text-on-surface-variant hover:text-primary transition-colors no-drag focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 rounded px-1"
          onClick={() => dispatch({ type: 'OPEN_KEYBOARD_SHORTCUTS' })}
        >
          Atajos <span className="opacity-60 normal-case">(F1)</span>
        </button>
        <button
          type="button"
          className="text-on-surface-variant hover:text-primary transition-colors no-drag focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 rounded px-1"
          onClick={() => dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })}
        >
          Buscar <span className="opacity-60 normal-case">(⌘K)</span>
        </button>
        <button
          type="button"
          className="text-on-surface-variant hover:text-primary transition-colors no-drag focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 rounded px-1"
          onClick={() => dispatch({ type: 'OPEN_TAB', pluginId: 'settings' })}
        >
          Ajustes
        </button>
      </div>
    </footer>
  )
}
