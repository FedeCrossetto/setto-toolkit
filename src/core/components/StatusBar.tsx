import { useApp } from '../AppContext'
import { getPlugin } from '../plugin-registry'

export function StatusBar(): JSX.Element {
  const { state } = useApp()
  const activePlugin = state.activeTabId ? getPlugin(state.activeTabId) : null
  const leftEdge = state.sidebarCollapsed ? 76 : 224

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
          <div className="w-1.5 h-1.5 rounded-full bg-accent" />
          <span className="text-accent font-bold">System Ready</span>
        </div>
        {activePlugin && (
          <span className="text-on-surface-variant">{activePlugin.name}</span>
        )}
      </div>
      <div className="flex gap-6 text-[10px] uppercase tracking-widest">
        <span className="text-on-surface-variant hover:text-primary cursor-default transition-colors">Logs</span>
        <span className="text-on-surface-variant hover:text-primary cursor-default transition-colors">Runtime</span>
        <span className="text-on-surface-variant hover:text-primary cursor-default transition-colors">Settings</span>
      </div>
    </footer>
  )
}
