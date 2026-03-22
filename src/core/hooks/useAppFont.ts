import { useState, useEffect, useCallback } from 'react'

export interface AppFontPrefs {
  fontFamily: string
  fontSize: 'small' | 'normal' | 'large'
}

const STORAGE_KEY = 'app:font-prefs'
const DEFAULTS: AppFontPrefs = { fontFamily: 'Inter', fontSize: 'normal' }

export const APP_FONT_FAMILIES = [
  { label: 'Inter',          stack: 'Inter, system-ui, sans-serif' },
  { label: 'System UI',      stack: 'system-ui, -apple-system, sans-serif' },
  { label: 'Segoe UI',       stack: "'Segoe UI', system-ui, sans-serif" },
  { label: 'JetBrains Mono', stack: "'JetBrains Mono', 'Fira Code', monospace" },
] as const

export const APP_FONT_SIZES: Record<AppFontPrefs['fontSize'], string> = {
  small:  '13px',
  normal: '15px',
  large:  '17px',
}

function applyFont(prefs: AppFontPrefs): void {
  const entry = APP_FONT_FAMILIES.find((f) => f.label === prefs.fontFamily) ?? APP_FONT_FAMILIES[0]
  document.documentElement.style.setProperty('--app-font-family', entry.stack)
  document.documentElement.style.setProperty('--app-font-size-base', APP_FONT_SIZES[prefs.fontSize])
}

function readPrefs(): AppFontPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

export function useAppFont() {
  const [prefs, setPrefs] = useState<AppFontPrefs>(readPrefs)

  // Apply to DOM + persist whenever prefs change
  useEffect(() => {
    applyFont(prefs)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  }, [prefs])

  const updateFont = useCallback((patch: Partial<AppFontPrefs>) => {
    setPrefs((prev) => ({ ...prev, ...patch }))
  }, [])

  return { prefs, updateFont }
}

// Call once on app boot (before React renders) to avoid flash
export function applyFontImmediate(): void {
  applyFont(readPrefs())
}
