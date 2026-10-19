import { Plus } from 'lucide-react'
import { useApp } from '../AppContext'
import { getPlugin } from '../plugin-registry'
import { PluginIcon } from '../pluginIcons'
import { WindowControls } from './TitleBar'

/**
 * Encabezado del panel de contenido: módulo actual (con subtítulo opcional, ver
 * `useModuleSubtitle`) + "Nuevo" + controles de ventana. Claro, con línea fina abajo.
 * La marca y el buscador viven en la barra lateral. Es zona de arrastre de la ventana.
 */
export function TopBar(): JSX.Element {
  const { state } = useApp()
  const plugin = state.activeTabId ? getPlugin(state.activeTabId) : undefined
  const subtitle = plugin ? state.moduleSubtitles[plugin.id] : undefined
  const dirty = plugin ? !!state.dirtyPlugins[plugin.id] : false

  return (
    <header className="drag-region h-(--topbar-h) flex items-center gap-2 pl-5 pr-3 shrink-0 hairline-b bg-surface">
      <div className="flex items-center gap-2 flex-1 min-w-0" data-testid="topbar-title">
        {plugin && (
          <>
            <PluginIcon icon={plugin.icon} size={16} weight="light" className="shrink-0 text-on-surface-variant" />
            <h1
              key={plugin.id}
              className="text-[14px] font-semibold tracking-[-0.01em] text-on-surface truncate shrink-0 max-w-[40%]"
              style={{ animation: 'tabIn 0.18s var(--ease-mac) backwards' }}
            >
              {plugin.name}
            </h1>
            {dirty && <span title="Cambios sin guardar" aria-label="Cambios sin guardar" className="w-1.5 h-1.5 rounded-full bg-warning shrink-0" />}
            {subtitle && (
              <>
                <span aria-hidden className="text-on-surface-variant/40 text-[13px] shrink-0">/</span>
                <span className="text-[13px] text-on-surface-variant truncate min-w-0" title={subtitle}>{subtitle}</span>
              </>
            )}
          </>
        )}
      </div>

      <button
        onClick={() => window.dispatchEvent(new CustomEvent('setto:quick-capture'))}
        title="Captura rápida (Ctrl+Shift+Espacio)"
        className="no-drag ui-btn ui-btn-outline ui-btn-sm h-(--control-h) px-3 shrink-0 rounded-full!"
      >
        <Plus size={13} />
        Nuevo
      </button>

      <WindowControls />
    </header>
  )
}
