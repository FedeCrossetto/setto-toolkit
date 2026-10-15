import { useState, useRef, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { SPRING } from '../motion'
import { Search, X, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useApp } from '../AppContext'
import { getPlugin } from '../plugin-registry'
import { PluginIcon } from '../pluginIcons'
import { Modal } from './Modal'
import { WindowControls } from './TitleBar'

/**
 * Barra superior oscura (estilo editores SaaS): marca + pestañas + buscador +
 * acción "Nuevo" + controles de ventana. Es también la zona de arrastre.
 * El color sale de --c-topbar (useThemePalette).
 */
export function TabBar(): JSX.Element {
  const { state, dispatch } = useApp()
  const [confirmClose, setConfirmClose] = useState<{ tabId: string; pluginName: string } | null>(null)
  const [canScrollLeft,  setCanScrollLeft]  = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const requestClose = (tabId: string, pluginId: string, pluginName: string): void => {
    if (state.dirtyPlugins[pluginId]) setConfirmClose({ tabId, pluginName })
    else dispatch({ type: 'CLOSE_TAB', tabId })
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

  const iconBtn = 'no-drag w-7 h-7 flex items-center justify-center rounded-md text-white/60 hover:text-white hover:bg-white/10 transition-colors'

  return (
    <header className="topbar drag-region h-(--topbar-h) flex items-center gap-2 pl-3 pr-3 shrink-0 text-white">
      {/* Marca */}
      <div className="flex items-center gap-2 pr-3 mr-1 border-r border-white/10 h-6 shrink-0">
        <img src="./setto-logo.png" alt="" draggable={false} className="w-[22px] h-[22px] rounded-[6px] select-none" />
        <span className="font-semibold text-[14px] tracking-tight text-white/95">Setto</span>
      </div>

      {canScrollLeft && (
        <button onClick={() => scrollBy('left')} aria-label="Pestañas anteriores" className={iconBtn}>
          <ChevronLeft size={14} />
        </button>
      )}

      {/* Pestañas */}
      <div ref={scrollRef} className="flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto scrollbar-hide">
        {state.openTabs.map((tab) => {
          const plugin = getPlugin(tab.pluginId)
          if (!plugin) return null
          const active = state.activeTabId === tab.tabId
          const dirty = !!state.dirtyPlugins[tab.pluginId]

          return (
            <div
              key={tab.tabId}
              role="tab"
              tabIndex={0}
              aria-selected={active}
              title={plugin.description}
              className={`no-drag relative flex items-center gap-1.5 h-(--control-h) pl-2.5 pr-1.5 text-[13px] cursor-default whitespace-nowrap group rounded-lg focus:outline-hidden focus-visible:ring-2 focus-visible:ring-white/30 transition-colors ${
                active ? 'text-white font-medium' : 'text-white/55 hover:text-white/90 hover:bg-white/6'
              }`}
              onMouseDown={(e) => { if (e.button === 1) { e.preventDefault(); requestClose(tab.tabId, tab.pluginId, plugin.name) } }}
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
                  layoutId="tabbar-active"
                  className="absolute inset-0 rounded-lg bg-white/12 shadow-[inset_0_1px_0_rgb(255_255_255/0.08)]"
                  transition={SPRING.snappy}
                />
              )}
              <PluginIcon icon={plugin.icon} size={13} weight={active ? 'fill' : 'regular'} className="relative shrink-0" />
              <span className="relative">{plugin.name}</span>
              <span className="relative w-4 h-4 flex items-center justify-center">
                {dirty && <span className="w-1.5 h-1.5 rounded-full bg-white/60 group-hover:hidden" title="Sin guardar" />}
                {state.openTabs.length > 1 && (
                  <button
                    aria-label={`Cerrar ${plugin.name}`}
                    className="absolute inset-0 rounded-[5px] items-center justify-center text-white/60 hover:bg-white/15 hover:text-white hidden group-hover:flex"
                    onClick={(e) => { e.stopPropagation(); requestClose(tab.tabId, tab.pluginId, plugin.name) }}
                  >
                    <X size={11} strokeWidth={2.4} />
                  </button>
                )}
              </span>
            </div>
          )
        })}
      </div>

      {canScrollRight && (
        <button onClick={() => scrollBy('right')} aria-label="Pestañas siguientes" className={iconBtn}>
          <ChevronRight size={14} />
        </button>
      )}

      {/* Buscador (abre Ctrl+K) */}
      <button
        onClick={() => dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })}
        className="no-drag flex items-center gap-2 h-(--control-h) w-[240px] max-w-[28vw] px-2.5 rounded-lg bg-white/[0.07] text-white/55 hover:bg-white/11 hover:text-white/80 transition-colors shrink-0"
      >
        <Search size={13} />
        <span className="text-[13px] flex-1 text-left truncate">Buscar en Setto…</span>
        <kbd className="text-[11px] font-sans px-1.5 py-px rounded bg-white/10 text-white/60">Ctrl K</kbd>
      </button>

      {/* Acción principal */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('setto:quick-capture'))}
        title="Captura rápida (Ctrl+Shift+Espacio)"
        className="no-drag ui-btn ui-btn-primary ui-btn-sm h-(--control-h) px-3 shrink-0"
      >
        <Plus size={13} strokeWidth={2.4} />
        Nuevo
      </button>

      <WindowControls />

      <Modal
        open={!!confirmClose}
        onClose={() => setConfirmClose(null)}
        width={360}
        footer={
          <>
            <button onClick={() => setConfirmClose(null)} className="ui-btn ui-btn-outline">Cancelar</button>
            <button
              autoFocus
              onClick={() => { if (confirmClose) dispatch({ type: 'CLOSE_TAB', tabId: confirmClose.tabId }); setConfirmClose(null) }}
              className="ui-btn ui-btn-danger"
            >
              Cerrar sin guardar
            </button>
          </>
        }
      >
        <div className="pt-5 text-center">
          <p className="t-headline">Cambios sin guardar</p>
          <p className="t-footnote text-on-surface-variant mt-1.5">
            «{confirmClose?.pluginName}» tiene cambios sin guardar. ¿Cerrar de todos modos?
          </p>
        </div>
      </Modal>
    </header>
  )
}
