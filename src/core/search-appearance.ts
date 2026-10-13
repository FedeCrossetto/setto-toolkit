import { Moon, Palette, Sparkles } from 'lucide-react'
import { scoreMatch } from './palette-logic'
import { DARK_STYLES, PALETTES, setAppearance } from './hooks/useThemePalette'
import { PRESET_LIST } from './themes/presets'
import type { SearchItem, SearchProvider } from './search'

/**
 * Ctrl+K → "Apariencia": cambiar de tema, color de acento, estilo del modo
 * oscuro o fondos sin ir a Ajustes ("tema nord", "color verde", "oscuro negro").
 * Sólo aparece al escribir, para no llenar la paleta vacía.
 */
interface Entry { id: string; title: string; keywords: string; hint?: string; icon: SearchItem['icon']; run: () => void }

function entries(): Entry[] {
  return [
    ...PRESET_LIST.map((p): Entry => ({
      id: `preset:${p.id}`, title: `Tema: ${p.name}`, keywords: `tema theme apariencia ${p.name} ${p.description}`,
      hint: p.description, icon: Sparkles, run: () => setAppearance({ preset: p.id }),
    })),
    ...PALETTES.map((p): Entry => ({
      id: `palette:${p.id}`, title: `Color: ${p.name}`, keywords: `color acento accent paleta ${p.name} ${p.label}`,
      icon: Palette, run: () => setAppearance({ preset: 'setto', palette: p.id }),
    })),
    ...DARK_STYLES.map((d): Entry => ({
      id: `dark:${d.id}`, title: `Modo oscuro: ${d.name}`, keywords: `oscuro dark modo negro oled gris atenuado dim ${d.name}`,
      icon: Moon, run: () => setAppearance({ preset: 'setto', darkStyle: d.id }),
    })),
    { id: 'surface:tinted', title: 'Fondos teñidos con el color', keywords: 'fondos superficies teñidos tinte color',
      icon: Palette, run: () => setAppearance({ preset: 'setto', surface: 'tinted' }) },
    { id: 'surface:neutral', title: 'Fondos neutros (grises)', keywords: 'fondos superficies neutros grises',
      icon: Palette, run: () => setAppearance({ preset: 'setto', surface: 'neutral' }) },
  ]
}

export const appearanceSearchProvider: SearchProvider = {
  id: 'appearance',
  group: 'Apariencia',
  // Justo después de Módulos/Acciones: si no, "Nuevo gasto…" (que acepta cualquier
  // texto) queda primero y se lleva el Enter.
  order: 2,
  search(query) {
    if (query.length < 2) return []
    return entries()
      .map((e): SearchItem | null => {
        const score = scoreMatch(query, e.title, e.keywords)
        if (score < 0) return null
        return {
          id: `appearance:${e.id}`, title: e.title, subtitle: e.hint, icon: e.icon, score, hint: 'Aplicar',
          run: (ctx) => { e.run(); ctx.notify(`${e.title}`, 'success') },
        }
      })
      .filter((i): i is SearchItem => i !== null)
  },
}
