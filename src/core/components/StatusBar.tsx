import { useApp } from '../AppContext'
import { getPlugin } from '../plugin-registry'

export function StatusBar(): JSX.Element {
  const { state } = useApp()
  const activePlugin = state.activeTabId ? getPlugin(state.activeTabId) : null
  const leftPad = state.sidebarCollapsed ? '84px' : '240px'

  return (
    <footer className="fixed bottom-0 left-0 right-0 h-6 border-t border-outline-variant/20 flex items-center px-4 justify-between z-50 bg-surface" style={{ paddingLeft: leftPad }}>
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
