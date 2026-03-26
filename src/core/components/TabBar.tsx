import { useState } from 'react'
import { Diff, Search, X } from 'lucide-react'
import { useApp } from '../AppContext'
import { getPlugin } from '../plugin-registry'
import { PluginIcon } from '../pluginIcons'
import { dragState } from '../dragState'

export function TabBar(): JSX.Element {
  const { state, dispatch } = useApp()
  const [isDiffDropOver, setDiffDropOver] = useState(false)

  const openPalette = (): void => dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })

  return (
    <header className="bg-surface w-full h-12 flex items-center border-b border-outline-variant/20 sticky top-0 z-40 pl-4 pr-3 gap-2">
      {/* Plugin tabs */}
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
              <PluginIcon icon={plugin.icon} size={14} />
              <span>{plugin.name}</span>
              {state.dirtyPlugins[tab.pluginId] && (
                <span title="Unsaved changes" className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
              )}
              {state.openTabs.length > 1 && (
                <button
                  className="ml-1 opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-error transition-all"
                  onClick={(e) => { e.stopPropagation(); dispatch({ type: 'CLOSE_TAB', tabId: tab.tabId }) }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Smart Diff drop zone ─────────────────────────────────────────────────
          Always in the DOM and always interactive — no show/hide logic that would
          create timing or hit-area issues. When a setto-file drag is active it
          highlights on hover; clicking it also opens Smart Diff directly. */}
      <div
        onClick={() => dispatch({ type: 'OPEN_TAB', pluginId: 'smart-diff' })}
        onDragOver={(e) => {
          e.preventDefault()
          if (dragState.get() !== null) {
            e.dataTransfer.dropEffect = 'copy'
            setDiffDropOver(true)
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDiffDropOver(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setDiffDropOver(false)
          const fileData = dragState.get()
          dragState.set(null)
          if (!fileData) return
          dispatch({ type: 'SEND_TO_DIFF', ...fileData })
        }}
        title="Drag a file here to compare in Smart Diff"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold whitespace-nowrap flex-shrink-0 cursor-pointer select-none transition-all duration-100 ${
          isDiffDropOver
            ? 'bg-[#887CFD]/20 border-[#887CFD]/60 text-[#887CFD] scale-105'
            : 'bg-surface-container/60 border-outline-variant/20 text-on-surface-variant/40 hover:text-on-surface-variant hover:border-outline-variant/50 hover:bg-surface-container'
        }`}
      >
        <Diff size={14} />
        <span className="hidden lg:inline">{isDiffDropOver ? 'Drop to compare' : 'Smart Diff'}</span>
      </div>

      {/* Command palette trigger */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <button
          onClick={openPalette}
          className="flex items-center gap-2 bg-surface-container px-3 py-1.5 rounded-lg border border-outline-variant/30 text-on-surface-variant hover:border-primary/40 hover:text-on-surface transition-colors"
        >
          <Search size={14} />
          <span className="text-xs hidden md:block pr-4">Search tools...</span>
          <kbd className="text-[10px] bg-surface-container-low px-1.5 py-0.5 rounded border border-outline-variant/30 hidden md:block">⌘K</kbd>
        </button>
      </div>
    </header>
  )
}
