import { useState, useCallback } from 'react'

export type EditorTheme = 'auto' | 'dark' | 'light'
export type EditorColorScheme = 'nexus' | 'httpie' | 'aurora' | 'dracula' | 'monokai'

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
  /** Width in px of the left sidebar (Explorer + Open files) */
  sidebarWidth: number
}

const STORAGE_KEY = 'file-editor:prefs'

// "SF Mono" only exists on macOS — on Windows/Linux it silently falls back through the
// stack in monoStack() (CodeEditor.tsx), but starting from a font that's actually
// installed renders crisper out of the box than relying on the fallback chain.
const PLATFORM_DEFAULT_FONT = window.api.platform === 'darwin' ? 'SF Mono' : 'Consolas'

const DEFAULTS: EditorPrefs = { fontSize: 14, fontFamily: PLATFORM_DEFAULT_FONT, editorTheme: 'auto', colorScheme: 'nexus', autoSave: false, autoSaveDelay: 1500, tailLinesCount: 2000, minimap: false, sidebarWidth: 224 }

export const SIDEBAR_WIDTH_MIN = 180
export const SIDEBAR_WIDTH_MAX = 480

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
      // Migrate users still on the untouched old default (SF Mono @ 13px) to the
      // platform-appropriate font — "SF Mono" doesn't exist outside macOS.
      if (merged.fontFamily === 'SF Mono' && merged.fontSize === 13 && window.api.platform !== 'darwin') {
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
