import { useState, useEffect, useCallback } from 'react'

export interface AppFontPrefs {
  fontFamily: string
  /** Tamaño de la interfaz: small = Compacto (default), normal, large */
  fontSize: 'small' | 'normal' | 'large'
}

const STORAGE_KEY = 'app:font-prefs'
const DEFAULTS: AppFontPrefs = { fontFamily: 'Inter', fontSize: 'small' }
/**
 * v5: una sola fuente de UI (Inter, como Notion/Linear) y tamaño Compacto.
 * La monoespaciada queda sólo para código; ya no se ofrece como fuente de la app.
 */
const DESIGN_KEY = 'app:design-v5-font'

/** Fuentes de interfaz permitidas (la monoespaciada es sólo para código). */
export const APP_FONT_FAMILIES = [
  { label: 'Inter',   stack: "'Inter Variable', Inter, 'Segoe UI Variable Text', 'Segoe UI', system-ui, -apple-system, sans-serif" },
  { label: 'Sistema', stack: "-apple-system, BlinkMacSystemFont, 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif" },
] as const

/**
 * Base de `rem` (espaciados de Tailwind). Los tamaños de letra son px enteros
 * (@theme en globals.css + clases .t-*), así achicar la interfaz no deja texto borroso.
 */
export const APP_FONT_SIZES: Record<AppFontPrefs['fontSize'], string> = {
  small:  '12px',
  normal: '14px',
  large:  '16px',
}

export const APP_SIZE_LABELS: Record<AppFontPrefs['fontSize'], string> = {
  small: 'Compacto',
  normal: 'Normal',
  large: 'Grande',
}

function applyFont(prefs: AppFontPrefs): void {
  const entry = APP_FONT_FAMILIES.find((f) => f.label === prefs.fontFamily) ?? APP_FONT_FAMILIES[0]
  const el = document.documentElement
  el.style.setProperty('--app-font-family', entry.stack)
  el.style.setProperty('--app-font-size-base', APP_FONT_SIZES[prefs.fontSize])
  el.dataset['uiSize'] = prefs.fontSize
}

function readPrefs(): AppFontPrefs {
  if (!localStorage.getItem(DESIGN_KEY)) {
    localStorage.setItem(DESIGN_KEY, '1')
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULTS))
    return DEFAULTS
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? { ...DEFAULTS, ...JSON.parse(raw) } as AppFontPrefs : DEFAULTS
    if (!APP_FONT_FAMILIES.some((f) => f.label === parsed.fontFamily)) parsed.fontFamily = 'Inter'
    return parsed
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
