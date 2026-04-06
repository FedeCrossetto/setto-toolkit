import { useState, useEffect, useCallback } from 'react'

export type PaletteId =
  | 'neonLime'
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
  { id: 'neonLime',    name: 'Neon Lime',   label: 'Lima neón · claro / oscuro', from: '#A3E635', to: '#D9F99D' },
  { id: 'fresh',       name: 'Fresh',       label: 'Tech / Modern',            from: '#1EADF0', to: '#0AFB60' },
  { id: 'futuristic',  name: 'Futuristic',  label: 'Dev / AI Vibe',            from: '#0100EC', to: '#FB36F4' },
  { id: 'playful',     name: 'Playful',     label: 'Energetic / Bold',         from: '#FFE031', to: '#F04579' },
  { id: 'cyber',       name: 'Cyber',       label: 'Neon / Dark Tech',         from: '#9D00C6', to: '#00FFED' },
  { id: 'natural',     name: 'Natural',     label: 'Clean / Productivity',     from: '#E5F230', to: '#54DB63' },
  { id: 'bold',        name: 'Bold',        label: 'Alert / Action',           from: '#F237EF', to: '#FC5252' },
  { id: 'slateCyan',   name: 'Slate & Cyan', label: 'Gris → cyan',             from: '#64748B', to: '#22D3EE' },
  { id: 'pastel',      name: 'Pastel',      label: 'Amarillo → verde pastel',  from: '#FEF3C7', to: '#BBF7D0' },
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
  neonLime: {
    // Mismos tokens que en oscuro: verde flúor / lima neón (texto primary, botones, acentos).
    primary:      '163 230 53',
    primaryLight: '190 242 100',
    onPrimary:    '15 23 15',
    secondary:    '132 204 22',
    onSecondary:  '255 255 255',
    accent:       '217 249 157',
    gradient:     'linear-gradient(135deg, #A3E635, #D9F99D)',
  },
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
    primary:      '77 124 42',
    primaryLight: '110 160 60',
    onPrimary:    '255 255 255',
    secondary:    '52 120 70',
    onSecondary:  '255 255 255',
    accent:       '134 239 172',
    gradient:     'linear-gradient(135deg, #FEF3C7 0%, #FEF08A 48%, #BBF7D0 100%)',
  },
}

/** Dark theme: cada paleta conserva su matiz (antes todo caía en gris y no se notaba el cambio). */
const DARK_TOKENS: Record<PaletteId, PaletteTokens> = {
  neonLime: {
    primary:      '163 230 53',
    primaryLight: '190 242 100',
    onPrimary:    '15 23 15',
    secondary:    '132 204 22',
    onSecondary:  '255 255 255',
    accent:       '217 249 157',
    gradient:     'linear-gradient(135deg, #A3E635, #D9F99D)',
  },
  fresh: {
    primary:      '14 165 233',
    primaryLight: '56 189 248',
    onPrimary:    '255 255 255',
    secondary:    '16 185 129',
    onSecondary:  '255 255 255',
    accent:       '52 211 153',
    gradient:     'linear-gradient(135deg, #0EA5E9, #34D399)',
  },
  futuristic: {
    primary:      '99 102 241',
    primaryLight: '129 140 248',
    onPrimary:    '255 255 255',
    secondary:    '217 70 239',
    onSecondary:  '255 255 255',
    accent:       '232 121 249',
    gradient:     'linear-gradient(135deg, #6366F1, #E879F9)',
  },
  playful: {
    primary:      '236 72 153',
    primaryLight: '244 114 182',
    onPrimary:    '255 255 255',
    secondary:    '234 179 8',
    onSecondary:  '18 18 18',
    accent:       '250 204 21',
    gradient:     'linear-gradient(135deg, #EC4899, #EAB308)',
  },
  cyber: {
    primary:      '168 85 247',
    primaryLight: '192 132 252',
    onPrimary:    '255 255 255',
    secondary:    '6 182 212',
    onSecondary:  '18 18 18',
    accent:       '34 211 238',
    gradient:     'linear-gradient(135deg, #A855F7, #22D3EE)',
  },
  natural: {
    primary:      '132 204 22',
    primaryLight: '163 230 53',
    onPrimary:    '18 18 18',
    secondary:    '74 222 128',
    onSecondary:  '18 18 18',
    accent:       '101 163 13',
    gradient:     'linear-gradient(135deg, #84CC16, #4ADE80)',
  },
  bold: {
    primary:      '217 70 239',
    primaryLight: '232 121 249',
    onPrimary:    '255 255 255',
    secondary:    '239 68 68',
    onSecondary:  '255 255 255',
    accent:       '248 113 113',
    gradient:     'linear-gradient(135deg, #D946EF, #EF4444)',
  },
  slateCyan: {
    primary:      '148 163 184',
    primaryLight: '203 213 225',
    onPrimary:    '15 23 42',
    secondary:    '6 182 212',
    onSecondary:  '15 23 42',
    accent:       '34 211 238',
    gradient:     'linear-gradient(135deg, #64748B, #22D3EE)',
  },
  pastel: {
    primary:      '190 242 100',
    primaryLight: '217 249 157',
    onPrimary:    '22 22 22',
    secondary:    '134 239 172',
    onSecondary:  '22 22 22',
    accent:       '187 247 208',
    gradient:     'linear-gradient(135deg, #BEF264, #86EFAC)',
  },
}

/** Superficies siempre neutras (blanco/gris claro u oscuro); no dependen de la paleta de acento. */
function applyNeutralSurfaces(isDark: boolean): void {
  const el = document.documentElement
  if (isDark) {
    el.style.setProperty('--c-background', '17 17 17')
    el.style.setProperty('--c-surface', '17 17 17')
    el.style.setProperty('--c-surface-container-low', '21 21 21')
    el.style.setProperty('--c-surface-container', '26 26 26')
    el.style.setProperty('--c-surface-container-high', '32 32 32')
    el.style.setProperty('--c-surface-container-highest', '40 40 40')
    el.style.setProperty('--c-on-surface', '238 238 238')
    el.style.setProperty('--c-on-surface-variant', '160 160 160')
    el.style.setProperty('--c-outline-variant', '60 60 60')
    el.style.setProperty('--c-outline', '110 110 110')
    el.style.setProperty('--c-error', '255 110 132')
    el.style.setProperty('--c-sidebar', '22 22 22')
  } else {
    // Grises con R=G=B puros (sin matiz azul/violeta); si no, junto a un primary verde se percibe tinte.
    el.style.setProperty('--c-background', '255 255 255')
    el.style.setProperty('--c-surface', '255 255 255')
    el.style.setProperty('--c-surface-container-low', '250 250 250')
    el.style.setProperty('--c-surface-container', '245 245 245')
    el.style.setProperty('--c-surface-container-high', '237 237 237')
    el.style.setProperty('--c-surface-container-highest', '229 229 229')
    el.style.setProperty('--c-on-surface', '24 24 24')
    el.style.setProperty('--c-on-surface-variant', '82 82 82')
    el.style.setProperty('--c-outline-variant', '224 224 224')
    el.style.setProperty('--c-outline', '142 142 142')
    el.style.setProperty('--c-error', '215 51 87')
    el.style.setProperty('--c-sidebar', '22 22 22')
  }
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

  applyNeutralSurfaces(isDark)
}

const ALL_PALETTES: PaletteId[] = [
  'neonLime', 'fresh', 'futuristic', 'playful', 'cyber', 'natural', 'bold',
  'slateCyan', 'pastel',
]

function readPalette(): PaletteId {
  const stored = localStorage.getItem('app:palette')
  if (stored && ALL_PALETTES.includes(stored as PaletteId)) return stored as PaletteId
  return 'neonLime'
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
