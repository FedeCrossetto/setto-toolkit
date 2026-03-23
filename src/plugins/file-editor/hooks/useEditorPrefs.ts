import { useState, useCallback } from 'react'

export type EditorTheme = 'auto' | 'dark' | 'light'

export interface EditorPrefs {
  fontSize: number
  fontFamily: string
  editorTheme: EditorTheme
  autoSave: boolean
  autoSaveDelay: number
  /** Number of lines loaded when a file exceeds the 2 MB threshold (tail mode) */
  tailLinesCount: number
}

const STORAGE_KEY = 'file-editor:prefs'
const DEFAULTS: EditorPrefs = { fontSize: 11, fontFamily: 'JetBrains Mono', editorTheme: 'auto', autoSave: false, autoSaveDelay: 1500, tailLinesCount: 2000 }

export const FONT_FAMILIES = ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas'] as const
export const FONT_SIZE_MIN = 9
export const FONT_SIZE_MAX = 18

export function useEditorPrefs() {
  const [prefs, setPrefs] = useState<EditorPrefs>(() => {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') }
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
