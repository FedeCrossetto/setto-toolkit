import { useState, useCallback } from 'react'

export type EditorTheme = 'auto' | 'dark' | 'light'
export type EditorColorScheme = 'nexus' | 'httpie'

export interface EditorPrefs {
  fontSize: number
  fontFamily: string
  editorTheme: EditorTheme
  colorScheme: EditorColorScheme
  autoSave: boolean
  autoSaveDelay: number
  /** Number of lines loaded when a file exceeds the 2 MB threshold (tail mode) */
  tailLinesCount: number
  /** Show the code minimap on the right edge of the editor */
  minimap: boolean
}

const STORAGE_KEY = 'file-editor:prefs'
const DEFAULTS: EditorPrefs = { fontSize: 13, fontFamily: 'SF Mono', editorTheme: 'auto', colorScheme: 'nexus', autoSave: false, autoSaveDelay: 1500, tailLinesCount: 2000, minimap: false }

export const FONT_FAMILIES = ['SF Mono', 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas'] as const
export const FONT_SIZE_MIN = 9
export const FONT_SIZE_MAX = 18

export function useEditorPrefs() {
  const [prefs, setPrefs] = useState<EditorPrefs>(() => {
    try {
      const merged = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') }
      // Migrate the old default (JetBrains Mono @ 11px) — it isn't installed on
      // most systems and rendered as generic monospace. Move such users to SF Mono.
      if (merged.fontFamily === 'JetBrains Mono' && merged.fontSize === 11) {
        merged.fontFamily = DEFAULTS.fontFamily
        merged.fontSize = DEFAULTS.fontSize
      }
      return merged
    } catch { return DEFAULTS }
  })

  const updatePrefs = useCallback((patch: Partial<EditorPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  return { prefs, updatePrefs }
}
