import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useApp } from '../AppContext'
import { allPlugins } from '../plugin-registry'
import { PluginIcon, shortName } from '../pluginIcons'
import type { PluginManifest } from '../types'
import { SPRING } from '../motion'

/** Ancho de la barra lateral — App.tsx y la toolbar lo leen de acá. */
export const SIDEBAR_WIDTH = { expanded: 216, collapsed: 68 }

const SECTION_LABEL: Record<string, string> = {
  personal: 'Personal',
  dev: 'Desarrollo',
}

// ── Nav item ───────────────────────────────────────────────────────────────────
function SidebarItem({
  plugin,
  active,
  collapsed,
  dirty,
  onClick,
}: {
  plugin: PluginManifest
  active: boolean
  collapsed: boolean
  dirty: boolean
  onClick: () => void
}): JSX.Element {
  // Minimalista: un solo acento. Inactivo = ícono gris sin fondo; activo = baldosa llena del tema.
  const tile = (
    <span
      className={`relative z-10 grid place-items-center shrink-0 rounded-[9px] transition-[background-color,color,transform] duration-150 group-active:scale-95 ${
        collapsed ? 'w-[34px] h-[28px]' : 'w-[24px] h-[24px] rounded-[7px]'} ${
        active ? 'bg-primary text-on-primary shadow-[0_2px_8px_-2px_rgb(var(--c-primary)/0.5)]' : 'text-on-surface-variant group-hover:text-on-surface'}`}
    >
      <PluginIcon icon={plugin.icon} size={collapsed ? 16 : 14} weight={active ? 'fill' : 'regular'} className="shrink-0" />
      {dirty && (
        <span title="Cambios sin guardar" className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-warning ring-2 ring-[rgb(var(--c-sidebar))]" />
      )}
    </span>
  )
  return (
    <button
      onClick={onClick}
      title={plugin.name}
      aria-label={plugin.name}
      aria-current={active ? 'page' : undefined}
      className={`group relative flex w-full rounded-[10px] transition-colors duration-100 no-drag ${
        collapsed ? 'flex-col items-center justify-center gap-[3px] py-[6px]' : 'items-center gap-2.5 h-(--nav-row-h) px-2'
      } ${active ? '' : 'hover:bg-on-surface/4.5 dark:hover:bg-white/5'}`}
    >
      {/* La pastilla de selección se desliza de un ítem al otro (mismo layoutId). */}
      {active && (
        <motion.span layoutId="sidebar-active" className="absolute inset-0 z-0 rounded-[10px] bg-selected" transition={SPRING.snappy} />
      )}
      {tile}
      {collapsed ? (
        <span className={`relative z-10 max-w-full truncate px-0.5 text-[10px] leading-[12px] tracking-[-0.01em] ${active ? 'font-semibold text-on-surface' : 'font-medium text-on-surface-variant group-hover:text-on-surface'}`}>
          {shortName(plugin.id, plugin.name)}
        </span>
      ) : (
        <span className={`relative z-10 flex-1 text-left truncate t-body ${active ? 'font-semibold text-on-surface' : 'font-medium text-on-surface/80 group-hover:text-on-surface'}`}>
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

  const openTab = (pluginId: string): void => {
    dispatch({ type: 'OPEN_TAB', pluginId })
    dispatch({ type: 'CLOSE_COMMAND_PALETTE' })
  }

  const activePluginId = state.openTabs.find(t => t.tabId === state.activeTabId)?.pluginId

  return (
    <aside
      className="relative z-50 h-full shrink-0 flex flex-col bg-sidebar hairline-r transition-[width] duration-200"
      style={{ width: collapsed ? SIDEBAR_WIDTH.collapsed : SIDEBAR_WIDTH.expanded, transitionTimingFunction: 'var(--ease-mac)' }}
    >
      {/* layoutScroll: la pastilla mide bien aunque la lista esté scrolleada. */}
      <motion.nav layoutScroll className={`flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide pt-3 pb-2 ${collapsed ? 'px-1.5' : 'px-2.5'}`}>
        {sections.map((g, i) => (
          <div key={g.key} className={i > 0 ? (collapsed ? 'mt-2' : 'mt-4') : ''}>
            {collapsed
              ? (i > 0 && <div className="mx-3 mb-2 h-px bg-(--hairline)" />)
              : <div className="px-2.5 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-on-surface-variant/70">{SECTION_LABEL[g.key] ?? g.key}</div>}
            <div className="flex flex-col gap-0.5">
              {g.items.map(p => (
                <SidebarItem
                  key={p.id}
                  plugin={p}
                  active={activePluginId === p.id}
                  collapsed={collapsed}
                  dirty={!!state.dirtyPlugins[p.id]}
                  onClick={() => openTab(p.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </motion.nav>

      <div className={`flex flex-col gap-0.5 pb-3 pt-2 hairline-t shrink-0 ${collapsed ? 'px-1.5' : 'px-2.5'}`}>
        {pinned.map(p => (
          <SidebarItem
            key={p.id}
            plugin={p}
            active={activePluginId === p.id}
            collapsed={collapsed}
            dirty={false}
            onClick={() => openTab(p.id)}
          />
        ))}
        <button
          onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
          title={collapsed ? 'Expandir barra lateral' : 'Contraer barra lateral'}
          className={`flex items-center h-(--nav-row-h) rounded-[10px] text-on-surface-variant hover:bg-on-surface/4 hover:text-on-surface transition-colors ${
            collapsed ? 'justify-center' : 'gap-2.5 px-2'
          }`}
        >
          <span className={`grid place-items-center ${collapsed ? '' : 'w-[24px]'}`}>
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </span>
          {!collapsed && <span className="t-body font-medium">Contraer</span>}
        </button>
      </div>
    </aside>
  )
}
