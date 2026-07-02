import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react'
import { useApp } from '../AppContext'
import { getPlugin } from '../plugin-registry'
import { PluginIcon } from '../pluginIcons'

export function TabBar(): JSX.Element {
  const { state, dispatch } = useApp()
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
          aria-label="Desplazar pestañas a la izquierda"
          className="flex-shrink-0 mr-1 text-on-surface-variant hover:text-primary transition-colors"
        >
          <ChevronLeft size={16} />
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
              role="tab"
              tabIndex={0}
              aria-selected={active}
              className={`relative flex items-center gap-1.5 px-3 py-1.5 my-1.5 text-xs cursor-pointer whitespace-nowrap group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 rounded-lg transition-colors duration-200 ${
                active
                  ? 'text-white font-semibold'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
              onClick={() => dispatch({ type: 'SET_ACTIVE_TAB', tabId: tab.tabId })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  dispatch({ type: 'SET_ACTIVE_TAB', tabId: tab.tabId })
                }
              }}
            >
              {active && (
                <motion.span
                  layoutId="tabbar-active-pill"
                  className="absolute inset-0 rounded-lg shadow-sm"
                  style={{ background: 'var(--gradient-brand)', boxShadow: '0 2px 8px rgb(var(--c-primary) / 0.35)' }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                />
              )}
              {!active && (
                <span className="absolute inset-0 rounded-lg bg-transparent group-hover:bg-surface-container-high transition-colors duration-150" />
              )}
              <PluginIcon icon={plugin.icon} size={13} className="relative" />
              <span className="relative">{plugin.name}</span>
              {state.dirtyPlugins[tab.pluginId] && (
                <span title="Sin guardar" className="relative w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
              )}
              {state.openTabs.length > 1 && (
                <button
                  aria-label={`Cerrar ${plugin.name}`}
                  className="relative ml-0.5 opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-error transition-all"
                  onClick={(e) => {
                    e.stopPropagation()
                    requestClose(tab.tabId, tab.pluginId, plugin.name)
                  }}
                >
                  <X size={11} />
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
          aria-label="Desplazar pestañas a la derecha"
          className="flex-shrink-0 ml-1 text-on-surface-variant hover:text-primary transition-colors"
        >
          <ChevronRight size={16} />
        </button>
      )}

      {/* Command palette trigger */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <button
          onClick={openPalette}
          className="flex items-center gap-2 bg-surface-container px-3 py-1.5 rounded-lg border border-outline-variant/30 text-on-surface-variant hover:border-primary/40 hover:text-on-surface transition-colors"
        >
          <Search size={14} />
          <span className="text-xs hidden md:block pr-4">Buscar herramientas...</span>
          <kbd className="text-[10px] bg-surface-container-low px-1.5 py-0.5 rounded border border-outline-variant/30 hidden md:block">⌘K</kbd>
          <kbd className="text-[10px] bg-surface-container-low px-1.5 py-0.5 rounded border border-outline-variant/30 hidden md:block">/</kbd>
        </button>
      </div>

      {/* Unsaved-changes guard when closing a plugin tab */}
      <AnimatePresence>
        {confirmClose && (
          <motion.div
            className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <motion.div
              className="w-[360px] ui-card p-5 flex flex-col gap-5"
              initial={{ opacity: 0, scale: 0.96, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 6 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              <div className="flex items-start gap-3">
                <AlertTriangle size={20} className="text-warning mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-on-surface">Cambios sin guardar</p>
                  <p className="text-[12px] text-on-surface-variant mt-1">
                    <span className="font-medium text-on-surface">"{confirmClose.pluginName}"</span> tiene archivos sin guardar.
                    ¿Cerrar de todos modos?
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setConfirmClose(null)}
                  className="ui-btn ui-btn-ghost"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    dispatch({ type: 'CLOSE_TAB', tabId: confirmClose.tabId })
                    setConfirmClose(null)
                  }}
                  className="ui-btn px-3 py-1.5 text-[12px] rounded-lg text-error hover:bg-error/10 border border-error/30 transition-colors"
                >
                  Cerrar igualmente
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
