import { useState, useEffect, useCallback } from 'react'

export type PaletteId =
  | 'fresh'
  | 'futuristic'
  | 'playful'
  | 'cyber'
  | 'natural'
  | 'bold'
  | 'slateCyan'
  | 'pastel'

export interface PaletteDef {
  id: PaletteId
  name: string
  label: string
  /** Two main hex colors for preview */
  from: string
  to: string
}

export const PALETTES: PaletteDef[] = [
  { id: 'fresh',       name: 'Fresh',       label: 'Tech / Modern',        from: '#1EADF0', to: '#0AFB60' },
  { id: 'futuristic',  name: 'Futuristic',  label: 'Dev / AI Vibe',        from: '#0100EC', to: '#FB36F4' },
  { id: 'playful',     name: 'Playful',     label: 'Energetic / Bold',     from: '#FFE031', to: '#F04579' },
  { id: 'cyber',       name: 'Cyber',       label: 'Neon / Dark Tech',     from: '#9D00C6', to: '#00FFED' },
  { id: 'natural',     name: 'Natural',     label: 'Clean / Productivity', from: '#E5F230', to: '#54DB63' },
  { id: 'bold',        name: 'Bold',        label: 'Alert / Action',       from: '#F237EF', to: '#FC5252' },
  { id: 'slateCyan',   name: 'Slate & Cyan', label: 'Gris → cyan',         from: '#64748B', to: '#22D3EE' },
  { id: 'pastel',      name: 'Pastel',      label: 'Amarillo → verde pastel', from: '#FEF3C7', to: '#BBF7D0' },
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

const LIGHT_TOKENS: Record<PaletteId, PaletteTokens> = {
  fresh: {
    primary:      '14 142 210',
    primaryLight: '30 173 240',
    onPrimary:    '255 255 255',
    secondary:    '8 185 75',
    onSecondary:  '255 255 255',
    accent:       '10 251 96',
    gradient:     'linear-gradient(135deg, #1EADF0, #0AFB60)',
  },
  futuristic: {
    primary:      '1 0 236',
    primaryLight: '90 88 252',
    onPrimary:    '255 255 255',
    secondary:    '200 0 200',
    onSecondary:  '255 255 255',
    accent:       '251 54 244',
    gradient:     'linear-gradient(135deg, #0100EC, #FB36F4)',
  },
  playful: {
    primary:      '220 40 105',
    primaryLight: '244 80 140',
    onPrimary:    '255 255 255',
    secondary:    '200 140 0',
    onSecondary:  '255 255 255',
    accent:       '240 69 121',
    gradient:     'linear-gradient(135deg, #DC2869, #C88C00)',
  },
  cyber: {
    primary:      '157 0 198',
    primaryLight: '198 60 236',
    onPrimary:    '255 255 255',
    secondary:    '0 168 160',
    onSecondary:  '255 255 255',
    accent:       '0 200 190',
    gradient:     'linear-gradient(135deg, #9D00C6, #00A8A0)',
  },
  natural: {
    primary:      '72 148 0',
    primaryLight: '100 190 10',
    onPrimary:    '255 255 255',
    secondary:    '40 170 60',
    onSecondary:  '255 255 255',
    accent:       '84 219 99',
    gradient:     'linear-gradient(135deg, #489400, #28AA3C)',
  },
  bold: {
    primary:      '200 0 192',
    primaryLight: '232 50 224',
    onPrimary:    '255 255 255',
    secondary:    '214 30 30',
    onSecondary:  '255 255 255',
    accent:       '252 82 82',
    gradient:     'linear-gradient(135deg, #C800C0, #D61E1E)',
  },
  slateCyan: {
    primary:      '71 85 105',
    primaryLight: '100 116 139',
    onPrimary:    '255 255 255',
    secondary:    '8 145 178',
    onSecondary:  '255 255 255',
    accent:       '34 211 238',
    gradient:     'linear-gradient(135deg, #475569 0%, #64748B 42%, #06B6D4 100%)',
  },
  pastel: {
    // Textos sobre blanco: verde oliva / lima oscuro; el degradé sigue pastel
    primary:      '77 124 42',
    primaryLight: '110 160 60',
    onPrimary:    '255 255 255',
    secondary:    '52 120 70',
    onSecondary:  '255 255 255',
    accent:       '134 239 172',
    gradient:     'linear-gradient(135deg, #FEF3C7 0%, #FEF08A 48%, #BBF7D0 100%)',
  },
}

const DARK_GRAY: PaletteTokens = {
  primary:      '140 140 145',
  primaryLight: '185 185 190',
  onPrimary:    '18 18 18',
  secondary:    '110 110 115',
  onSecondary:  '18 18 18',
  accent:       '160 160 165',
  gradient:     'linear-gradient(135deg, #8C8C91, #B9B9BE)',
}

const DARK_TOKENS: Record<PaletteId, PaletteTokens> = {
  fresh:      DARK_GRAY,
  futuristic: DARK_GRAY,
  playful:    DARK_GRAY,
  cyber:      DARK_GRAY,
  natural:    DARK_GRAY,
  bold:       DARK_GRAY,
  slateCyan:  DARK_GRAY,
  pastel:     DARK_GRAY,
}

function applyPalette(id: PaletteId): void {
  const isDark = document.documentElement.classList.contains('dark')
  const tokens = isDark ? DARK_TOKENS[id] : LIGHT_TOKENS[id]
  const el = document.documentElement

  el.setAttribute('data-palette', id)

  el.style.setProperty('--c-primary',      tokens.primary)
  el.style.setProperty('--c-primary-light', tokens.primaryLight)
  el.style.setProperty('--c-on-primary',   tokens.onPrimary)
  el.style.setProperty('--c-secondary',    tokens.secondary)
  el.style.setProperty('--c-on-secondary', tokens.onSecondary)
  el.style.setProperty('--c-accent',       tokens.accent)
  el.style.setProperty('--gradient-brand', tokens.gradient)
}

const ALL_PALETTES: PaletteId[] = [
  'fresh', 'futuristic', 'playful', 'cyber', 'natural', 'bold',
  'slateCyan', 'pastel',
]

function readPalette(): PaletteId {
  const stored = localStorage.getItem('app:palette')
  if (stored && ALL_PALETTES.includes(stored as PaletteId)) return stored as PaletteId
  return 'futuristic'
}

export function useThemePalette() {
  const [palette, setPaletteState] = useState<PaletteId>(readPalette)

  useEffect(() => {
    applyPalette(palette)
    localStorage.setItem('app:palette', palette)
  }, [palette])

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
