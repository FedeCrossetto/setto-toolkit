export interface TerminalSession {
  id: string
  title: string
  shell: string
  cwd: string
  createdAt: string
  closedAt?: string
  exitCode?: number | null
}

export interface TerminalPrefs {
  shell: string
  fontSize: number
  fontFamily: string
  theme: string
  scrollback: number
  cursorStyle: 'block' | 'underline' | 'bar'
  cursorBlink: boolean
}

export const DEFAULT_PREFS: TerminalPrefs = {
  shell: '',        // empty = auto-detect per platform
  fontSize: 13,
  fontFamily: 'Consolas, "Cascadia Code", "Fira Code", monospace',
  theme: 'dark',
  scrollback: 3000,
  cursorStyle: 'bar',
  cursorBlink: true,
}
