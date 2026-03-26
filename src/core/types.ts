import type { ComponentType, LazyExoticComponent } from 'react'

export interface PluginManifest {
  id: string
  name: string
  description: string
  /** Material Symbols Outlined icon name */
  icon: string
  component: ComponentType | LazyExoticComponent<ComponentType>
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
  /** In-app keyboard shortcuts reference (F1 or Help in command palette) */
  keyboardShortcutsOpen: boolean
  theme: Theme
  sidebarCollapsed: boolean
  disabledPlugins: string[]
  /** Set by OPEN_IN_EDITOR — consumed and cleared by FileEditor on mount */
  editorTarget?: { path: string; line?: number }
  /** Set by SEND_TO_DIFF / SEND_PAIR_TO_DIFF — consumed and cleared by SmartDiff */
  diffTarget?:  { name: string; path: string | null; content: string }
  diffTarget2?: { name: string; path: string | null; content: string }
  /** Plugins that have unsaved changes, keyed by pluginId */
  dirtyPlugins: Record<string, boolean>
}

export type AppAction =
  | { type: 'OPEN_TAB'; pluginId: string }
  | { type: 'CLOSE_TAB'; tabId: string }
  | { type: 'SET_ACTIVE_TAB'; tabId: string }
  | { type: 'TOGGLE_COMMAND_PALETTE' }
  | { type: 'CLOSE_COMMAND_PALETTE' }
  | { type: 'OPEN_KEYBOARD_SHORTCUTS' }
  | { type: 'CLOSE_KEYBOARD_SHORTCUTS' }
  | { type: 'SET_THEME'; theme: Theme }
  | { type: 'TOGGLE_SIDEBAR' }
  /** Cross-plugin: open a file in the File Editor at an optional line */
  | { type: 'OPEN_IN_EDITOR'; path: string; line?: number }
  /** Cross-plugin: send one file to Smart Diff (loads into first empty pane) */
  | { type: 'SEND_TO_DIFF'; name: string; path: string | null; content: string }
  /** Cross-plugin: send two files to Smart Diff (file1 → Original, file2 → Modified) */
  | { type: 'SEND_PAIR_TO_DIFF';
      file1: { name: string; path: string | null; content: string };
      file2: { name: string; path: string | null; content: string } }
  /** Clear diff targets after Smart Diff has consumed them */
  | { type: 'CLEAR_DIFF_TARGET' }
  /** Plugins report their unsaved-changes status */
  | { type: 'SET_PLUGIN_DIRTY'; pluginId: string; dirty: boolean }
  /** Enable or disable a plugin (hides from sidebar, closes open tab) */
  | { type: 'TOGGLE_PLUGIN'; pluginId: string }
