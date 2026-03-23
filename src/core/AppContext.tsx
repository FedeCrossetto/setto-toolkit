import { createContext, useContext, useReducer, useEffect, type ReactNode } from 'react'
import type { AppState, AppAction, Tab, Theme } from './types'

const THEME_KEY   = 'app-theme'
const SIDEBAR_KEY = 'app-sidebar-collapsed'

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getInitialSidebarCollapsed(): boolean {
  const stored = localStorage.getItem(SIDEBAR_KEY)
  // Default to collapsed (true) if nothing stored yet
  return stored === null ? true : stored === 'true'
}

const initialState: AppState = {
  openTabs: [{ tabId: 'dashboard', pluginId: 'dashboard' }],
  activeTabId: 'dashboard',
  commandPaletteOpen: false,
  theme: getInitialTheme(),
  sidebarCollapsed: getInitialSidebarCollapsed(),
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
    case 'SET_PLUGIN_DIRTY': {
      if (state.dirtyPlugins[action.pluginId] === action.dirty) return state
      return {
        ...state,
        dirtyPlugins: { ...state.dirtyPlugins, [action.pluginId]: action.dirty },
      }
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

  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}
