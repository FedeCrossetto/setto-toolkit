import type { ComponentType } from 'react'
import {
  ALargeSmall,
  FolderSearch,
  GitCompare,
  Highlighter,
  Info,
  LayoutDashboard,
  Puzzle,
  Rocket,
  SlidersHorizontal,
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
  tune:                     SlidersHorizontal,
  info:                     Info,
  extension:                Puzzle,
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
