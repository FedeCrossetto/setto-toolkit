import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cycleIndex, orderByMru, syncMru, touchMru, type TabLike } from '../navigation'

interface TabSwitcherProps<T extends TabLike> {
  tabs: readonly T[]
  activeId: string | null
  onCommit: (id: string) => void
  renderIcon: (tab: T) => ReactNode
}

interface SwitchState { list: string[]; index: number }

/**
 * Ctrl+Tab / Ctrl+Shift+Tab: alterna entre archivos abiertos por uso reciente (MRU).
 * Mientras Ctrl está apretado muestra un popover centrado; al soltarlo, abre el elegido.
 * Escape cancela. Sólo reacciona cuando el Editor es la pestaña visible.
 */
export function TabSwitcher<T extends TabLike>({ tabs, activeId, onCommit, renderIcon }: TabSwitcherProps<T>): JSX.Element {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const [mru, setMru] = useState<string[]>([])
  const [sw, setSw] = useState<SwitchState | null>(null)

  const idsKey = tabs.map((t) => t.id).join('|')
  useEffect(() => {
    const ids = idsKey ? idsKey.split('|') : []
    setMru((m) => {
      const synced = syncMru(m, ids)
      return activeId && ids.includes(activeId) ? touchMru(synced, activeId) : synced
    })
  }, [idsKey, activeId])

  // Refs para que los listeners (montados una vez) lean valores frescos
  const live = useRef({ tabs, mru, sw, onCommit })
  live.current = { tabs, mru, sw, onCommit }

  useEffect(() => {
    const visible = (): boolean => !!anchorRef.current && anchorRef.current.offsetParent !== null
    const close = (commit: boolean): void => {
      const cur = live.current.sw
      setSw(null)
      if (commit && cur) {
        const id = cur.list[cur.index]
        if (id) live.current.onCommit(id)
      }
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Tab' && e.ctrlKey && !e.altKey && !e.metaKey) {
        if (!visible()) return
        e.preventDefault()
        e.stopPropagation()
        const dir: 1 | -1 = e.shiftKey ? -1 : 1
        const cur = live.current.sw
        if (cur) {
          setSw({ ...cur, index: cycleIndex(cur.list.length, cur.index, dir) })
        } else {
          const list = orderByMru(live.current.tabs, live.current.mru).map((t) => t.id)
          if (list.length < 2) return
          setSw({ list, index: cycleIndex(list.length, 0, dir) })
        }
        return
      }
      if (e.key === 'Escape' && live.current.sw) { e.preventDefault(); e.stopPropagation(); close(false) }
    }
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.key === 'Control' && live.current.sw) close(true)
    }
    const onBlur = (): void => { if (live.current.sw) close(false) }
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  const byId = new Map(tabs.map((t) => [t.id, t]))

  return (
    <>
      <span ref={anchorRef} className="absolute w-0 h-0 pointer-events-none" aria-hidden />
      {sw && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[18vh] pointer-events-none">
          <div role="listbox" aria-label="Cambiar de archivo"
            className="mac-popover hairline w-[360px] max-w-[90vw] max-h-[60vh] overflow-y-auto p-1.5 pointer-events-auto">
            <p className="t-section px-2.5 pt-1 pb-1.5">Archivos recientes</p>
            {sw.list.map((id, i) => {
              const tab = byId.get(id)
              if (!tab) return null
              const selected = i === sw.index
              return (
                <div key={id} role="option" aria-selected={selected}
                  onMouseDown={(e) => { e.preventDefault(); setSw(null); onCommit(id) }}
                  className={`flex items-center gap-2.5 h-[30px] px-2.5 rounded-lg cursor-default ${selected ? 'bg-selected text-on-surface' : 'text-on-surface/80 hover:bg-on-surface/4'}`}>
                  <span className="shrink-0 flex">{renderIcon(tab)}</span>
                  <span className={`text-[13px] truncate ${selected ? 'font-semibold' : 'font-medium'}`}>{tab.name}</span>
                  {tab.isDirty && <span title="Sin guardar" className="w-1.5 h-1.5 rounded-full bg-on-surface-variant shrink-0" />}
                  {tab.path && <span className="ml-auto t-caption text-on-surface-variant truncate min-w-0 max-w-[45%]" title={tab.path}>{tab.path.replace(/[/\\][^/\\]+$/, '')}</span>}
                </div>
              )
            })}
            <p className="t-caption text-on-surface-variant px-2.5 pt-1.5">Soltá Ctrl para abrir · Esc cancela</p>
          </div>
        </div>
      )}
    </>
  )
}
