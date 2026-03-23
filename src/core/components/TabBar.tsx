import { useState } from 'react'
import { useApp } from '../AppContext'
import { getPlugin } from '../plugin-registry'

export function TabBar(): JSX.Element {
  const { state, dispatch } = useApp()
  const [confirmClose, setConfirmClose] = useState<{ tabId: string; pluginName: string } | null>(null)

  const openPalette = (): void => dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })

  const requestClose = (tabId: string, pluginId: string, pluginName: string): void => {
    if (state.dirtyPlugins.has(pluginId)) {
      setConfirmClose({ tabId, pluginName })
    } else {
      dispatch({ type: 'CLOSE_TAB', tabId })
    }
  }

  return (
    <header className="bg-surface w-full h-12 flex items-center border-b border-outline-variant/20 sticky top-0 z-40 pl-4 pr-4">
      {/* Tabs */}
      <div className="flex items-center gap-0 flex-1 min-w-0 overflow-x-auto scrollbar-hide">
        {state.openTabs.map((tab) => {
          const plugin = getPlugin(tab.pluginId)
          if (!plugin) return null
          const active = state.activeTabId === tab.tabId

          return (
            <div
              key={tab.tabId}
              className={`flex items-center gap-1.5 px-4 pb-3 pt-3 text-sm cursor-pointer border-b-2 transition-all duration-200 whitespace-nowrap group ${
                active
                  ? 'text-primary border-primary font-semibold'
                  : 'text-on-surface-variant border-transparent hover:text-on-surface hover:bg-surface-container'
              }`}
              onClick={() => dispatch({ type: 'SET_ACTIVE_TAB', tabId: tab.tabId })}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                {plugin.icon}
              </span>
              <span>{plugin.name}</span>
              {state.openTabs.length > 1 && (
                <button
                  className="ml-1 opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-error transition-all"
                  onClick={(e) => {
                    e.stopPropagation()
                    requestClose(tab.tabId, tab.pluginId, plugin.name)
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>close</span>
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Command palette trigger */}
      <div className="ml-auto flex items-center gap-3 flex-shrink-0">
        <button
          onClick={openPalette}
          className="flex items-center gap-2 bg-surface-container px-3 py-1.5 rounded-lg border border-outline-variant/30 text-on-surface-variant hover:border-primary/40 hover:text-on-surface transition-colors"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>search</span>
          <span className="text-xs hidden md:block pr-4">Search tools...</span>
          <kbd className="text-[10px] bg-surface-container-low px-1.5 py-0.5 rounded border border-outline-variant/30 hidden md:block">⌘K</kbd>
        </button>
      </div>

      {/* Unsaved-changes guard when closing a plugin tab */}
      {confirmClose && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-[360px] bg-surface-container border border-outline-variant/30 rounded-2xl shadow-2xl p-5 flex flex-col gap-5">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-warning mt-0.5" style={{ fontSize: '20px' }}>warning</span>
              <div>
                <p className="text-sm font-semibold text-on-surface">Unsaved changes</p>
                <p className="text-[12px] text-on-surface-variant mt-1">
                  <span className="font-medium text-on-surface">"{confirmClose.pluginName}"</span> has unsaved files.
                  Close anyway?
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmClose(null)}
                className="px-3 py-1.5 text-[12px] rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  dispatch({ type: 'CLOSE_TAB', tabId: confirmClose.tabId })
                  setConfirmClose(null)
                }}
                className="px-3 py-1.5 text-[12px] rounded-lg text-error hover:bg-error/10 border border-error/30 transition-colors"
              >
                Close anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
