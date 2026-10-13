import { createElement } from 'react'
import {
  CalendarDays, Code2, Keyboard, Moon, NotebookPen, Settings, Sun, Wallet, Zap,
} from 'lucide-react'
import { allPlugins } from './plugin-registry'
import { PluginIcon } from './pluginIcons'
import { scoreMatch } from './palette-logic'
import { setExplicitTheme } from './themeMode'
import type { SearchItem, SearchProvider } from './search'
import type { IconComponent, PluginManifest, Theme } from './types'

/** Lucide-compatible icon component for a plugin manifest. */
function pluginIconComponent(plugin: PluginManifest): IconComponent {
  return (props) => createElement(PluginIcon, { icon: plugin.icon, size: props.size, className: props.className, style: props.style })
}

/** "Módulos": enabled plugins only. */
export function modulesProvider(disabled: string[]): SearchProvider {
  return {
    id: 'builtin-modules',
    group: 'Módulos',
    search: (query) =>
      allPlugins
        .filter((p) => !disabled.includes(p.id))
        .map((p): SearchItem | null => {
          const score = scoreMatch(query, p.name, p.description, ...(p.keywords ?? []))
          if (score < 0) return null
          return {
            id: `module:${p.id}`,
            title: p.name,
            subtitle: p.description,
            icon: pluginIconComponent(p),
            hint: 'Módulo',
            score,
            run: (ctx) => ctx.dispatch({ type: 'OPEN_TAB', pluginId: p.id }),
          }
        })
        .filter((i): i is SearchItem => i !== null),
  }
}

interface ActionDef {
  id: string
  title: string
  keywords: string
  icon: IconComponent
  hint?: string
  /** Hidden when this plugin is disabled */
  pluginId?: string
  run: SearchItem['run']
}

/** "Acciones": quick commands. `theme` decides the label of the theme toggle. */
export function actionsProvider(disabled: string[], theme: Theme): SearchProvider {
  const actions: ActionDef[] = [
    {
      id: 'new-note', title: 'Nueva nota', keywords: 'crear nota apunte escribir', icon: NotebookPen, pluginId: 'notes',
      run: (ctx) => ctx.dispatch({ type: 'OPEN_WITH_INTENT', pluginId: 'notes', action: 'new', payload: {} }),
    },
    {
      id: 'today-note', title: 'Nota de hoy', keywords: 'diario hoy daily', icon: CalendarDays, pluginId: 'notes',
      run: (ctx) => ctx.dispatch({ type: 'OPEN_WITH_INTENT', pluginId: 'notes', action: 'today' }),
    },
    {
      id: 'new-expense', title: 'Nuevo gasto', keywords: 'gasto pago plata registrar agregar', icon: Wallet, pluginId: 'gastos',
      run: (ctx) => ctx.dispatch({ type: 'OPEN_WITH_INTENT', pluginId: 'gastos', action: 'quick-add', payload: {} }),
    },
    {
      id: 'new-snippet', title: 'Nuevo snippet', keywords: 'script codigo comando crear', icon: Code2, pluginId: 'snippets',
      run: (ctx) => ctx.dispatch({ type: 'OPEN_WITH_INTENT', pluginId: 'snippets', action: 'new', payload: {} }),
    },
    {
      id: 'quick-capture', title: 'Captura rápida', keywords: 'capturar anotar rapido', icon: Zap, hint: 'Ctrl+Shift+Espacio',
      run: () => { window.dispatchEvent(new CustomEvent('setto:quick-capture')) },
    },
    theme === 'dark'
      ? {
          id: 'theme-light', title: 'Cambiar a tema claro', keywords: 'tema apariencia claro light modo', icon: Sun,
          run: (ctx) => setExplicitTheme('light', ctx.dispatch),
        }
      : {
          id: 'theme-dark', title: 'Cambiar a tema oscuro', keywords: 'tema apariencia oscuro dark modo', icon: Moon,
          run: (ctx) => setExplicitTheme('dark', ctx.dispatch),
        },
    {
      id: 'shortcuts', title: 'Atajos de teclado', keywords: 'ayuda teclas shortcuts', icon: Keyboard, hint: 'F1',
      run: (ctx) => ctx.dispatch({ type: 'OPEN_KEYBOARD_SHORTCUTS' }),
    },
    {
      id: 'settings', title: 'Ajustes', keywords: 'preferencias configuracion opciones', icon: Settings,
      run: (ctx) => ctx.dispatch({ type: 'OPEN_TAB', pluginId: 'settings' }),
    },
  ]

  return {
    id: 'builtin-actions',
    group: 'Acciones',
    search: (query) =>
      actions
        .filter((a) => !a.pluginId || !disabled.includes(a.pluginId))
        .map((a): SearchItem | null => {
          const score = scoreMatch(query, a.title, a.keywords)
          if (score < 0) return null
          return { id: `action:${a.id}`, title: a.title, icon: a.icon, hint: a.hint, score, run: a.run }
        })
        .filter((i): i is SearchItem => i !== null),
  }
}
