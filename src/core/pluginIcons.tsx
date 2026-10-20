import type { IconComponent } from './types'
import {
  ClipboardText,
  Code2,
  FileCode2,
  FolderSearch,
  GitCompare,
  House,
  Info,
  KeyRound,
  NotebookPen,
  Plug,
  Puzzle,
  Send,
  Settings,
  SquareTerminal,
  Ticket,
  Toolbox,
  Wallet,
  FilePen,
  Server,
} from 'lucide-react'

/** Maps each plugin manifest icon string to its Lucide component. */
const PLUGIN_ICON_MAP: Record<string, IconComponent> = {
  home:          House,
  notes:         NotebookPen,
  snippets:      Code2,
  wallet:        Wallet,
  key:           KeyRound,
  editor:        FilePen,   // hoja con lápiz: no se confunde con Snippets (</>)
  terminal:      SquareTerminal,
  api:           Send,
  'repo-search': FolderSearch,
  diff:          GitCompare,
  ticket:        Ticket,
  plug:          Plug,
  settings:      Settings,
  info:          Info,
  extension:     Puzzle,
  utilities:     Toolbox,
  database:      Server,
  captures:      ClipboardText,
  // Legacy keys (manifests antiguos)
  space_dashboard:          House,
  a_large_small:            FileCode2,
  text_compare:             GitCompare,
  folder_search:            FolderSearch,
  rocket_launch:            Send,
  format_ink_highlighter:   Code2,
  confirmation_number:      Ticket,
  square_terminal:          SquareTerminal,
  tune:                     Settings,
  lock:                     Plug,
  chart_no_axes_column_increasing: Wallet,
}

/**
 * Color de íconos de módulo. Estilo unificado: todos usan el acento de la app
 * (como la barra lateral de Finder). Para volver a colores por módulo, asignar
 * canales RGB acá (p. ej. notes: '255 179 0').
 */
export const PLUGIN_TINT: Record<string, string> = {}

/**
 * Nombre corto para la barra plegada (cabe debajo del ícono, ~52 px a 10 px).
 * Regla: la etiqueta es el nombre del módulo; sólo se acorta si de verdad no
 * entra, y entonces se usa la MISMA forma corta en todos lados donde haga
 * falta una (barra plegada, pestaña del dock).
 */
export const SHORT_NAME: Record<string, string> = {
  captures: 'Copiado',
  'repo-search': 'Repos',
}
export function shortName(pluginId: string, name: string): string {
  return SHORT_NAME[pluginId] ?? name
}

/** CSS color for a plugin icon (defaults to the app accent). */
export function pluginTint(pluginId: string, alpha = 1): string {
  const t = PLUGIN_TINT[pluginId] ?? 'var(--c-primary)'
  return `rgb(${t} / ${alpha})`
}

/** Background for icon tiles (widgets, filas de Ajustes): el degradé de marca. */
export function pluginTile(_pluginId?: string): string {
  return 'var(--gradient-brand)'
}

/** Tile neutro para filas utilitarias (datos, logs, acerca de). */
export const NEUTRAL_TILE = 'rgb(var(--c-on-surface-variant) / 0.55)'

interface PluginIconProps {
  icon: string
  size?: number
  className?: string
  style?: React.CSSProperties
  /** Peso del ícono (Phosphor): 'fill' para el ítem activo, 'duotone', etc. */
  weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone'
}

export function PluginIcon({ icon, size = 16, className, style, weight }: PluginIconProps): JSX.Element {
  const Icon = (PLUGIN_ICON_MAP[icon] ?? Info) as unknown as (p: Omit<PluginIconProps, "icon">) => JSX.Element
  return <Icon size={size} className={className} style={style} weight={weight} />
}
