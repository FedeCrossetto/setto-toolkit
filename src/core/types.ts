import type { ComponentType, CSSProperties, LazyExoticComponent, ReactNode } from 'react'

/** Shape shared by lucide-react icons and our hand-rolled SVG icon components.
 *  A plain function signature (not ComponentType<...>) sidesteps a structural
 *  mismatch on lucide-react's `propTypes` static field under strict checks. */
export type IconComponent = (props: { size?: number; className?: string; style?: CSSProperties; color?: string }) => ReactNode

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
  /** Sidebar/Dashboard grouping: 'personal' (uso diario) | 'dev' (desarrollo). Default 'dev'. */
  section?: 'personal' | 'dev'
  /** Hidden by default on a fresh install (still activable in Ajustes → Módulos). */
  defaultDisabled?: boolean
  /**
   * Never unmount once opened (the shell keeps only the most recent modules
   * mounted). For modules whose unmount loses live work, e.g. Terminal sessions.
   */
  keepAlive?: boolean
}

/** Cross-plugin "open X with this payload" — e.g. Ctrl+K opening a specific note. */
export interface PluginIntent {
  pluginId: string
  action: string
  payload?: unknown
  /** Monotonic stamp so the same intent can be re-sent */
  stamp: number
}

export interface Tab {
  tabId: string
  pluginId: string
}

export type Theme = 'dark' | 'light'

export interface AppState {
  /**
   * Modules currently mounted, least → most recently used (LRU, see
   * `src/core/navigation.ts`). The shell shows one module at a time; there are
   * no visible tabs anymore, the name is kept for compatibility.
   */
  openTabs: Tab[]
  /** The module on screen (tabId === pluginId). */
  activeTabId: string | null
  /** Optional subtitle/breadcrumb each module shows in the top bar (useModuleSubtitle). */
  moduleSubtitles: Record<string, string | undefined>
  /** Welcome flow (first run, or reopened from Ajustes → Acerca de). */
  onboardingOpen: boolean
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
  /** Set by OPEN_TERMINAL_HERE — consumed and cleared by Terminal */
  terminalTarget?: { cwd: string }
  /** Set by RUN_IN_TERMINAL — consumed and cleared by Terminal */
  terminalCommand?: { content: string; stamp: number }
  /** Incremented by INTERRUPT_TERMINAL — Terminal sends Ctrl+C to active session */
  terminalInterrupt?: number
  /** Plugins that have unsaved changes, keyed by pluginId */
  dirtyPlugins: Record<string, boolean>
  /** Last intent sent to a plugin (see usePluginIntent) */
  pluginIntent?: PluginIntent
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
  /** Convenience aliases for SET_PLUGIN_DIRTY */
  | { type: 'MARK_PLUGIN_DIRTY'; pluginId: string }
  | { type: 'MARK_PLUGIN_CLEAN'; pluginId: string }
  /** Enable or disable a plugin (hides from sidebar, closes open tab) */
  | { type: 'TOGGLE_PLUGIN'; pluginId: string }
  /** Cross-plugin: open terminal tab in a specific working directory */
  | { type: 'OPEN_TERMINAL_HERE'; cwd: string }
  /** Cross-plugin: send a command string to the active terminal session */
  | { type: 'RUN_IN_TERMINAL'; content: string }
  /** Clear terminal targets after Terminal has consumed them */
  | { type: 'CLEAR_TERMINAL_TARGET' }
  /** Cross-plugin: send a raw control sequence to the active terminal (no \r appended) */
  | { type: 'INTERRUPT_TERMINAL' }
  /** Clear editor target after FileEditor has consumed it */
  | { type: 'CLEAR_EDITOR_TARGET' }
  /** Open (or focus) a plugin tab and hand it an intent, e.g. { action: 'open-note', payload: id } */
  | { type: 'OPEN_WITH_INTENT'; pluginId: string; action: string; payload?: unknown }
  | { type: 'CLEAR_PLUGIN_INTENT' }
  /** Module-provided subtitle for the top bar (undefined clears it) */
  | { type: 'SET_MODULE_SUBTITLE'; pluginId: string; subtitle?: string }
  | { type: 'OPEN_ONBOARDING' }
  | { type: 'CLOSE_ONBOARDING' }
