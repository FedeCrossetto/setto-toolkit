import { Plus } from 'lucide-react'
import { useApp } from '../AppContext'
import { getPlugin } from '../plugin-registry'
import { PluginIcon } from '../pluginIcons'
import { WindowControls } from './TitleBar'
import { usePrimaryAction } from '../module-actions'

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
  // "Nuevo" contextual: la acción principal del módulo (Nueva clave, Nuevo snippet…) o la captura rápida.
  const primary = usePrimaryAction(plugin?.id)

  return (
    // Misma altura que la fila del logo de la barra lateral y su mismo fondo: una sola franja.
    <header className="drag-region h-[52px] flex items-center gap-2 pl-[14px] pr-2 shrink-0">
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
                <span className="text-[13px] text-on-surface/70 truncate min-w-0" title={subtitle}>{subtitle}</span>
              </>
            )}
          </>
        )}
      </div>

      <button
        key={primary?.label ?? 'nuevo'}
        onClick={() => (primary ? primary.run() : window.dispatchEvent(new CustomEvent('setto:quick-capture')))}
        title={primary ? primary.title ?? primary.label : 'Captura rápida (Ctrl+Shift+Espacio)'}
        aria-label={primary?.label ?? 'Captura rápida'}
        // Sin acción propia del módulo, la captura rápida queda como un "+" discreto.
        className={`no-drag ui-btn ui-btn-sm h-(--control-h) shrink-0 ${primary ? 'ui-btn-outline px-3' : 'ui-btn-ghost ui-btn-icon w-(--control-h)!'}`}
        style={{ animation: 'fadeIn 0.18s ease both' }}
      >
        <Plus size={primary ? 13 : 15} />
        {primary?.label}
      </button>

      <WindowControls />
    </header>
  )
}
