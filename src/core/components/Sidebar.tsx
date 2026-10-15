import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useApp } from '../AppContext'
import { allPlugins } from '../plugin-registry'
import { PluginIcon } from '../pluginIcons'
import type { PluginManifest } from '../types'
import { SPRING } from '../motion'

/** Ancho de la barra lateral — App.tsx y la toolbar lo leen de acá. */
export const SIDEBAR_WIDTH = { expanded: 224, collapsed: 60 }

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
  return (
    <button
      onClick={onClick}
      title={collapsed ? plugin.name : undefined}
      aria-current={active ? 'page' : undefined}
      className={`group relative flex items-center w-full h-[var(--nav-row-h)] rounded-lg transition-colors duration-100 no-drag ${
        collapsed ? 'justify-center' : 'gap-2.5 px-2.5'
      } ${active ? '' : 'hover:bg-on-surface/[0.04] dark:hover:bg-white/[0.05]'}`}
    >
      {/* La pastilla de selección se desliza de un ítem al otro (mismo layoutId). */}
      {active && (
        <motion.span layoutId="sidebar-active" className="absolute inset-0 z-0 rounded-lg bg-selected" transition={SPRING.snappy} />
      )}
      <PluginIcon
        icon={plugin.icon}
        size={collapsed ? 19 : 17}
        weight={active ? 'fill' : 'regular'}
        className={`relative z-10 flex-shrink-0 transition-colors ${active ? 'text-primary' : 'text-on-surface-variant group-hover:text-on-surface'}`}
      />
      {!collapsed && (
        <span className={`relative z-10 flex-1 text-left truncate text-[13px] ${active ? 'font-semibold text-on-surface' : 'font-medium text-on-surface/75 group-hover:text-on-surface'}`}>
          {plugin.name}
        </span>
      )}
      {dirty && (
        <span
          title="Cambios sin guardar"
          className={`w-1.5 h-1.5 rounded-full bg-warning flex-shrink-0 ${collapsed ? 'absolute z-10 top-1.5 right-2' : 'relative z-10'}`}
        />
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
      className="relative z-50 h-full flex-shrink-0 flex flex-col bg-sidebar hairline-r transition-[width] duration-200"
      style={{ width: collapsed ? SIDEBAR_WIDTH.collapsed : SIDEBAR_WIDTH.expanded, transitionTimingFunction: 'var(--ease-mac)' }}
    >
      {/* layoutScroll: la pastilla mide bien aunque la lista esté scrolleada. */}
      <motion.nav layoutScroll className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide px-3 pt-3 pb-2">
        {sections.map((g, i) => (
          <div key={g.key} className={i > 0 ? 'mt-5' : ''}>
            {collapsed
              ? (i > 0 && <div className="mx-2 mb-2 h-px bg-[var(--hairline)]" />)
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

      <div className="flex flex-col gap-0.5 px-3 pb-3 pt-2 hairline-t flex-shrink-0">
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
          className={`flex items-center h-[var(--nav-row-h)] rounded-lg text-on-surface-variant hover:bg-on-surface/[0.04] hover:text-on-surface transition-colors ${
            collapsed ? 'justify-center' : 'gap-2.5 px-2.5'
          }`}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          {!collapsed && <span className="text-[13px] font-medium">Contraer</span>}
        </button>
      </div>
    </aside>
  )
}
