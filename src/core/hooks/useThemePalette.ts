import { useState, useEffect, useCallback } from 'react'

export type PaletteId = 'fresh' | 'futuristic' | 'playful' | 'cyber' | 'natural' | 'bold'

export interface PaletteDef {
  id: PaletteId
  name: string
  label: string
  /** Two main hex colors for preview */
  from: string
  to: string
}

export const PALETTES: PaletteDef[] = [
  { id: 'fresh',       name: 'Fresh',       label: 'Tech / Modern',       from: '#1EADF0', to: '#0AFB60' },
  { id: 'futuristic',  name: 'Futuristic',  label: 'Dev / AI Vibe',       from: '#0100EC', to: '#FB36F4' },
  { id: 'playful',     name: 'Playful',     label: 'Energetic / Bold',    from: '#FFE031', to: '#F04579' },
  { id: 'cyber',       name: 'Cyber',       label: 'Neon / Dark Tech',    from: '#9D00C6', to: '#00FFED' },
  { id: 'natural',     name: 'Natural',     label: 'Clean / Productivity',from: '#E5F230', to: '#54DB63' },
  { id: 'bold',        name: 'Bold',        label: 'Alert / Action',      from: '#F237EF', to: '#FC5252' },
]

type PaletteTokens = {
  primary: string
  primaryLight: string
  onPrimary: string
  secondary: string
  onSecondary: string
  accent: string
  gradient: string
}

// Light mode: use the actual vivid palette colors wherever contrast allows.
// For colors that are too light on white (yellows, limes), the secondary/darker
// sibling takes the primary role so the UI stays readable without losing energy.
const LIGHT_TOKENS: Record<PaletteId, PaletteTokens> = {
  fresh: {
    primary:      '14 142 210',     // #0E8ED2 — vivid cyan, readable on white
    primaryLight: '30 173 240',     // #1EADF0
    onPrimary:    '255 255 255',
    secondary:    '8 185 75',       // vivid green
    onSecondary:  '255 255 255',
    accent:       '10 251 96',      // #0AFB60
    gradient:     'linear-gradient(135deg, #1EADF0, #0AFB60)',
  },
  futuristic: {
    primary:      '1 0 236',        // #0100EC — deep electric blue (high contrast on white)
    primaryLight: '90 88 252',
    onPrimary:    '255 255 255',
    secondary:    '200 0 200',      // vivid magenta
    onSecondary:  '255 255 255',
    accent:       '251 54 244',     // #FB36F4
    gradient:     'linear-gradient(135deg, #0100EC, #FB36F4)',
  },
  playful: {
    // Yellow on white is illegible — use hot pink as primary, yellow as accent
    primary:      '220 40 105',     // #DC2869 — vivid rose/hot pink
    primaryLight: '244 80 140',
    onPrimary:    '255 255 255',
    secondary:    '200 140 0',      // dark gold (readable yellow)
    onSecondary:  '255 255 255',
    accent:       '240 69 121',     // #F04579
    gradient:     'linear-gradient(135deg, #DC2869, #C88C00)',
  },
  cyber: {
    primary:      '157 0 198',      // #9D00C6 — deep purple, great contrast
    primaryLight: '198 60 236',
    onPrimary:    '255 255 255',
    secondary:    '0 168 160',      // teal
    onSecondary:  '255 255 255',
    accent:       '0 200 190',
    gradient:     'linear-gradient(135deg, #9D00C6, #00A8A0)',
  },
  natural: {
    // Lime on white is illegible — use saturated green as primary
    primary:      '72 148 0',       // #489400 — vivid grass green
    primaryLight: '100 190 10',
    onPrimary:    '255 255 255',
    secondary:    '40 170 60',
    onSecondary:  '255 255 255',
    accent:       '84 219 99',      // #54DB63
    gradient:     'linear-gradient(135deg, #489400, #28AA3C)',
  },
  bold: {
    primary:      '200 0 192',      // #C800C0 — vivid magenta
    primaryLight: '232 50 224',
    onPrimary:    '255 255 255',
    secondary:    '214 30 30',      // vivid red
    onSecondary:  '255 255 255',
    accent:       '252 82 82',      // #FC5252
    gradient:     'linear-gradient(135deg, #C800C0, #D61E1E)',
  },
}

const DARK_TOKENS: Record<PaletteId, PaletteTokens> = {
  fresh: {
    primary:      '30 173 240',     // #1EADF0
    primaryLight: '111 204 245',
    onPrimary:    '0 40 70',
    secondary:    '10 251 96',      // #0AFB60
    onSecondary:  '0 50 20',
    accent:       '127 255 186',
    gradient:     'linear-gradient(135deg, #1EADF0, #0AFB60)',
  },
  futuristic: {
    primary:      '99 99 248',      // lighter blue for dark bg
    primaryLight: '152 152 251',
    onPrimary:    '10 10 60',
    secondary:    '251 54 244',     // #FB36F4
    onSecondary:  '60 0 60',
    accent:       '255 155 254',
    gradient:     'linear-gradient(135deg, #6363F8, #FB36F4)',
  },
  playful: {
    primary:      '255 224 49',     // #FFE031
    primaryLight: '255 240 130',
    onPrimary:    '60 40 0',
    secondary:    '240 69 121',     // #F04579
    onSecondary:  '70 0 25',
    accent:       '255 160 190',
    gradient:     'linear-gradient(135deg, #FFE031, #F04579)',
  },
  cyber: {
    primary:      '190 68 240',     // bright purple
    primaryLight: '214 128 240',
    onPrimary:    '40 0 60',
    secondary:    '0 255 237',      // #00FFED
    onSecondary:  '0 50 48',
    accent:       '128 255 247',
    gradient:     'linear-gradient(135deg, #BE44F0, #00FFED)',
  },
  natural: {
    primary:      '229 242 48',     // #E5F230
    primaryLight: '240 248 140',
    onPrimary:    '40 48 0',
    secondary:    '84 219 99',      // #54DB63
    onSecondary:  '10 48 16',
    accent:       '160 240 168',
    gradient:     'linear-gradient(135deg, #E5F230, #54DB63)',
  },
  bold: {
    primary:      '242 55 239',     // #F237EF
    primaryLight: '248 128 246',
    onPrimary:    '60 0 58',
    secondary:    '252 82 82',      // #FC5252
    onSecondary:  '60 10 10',
    accent:       '255 160 160',
    gradient:     'linear-gradient(135deg, #F237EF, #FC5252)',
  },
}

function applyPalette(id: PaletteId): void {
  const isDark = document.documentElement.classList.contains('dark')
  const tokens = isDark ? DARK_TOKENS[id] : LIGHT_TOKENS[id]
  const el = document.documentElement

  el.style.setProperty('--c-primary',      tokens.primary)
  el.style.setProperty('--c-primary-light', tokens.primaryLight)
  el.style.setProperty('--c-on-primary',   tokens.onPrimary)
  el.style.setProperty('--c-secondary',    tokens.secondary)
  el.style.setProperty('--c-on-secondary', tokens.onSecondary)
  el.style.setProperty('--c-accent',       tokens.accent)
  el.style.setProperty('--gradient-brand', tokens.gradient)
}

function readPalette(): PaletteId {
  const stored = localStorage.getItem('app:palette')
  const valid: PaletteId[] = ['fresh', 'futuristic', 'playful', 'cyber', 'natural', 'bold']
  return valid.includes(stored as PaletteId) ? (stored as PaletteId) : 'futuristic'
}

export function useThemePalette() {
  const [palette, setPaletteState] = useState<PaletteId>(readPalette)

  useEffect(() => {
    applyPalette(palette)
    localStorage.setItem('app:palette', palette)
  }, [palette])

  // Re-apply when dark/light class changes
  useEffect(() => {
    const observer = new MutationObserver(() => applyPalette(palette))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [palette])

  const setPalette = useCallback((id: PaletteId) => setPaletteState(id), [])

  return { palette, setPalette }
}

export function applyPaletteImmediate(): void {
  applyPalette(readPalette())
}
