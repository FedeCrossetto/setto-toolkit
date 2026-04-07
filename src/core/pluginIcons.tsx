import type { ComponentType } from 'react'
import {
  ALargeSmall,
  ChartNoAxesColumnIncreasing,
  FolderSearch,
  GitCompare,
  Highlighter,
  Info,
  LayoutDashboard,
  Lock,
  Puzzle,
  Rocket,
  SlidersHorizontal,
  SquareTerminal,
  Table2,
  Ticket,
} from 'lucide-react'

/** Maps each plugin manifest icon string to its Lucide component. */
const PLUGIN_ICON_MAP: Record<string, ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>> = {
  space_dashboard:          LayoutDashboard,
  a_large_small:            ALargeSmall,
  text_compare:             GitCompare,
  folder_search:            FolderSearch,
  rocket_launch:            Rocket,
  format_ink_highlighter:   Highlighter,
  confirmation_number:      Ticket,
  square_terminal:          SquareTerminal,
  tune:                     SlidersHorizontal,
  info:                     Info,
  lock:                     Lock,
  extension:                Puzzle,
  table_chart_view:         Table2,
  chart_no_axes_column_increasing: ChartNoAxesColumnIncreasing,
}

interface PluginIconProps {
  icon: string
  size?: number
  className?: string
  style?: React.CSSProperties
}

export function PluginIcon({ icon, size = 16, className, style }: PluginIconProps): JSX.Element {
  const Icon = PLUGIN_ICON_MAP[icon] ?? Info
  return <Icon size={size} className={className} style={style} />
}
