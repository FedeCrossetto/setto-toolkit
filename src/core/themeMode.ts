import { useCallback, useEffect, useState } from 'react'
import { useApp } from './AppContext'
import type { Theme } from './types'

/**
 * Theme *mode* on top of AppState.theme: the user can pick Claro / Oscuro or
 * "Sistema", which follows `prefers-color-scheme`. AppState.theme keeps being the
 * resolved value (light | dark); this module only decides which one to dispatch.
 */
export type ThemeMode = Theme | 'system'

const MODE_KEY = 'app-theme-mode'
const MODE_EVENT = 'setto:theme-mode'

export function getThemeMode(): ThemeMode {
  try {
    const v = localStorage.getItem(MODE_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch { /* storage unavailable */ }
  return 'light'
}

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function resolveTheme(mode: ThemeMode): Theme {
  return mode === 'system' ? systemTheme() : mode
}

function storeMode(mode: ThemeMode): void {
  try { localStorage.setItem(MODE_KEY, mode) } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(MODE_EVENT, { detail: mode }))
}

/** Read/write the theme mode. Setting it dispatches the resolved SET_THEME. */
export function useThemeMode(): [ThemeMode, (mode: ThemeMode) => void] {
  const { dispatch, state } = useApp()
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const stored = getThemeMode()
    // First run (no mode stored yet): reflect the current explicit theme.
    try { if (!localStorage.getItem(MODE_KEY)) return state.theme } catch { /* ignore */ }
    return stored
  })

  useEffect(() => {
    const onMode = (e: Event): void => setModeState((e as CustomEvent<ThemeMode>).detail)
    window.addEventListener(MODE_EVENT, onMode)
    return () => window.removeEventListener(MODE_EVENT, onMode)
  }, [])

  const setMode = useCallback((next: ThemeMode) => {
    storeMode(next)
    setModeState(next)
    dispatch({ type: 'SET_THEME', theme: resolveTheme(next) })
  }, [dispatch])

  return [mode, setMode]
}

/**
 * Keeps AppState.theme in sync with the OS while the mode is "Sistema".
 * Mount once in an always-present component (the command palette does it).
 */
export function useSystemThemeSync(): void {
  const { dispatch } = useApp()
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      if (getThemeMode() === 'system') dispatch({ type: 'SET_THEME', theme: mq.matches ? 'dark' : 'light' })
    }
    apply()
    mq.addEventListener('change', apply)
    window.addEventListener(MODE_EVENT, apply)
    return () => {
      mq.removeEventListener('change', apply)
      window.removeEventListener(MODE_EVENT, apply)
    }
  }, [dispatch])
}

/** Explicit light/dark switch (e.g. from the palette) — leaves "Sistema" mode. */
export function setExplicitTheme(theme: Theme, dispatch: React.Dispatch<import('./types').AppAction>): void {
  storeMode(theme)
  dispatch({ type: 'SET_THEME', theme })
}
