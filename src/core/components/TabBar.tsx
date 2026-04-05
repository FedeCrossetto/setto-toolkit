import { useState, useRef, useEffect, useCallback } from 'react'
import { Diff, Search, X } from 'lucide-react'
import { useApp } from '../AppContext'
import { getPlugin } from '../plugin-registry'
import { PluginIcon } from '../pluginIcons'
import { dragState } from '../dragState'

export function TabBar(): JSX.Element {
  const { state, dispatch } = useApp()
  const [isDiffDropOver, setDiffDropOver] = useState(false)
  const [confirmClose, setConfirmClose] = useState<{ tabId: string; pluginName: string } | null>(null)
  const [canScrollLeft,  setCanScrollLeft]  = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const openPalette = (): void => dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })

  const requestClose = (tabId: string, pluginId: string, pluginName: string): void => {
    if (state.dirtyPlugins[pluginId]) {
      setConfirmClose({ tabId, pluginName })
    } else {
      dispatch({ type: 'CLOSE_TAB', tabId })
    }
  }

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 0)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    updateScrollState()
    el.addEventListener('scroll', updateScrollState)
    const ro = new ResizeObserver(updateScrollState)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', updateScrollState); ro.disconnect() }
  }, [updateScrollState, state.openTabs])

  const scrollBy = (dir: 'left' | 'right'): void => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -160 : 160, behavior: 'smooth' })
  }

  return (
    <header className="bg-surface w-full h-12 flex items-center border-b border-outline-variant/20 sticky top-0 z-40 pl-4 pr-4">
      {/* Scroll left arrow */}
      {canScrollLeft && (
        <button
          onClick={() => scrollBy('left')}
          className="flex-shrink-0 mr-1 text-on-surface-variant hover:text-primary transition-colors"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_left</span>
        </button>
      )}

      {/* Tabs */}
      <div ref={scrollRef} className="flex items-center gap-0 flex-1 min-w-0 overflow-x-auto scrollbar-hide">
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
                  onClick={(e) => {
                    e.stopPropagation()
                    requestClose(tab.tabId, tab.pluginId, plugin.name)
                  }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Scroll right arrow */}
      {canScrollRight && (
        <button
          onClick={() => scrollBy('right')}
          className="flex-shrink-0 ml-1 text-on-surface-variant hover:text-primary transition-colors"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        </button>
      )}

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
