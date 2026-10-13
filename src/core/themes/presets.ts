import type { PaletteTokens } from '../hooks/useThemePalette'

/**
 * Temas completos: cada uno define acento + superficies (fondo, paneles, texto,
 * bordes) para claro y oscuro, y qué tema usan el Editor y la Terminal cuando
 * están en "sigue a la app". "setto" es el tema propio: su acento sale de la
 * paleta elegida y sus superficies se arman con los estilos de fondo/oscuro.
 *
 * Colores como canales "r g b" (los tokens --c-* de globals.css / tailwind).
 */

export type PresetId = 'setto' | 'nord' | 'catppuccin' | 'tokyo-night' | 'github' | 'dracula'

export interface SurfaceTokens {
  background: string
  surface: string
  surfaceLow: string
  surfaceContainer: string
  surfaceHigh: string
  surfaceHighest: string
  onSurface: string
  onSurfaceVariant: string
  outlineVariant: string
  outline: string
  error: string
  warning: string
  success: string
  sidebar: string
  topbar: string
}

export interface PresetVariant { accent: PaletteTokens; surfaces: SurfaceTokens }

export interface ThemePreset {
  id: PresetId
  name: string
  description: string
  light: PresetVariant
  dark: PresetVariant
  /** Familia de tema del Editor (themes/registry.ts) por variante. */
  editor: { light: string; dark: string }
  /** Tema de la Terminal (terminal/themes.ts) por variante. */
  terminal: { light: string; dark: string }
}

const S = (
  background: string, surface: string, surfaceLow: string, surfaceContainer: string, surfaceHigh: string, surfaceHighest: string,
  onSurface: string, onSurfaceVariant: string, outlineVariant: string, outline: string,
  error: string, warning: string, success: string, sidebar: string, topbar: string,
): SurfaceTokens => ({
  background, surface, surfaceLow, surfaceContainer, surfaceHigh, surfaceHighest,
  onSurface, onSurfaceVariant, outlineVariant, outline, error, warning, success, sidebar, topbar,
})

const A = (primary: string, primaryLight: string, onPrimary: string, secondary: string, accent: string, gradient: string, onSecondary = onPrimary): PaletteTokens =>
  ({ primary, primaryLight, onPrimary, secondary, onSecondary, accent, gradient })

/** Presets con superficies propias. "setto" se arma en tiempo de ejecución (useThemePalette.ts). */
export const PRESETS: Record<Exclude<PresetId, 'setto'>, ThemePreset> = {
  nord: {
    id: 'nord', name: 'Nord', description: 'Ártico, azules apagados',
    light: {
      accent: A('94 129 172', '129 161 193', '255 255 255', '76 106 146', '136 192 208', 'linear-gradient(135deg, #88C0D0, #5E81AC)'),
      surfaces: S('229 233 240', '242 244 248', '238 241 246', '229 233 240', '216 222 233', '200 208 222',
        '46 52 64', '76 86 106', '216 222 233', '144 154 174', '191 97 106', '208 135 112', '120 150 95', '236 239 244', '46 52 64'),
    },
    dark: {
      accent: A('136 192 208', '163 210 222', '46 52 64', '129 161 193', '143 188 187', 'linear-gradient(135deg, #8FBCBB, #88C0D0 55%, #81A1C1)'),
      surfaces: S('36 41 51', '46 52 64', '50 56 69', '59 66 82', '67 76 94', '76 86 106',
        '236 239 244', '163 172 189', '67 76 94', '97 110 136', '191 97 106', '235 203 139', '163 190 140', '41 46 57', '30 34 42'),
    },
    editor: { light: 'setto', dark: 'nord' },
    terminal: { light: 'nord-light', dark: 'nord' },
  },
  catppuccin: {
    id: 'catppuccin', name: 'Catppuccin', description: 'Pastel cálido (Latte / Mocha)',
    light: {
      accent: A('136 57 239', '114 135 253', '255 255 255', '234 118 203', '30 102 245', 'linear-gradient(135deg, #EA76CB, #8839EF 55%, #1E66F5)'),
      surfaces: S('230 233 239', '245 246 249', '239 241 245', '230 233 239', '220 224 232', '204 208 218',
        '76 79 105', '108 111 133', '220 224 232', '156 160 176', '210 15 57', '254 100 11', '64 160 43', '239 241 245', '76 79 105'),
    },
    dark: {
      accent: A('203 166 247', '180 190 254', '30 30 46', '245 194 231', '137 180 250', 'linear-gradient(135deg, #F5C2E7, #CBA6F7 55%, #89B4FA)'),
      surfaces: S('24 24 37', '30 30 46', '36 36 54', '49 50 68', '69 71 90', '88 91 112',
        '205 214 244', '166 173 200', '49 50 68', '108 112 134', '243 139 168', '250 179 135', '166 227 161', '24 24 37', '17 17 27'),
    },
    editor: { light: 'catppuccin', dark: 'catppuccin' },
    terminal: { light: 'catppuccin-latte', dark: 'catppuccin-mocha' },
  },
  'tokyo-night': {
    id: 'tokyo-night', name: 'Tokyo Night', description: 'Noche azul con neones suaves',
    light: {
      accent: A('46 125 233', '85 150 240', '255 255 255', '152 84 241', '0 113 151', 'linear-gradient(135deg, #2E7DE9, #9854F1)'),
      surfaces: S('208 213 227', '233 233 237', '225 226 231', '216 219 229', '196 200 218', '180 185 208',
        '52 59 88', '97 114 176', '196 200 218', '132 140 181', '245 42 101', '140 108 62', '88 117 57', '225 226 231', '52 59 88'),
    },
    dark: {
      accent: A('122 162 247', '157 186 250', '26 27 38', '187 154 247', '125 207 255', 'linear-gradient(135deg, #7DCFFF, #7AA2F7 55%, #BB9AF7)'),
      surfaces: S('22 22 30', '26 27 38', '31 32 46', '36 40 59', '41 46 66', '59 66 97',
        '192 202 245', '154 165 206', '41 46 66', '86 95 137', '247 118 142', '224 175 104', '158 206 106', '22 22 30', '16 16 22'),
    },
    editor: { light: 'tokyo-night', dark: 'tokyo-night' },
    terminal: { light: 'tokyo-night-day', dark: 'tokyo-night' },
  },
  github: {
    id: 'github', name: 'GitHub', description: 'Sobrio, el de todos los días',
    light: {
      accent: A('9 105 218', '33 139 255', '255 255 255', '130 80 223', '27 124 131', 'linear-gradient(135deg, #218BFF, #0969DA)'),
      surfaces: S('246 248 250', '255 255 255', '250 251 252', '246 248 250', '234 238 242', '208 215 222',
        '31 35 40', '101 109 118', '216 222 228', '140 149 159', '207 34 46', '154 103 0', '26 127 55', '246 248 250', '36 41 47'),
    },
    dark: {
      accent: A('31 111 235', '88 166 255', '255 255 255', '163 113 247', '57 197 207', 'linear-gradient(135deg, #58A6FF, #1F6FEB)'),
      surfaces: S('1 4 9', '13 17 23', '18 22 29', '22 27 34', '33 38 45', '48 54 61',
        '230 237 243', '132 141 151', '48 54 61', '110 118 129', '248 81 73', '210 153 34', '63 185 80', '1 4 9', '1 4 9'),
    },
    editor: { light: 'github', dark: 'github' },
    terminal: { light: 'github-light', dark: 'github-dark' },
  },
  dracula: {
    id: 'dracula', name: 'Dracula', description: 'Violeta y rosa sobre gris oscuro',
    light: {
      // "Alucard", la variante clara oficial
      accent: A('100 74 201', '140 110 230', '255 255 255', '163 20 77', '3 106 150', 'linear-gradient(135deg, #644AC9, #A3144D)'),
      surfaces: S('245 241 222', '255 251 235', '250 246 228', '242 238 220', '230 226 210', '207 207 222',
        '31 31 31', '99 93 151', '228 224 205', '160 156 180', '203 58 42', '163 77 20', '20 113 10', '250 246 228', '40 42 54'),
    },
    dark: {
      accent: A('189 147 249', '214 172 255', '40 42 54', '255 121 198', '139 233 253', 'linear-gradient(135deg, #FF79C6, #BD93F9 55%, #8BE9FD)'),
      surfaces: S('33 34 44', '40 42 54', '45 47 61', '52 55 70', '68 71 90', '85 89 112',
        '248 248 242', '176 182 208', '60 63 80', '98 114 164', '255 85 85', '255 184 108', '80 250 123', '33 34 44', '25 26 33'),
    },
    editor: { light: 'setto', dark: 'dracula' },
    terminal: { light: 'light', dark: 'dracula' },
  },
}

export const PRESET_LIST: { id: PresetId; name: string; description: string }[] = [
  { id: 'setto', name: 'Setto', description: 'Tu color de acento sobre grises' },
  ...Object.values(PRESETS).map(({ id, name, description }) => ({ id, name, description })),
]
