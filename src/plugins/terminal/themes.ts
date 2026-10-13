import type { ITheme } from '@xterm/xterm'

export interface TerminalThemeDefinition {
  label: string
  theme: ITheme
  background: string  // CSS color for the surrounding UI
}

export const TERMINAL_THEMES: Record<string, TerminalThemeDefinition> = {
  system: {
    label: 'Sistema (sigue a la app)',
    background: '#1e1e1e',
    theme: {}, // resolved at runtime by resolveTerminalTheme()
  },
  dark: {
    // Inspirado en Terminal.app "Pro": neutro, contraste cómodo, ANSI suaves
    label: 'Oscuro',
    background: '#1e1e1e',
    theme: {
      background:    '#1e1e1e',
      foreground:    '#e5e5ea',
      cursor:        '#c7c7cc',
      cursorAccent:  '#1e1e1e',
      selectionBackground: 'rgba(255, 255, 255, 0.18)',
      black:         '#3a3a3c',
      red:           '#ff6b6b',
      green:         '#6cc788',
      yellow:        '#e5c07b',
      blue:          '#6ca7ff',
      magenta:       '#c792ea',
      cyan:          '#5fc7d6',
      white:         '#c7c7cc',
      brightBlack:   '#636366',
      brightRed:     '#ff8a80',
      brightGreen:   '#8edb9f',
      brightYellow:  '#f2d58f',
      brightBlue:    '#8ab8ff',
      brightMagenta: '#d5a8f0',
      brightCyan:    '#7fd6e2',
      brightWhite:   '#f2f2f7',
    },
  },
  light: {
    // Inspirado en Terminal.app "Básico": fondo blanco, texto casi negro
    label: 'Claro',
    background: '#ffffff',
    theme: {
      background:    '#ffffff',
      foreground:    '#1d1d1f',
      cursor:        '#3a3a3c',
      cursorAccent:  '#ffffff',
      selectionBackground: 'rgba(52, 120, 246, 0.22)',
      black:         '#1d1d1f',
      red:           '#c4302b',
      green:         '#2e8b3e',
      yellow:        '#9a6a00',
      blue:          '#1f5fd1',
      magenta:       '#9b3bb0',
      cyan:          '#16808f',
      white:         '#8e8e93',
      brightBlack:   '#636366',
      brightRed:     '#e0443e',
      brightGreen:   '#3aa34d',
      brightYellow:  '#b8860b',
      brightBlue:    '#3478f6',
      brightMagenta: '#af52de',
      brightCyan:    '#1e9aaa',
      brightWhite:   '#3a3a3c',
    },
  },
  monokai: {
    label: 'Monokai',
    background: '#272822',
    theme: {
      background:    '#272822',
      foreground:    '#f8f8f2',
      cursor:        '#f8f8f2',
      cursorAccent:  '#272822',
      selectionBackground: 'rgba(248, 248, 242, 0.2)',
      black:         '#272822',
      red:           '#f92672',
      green:         '#a6e22e',
      yellow:        '#f4bf75',
      blue:          '#66d9e8',
      magenta:       '#ae81ff',
      cyan:          '#a1efe4',
      white:         '#f8f8f2',
      brightBlack:   '#75715e',
      brightRed:     '#f92672',
      brightGreen:   '#a6e22e',
      brightYellow:  '#f4bf75',
      brightBlue:    '#66d9e8',
      brightMagenta: '#ae81ff',
      brightCyan:    '#a1efe4',
      brightWhite:   '#f9f8f5',
    },
  },
  dracula: {
    label: 'Dracula',
    background: '#282a36',
    theme: {
      background:    '#282a36',
      foreground:    '#f8f8f2',
      cursor:        '#f8f8f2',
      cursorAccent:  '#282a36',
      selectionBackground: 'rgba(248, 248, 242, 0.2)',
      black:         '#21222c',
      red:           '#ff5555',
      green:         '#50fa7b',
      yellow:        '#f1fa8c',
      blue:          '#bd93f9',
      magenta:       '#ff79c6',
      cyan:          '#8be9fd',
      white:         '#f8f8f2',
      brightBlack:   '#6272a4',
      brightRed:     '#ff6e6e',
      brightGreen:   '#69ff94',
      brightYellow:  '#ffffa5',
      brightBlue:    '#d6acff',
      brightMagenta: '#ff92df',
      brightCyan:    '#a4ffff',
      brightWhite:   '#ffffff',
    },
  },
  solarized: {
    label: 'Solarized oscuro',
    background: '#002b36',
    theme: {
      background:    '#002b36',
      foreground:    '#839496',
      cursor:        '#839496',
      cursorAccent:  '#002b36',
      selectionBackground: 'rgba(131, 148, 150, 0.2)',
      black:         '#073642',
      red:           '#dc322f',
      green:         '#859900',
      yellow:        '#b58900',
      blue:          '#268bd2',
      magenta:       '#d33682',
      cyan:          '#2aa198',
      white:         '#eee8d5',
      brightBlack:   '#002b36',
      brightRed:     '#cb4b16',
      brightGreen:   '#586e75',
      brightYellow:  '#657b83',
      brightBlue:    '#839496',
      brightMagenta: '#6c71c4',
      brightCyan:    '#93a1a1',
      brightWhite:   '#fdf6e3',
    },
  },
  // ── Pareja de los temas completos de la app (Ajustes → Apariencia → Tema) ──
  'nord': {
    label: 'Nord',
    background: '#2e3440',
    theme: {
      background: '#2e3440', foreground: '#d8dee9', cursor: '#d8dee9', cursorAccent: '#2e3440',
      selectionBackground: 'rgba(136, 192, 208, 0.25)',
      black: '#3b4252', red: '#bf616a', green: '#a3be8c', yellow: '#ebcb8b', blue: '#81a1c1', magenta: '#b48ead', cyan: '#88c0d0', white: '#e5e9f0',
      brightBlack: '#4c566a', brightRed: '#bf616a', brightGreen: '#a3be8c', brightYellow: '#ebcb8b', brightBlue: '#81a1c1', brightMagenta: '#b48ead', brightCyan: '#8fbcbb', brightWhite: '#eceff4',
    },
  },
  'nord-light': {
    label: 'Nord claro',
    background: '#eceff4',
    theme: {
      background: '#eceff4', foreground: '#2e3440', cursor: '#4c566a', cursorAccent: '#eceff4',
      selectionBackground: 'rgba(94, 129, 172, 0.22)',
      black: '#3b4252', red: '#bf616a', green: '#5f8a4c', yellow: '#b48a2c', blue: '#5e81ac', magenta: '#9a6f95', cyan: '#3f8a9c', white: '#d8dee9',
      brightBlack: '#4c566a', brightRed: '#c7707a', brightGreen: '#6f9a5c', brightYellow: '#c49a3c', brightBlue: '#81a1c1', brightMagenta: '#b48ead', brightCyan: '#5aa0b0', brightWhite: '#e5e9f0',
    },
  },
  'catppuccin-mocha': {
    label: 'Catppuccin Mocha',
    background: '#1e1e2e',
    theme: {
      background: '#1e1e2e', foreground: '#cdd6f4', cursor: '#f5e0dc', cursorAccent: '#1e1e2e',
      selectionBackground: 'rgba(88, 91, 112, 0.6)',
      black: '#45475a', red: '#f38ba8', green: '#a6e3a1', yellow: '#f9e2af', blue: '#89b4fa', magenta: '#f5c2e7', cyan: '#94e2d5', white: '#bac2de',
      brightBlack: '#585b70', brightRed: '#f38ba8', brightGreen: '#a6e3a1', brightYellow: '#f9e2af', brightBlue: '#89b4fa', brightMagenta: '#f5c2e7', brightCyan: '#94e2d5', brightWhite: '#a6adc8',
    },
  },
  'catppuccin-latte': {
    label: 'Catppuccin Latte',
    background: '#eff1f5',
    theme: {
      background: '#eff1f5', foreground: '#4c4f69', cursor: '#dc8a78', cursorAccent: '#eff1f5',
      selectionBackground: 'rgba(172, 176, 190, 0.5)',
      black: '#5c5f77', red: '#d20f39', green: '#40a02b', yellow: '#df8e1d', blue: '#1e66f5', magenta: '#ea76cb', cyan: '#179299', white: '#acb0be',
      brightBlack: '#6c6f85', brightRed: '#d20f39', brightGreen: '#40a02b', brightYellow: '#df8e1d', brightBlue: '#1e66f5', brightMagenta: '#ea76cb', brightCyan: '#179299', brightWhite: '#bcc0cc',
    },
  },
  'tokyo-night': {
    label: 'Tokyo Night',
    background: '#1a1b26',
    theme: {
      background: '#1a1b26', foreground: '#c0caf5', cursor: '#c0caf5', cursorAccent: '#1a1b26',
      selectionBackground: 'rgba(51, 70, 124, 0.7)',
      black: '#15161e', red: '#f7768e', green: '#9ece6a', yellow: '#e0af68', blue: '#7aa2f7', magenta: '#bb9af7', cyan: '#7dcfff', white: '#a9b1d6',
      brightBlack: '#414868', brightRed: '#f7768e', brightGreen: '#9ece6a', brightYellow: '#e0af68', brightBlue: '#7aa2f7', brightMagenta: '#bb9af7', brightCyan: '#7dcfff', brightWhite: '#c0caf5',
    },
  },
  'tokyo-night-day': {
    label: 'Tokyo Night Day',
    background: '#e1e2e7',
    theme: {
      background: '#e1e2e7', foreground: '#3760bf', cursor: '#3760bf', cursorAccent: '#e1e2e7',
      selectionBackground: 'rgba(183, 193, 227, 0.7)',
      black: '#b4b5b9', red: '#f52a65', green: '#587539', yellow: '#8c6c3e', blue: '#2e7de9', magenta: '#9854f1', cyan: '#007197', white: '#6172b0',
      brightBlack: '#a1a6c5', brightRed: '#f52a65', brightGreen: '#587539', brightYellow: '#8c6c3e', brightBlue: '#2e7de9', brightMagenta: '#9854f1', brightCyan: '#007197', brightWhite: '#3760bf',
    },
  },
  'github-dark': {
    label: 'GitHub Dark',
    background: '#0d1117',
    theme: {
      background: '#0d1117', foreground: '#e6edf3', cursor: '#e6edf3', cursorAccent: '#0d1117',
      selectionBackground: 'rgba(56, 139, 253, 0.3)',
      black: '#484f58', red: '#ff7b72', green: '#3fb950', yellow: '#d29922', blue: '#58a6ff', magenta: '#bc8cff', cyan: '#39c5cf', white: '#b1bac4',
      brightBlack: '#6e7681', brightRed: '#ffa198', brightGreen: '#56d364', brightYellow: '#e3b341', brightBlue: '#79c0ff', brightMagenta: '#d2a8ff', brightCyan: '#56d4dd', brightWhite: '#ffffff',
    },
  },
  'github-light': {
    label: 'GitHub Light',
    background: '#ffffff',
    theme: {
      background: '#ffffff', foreground: '#1f2328', cursor: '#1f2328', cursorAccent: '#ffffff',
      selectionBackground: 'rgba(84, 174, 255, 0.3)',
      black: '#24292f', red: '#cf222e', green: '#116329', yellow: '#4d2d00', blue: '#0969da', magenta: '#8250df', cyan: '#1b7c83', white: '#6e7781',
      brightBlack: '#57606a', brightRed: '#a40e26', brightGreen: '#1a7f37', brightYellow: '#633c01', brightBlue: '#218bff', brightMagenta: '#a475f9', brightCyan: '#3192aa', brightWhite: '#8c959f',
    },
  },
}

/** Reads an `R G B` CSS token from :root and returns it as #rrggbb (xterm needs concrete colors). */
function readTokenHex(name: string): string | null {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    const parts = raw.split(/[\s,]+/).map(Number)
    if (parts.length < 3 || parts.slice(0, 3).some((n) => Number.isNaN(n))) return null
    return '#' + parts.slice(0, 3).map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join('')
  } catch {
    return null
  }
}

/**
 * Resolves the theme actually applied to xterm.
 * - `system` follows the app's light/dark mode.
 * - When the terminal theme matches the app mode (oscuro+dark / claro+light), the background
 *   uses the app's `--c-surface` token so the terminal blends with the rest of the window.
 */
export function resolveTerminalTheme(id: string, presetTheme?: string | null): TerminalThemeDefinition {
  const appDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  // "Sistema" con un tema completo activo (Nord, Catppuccin…): usa su pareja de terminal.
  const fromPreset = id === 'system' && !!presetTheme && !!TERMINAL_THEMES[presetTheme]
  const key = fromPreset ? presetTheme! : id === 'system' ? (appDark ? 'dark' : 'light') : id
  const def = TERMINAL_THEMES[key] ?? TERMINAL_THEMES['dark']!
  const matchesApp = fromPreset || (key === 'dark' && appDark) || (key === 'light' && !appDark)
  if (!matchesApp) return def
  const bg = readTokenHex('--c-surface')
  if (!bg) return def
  return { ...def, background: bg, theme: { ...def.theme, background: bg, cursorAccent: bg } }
}
