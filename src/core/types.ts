import type { ComponentType } from 'react'

export interface PluginManifest {
  id: string
  name: string
  description: string
  /** Material Symbols Outlined icon name */
  icon: string
  component: ComponentType
  keywords?: string[]
  /** If true, the plugin icon appears pinned at the bottom of the sidebar */
  pinned?: boolean
}

export interface Tab {
  tabId: string
  pluginId: string
}

export type Theme = 'dark' | 'light'

export interface AppState {
  openTabs: Tab[]
  activeTabId: string | null
  commandPaletteOpen: boolean
  theme: Theme
  sidebarCollapsed: boolean
  /** Set by OPEN_IN_EDITOR — consumed and cleared by FileEditor on mount */
  editorTarget?: { path: string; line?: number }
  /** Plugins that have unsaved changes, keyed by pluginId */
  dirtyPlugins: Record<string, boolean>
}

export type AppAction =
  | { type: 'OPEN_TAB'; pluginId: string }
  | { type: 'CLOSE_TAB'; tabId: string }
  | { type: 'SET_ACTIVE_TAB'; tabId: string }
  | { type: 'TOGGLE_COMMAND_PALETTE' }
  | { type: 'CLOSE_COMMAND_PALETTE' }
  | { type: 'SET_THEME'; theme: Theme }
  | { type: 'TOGGLE_SIDEBAR' }
  /** Cross-plugin: open a file in the File Editor at an optional line */
  | { type: 'OPEN_IN_EDITOR'; path: string; line?: number }
  /** Plugins report their unsaved-changes status */
  | { type: 'SET_PLUGIN_DIRTY'; pluginId: string; dirty: boolean }
