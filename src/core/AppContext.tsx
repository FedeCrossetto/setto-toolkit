import { createContext, useContext, useReducer, useEffect, type ReactNode } from 'react'
import type { AppState, AppAction, Tab, Theme } from './types'

const THEME_KEY    = 'app-theme'
const SIDEBAR_KEY  = 'app-sidebar-collapsed'
const DISABLED_KEY = 'plugins-disabled'

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getInitialSidebarCollapsed(): boolean {
  const stored = localStorage.getItem(SIDEBAR_KEY)
  return stored === null ? true : stored === 'true'
}

function getInitialDisabledPlugins(): string[] {
  try {
    const stored = localStorage.getItem(DISABLED_KEY)
    return stored ? (JSON.parse(stored) as string[]) : []
  } catch {
    return []
  }
}

const initialState: AppState = {
  openTabs: [{ tabId: 'dashboard', pluginId: 'dashboard' }],
  activeTabId: 'dashboard',
  commandPaletteOpen: false,
  keyboardShortcutsOpen: false,
  theme: getInitialTheme(),
  sidebarCollapsed: getInitialSidebarCollapsed(),
  disabledPlugins: getInitialDisabledPlugins(),
  dirtyPlugins: {},
}

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'OPEN_TAB': {
      const existing = state.openTabs.find((t) => t.pluginId === action.pluginId)
      if (existing) return { ...state, activeTabId: existing.tabId }
      const newTab: Tab = { tabId: action.pluginId, pluginId: action.pluginId }
      return {
        ...state,
        openTabs: [...state.openTabs, newTab],
        activeTabId: newTab.tabId,
      }
    }
    case 'CLOSE_TAB': {
      const tabs = state.openTabs.filter((t) => t.tabId !== action.tabId)
      const activeTabId =
        state.activeTabId === action.tabId
          ? (tabs[tabs.length - 1]?.tabId ?? null)
          : state.activeTabId
      return { ...state, openTabs: tabs, activeTabId }
    }
    case 'SET_ACTIVE_TAB':
      return { ...state, activeTabId: action.tabId }
    case 'TOGGLE_COMMAND_PALETTE':
      return { ...state, commandPaletteOpen: !state.commandPaletteOpen }
    case 'CLOSE_COMMAND_PALETTE':
      return { ...state, commandPaletteOpen: false }
    case 'OPEN_KEYBOARD_SHORTCUTS':
      return { ...state, keyboardShortcutsOpen: true, commandPaletteOpen: false }
    case 'CLOSE_KEYBOARD_SHORTCUTS':
      return { ...state, keyboardShortcutsOpen: false }
    case 'SET_THEME':
      return { ...state, theme: action.theme }
    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarCollapsed: !state.sidebarCollapsed }
    case 'OPEN_IN_EDITOR': {
      // Open the file-editor tab and store the target path/line for the plugin to consume
      const existing = state.openTabs.find((t) => t.pluginId === 'file-editor')
      const tabId = existing?.tabId ?? 'file-editor'
      const openTabs = existing
        ? state.openTabs
        : [...state.openTabs, { tabId: 'file-editor', pluginId: 'file-editor' }]
      return {
        ...state,
        openTabs,
        activeTabId: tabId,
        editorTarget: { path: action.path, line: action.line },
      }
    }
    case 'SEND_TO_DIFF': {
      const existing = state.openTabs.find((t) => t.pluginId === 'smart-diff')
      const tabId    = existing?.tabId ?? 'smart-diff'
      const openTabs = existing
        ? state.openTabs
        : [...state.openTabs, { tabId: 'smart-diff', pluginId: 'smart-diff' }]
      return {
        ...state,
        openTabs,
        activeTabId: tabId,
        diffTarget: { name: action.name, path: action.path, content: action.content },
      }
    }
    case 'SEND_PAIR_TO_DIFF': {
      const existing = state.openTabs.find((t) => t.pluginId === 'smart-diff')
      const tabId    = existing?.tabId ?? 'smart-diff'
      const openTabs = existing
        ? state.openTabs
        : [...state.openTabs, { tabId: 'smart-diff', pluginId: 'smart-diff' }]
      return {
        ...state,
        openTabs,
        activeTabId: tabId,
        diffTarget:  action.file1,
        diffTarget2: action.file2,
      }
    }
    case 'CLEAR_DIFF_TARGET':
      return { ...state, diffTarget: undefined, diffTarget2: undefined }
    case 'OPEN_TERMINAL_HERE': {
      const existing = state.openTabs.find((t) => t.pluginId === 'terminal')
      const tabId    = existing?.tabId ?? 'terminal'
      const openTabs = existing
        ? state.openTabs
        : [...state.openTabs, { tabId: 'terminal', pluginId: 'terminal' }]
      return { ...state, openTabs, activeTabId: tabId, terminalTarget: { cwd: action.cwd } }
    }
    case 'RUN_IN_TERMINAL': {
      const existing = state.openTabs.find((t) => t.pluginId === 'terminal')
      const tabId    = existing?.tabId ?? 'terminal'
      const openTabs = existing
        ? state.openTabs
        : [...state.openTabs, { tabId: 'terminal', pluginId: 'terminal' }]
      return { ...state, openTabs, activeTabId: tabId, terminalCommand: { content: action.content, stamp: Date.now() } }
    }
    case 'CLEAR_TERMINAL_TARGET':
      return { ...state, terminalTarget: undefined, terminalCommand: undefined }
    case 'INTERRUPT_TERMINAL': {
      // Just activate the terminal tab — the Terminal component handles the actual signal
      const existing = state.openTabs.find((t) => t.pluginId === 'terminal')
      if (!existing) return state
      return { ...state, activeTabId: existing.tabId, terminalInterrupt: (state.terminalInterrupt ?? 0) + 1 }
    }
    case 'SET_PLUGIN_DIRTY': {
      if (state.dirtyPlugins[action.pluginId] === action.dirty) return state
      return {
        ...state,
        dirtyPlugins: { ...state.dirtyPlugins, [action.pluginId]: action.dirty },
      }
    }
    case 'TOGGLE_PLUGIN': {
      const isDisabled = state.disabledPlugins.includes(action.pluginId)
      const disabledPlugins = isDisabled
        ? state.disabledPlugins.filter(id => id !== action.pluginId)
        : [...state.disabledPlugins, action.pluginId]
      // Close the tab if disabling and it's open
      const openTabs = isDisabled
        ? state.openTabs
        : state.openTabs.filter(t => t.pluginId !== action.pluginId)
      const activeTabId =
        !isDisabled && state.activeTabId === action.pluginId
          ? (openTabs[openTabs.length - 1]?.tabId ?? null)
          : state.activeTabId
      return { ...state, disabledPlugins, openTabs, activeTabId }
    }
    default:
      return state
  }
}

interface AppContextValue {
  state: AppState
  dispatch: React.Dispatch<AppAction>
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }): JSX.Element {
  const [state, dispatch] = useReducer(appReducer, initialState)

  useEffect(() => {
    const html = document.documentElement
    if (state.theme === 'dark') {
      html.classList.add('dark')
    } else {
      html.classList.remove('dark')
    }
    localStorage.setItem(THEME_KEY, state.theme)
  }, [state.theme])

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, String(state.sidebarCollapsed))
  }, [state.sidebarCollapsed])

  useEffect(() => {
    localStorage.setItem(DISABLED_KEY, JSON.stringify(state.disabledPlugins))
  }, [state.disabledPlugins])

  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}
