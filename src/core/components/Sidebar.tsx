import { useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useApp } from '../AppContext'
import { allPlugins } from '../plugin-registry'
import { PluginIcon } from '../pluginIcons'
import type { PluginManifest } from '../types'

const PANEL_BG  = 'rgb(var(--c-sidebar))'
const CORNER_R  = 16

// ── Logo ───────────────────────────────────────────────────────────────────────
function AppLogo({ height = 56 }: { height?: number }): JSX.Element {
  return (
    <img
      src="./setto-logo.png"
      alt=""
      style={{
        flexShrink: 0,
        display: 'block',
        height,
        width: 'auto',
        maxWidth: 'none',
      }}
    />
  )
}

// ── Nav item ───────────────────────────────────────────────────────────────────
interface SidebarItemProps {
  plugin: PluginManifest
  active: boolean
  collapsed: boolean
  onClick: () => void
}

function SidebarItem({ plugin, active, collapsed, onClick }: SidebarItemProps): JSX.Element {
  const h = collapsed ? 40 : 38

  return (
    <div style={{ position: 'relative', marginBottom: 4 }}>
      <button
        onClick={onClick}
        title={plugin.name}
        style={{
          height: h,
          display: 'flex',
          alignItems: 'center',
          width: 'calc(100% - 16px)',
          marginLeft: 8,
          marginRight: 8,
          paddingLeft: collapsed ? 0 : 10,
          paddingRight: collapsed ? 0 : 10,
          justifyContent: collapsed ? 'center' : undefined,
          borderRadius: 12,
          // Active = filled brand-gradient pill with a soft glow (CloudDock style)
          background: active ? 'var(--gradient-brand)' : undefined,
          boxShadow: active ? '0 4px 14px rgb(var(--c-primary) / 0.35)' : undefined,
          position: 'relative',
          zIndex: 1,
          transition: 'background-color 180ms ease-out, color 180ms ease-out',
          color: active ? 'rgb(var(--c-on-primary))' : 'rgba(255,255,255,0.45)',
        }}
        className={[
          'transition-colors duration-200',
          !active && 'hover:!bg-white/[0.07] hover:!text-white/80',
        ].filter(Boolean).join(' ')}
      >
        {/* Icon */}
        <PluginIcon
          icon={plugin.icon}
          size={active ? 19 : 18}
          className="flex-shrink-0"
          style={{ color: 'inherit', transition: 'width 200ms, height 200ms, color 200ms' }}
        />

        {/* Label */}
        {!collapsed && (
          <span
            className="truncate text-[12px] select-none ml-3"
            style={{ fontWeight: active ? 600 : 500, color: 'inherit' }}
          >
            {plugin.name}
          </span>
        )}
      </button>
    </div>
  )
}

// ── Sidebar ────────────────────────────────────────────────────────────────────
export function Sidebar(): JSX.Element {
  const { state, dispatch } = useApp()
  const collapsed = state.sidebarCollapsed

  const mainPlugins   = useMemo(() => allPlugins.filter(p => !p.pinned && !state.disabledPlugins.includes(p.id)), [state.disabledPlugins])
  const pinnedPlugins = useMemo(() => allPlugins.filter(p =>  p.pinned && !state.disabledPlugins.includes(p.id)), [state.disabledPlugins])

  const openTab = (pluginId: string): void => {
    dispatch({ type: 'OPEN_TAB', pluginId })
    dispatch({ type: 'CLOSE_COMMAND_PALETTE' })
  }

  const isActive = (pluginId: string): boolean =>
    state.activeTabId === pluginId ||
    state.openTabs.some(t => t.pluginId === pluginId && t.tabId === state.activeTabId)

  const toggleTheme = (): void =>
    dispatch({ type: 'SET_THEME', theme: state.theme === 'dark' ? 'light' : 'dark' })

  const outerW = collapsed ? 62 : 164

  return (
    <aside
      className="fixed left-0 top-0 h-full z-50 transition-all duration-200"
      style={{ width: outerW, background: 'transparent' }}
    >
      <div
        className="absolute flex flex-col"
        style={{
          top: 44,
          bottom: 30,
          left: 8,
          right: 0,
          borderRadius: '16px',
          background: PANEL_BG,
        }}
      >

        {/* ── Logo ──────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-center mt-2 mb-1 flex-shrink-0 px-0">
          {collapsed ? (
            <AppLogo height={34} />
          ) : (
            <div className="flex flex-col items-center gap-0">
              <AppLogo height={56} />
              <div className="leading-none text-center mt-0.5">
                <div className="font-bold text-[14px] tracking-tight" style={{ color: '#ffffff' }}>SETTO</div>
                <div className="text-[9px] tracking-widest uppercase font-medium mt-px" style={{ color: 'rgba(255,255,255,0.3)' }}>Toolkit</div>
              </div>
            </div>
          )}
        </div>

        {/* ── Main nav ──────────────────────────────────────────────────────── */}
        <nav
          className="relative flex flex-col flex-1 overflow-x-visible"
          style={{
            overflowY: 'auto',
            paddingTop: CORNER_R,
            paddingBottom: CORNER_R,
          }}
        >
          {mainPlugins.map(plugin => (
            <SidebarItem
              key={plugin.id}
              plugin={plugin}
              active={isActive(plugin.id)}
              collapsed={collapsed}
              onClick={() => openTab(plugin.id)}
            />
          ))}
        </nav>

        {/* ── Bottom ────────────────────────────────────────────────────────── */}
        <div className="flex flex-col flex-shrink-0 mb-3">
          <div
            className="mb-2 mt-1"
            style={{ height: 1, background: 'rgba(255,255,255,0.08)', marginLeft: 12, marginRight: 12 }}
          />

          {pinnedPlugins.map(plugin => (
            <SidebarItem
              key={plugin.id}
              plugin={plugin}
              active={isActive(plugin.id)}
              collapsed={collapsed}
              onClick={() => openTab(plugin.id)}
            />
          ))}


          {/* Toggle sidebar button (always at bottom) */}
          <button
            onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: collapsed ? 'center' : undefined,
              paddingLeft: collapsed ? 0 : 10,
              borderRadius: 12,
              margin: '0 8px',
              color: 'rgba(255,255,255,0.2)',
            }}
            className="hover:bg-white/[0.07] hover:!text-white/50 transition-colors duration-150"
          >
            {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
        </div>
      </div>
    </aside>
  )
}
