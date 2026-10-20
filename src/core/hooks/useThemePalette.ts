import { useCallback, useSyncExternalStore } from 'react'
import { PRESETS, PRESET_LIST, type PresetId, type PresetVariant, type SurfaceTokens } from '../themes/presets'

/**
 * Paletas de acento. Cada una ocupa un matiz distinto del círculo cromático (sin
 * dos violetas ni tres verdes); las neutras van al final. El swatch de Ajustes se
 * pinta con estos mismos tokens, así que lo que se ve es lo que pinta la app.
 */
export type PaletteId =
  | 'setto'
  | 'celeste'
  | 'macos'
  | 'fresh'
  | 'natural'
  | 'neonLime'
  | 'amber'
  | 'orange'
  | 'playful'
  | 'bold'
  | 'slateCyan'
  | 'graphite'

export interface PaletteDef {
  id: PaletteId
  name: string
  label: string
}

export const PALETTES: PaletteDef[] = [
  { id: 'setto',     name: 'Violeta',   label: 'Violeta de marca' },
  { id: 'celeste',   name: 'Índigo',    label: 'Índigo con toques celeste y lila' },
  { id: 'macos',     name: 'Azul',      label: 'Azul sistema (macOS)' },
  { id: 'fresh',     name: 'Turquesa',  label: 'Turquesa y cian' },
  { id: 'natural',   name: 'Verde',     label: 'Verde esmeralda' },
  { id: 'neonLime',  name: 'Lima',      label: 'Lima neón' },
  { id: 'amber',     name: 'Ámbar',     label: 'Ámbar / mostaza' },
  { id: 'orange',    name: 'Naranja',   label: 'Naranja atardecer' },
  { id: 'playful',   name: 'Rosa',      label: 'Rosa frambuesa' },
  { id: 'bold',      name: 'Fucsia',    label: 'Fucsia / magenta' },
  { id: 'slateCyan', name: 'Pizarra',   label: 'Gris pizarra con cian' },
  { id: 'graphite',  name: 'Grafito',   label: 'Neutro / sobrio' },
]

/** Paletas retiradas por repetir matiz → la más parecida que sigue existiendo. */
const RETIRED: Record<string, PaletteId> = {
  cyber: 'setto',
  futuristic: 'celeste',
  pastel: 'natural',
}

export type PaletteTokens = {
  primary: string
  primaryLight: string
  onPrimary: string
  secondary: string
  onSecondary: string
  accent: string
  gradient: string
}

const LIGHT_TOKENS: Record<PaletteId, PaletteTokens> = {
  // Marca: violeta eléctrico como acento sólido (botones, selección); el degradé
  // del logo queda para marca, splash y detalles.
  setto: {
    primary:      '124 58 237',
    primaryLight: '160 110 250',
    onPrimary:    '255 255 255',
    secondary:    '168 85 247',
    onSecondary:  '255 255 255',
    accent:       '192 132 252',
    gradient:     'linear-gradient(120deg, #C9A7FF 0%, #A855F7 55%, #7C3AED 100%)',
  },
  // Índigo: punto medio del degradé celeste → lila; secondary = lila, accent = celeste.
  celeste: {
    primary:      '79 70 229',
    primaryLight: '129 140 248',
    onPrimary:    '255 255 255',
    secondary:    '147 97 240',
    onSecondary:  '255 255 255',
    accent:       '14 165 233',
    gradient:     'linear-gradient(135deg, #1EA7EE 0%, #6A72F2 55%, #A065F0 100%)',
  },
  macos: {
    primary:      '0 122 255',
    primaryLight: '64 156 255',
    onPrimary:    '255 255 255',
    secondary:    '88 86 214',
    onSecondary:  '255 255 255',
    accent:       '50 173 230',
    gradient:     'linear-gradient(180deg, #1A8CFF, #007AFF)',
  },
  fresh: {
    primary:      '13 148 136',
    primaryLight: '20 184 166',
    onPrimary:    '255 255 255',
    secondary:    '14 116 144',
    onSecondary:  '255 255 255',
    accent:       '45 212 191',
    gradient:     'linear-gradient(135deg, #2DD4BF, #0D9488 55%, #0E7490)',
  },
  natural: {
    primary:      '5 150 105',
    primaryLight: '16 185 129',
    onPrimary:    '255 255 255',
    secondary:    '21 128 61',
    onSecondary:  '255 255 255',
    accent:       '52 211 153',
    gradient:     'linear-gradient(135deg, #34D399, #059669 55%, #15803D)',
  },
  neonLime: {
    // En claro, el lima neón puro quema la vista como texto/ícono sobre blanco;
    // se oscurece a un verde lima legible y se reserva el tono flúor para acentos suaves.
    primary:      '77 124 15',
    primaryLight: '101 163 13',
    onPrimary:    '255 255 255',
    secondary:    '63 98 18',
    onSecondary:  '255 255 255',
    accent:       '163 230 53',
    gradient:     'linear-gradient(135deg, #A3E635, #65A30D 50%, #4D7C0F)',
  },
  amber: {
    primary:      '180 83 9',
    primaryLight: '217 119 6',
    onPrimary:    '255 255 255',
    secondary:    '161 98 7',
    onSecondary:  '255 255 255',
    accent:       '245 158 11',
    gradient:     'linear-gradient(135deg, #FBBF24, #D97706 55%, #B45309)',
  },
  orange: {
    primary:      '234 88 12',
    primaryLight: '249 115 22',
    onPrimary:    '255 255 255',
    secondary:    '220 38 38',
    onSecondary:  '255 255 255',
    accent:       '251 146 60',
    gradient:     'linear-gradient(135deg, #FB923C, #EA580C 55%, #DC2626)',
  },
  playful: {
    primary:      '225 29 72',
    primaryLight: '244 63 94',
    onPrimary:    '255 255 255',
    secondary:    '219 39 119',
    onSecondary:  '255 255 255',
    accent:       '251 113 133',
    gradient:     'linear-gradient(135deg, #FB7185, #E11D48 55%, #DB2777)',
  },
  bold: {
    primary:      '192 38 211',
    primaryLight: '217 70 239',
    onPrimary:    '255 255 255',
    secondary:    '147 51 234',
    onSecondary:  '255 255 255',
    accent:       '232 121 249',
    gradient:     'linear-gradient(135deg, #E879F9, #C026D3 55%, #9333EA)',
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
  graphite: {
    primary:      '99 99 104',
    primaryLight: '142 142 147',
    onPrimary:    '255 255 255',
    secondary:    '72 72 74',
    onSecondary:  '255 255 255',
    accent:       '0 122 255',
    gradient:     'linear-gradient(180deg, #7C7C81, #636368)',
  },
}

/** Dark theme: mismo matiz que en claro, más luminoso; texto oscuro sobre acentos claros. */
const DARK_TOKENS: Record<PaletteId, PaletteTokens> = {
  setto: {
    primary:      '157 108 255',
    primaryLight: '190 150 255',
    onPrimary:    '255 255 255',
    secondary:    '192 132 252',
    onSecondary:  '24 10 48',
    accent:       '216 180 254',
    gradient:     'linear-gradient(120deg, #D4B8FF 0%, #B07BFF 55%, #8B5CF6 100%)',
  },
  celeste: {
    primary:      '129 140 248',
    primaryLight: '165 180 252',
    onPrimary:    '15 15 50',
    secondary:    '192 132 252',
    onSecondary:  '24 10 48',
    accent:       '103 200 250',
    gradient:     'linear-gradient(135deg, #3FB6F5 0%, #7C83F6 55%, #B07CF6 100%)',
  },
  macos: {
    primary:      '10 132 255',
    primaryLight: '64 156 255',
    onPrimary:    '255 255 255',
    secondary:    '94 92 230',
    onSecondary:  '255 255 255',
    accent:       '100 210 255',
    gradient:     'linear-gradient(180deg, #2491FF, #0A84FF)',
  },
  fresh: {
    primary:      '45 212 191',
    primaryLight: '94 234 212',
    onPrimary:    '4 47 46',
    secondary:    '34 211 238',
    onSecondary:  '8 47 73',
    accent:       '153 246 228',
    gradient:     'linear-gradient(135deg, #5EEAD4, #2DD4BF 55%, #22D3EE)',
  },
  natural: {
    primary:      '52 211 153',
    primaryLight: '110 231 183',
    onPrimary:    '2 44 34',
    secondary:    '74 222 128',
    onSecondary:  '5 46 22',
    accent:       '167 243 208',
    gradient:     'linear-gradient(135deg, #6EE7B7, #34D399 55%, #4ADE80)',
  },
  neonLime: {
    primary:      '163 230 53',
    primaryLight: '190 242 100',
    onPrimary:    '15 23 15',
    secondary:    '132 204 22',
    onSecondary:  '15 23 15',
    accent:       '217 249 157',
    gradient:     'linear-gradient(135deg, #D9F99D, #A3E635 55%, #84CC16)',
  },
  amber: {
    primary:      '251 191 36',
    primaryLight: '252 211 77',
    onPrimary:    '45 25 0',
    secondary:    '245 158 11',
    onSecondary:  '45 25 0',
    accent:       '253 230 138',
    gradient:     'linear-gradient(135deg, #FDE68A, #FBBF24 55%, #F59E0B)',
  },
  orange: {
    primary:      '251 146 60',
    primaryLight: '253 186 116',
    onPrimary:    '50 18 0',
    secondary:    '248 113 113',
    onSecondary:  '60 10 10',
    accent:       '254 215 170',
    gradient:     'linear-gradient(135deg, #FDBA74, #FB923C 55%, #F87171)',
  },
  playful: {
    primary:      '251 113 133',
    primaryLight: '253 164 175',
    onPrimary:    '60 5 20',
    secondary:    '244 114 182',
    onSecondary:  '60 5 35',
    accent:       '254 205 211',
    gradient:     'linear-gradient(135deg, #FDA4AF, #FB7185 55%, #F472B6)',
  },
  bold: {
    primary:      '232 121 249',
    primaryLight: '240 171 252',
    onPrimary:    '50 5 60',
    secondary:    '192 132 252',
    onSecondary:  '24 10 48',
    accent:       '245 208 254',
    gradient:     'linear-gradient(135deg, #F0ABFC, #E879F9 55%, #C084FC)',
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
  graphite: {
    primary:      '152 152 157',
    primaryLight: '174 174 178',
    onPrimary:    '18 18 18',
    secondary:    '120 120 126',
    onSecondary:  '255 255 255',
    accent:       '10 132 255',
    gradient:     'linear-gradient(180deg, #A1A1A6, #98989D)',
  },
}

export function getPaletteTokens(id: PaletteId, isDark: boolean): PaletteTokens {
  return (isDark ? DARK_TOKENS : LIGHT_TOKENS)[id]
}

// ─── Colores de datos (gráficos, categorías) ─────────────────────────────────
// Primary + acento no alcanzan para distinguir 6-8 series (en casi todas las
// paletas son el mismo matiz). Se generan CHART_COUNT tonos rotando el matiz del
// primary por el ángulo áureo: arrancan en el color de la paleta y dos vecinos
// nunca quedan parecidos. Luminosidad/saturación fijas por tema para que todos
// tengan el mismo peso visual sobre la superficie.

export const CHART_COUNT = 8
const GOLDEN_ANGLE = 137.508

function rgbToHue(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  if (d === 0) return 220 // neutros (Grafito): arrancar en un azul frío
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  h *= 60
  return h < 0 ? h + 360 : h
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] :
    h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

function luminance([r, g, b]: [number, number, number]): number {
  const f = (v: number): number => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

/** CHART_COUNT colores como canales "r g b". El primero es el primary tal cual. */
export function chartColors(tokens: PaletteTokens, isDark: boolean): string[] {
  const [r, g, b] = tokens.primary.split(' ').map(Number) as [number, number, number]
  const base = rgbToHue(r, g, b)
  // Contraste mínimo 3:1 contra la superficie (blanco / gris oscuro): a igual L
  // un cian o un amarillo se ven mucho más claros que un azul, así que L se
  // ajusta por matiz hasta llegar al contraste.
  const surface = isDark ? luminance([32, 32, 35]) : 1
  const s = isDark ? 0.72 : 0.7
  const out = [tokens.primary]
  for (let i = 1; i < CHART_COUNT; i++) {
    const h = (base + i * GOLDEN_ANGLE) % 360
    let l = isDark ? 0.62 : 0.52
    let rgb = hslToRgb(h, s, l)
    for (let n = 0; n < 20; n++) {
      const y = luminance(rgb)
      const ratio = isDark ? (y + 0.05) / (surface + 0.05) : (surface + 0.05) / (y + 0.05)
      if (ratio >= 3) break
      l += isDark ? 0.02 : -0.02
      rgb = hslToRgb(h, s, l)
    }
    out.push(rgb.join(' '))
  }
  return out
}

// ─── Apariencia: tema completo + estilos de fondo ────────────────────────────
// "setto" usa la paleta de acento elegida sobre superficies propias (neutras o
// teñidas con el acento; oscuro gris / negro / atenuado). Los demás temas
// (Nord, Catppuccin…) traen acento y superficies propios: ver themes/presets.ts.

export type SurfaceStyle = 'neutral' | 'tinted'
export type DarkStyle = 'gray' | 'black' | 'dim'

export interface Appearance {
  preset: PresetId
  palette: PaletteId
  surface: SurfaceStyle
  darkStyle: DarkStyle
}

export const DARK_STYLES: { id: DarkStyle; name: string }[] = [
  { id: 'gray', name: 'Gris' },
  { id: 'black', name: 'Negro' },
  { id: 'dim', name: 'Atenuado' },
]

/** Superficies del tema Setto. Grises puros; en oscuro, tres intensidades. */
export function settoSurfaces(isDark: boolean, darkStyle: DarkStyle): SurfaceTokens {
  if (!isDark) {
    return {
      background: '250 250 251', surface: '255 255 255', surfaceLow: '250 250 250', surfaceContainer: '243 243 244',
      surfaceHigh: '235 235 237', surfaceHighest: '225 225 228', onSurface: '28 28 30', onSurfaceVariant: '112 112 118',
      outlineVariant: '232 232 234', outline: '161 161 168', error: '229 72 77', warning: '230 140 20', success: '22 163 120',
      sidebar: '244 245 247', topbar: '35 35 39',
    }
  }
  const status = { error: '255 99 99', warning: '255 176 64', success: '52 211 153' }
  if (darkStyle === 'black') {
    // Negro puro (OLED): el lienzo es #000 y las tarjetas apenas se separan.
    return {
      background: '0 0 0', surface: '15 15 17', surfaceLow: '19 19 21', surfaceContainer: '25 25 28',
      surfaceHigh: '34 34 38', surfaceHighest: '46 46 51', onSurface: '240 240 241', onSurfaceVariant: '150 150 156',
      outlineVariant: '38 38 42', outline: '96 96 102', ...status, sidebar: '0 0 0', topbar: '0 0 0',
    }
  }
  if (darkStyle === 'dim') {
    // Atenuado: gris pizarra más claro, menos contraste para sesiones largas.
    return {
      background: '44 46 53', surface: '48 50 57', surfaceLow: '52 55 62', surfaceContainer: '58 61 69',
      surfaceHigh: '68 71 80', surfaceHighest: '82 85 95', onSurface: '228 230 235', onSurfaceVariant: '162 166 177',
      outlineVariant: '66 69 78', outline: '112 116 127', ...status, sidebar: '36 38 44', topbar: '30 32 37',
    }
  }
  return {
    background: '26 26 29', surface: '32 32 35', surfaceLow: '37 37 40', surfaceContainer: '42 42 46',
    surfaceHigh: '52 52 56', surfaceHighest: '64 64 69', onSurface: '240 240 241', onSurfaceVariant: '155 155 161',
    outlineVariant: '54 54 58', outline: '100 100 106', ...status, sidebar: '20 20 23', topbar: '17 17 19',
  }
}

/** Mezcla `amount` del acento en un color de superficie (fondos "teñidos"). */
function tint(rgb: string, accent: string, amount: number): string {
  const a = rgb.split(' ').map(Number)
  const b = accent.split(' ').map(Number)
  return a.map((v, i) => Math.round(v * (1 - amount) + b[i]! * amount)).join(' ')
}

export function tintSurfaces(s: SurfaceTokens, accent: string, isDark: boolean): SurfaceTokens {
  // Muy poco: que se note el matiz sin perder el gris. Los textos casi no se tocan.
  const k = isDark ? 0.07 : 0.045
  const t = (c: string, f = 1): string => tint(c, accent, k * f)
  return {
    ...s,
    background: t(s.background, 1.4), surface: t(s.surface, s.surface === '255 255 255' ? 0.35 : 1),
    surfaceLow: t(s.surfaceLow), surfaceContainer: t(s.surfaceContainer, 1.2), surfaceHigh: t(s.surfaceHigh, 1.2),
    surfaceHighest: t(s.surfaceHighest, 1.2), onSurfaceVariant: t(s.onSurfaceVariant, 0.6),
    outlineVariant: t(s.outlineVariant, 1.2), outline: t(s.outline, 0.8),
    sidebar: t(s.sidebar, s.sidebar === '255 255 255' ? 0.6 : 1.2), topbar: t(s.topbar, 1.5),
  }
}

/** Acento + superficies efectivos de una apariencia en claro u oscuro. */
export function resolveAppearance(a: Appearance, isDark: boolean): PresetVariant {
  if (a.preset !== 'setto') return PRESETS[a.preset][isDark ? 'dark' : 'light']
  const accent = getPaletteTokens(a.palette, isDark)
  const base = settoSurfaces(isDark, a.darkStyle)
  return { accent, surfaces: a.surface === 'tinted' ? tintSurfaces(base, accent.primary, isDark) : base }
}

const SURFACE_VARS: [keyof SurfaceTokens, string][] = [
  ['background', '--c-background'], ['surface', '--c-surface'], ['surfaceLow', '--c-surface-container-low'],
  ['surfaceContainer', '--c-surface-container'], ['surfaceHigh', '--c-surface-container-high'],
  ['surfaceHighest', '--c-surface-container-highest'], ['onSurface', '--c-on-surface'],
  ['onSurfaceVariant', '--c-on-surface-variant'], ['outlineVariant', '--c-outline-variant'], ['outline', '--c-outline'],
  ['error', '--c-error'], ['warning', '--c-warning'], ['success', '--c-success'], ['sidebar', '--c-sidebar'],
  ['topbar', '--c-topbar'], ['sidebar', '--c-chrome'],
]

function applyAppearance(a: Appearance): void {
  const el = document.documentElement
  const isDark = el.classList.contains('dark')
  const { accent, surfaces } = resolveAppearance(a, isDark)

  el.setAttribute('data-palette', a.palette)
  el.setAttribute('data-theme-preset', a.preset)

  el.style.setProperty('--c-primary',       accent.primary)
  el.style.setProperty('--c-primary-light', accent.primaryLight)
  el.style.setProperty('--c-on-primary',    accent.onPrimary)
  el.style.setProperty('--c-secondary',     accent.secondary)
  el.style.setProperty('--c-on-secondary',  accent.onSecondary)
  el.style.setProperty('--c-accent',        accent.accent)
  el.style.setProperty('--gradient-brand',  accent.gradient)
  for (const [k, v] of SURFACE_VARS) el.style.setProperty(v, surfaces[k])
  chartColors(accent, isDark).forEach((c, i) => el.style.setProperty(`--c-chart-${i + 1}`, c))
}

// ─── Transición suave al cambiar de tema ─────────────────────────────────────
// Durante ~250 ms todos los colores transicionan (clase en <html>, ver globals.css).

let transitionTimer: ReturnType<typeof setTimeout> | null = null
function withColorTransition(fn: () => void): void {
  const el = document.documentElement
  el.classList.add('theme-transition')
  fn()
  if (transitionTimer) clearTimeout(transitionTimer)
  transitionTimer = setTimeout(() => el.classList.remove('theme-transition'), 260)
}

// ─── Persistencia ────────────────────────────────────────────────────────────

const ALL_PALETTES = PALETTES.map((p) => p.id)
const PRESET_IDS = PRESET_LIST.map((p) => p.id)

/** Rediseño v4 (SaaS + logo nuevo): la primera vez se pasa a la paleta Setto. */
const DESIGN_V4_KEY = 'app:design-v5-palette'
const PALETTE_KEY = 'app:palette'
const APPEARANCE_KEY = 'app:appearance'
const DEFAULT_PALETTE: PaletteId = 'setto'
const DEFAULT_APPEARANCE: Appearance = { preset: 'setto', palette: DEFAULT_PALETTE, surface: 'neutral', darkStyle: 'gray' }

function readPalette(): PaletteId {
  try {
    if (!localStorage.getItem(DESIGN_V4_KEY)) {
      localStorage.setItem(DESIGN_V4_KEY, '1')
      localStorage.setItem(PALETTE_KEY, DEFAULT_PALETTE)
      return DEFAULT_PALETTE
    }
    const stored = localStorage.getItem(PALETTE_KEY) ?? ''
    if (ALL_PALETTES.includes(stored as PaletteId)) return stored as PaletteId
    if (stored in RETIRED) {
      localStorage.setItem(PALETTE_KEY, RETIRED[stored]!)
      return RETIRED[stored]!
    }
  } catch { /* storage unavailable */ }
  return DEFAULT_PALETTE
}

function readAppearance(): Appearance {
  const palette = readPalette()
  try {
    const raw = JSON.parse(localStorage.getItem(APPEARANCE_KEY) ?? '{}') as Partial<Appearance>
    return {
      preset: PRESET_IDS.includes(raw.preset as PresetId) ? (raw.preset as PresetId) : 'setto',
      palette,
      surface: raw.surface === 'tinted' ? 'tinted' : 'neutral',
      darkStyle: raw.darkStyle === 'black' || raw.darkStyle === 'dim' ? raw.darkStyle : 'gray',
    }
  } catch {
    return { ...DEFAULT_APPEARANCE, palette }
  }
}

function writeAppearance(a: Appearance): void {
  try {
    localStorage.setItem(PALETTE_KEY, a.palette)
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify({ preset: a.preset, surface: a.surface, darkStyle: a.darkStyle }))
  } catch { /* ignore */ }
}

// ─── Store único ─────────────────────────────────────────────────────────────
// Un solo valor y un solo observer (antes cada componente tenía su propio estado
// y al alternar claro/oscuro se reaplicaba una paleta vieja).

let current: Appearance | null = null
/** Apariencia de vista previa (hover en Ajustes): se pinta pero no se guarda. */
let preview: Appearance | null = null
const listeners = new Set<() => void>()
let observing = false

function getCurrent(): Appearance {
  if (current === null) current = readAppearance()
  return current
}

const emit = (): void => listeners.forEach((l) => l())

function ensureObserver(): void {
  if (observing) return
  observing = true
  // Al cambiar la clase `dark` hay que pasar a los tokens del otro tema.
  let wasDark = document.documentElement.classList.contains('dark')
  new MutationObserver(() => {
    const isDark = document.documentElement.classList.contains('dark')
    // Sólo con un cambio real de claro/oscuro se anima (otras clases no tocan colores).
    if (isDark === wasDark) return
    wasDark = isDark
    withColorTransition(() => applyAppearance(preview ?? getCurrent()))
    emit()
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setAppearance(patch: Partial<Appearance>): void {
  current = { ...getCurrent(), ...patch }
  preview = null
  writeAppearance(current)
  withColorTransition(() => applyAppearance(current!))
  emit()
}

/** Pinta `patch` sobre la apariencia actual sin guardarla; `null` vuelve a la guardada. */
export function previewAppearance(patch: Partial<Appearance> | null): void {
  preview = patch ? { ...getCurrent(), ...patch } : null
  withColorTransition(() => applyAppearance(preview ?? getCurrent()))
}

/** Elegir un color de acento implica el tema Setto (el único que usa la paleta). */
export function setPalette(id: PaletteId): void {
  setAppearance({ palette: id, preset: 'setto' })
}

export function useAppearance(): Appearance {
  return useSyncExternalStore(subscribe, getCurrent)
}

export function useThemePalette() {
  const palette = useSyncExternalStore(subscribe, () => getCurrent().palette)
  const set = useCallback((id: PaletteId) => setPalette(id), [])
  return { palette, setPalette: set }
}

/** Temas de Editor/Terminal del tema activo (null = Setto: cada módulo usa el suyo). */
export function presetCodeThemes(a: Appearance, isDark: boolean): { editor: string; terminal: string } | null {
  if (a.preset === 'setto') return null
  const p = PRESETS[a.preset]
  const v = isDark ? 'dark' : 'light'
  return { editor: p.editor[v], terminal: p.terminal[v] }
}

/** Aplica la apariencia guardada antes del primer pintado (main.tsx) y deja el observer activo. */
export function applyPaletteImmediate(): void {
  applyAppearance(getCurrent())
  ensureObserver()
}

/** Ventanas que viven aparte (selector de snippets): re-leer lo guardado por la principal. */
export function reloadAppearanceFromStorage(): void {
  current = readAppearance()
  applyAppearance(current)
  emit()
}
