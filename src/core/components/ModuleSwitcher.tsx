import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useApp } from '../AppContext'
import { allPlugins, getPlugin } from '../plugin-registry'
import { PluginIcon } from '../pluginIcons'
import { cycle, recentOrder, sidebarOrder } from '../navigation'
import { dialogMotion } from '../motion'

/**
 * Atajos de navegación entre módulos:
 * - Ctrl+1…9: módulo N en el orden de la barra lateral.
 * - Ctrl+` (en cualquier lado) y Ctrl+Tab (salvo en el Editor, donde Ctrl+Tab
 *   alterna archivos): recorre los módulos usados recientemente. Mientras se
 *   mantiene Ctrl aparece la lista; al soltar se abre el elegido (Esc cancela).
 */
export function ModuleSwitcher(): JSX.Element {
  const { state, dispatch } = useApp()
  const [sw, setSw] = useState<{ list: string[]; index: number } | null>(null)
  const live = useRef({ state, sw })
  live.current = { state, sw }

  const order = useMemo(
    () => sidebarOrder(allPlugins.filter((p) => !state.disabledPlugins.includes(p.id))).map((p) => p.id),
    [state.disabledPlugins],
  )
  const orderRef = useRef(order)
  orderRef.current = order

  useEffect(() => {
    const open = (pluginId: string): void => dispatch({ type: 'OPEN_TAB', pluginId })
    const close = (commit: boolean): void => {
      const cur = live.current.sw
      setSw(null)
      const id = cur?.list[cur.index]
      if (commit && id && id !== live.current.state.activeTabId) open(id)
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || !e.ctrlKey || e.altKey || e.metaKey) return
      // Ctrl+1…9
      if (!e.shiftKey && /^Digit[1-9]$/.test(e.code)) {
        const id = orderRef.current[Number(e.code.slice(5)) - 1]
        if (!id) return
        e.preventDefault()
        open(id)
        return
      }
      const backtick = e.code === 'Backquote'
      const tab = e.key === 'Tab' && live.current.state.activeTabId !== 'file-editor'
      if (!backtick && !tab) return
      e.preventDefault()
      const dir: 1 | -1 = e.shiftKey ? -1 : 1
      const cur = live.current.sw
      if (cur) { setSw({ ...cur, index: cycle(cur.list.length, cur.index, dir) }); return }
      const s = live.current.state
      const visible = new Set(orderRef.current)
      const list = recentOrder(s.openTabs).filter((id) => visible.has(id))
      if (s.activeTabId && list[0] !== s.activeTabId) list.unshift(s.activeTabId)
      if (list.length < 2) return
      setSw({ list, index: cycle(list.length, 0, dir) })
    }
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.key === 'Control' && live.current.sw) close(true)
    }
    const onEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && live.current.sw) { e.preventDefault(); e.stopPropagation(); close(false) }
    }
    const onBlur = (): void => { if (live.current.sw) close(false) }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keydown', onEsc, true)
    window.addEventListener('keyup', onKeyUp, true)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keydown', onEsc, true)
      window.removeEventListener('keyup', onKeyUp, true)
      window.removeEventListener('blur', onBlur)
    }
  }, [dispatch])

  return (
    <AnimatePresence>
      {sw && (
        <motion.div
          {...dialogMotion}
          role="listbox"
          aria-label="Módulos recientes"
          className="fixed inset-x-0 top-[22vh] mx-auto w-[280px] z-9000 bg-surface hairline rounded-xl shadow-2xl p-1.5"
        >
          <div className="t-caption text-on-surface-variant px-2.5 pt-1 pb-1.5">Módulos recientes</div>
          {sw.list.map((id, i) => {
            const p = getPlugin(id)
            if (!p) return null
            const sel = i === sw.index
            return (
              <div
                key={id}
                role="option"
                aria-selected={sel}
                className={`flex items-center gap-2.5 h-8 px-2.5 rounded-lg t-body ${sel ? 'bg-selected text-on-surface font-semibold' : 'text-on-surface/80'}`}
              >
                <PluginIcon icon={p.icon} size={15} weight={sel ? 'fill' : 'regular'} className={sel ? 'text-primary' : 'text-on-surface-variant'} />
                <span className="flex-1 truncate">{p.name}</span>
                {i === 0 && <span className="t-caption text-on-surface-variant">actual</span>}
              </div>
            )
          })}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
