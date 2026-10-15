import { createContext, useContext, useReducer, useEffect, useRef, type ReactNode } from 'react'
import type { AppState, AppAction, Tab, Theme, PluginIntent } from './types'
import { allPlugins } from './plugin-registry'

const THEME_KEY    = 'app-theme'
const SIDEBAR_KEY  = 'app-sidebar-collapsed'
const DISABLED_KEY = 'plugins-disabled'
const TABS_KEY     = 'app-open-tabs'
/** Rediseño v2: aplica una vez los módulos ocultos por defecto (defaultDisabled). */
const MODULES_V2_KEY = 'plugins-defaults-v2'

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
  let stored: string[] = []
  try {
    const raw = localStorage.getItem(DISABLED_KEY)
    stored = raw ? (JSON.parse(raw) as string[]) : []
  } catch { /* corrupt → defaults */ }
  if (!localStorage.getItem(MODULES_V2_KEY)) {
    localStorage.setItem(MODULES_V2_KEY, '1')
    // Los módulos de uso diario siempre visibles; los de desarrollo pesados, ocultos.
    const personal = new Set(allPlugins.filter(p => p.section === 'personal').map(p => p.id))
    const defaults = allPlugins.filter(p => p.defaultDisabled).map(p => p.id)
    stored = [...new Set([...stored.filter(id => !personal.has(id)), ...defaults])]
    // Persistir junto con el flag: si sólo se guardara en el useEffect, un cierre o
    // recarga antes del primer render dejaría el flag puesto con la lista vieja.
    localStorage.setItem(DISABLED_KEY, JSON.stringify(stored))
  }
  // v3: Notas pasa a estar oculto (se reactiva en Ajustes → Módulos)
  if (!localStorage.getItem('plugins-defaults-v3')) {
    localStorage.setItem('plugins-defaults-v3', '1')
    if (!stored.includes('notes')) stored = [...stored, 'notes']
    localStorage.setItem(DISABLED_KEY, JSON.stringify(stored))
  }
  return stored
}

function getInitialTabs(disabled: string[]): { openTabs: Tab[]; activeTabId: string | null } {
  const fallback = { openTabs: [{ tabId: 'dashboard', pluginId: 'dashboard' }], activeTabId: 'dashboard' }
  try {
    const raw = localStorage.getItem(TABS_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as { openTabs: Tab[]; activeTabId: string | null }
    const valid = new Set(allPlugins.map(p => p.id))
    const openTabs = (parsed.openTabs ?? []).filter(t => valid.has(t.pluginId) && !disabled.includes(t.pluginId))
    if (openTabs.length === 0) return fallback
    const activeTabId = openTabs.some(t => t.tabId === parsed.activeTabId) ? parsed.activeTabId : openTabs[0]!.tabId
    return { openTabs, activeTabId }
  } catch {
    return fallback
  }
}

const initialDisabled = getInitialDisabledPlugins()
const initialTabs = getInitialTabs(initialDisabled)

const initialState: AppState = {
  openTabs: initialTabs.openTabs,
  activeTabId: initialTabs.activeTabId,
  commandPaletteOpen: false,
  keyboardShortcutsOpen: false,
  theme: getInitialTheme(),
  sidebarCollapsed: getInitialSidebarCollapsed(),
  disabledPlugins: initialDisabled,
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
    case 'CLEAR_EDITOR_TARGET':
      return { ...state, editorTarget: undefined }
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
    case 'MARK_PLUGIN_DIRTY': {
      if (state.dirtyPlugins[action.pluginId]) return state
      return { ...state, dirtyPlugins: { ...state.dirtyPlugins, [action.pluginId]: true } }
    }
    case 'MARK_PLUGIN_CLEAN': {
      if (!state.dirtyPlugins[action.pluginId]) return state
      return { ...state, dirtyPlugins: { ...state.dirtyPlugins, [action.pluginId]: false } }
    }
    case 'OPEN_WITH_INTENT': {
      const existing = state.openTabs.find((t) => t.pluginId === action.pluginId)
      const tabId = existing?.tabId ?? action.pluginId
      const openTabs = existing ? state.openTabs : [...state.openTabs, { tabId, pluginId: action.pluginId }]
      const disabledPlugins = state.disabledPlugins.filter(id => id !== action.pluginId)
      return {
        ...state,
        openTabs,
        activeTabId: tabId,
        disabledPlugins,
        pluginIntent: { pluginId: action.pluginId, action: action.action, payload: action.payload, stamp: Date.now() },
      }
    }
    case 'CLEAR_PLUGIN_INTENT':
      return { ...state, pluginIntent: undefined }
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

  useEffect(() => {
    localStorage.setItem(TABS_KEY, JSON.stringify({ openTabs: state.openTabs, activeTabId: state.activeTabId }))
  }, [state.openTabs, state.activeTabId])

  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}

/**
 * Consume intents addressed to `pluginId` (sent with OPEN_WITH_INTENT).
 * The handler runs once per intent; the intent is cleared afterwards.
 */
export function usePluginIntent(pluginId: string, handler: (intent: PluginIntent) => void): void {
  const { state, dispatch } = useApp()
  const handlerRef = useRef(handler)
  handlerRef.current = handler
  const intent = state.pluginIntent
  useEffect(() => {
    if (!intent || intent.pluginId !== pluginId) return
    handlerRef.current(intent)
    dispatch({ type: 'CLEAR_PLUGIN_INTENT' })
  }, [intent, pluginId, dispatch])
}
