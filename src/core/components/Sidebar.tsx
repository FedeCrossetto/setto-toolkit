import { useMemo } from 'react'
import { useApp } from '../AppContext'
import { allPlugins } from '../plugin-registry'
import type { PluginManifest } from '../types'

// ── Logo mark ─────────────────────────────────────────────────────────────────
function AppLogo({ size = 34 }: { size?: number }): JSX.Element {
  return (
    <img src="./setto-logo.png" width={size} height={size} style={{ flexShrink: 0, objectFit: 'contain', filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.25))' }} />
  )
}

// ── Constants ─────────────────────────────────────────────────────────────────
const ITEM_R = 14   // border-radius for all items (px)

// ── SidebarItem ───────────────────────────────────────────────────────────────
interface SidebarItemProps {
  plugin: PluginManifest
  active: boolean
  collapsed: boolean
  onClick: () => void
}

function SidebarItem({ plugin, active, collapsed, onClick }: SidebarItemProps): JSX.Element {
  const h = collapsed ? 44 : 40

  return (
    <div className="relative" style={{ height: h, marginBottom: 2 }}>
      <button
        onClick={onClick}
        title={plugin.name}
        style={{
          height: h,
          borderRadius: ITEM_R,
          // In dark mode 0.18 opacity reads fine against dark surfaces.
          // In light mode the same opacity on white is nearly invisible, so we
          // use a CSS variable trick: --item-bg is set per-theme in globals.css.
          background: active ? 'var(--sidebar-item-active-bg)' : undefined,
        }}
        className={[
          'relative flex items-center w-full transition-colors duration-150',
          collapsed ? 'justify-center' : 'gap-3 px-3',
          active
            ? 'text-on-surface'
            : 'text-on-surface-variant/60 hover:text-on-surface hover:bg-white/[0.04]',
        ].join(' ')}
      >
        {/* Fluorescent left accent strip */}
        {active && (
          <span
            aria-hidden
            className="absolute left-0 rounded-full pointer-events-none"
            style={{
              top: 7, bottom: 7, width: 3,
              background: 'linear-gradient(to bottom, rgb(var(--c-primary-light)), rgb(var(--c-primary)))',
              boxShadow: '0 0 12px 3px rgb(var(--c-primary) / 0.55), 0 0 4px 1px rgb(var(--c-primary-light) / 0.8)',
            }}
          />
        )}

        {/* Icon */}
        <span
          className="material-symbols-outlined flex-shrink-0 relative z-10"
          style={{
            fontSize: active ? '21px' : '19px',
            fontVariationSettings: active ? "'FILL' 1, 'wght' 500" : "'FILL' 0, 'wght' 400",
            transition: 'font-size 150ms ease, font-variation-settings 150ms ease',
          }}
        >
          {plugin.icon}
        </span>

        {/* Label */}
        {!collapsed && (
          <span className={`truncate text-[13px] relative z-10 select-none ${active ? 'font-semibold' : 'font-medium'}`}>
            {plugin.name}
          </span>
        )}
      </button>
    </div>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
export function Sidebar(): JSX.Element {
  const { state, dispatch } = useApp()
  const collapsed = state.sidebarCollapsed

  const mainPlugins   = useMemo(() => allPlugins.filter((p) => !p.pinned), [])
  const pinnedPlugins = useMemo(() => allPlugins.filter((p) =>  p.pinned), [])

  const openTab = (pluginId: string): void => {
    dispatch({ type: 'OPEN_TAB', pluginId })
    dispatch({ type: 'CLOSE_COMMAND_PALETTE' })
  }

  const isActive = (pluginId: string): boolean =>
    state.activeTabId === pluginId ||
    state.openTabs.some((t) => t.pluginId === pluginId && t.tabId === state.activeTabId)

  const toggleTheme = (): void =>
    dispatch({ type: 'SET_THEME', theme: state.theme === 'dark' ? 'light' : 'dark' })

  return (
    <aside
      className={[
        'fixed left-0 top-0 h-full z-50 flex flex-col',
        'bg-surface',
        'transition-all duration-200',
        collapsed ? 'w-[68px]' : 'w-56',
      ].join(' ')}
      style={{ borderRight: '1px solid rgb(var(--c-outline-variant) / 0.15)' }}
    >
      {/* ── Logo ──────────────────────────────────────────────────────── */}
      <div className={`flex items-center mt-6 mb-6 ${collapsed ? 'justify-center px-2' : 'px-3 justify-between'}`}>
        {collapsed ? (
          <AppLogo size={44} />
        ) : (
          <div className="flex items-center gap-1.5">
            <AppLogo size={52} />
            <div className="leading-none">
              <div className="font-bold text-[15px] text-on-surface tracking-tight">SETTO</div>
              <div className="text-[10px] text-on-surface-variant/50 tracking-widest uppercase font-medium mt-0.5">Toolkit</div>
            </div>
          </div>
        )}
        {!collapsed && (
          <button
            onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
            className="p-1 rounded-lg text-on-surface-variant/40 hover:text-on-surface hover:bg-white/[0.04] transition-colors flex-shrink-0"
            title="Collapse sidebar"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>chevron_left</span>
          </button>
        )}
      </div>

      {/* ── Main nav ──────────────────────────────────────────────────── */}
      <nav className={`relative flex flex-col flex-1 ${collapsed ? 'px-[10px]' : 'px-2'}`}>
        {mainPlugins.map((plugin) => (
          <SidebarItem
            key={plugin.id}
            plugin={plugin}
            active={isActive(plugin.id)}
            collapsed={collapsed}
            onClick={() => openTab(plugin.id)}
          />
        ))}
      </nav>

      {/* ── Bottom: pinned plugins + theme toggle + expand ────────────── */}
      <div className={`mt-auto flex flex-col ${collapsed ? 'px-[10px]' : 'px-2'}`}>

        {pinnedPlugins.map((plugin) => {
          const active = isActive(plugin.id)
          return (
            <button
              key={plugin.id}
              title={plugin.name}
              onClick={() => openTab(plugin.id)}
              className={[
                'flex items-center w-full text-[13px] font-medium rounded-2xl mb-0.5',
                'transition-colors duration-150',
                collapsed ? 'justify-center h-11' : 'gap-3 px-3 h-10',
                active
                  ? 'text-primary bg-primary/10'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-white/[0.04]',
              ].join(' ')}
            >
              <span
                className="material-symbols-outlined flex-shrink-0"
                style={{ fontSize: '20px', fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
              >
                {plugin.icon}
              </span>
              {!collapsed && <span className="truncate">{plugin.name}</span>}
            </button>
          )
        })}

        <div className="border-t border-white/[0.06] mt-2 pt-2 mb-4 flex flex-col gap-0.5">

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            title={state.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className={[
              'flex items-center w-full rounded-2xl text-[13px] font-medium',
              'text-on-surface-variant hover:text-on-surface hover:bg-white/[0.04]',
              'transition-colors duration-150',
              collapsed ? 'justify-center h-11' : 'gap-3 px-3 h-10',
            ].join(' ')}
          >
            <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: '20px' }}>
              {state.theme === 'dark' ? 'light_mode' : 'dark_mode'}
            </span>
            {!collapsed && <span>{state.theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>}
          </button>

          {/* Expand button (collapsed state only) */}
          {collapsed && (
            <button
              onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
              title="Expand sidebar"
              className="flex items-center justify-center w-full h-9 rounded-2xl text-on-surface-variant/40 hover:text-on-surface-variant hover:bg-white/[0.04] transition-colors duration-150"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}
