import { useState, useCallback } from 'react'
import { DEFAULT_COLOR_SCHEME, migrateColorScheme } from '../themes/registry'
import type { EditorColorScheme } from '../themes/registry'
import type { EolKind } from '../types'

export type { EditorColorScheme }
export type EditorTheme = 'auto' | 'dark' | 'light'

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
  /** Fin de línea para archivos nuevos (los existentes conservan el suyo) */
  defaultEol: EolKind
  /** One-time migration marker: autosave was switched on by default (see below) */
  autoSaveMigrated?: boolean
}

const STORAGE_KEY = 'file-editor:prefs'

// JetBrains Mono is bundled via Google Fonts (index.html) so it renders the same on every
// platform; monoStack() (themes/buildTheme.ts) falls back to Cascadia/SF Mono/Consolas offline.
const DEFAULT_FONT = 'JetBrains Mono'

const PLATFORM_EOL: EolKind = typeof window !== 'undefined' && window.api?.platform === 'win32' ? 'crlf' : 'lf'

const DEFAULTS: EditorPrefs = { fontSize: 14, fontFamily: DEFAULT_FONT, editorTheme: 'auto', colorScheme: DEFAULT_COLOR_SCHEME, autoSave: true, autoSaveDelay: 1500, tailLinesCount: 2000, minimap: false, sidebarWidth: 224, defaultEol: PLATFORM_EOL, autoSaveMigrated: true }

export const SIDEBAR_WIDTH_MIN = 180
export const SIDEBAR_WIDTH_MAX = 480

export const FONT_FAMILIES = ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', 'Consolas'] as const
export const FONT_SIZE_MIN = 9
export const FONT_SIZE_MAX = 18

export function useEditorPrefs() {
  const [prefs, setPrefs] = useState<EditorPrefs>(() => {
    try {
      const merged = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') }
      // Old ids ('nexus', 'httpie') and unknown values map to the current registry
      merged.colorScheme = migrateColorScheme(merged.colorScheme)
      // Autosave is on by default now (local history makes it safe). Stored prefs can't tell
      // "explicitly turned off" from "old default", so migrate everyone to on exactly once;
      // turning it off afterwards sticks because the marker is persisted.
      if (!merged.autoSaveMigrated) {
        merged.autoSave = true
        merged.autoSaveMigrated = true
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)) } catch { /* storage full */ }
      }
      if (merged.defaultEol !== 'crlf' && merged.defaultEol !== 'lf') merged.defaultEol = DEFAULTS.defaultEol
      // Very old default (JetBrains Mono @ 11px) — keep the font, bump the size
      if (merged.fontFamily === 'JetBrains Mono' && merged.fontSize === 11) merged.fontSize = DEFAULTS.fontSize
      // Users still on the untouched old default (SF Mono @ 13px) outside macOS, where
      // "SF Mono" doesn't exist, move to the bundled default.
      if (merged.fontFamily === 'SF Mono' && merged.fontSize === 13 && window.api.platform !== 'darwin') {
        merged.fontFamily = DEFAULTS.fontFamily
        merged.fontSize = DEFAULTS.fontSize
      }
      // Tamaños enteros: medio píxel (13.5px) se ve borroso en Windows
      merged.fontSize = Math.round(merged.fontSize)
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
