import { useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useApp } from '../AppContext'
import { allPlugins } from '../plugin-registry'
import { PluginIcon } from '../pluginIcons'
import type { PluginManifest } from '../types'

const PANEL_BG  = 'linear-gradient(180deg, rgb(var(--c-sidebar)) 0%, rgb(var(--c-sidebar) / 0.92) 60%, rgb(var(--c-sidebar) / 0.85) 100%)'

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
  const h = collapsed ? 38 : 34

  return (
    <div style={{ marginBottom: 2, paddingLeft: 8, paddingRight: 8 }}>
      <button
        onClick={onClick}
        title={plugin.name}
        style={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          height: h,
          paddingLeft: collapsed ? 0 : 10,
          paddingRight: collapsed ? 0 : 10,
          justifyContent: collapsed ? 'center' : 'flex-start',
          borderRadius: 12,
          border: 'none',
          cursor: 'pointer',
          background: active ? 'linear-gradient(90deg, #5347CE, #4896FE)' : 'transparent',
          boxShadow: active ? '0 4px 14px rgb(var(--c-primary) / 0.40)' : 'none',
          color: active ? '#fff' : 'rgba(255,255,255,0.45)',
          transition: 'background 150ms ease-out, color 150ms ease-out, box-shadow 150ms ease-out',
        }}
        onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)' }}
        onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
      >
        {/* Icon */}
        <PluginIcon
          icon={plugin.icon}
          size={active ? 19 : 18}
          className="flex-shrink-0"
          style={{ color: 'inherit', transition: 'width 200ms, height 200ms, color 200ms' }}
        />

        {/* Label — fades + collapses horizontally so the button shrinks smoothly */}
        <span
          className="truncate text-[12px] select-none"
          style={{
            fontWeight: active ? 600 : 500,
            color: 'inherit',
            // marginLeft dinámico: con ml fijo el span descentraba el ícono en modo colapsado
            marginLeft: collapsed ? 0 : 12,
            maxWidth: collapsed ? 0 : 120,
            opacity: collapsed ? 0 : 1,
            overflow: 'hidden',
            transition: 'max-width 200ms ease, opacity 150ms ease, margin-left 200ms ease',
            whiteSpace: 'nowrap',
          }}
        >
          {plugin.name}
        </span>
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

  const outerW = collapsed ? 62 : 164

  return (
    <aside
      className="fixed left-0 top-0 h-full z-50 transition-all duration-200"
      style={{ width: outerW, background: 'transparent' }}
    >
      <div
        className="absolute flex flex-col overflow-hidden"
        style={{
          top: 44,
          bottom: 30,
          left: 8,
          right: 0,
          borderRadius: '16px',
          background: PANEL_BG,
        }}
      >

        {/* Noise texture overlay — SVG turbulence, adds tactile depth to the flat panel */}
        <svg aria-hidden className="pointer-events-none absolute inset-0 w-full h-full opacity-[0.035]" style={{ zIndex: 0 }}>
          <filter id="sidebar-noise">
            <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#sidebar-noise)" />
        </svg>

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
            paddingTop: 6,
            paddingBottom: 6,
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
