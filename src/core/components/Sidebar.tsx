import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { CaretDown, PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react'
import { useApp } from '../AppContext'
import { allPlugins } from '../plugin-registry'
import { PluginIcon, shortName } from '../pluginIcons'
import type { PluginManifest } from '../types'
import { SPRING } from '../motion'
import { sidebarOrder } from '../navigation'

/** Ancho de la barra lateral — App.tsx lo lee de acá. */
export const SIDEBAR_WIDTH = { expanded: 232, collapsed: 74 }

const SECTION_LABEL: Record<string, string> = {
  personal: 'Personal',
  dev: 'Desarrollo',
}

const COLLAPSED_SECTIONS_KEY = 'sidebar:collapsed-sections'

function readCollapsedSections(): string[] {
  try { return JSON.parse(localStorage.getItem(COLLAPSED_SECTIONS_KEY) ?? '[]') as string[] } catch { return [] }
}

// ── Nav item ───────────────────────────────────────────────────────────────────
function SidebarItem({
  plugin,
  active,
  collapsed,
  dirty,
  shortcut,
  onClick,
}: {
  plugin: PluginManifest
  active: boolean
  collapsed: boolean
  dirty: boolean
  /** N de Ctrl+N (1…9), en el orden de la barra. */
  shortcut?: number
  onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      title={plugin.name}
      aria-label={plugin.name}
      aria-current={active ? 'page' : undefined}
      aria-keyshortcuts={shortcut ? `Control+${shortcut}` : undefined}
      className={`group relative flex w-full rounded-[9px] transition-colors duration-100 no-drag ${
        collapsed ? 'flex-col items-center justify-center gap-[3px] py-[7px]' : 'items-center gap-2.5 h-(--nav-row-h) px-2.5'
      } ${active ? '' : 'hover:bg-on-surface/4 dark:hover:bg-white/4'}`}
    >
      {/* Activo = tarjeta blanca con borde fino; se desliza de un ítem al otro. */}
      {active && (
        <motion.span layoutId="sidebar-active" className="nav-active absolute inset-0 z-0 rounded-[9px]" transition={SPRING.snappy} />
      )}
      <span className="relative z-10 grid place-items-center shrink-0">
        <PluginIcon
          icon={plugin.icon}
          size={collapsed ? 18 : 16}
          weight={active ? 'regular' : 'light'}
          className={active ? 'text-on-surface' : 'text-on-surface-variant group-hover:text-on-surface'}
        />
        {dirty && (
          <span title="Cambios sin guardar" className="absolute -top-0.5 -right-1 w-1.5 h-1.5 rounded-full bg-warning" />
        )}
      </span>
      {collapsed ? (
        <span className={`relative z-10 max-w-full truncate text-[10px] leading-[12px] ${active ? 'font-semibold text-on-surface' : 'text-on-surface-variant group-hover:text-on-surface'}`}>
          {shortName(plugin.id, plugin.name)}
        </span>
      ) : (
        <span className={`relative z-10 flex-1 text-left truncate t-body ${active ? 'font-medium text-on-surface' : 'text-on-surface/75 group-hover:text-on-surface'}`}>
          {plugin.name}
        </span>
      )}
    </button>
  )
}

// ── Sidebar ────────────────────────────────────────────────────────────────────
export function Sidebar(): JSX.Element {
  const { state, dispatch } = useApp()
  const collapsed = state.sidebarCollapsed
  const [closedSections, setClosedSections] = useState<string[]>(readCollapsedSections)

  const enabled = useMemo(
    () => allPlugins.filter(p => !state.disabledPlugins.includes(p.id)),
    [state.disabledPlugins],
  )
  const sections = useMemo(() => {
    const groups: { key: string; items: PluginManifest[] }[] = []
    for (const p of enabled.filter(p => !p.pinned)) {
      const key = p.section ?? 'dev'
      let g = groups.find(x => x.key === key)
      if (!g) { g = { key, items: [] }; groups.push(g) }
      g.items.push(p)
    }
    return groups
  }, [enabled])
  const pinned = useMemo(() => enabled.filter(p => p.pinned && p.id !== 'about'), [enabled])
  // Mismo orden que Ctrl+1…9 (ModuleSwitcher).
  const shortcutOf = useMemo(() => {
    const ids = sidebarOrder(enabled).map(p => p.id)
    return (id: string): number | undefined => { const i = ids.indexOf(id); return i >= 0 && i < 9 ? i + 1 : undefined }
  }, [enabled])

  const openTab = (pluginId: string): void => {
    dispatch({ type: 'OPEN_TAB', pluginId })
    dispatch({ type: 'CLOSE_COMMAND_PALETTE' })
  }

  const toggleSection = (key: string): void => {
    setClosedSections((prev) => {
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
      try { localStorage.setItem(COLLAPSED_SECTIONS_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }

  const activePluginId = state.openTabs.find(t => t.tabId === state.activeTabId)?.pluginId
  const activeHidden = (key: string, items: PluginManifest[]): boolean =>
    closedSections.includes(key) && !items.some(p => p.id === activePluginId)

  return (
    <aside
      className="relative z-50 h-full shrink-0 flex flex-col bg-sidebar transition-[width] duration-200"
      style={{ width: collapsed ? SIDEBAR_WIDTH.collapsed : SIDEBAR_WIDTH.expanded, transitionTimingFunction: 'var(--ease-mac)' }}
    >
      {/* Marca + plegar (zona de arrastre de la ventana) */}
      <div className={`drag-region flex items-center shrink-0 h-[52px] ${collapsed ? 'justify-center px-2' : 'gap-2.5 pl-4 pr-2.5'}`}>
        <img src="./setto-logo.png" alt="" draggable={false} className="w-[24px] h-[24px] rounded-[7px] select-none shrink-0" />
        {!collapsed && (
          <>
            <span className="flex-1 font-semibold text-[14px] tracking-[-0.01em] text-on-surface truncate">Setto</span>
            <button
              onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
              title="Contraer barra lateral"
              aria-label="Contraer barra lateral"
              className="no-drag grid place-items-center w-7 h-7 rounded-md text-on-surface-variant hover:text-on-surface hover:bg-on-surface/5 transition-colors"
            >
              <PanelLeftClose size={16} />
            </button>
          </>
        )}
      </div>

      {/* Buscador (Ctrl+K) */}
      <div className={`shrink-0 pb-3 ${collapsed ? 'px-3' : 'px-3'}`}>
        <button
          onClick={() => dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })}
          aria-label="Buscar en Setto (Ctrl+K)"
          title={collapsed ? 'Buscar (Ctrl+K)' : undefined}
          className={`no-drag w-full flex items-center gap-2 h-8 rounded-[9px] border border-hairline-strong bg-surface text-on-surface-variant hover:text-on-surface hover:border-on-surface/20 transition-colors shadow-[0_1px_1px_rgb(0_0_0/0.03)] ${
            collapsed ? 'justify-center' : 'px-2.5'}`}
        >
          <Search size={15} />
          {!collapsed && (
            <>
              <span className="t-body flex-1 text-left">Buscar</span>
              <span className="flex gap-0.5">
                <kbd className="kbd-chip">Ctrl</kbd>
                <kbd className="kbd-chip">K</kbd>
              </span>
            </>
          )}
        </button>
      </div>

      {/* layoutScroll: la tarjeta activa mide bien aunque la lista esté scrolleada. */}
      <motion.nav layoutScroll className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide px-3 pb-2">
        {sections.map((g, i) => {
          const closed = !collapsed && activeHidden(g.key, g.items)
          return (
            <div key={g.key}>
              {i > 0 && <div className={`h-px bg-(--hairline) ${collapsed ? 'mx-2 my-2.5' : 'mx-1 my-3'}`} />}
              {!collapsed && (
                <button
                  onClick={() => toggleSection(g.key)}
                  aria-expanded={!closed}
                  className="no-drag group flex items-center gap-1.5 w-full px-1.5 mb-1 h-6 text-[11px] font-medium uppercase tracking-[0.08em] text-on-surface-variant/80 hover:text-on-surface"
                >
                  <CaretDown size={10} weight="fill" className={`transition-transform duration-150 ${closed ? '-rotate-90' : ''}`} />
                  {SECTION_LABEL[g.key] ?? g.key}
                </button>
              )}
              {!closed && (
                <div className="flex flex-col gap-px">
                  {g.items.map(p => (
                    <SidebarItem
                      key={p.id}
                      plugin={p}
                      active={activePluginId === p.id}
                      collapsed={collapsed}
                      dirty={!!state.dirtyPlugins[p.id]}
                      shortcut={shortcutOf(p.id)}
                      onClick={() => openTab(p.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </motion.nav>

      <div className="flex flex-col gap-px px-3 pb-3 pt-2 shrink-0">
        <div className={`h-px bg-(--hairline) mb-2 ${collapsed ? 'mx-2' : 'mx-1'}`} />
        {pinned.map(p => (
          <SidebarItem
            key={p.id}
            plugin={p}
            active={activePluginId === p.id}
            collapsed={collapsed}
            dirty={false}
            shortcut={shortcutOf(p.id)}
            onClick={() => openTab(p.id)}
          />
        ))}
        {collapsed && (
          <button
            onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
            title="Expandir barra lateral"
            aria-label="Expandir barra lateral"
            className="no-drag flex items-center justify-center h-(--nav-row-h) rounded-[9px] text-on-surface-variant hover:bg-on-surface/4 hover:text-on-surface transition-colors"
          >
            <PanelLeftOpen size={17} />
          </button>
        )}
      </div>
    </aside>
  )
}
