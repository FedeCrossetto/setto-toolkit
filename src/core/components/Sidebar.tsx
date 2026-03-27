import { useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useApp } from '../AppContext'
import { allPlugins } from '../plugin-registry'
import { PluginIcon } from '../pluginIcons'
import type { PluginManifest } from '../types'

const PANEL_BG  = 'rgb(var(--c-sidebar))'
const ACTIVE_BG = 'rgb(var(--c-background))'
const CORNER_R  = 16

// ── Logo ───────────────────────────────────────────────────────────────────────
function AppLogo({ size = 34 }: { size?: number }): JSX.Element {
  return (
    <img
      src="./setto_icon.png"
      width={size}
      height={size}
      style={{ flexShrink: 0, objectFit: 'contain', filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.15))' }}
    />
  )
}

// ── Concave notch corner ───────────────────────────────────────────────────────
function Notch({ side, visible }: { side: 'above' | 'below'; visible: boolean }): JSX.Element {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        right: 0,
        ...(side === 'above' ? { bottom: '100%' } : { top: '100%' }),
        width: CORNER_R,
        height: CORNER_R,
        background: visible ? ACTIVE_BG : 'transparent',
        zIndex: 2,
        pointerEvents: 'none',
        opacity: visible ? 1 : 0,
        transition: 'opacity 200ms ease-out',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: PANEL_BG,
          borderRadius: side === 'above'
            ? `0 0 ${CORNER_R}px 0`
            : `0 ${CORNER_R}px 0 0`,
        }}
      />
    </div>
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
    <div style={{
      position: 'relative',
      marginBottom: 2,
      zIndex: active ? 10 : undefined,
    }}>

      <Notch side="above" visible={active} />

      <button
        onClick={onClick}
        title={plugin.name}
        style={{
          height: h,
          display: 'flex',
          alignItems: 'center',
          width: active ? 'calc(100% - 8px)' : 'calc(100% - 16px)',
          marginLeft: 8,
          marginRight: 0,
          paddingLeft: collapsed ? 0 : 8,
          paddingRight: collapsed ? 0 : 8,
          justifyContent: collapsed ? 'center' : undefined,
          borderTopLeftRadius: 12,
          borderBottomLeftRadius: 12,
          borderTopRightRadius: active ? 0 : 12,
          borderBottomRightRadius: active ? 0 : 12,
          background: active ? ACTIVE_BG : undefined,
          position: 'relative',
          zIndex: 1,
          transition: 'none',
          color: active ? undefined : 'rgba(255,255,255,0.45)',
        }}
        className={[
          'transition-colors duration-200',
          !active && 'hover:!bg-white/[0.07]',
          active ? 'text-on-surface' : '',
        ].filter(Boolean).join(' ')}
      >
        {/* Icon */}
        <PluginIcon
          icon={plugin.icon}
          size={active ? 20 : 18}
          className="flex-shrink-0"
          style={{
            color: active ? 'rgb(var(--c-primary-light))' : 'inherit',
            transition: 'width 200ms, height 200ms, color 200ms',
          }}
        />

        {/* Label */}
        {!collapsed && (
          <span
            className="truncate text-[12px] select-none ml-3"
            style={{
              fontWeight: active ? 600 : 500,
              color: active ? 'rgb(var(--c-primary-light))' : 'inherit',
            }}
          >
            {plugin.name}
          </span>
        )}
      </button>

      <Notch side="below" visible={active} />
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
          top: 26,
          bottom: 30,
          left: 8,
          right: 0,
          borderRadius: '16px',
          background: PANEL_BG,
        }}
      >

        {/* ── Logo ──────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-center mt-2 mb-3 flex-shrink-0">
          {collapsed ? (
            <AppLogo size={48} />
          ) : (
            <div className="flex flex-col items-center gap-1">
              <AppLogo size={64} />
              <div className="leading-none text-center">
                <div className="font-bold text-[14px] tracking-tight" style={{ color: '#ffffff' }}>SETTO</div>
                <div className="text-[9px] tracking-widest uppercase font-medium mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>Toolkit</div>
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
