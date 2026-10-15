import { FileCode2, FolderOpen, Images } from 'lucide-react'
import type { SearchItem, SearchProvider } from './search'
import { actionsFor } from './clip-actions'
import { detectKind, findTicket, type ClipKind } from './clip-utils'

/**
 * Ctrl+K entiende lo que pegaste o escribiste: una ruta (abrir en el editor o en
 * el Explorador), un ticket (todo lo del ticket, abrir en Jira), un link, JSON,
 * JWT, timestamp… Reusa las acciones del portapapeles (clip-actions) y va primero
 * porque sólo aparece cuando el texto es claramente uno de esos tipos.
 */
const KINDS_WITH_ACTIONS: ClipKind[] = ['url', 'json', 'jwt', 'timestamp']

const stripQuotes = (s: string): string => s.trim().replace(/^"(.*)"$/, '$1')

export const commandsSearchProvider: SearchProvider = {
  id: 'commands',
  group: 'Acciones con lo que escribiste',
  order: -1,
  search(query) {
    const text = stripQuotes(query)
    if (text.length < 3) return []
    const kind = detectKind(text)
    const items: SearchItem[] = []

    if (kind === 'path') {
      const isFile = /\.[a-z0-9]{1,8}$/i.test(text.replace(/[\\/]+$/, ''))
      if (isFile) {
        items.push({
          id: 'commands:open-editor', title: 'Abrir en el editor', subtitle: text, icon: FileCode2, score: 100,
          run: ({ dispatch }) => dispatch({ type: 'OPEN_IN_EDITOR', path: text }),
        })
      }
      items.push({
        id: 'commands:reveal', title: isFile ? 'Mostrar en el Explorador' : 'Abrir la carpeta', subtitle: text, icon: FolderOpen, score: 90,
        run: async ({ notify }) => {
          try { await window.api.invoke('clipboard:open-path', text) } catch (e) {
            notify((e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 'error')
          }
        },
      })
      return items
    }

    const ticket = kind === 'ticket' ? text.trim() : findTicket(text)
    if (ticket) {
      items.push({
        id: `commands:ticket:${ticket}`, title: `Todo lo de ${ticket}`, subtitle: 'Capturas, copiados y comentario de evidencia para Jira', icon: Images, score: 100,
        run: ({ dispatch }) => dispatch({ type: 'OPEN_WITH_INTENT', pluginId: 'captures', action: 'ticket', payload: ticket }),
      })
    }

    if (ticket || KINDS_WITH_ACTIONS.includes(kind)) {
      const actions = actionsFor(ticket && kind !== 'url' ? 'ticket' : kind, ticket && kind !== 'url' ? ticket : text)
        .filter((a) => a.id !== 'captures')   // "Ver capturas" ya está arriba como "Todo lo de…"
      for (const a of actions) {
        items.push({
          id: `commands:${a.id}`, title: a.label, subtitle: kind === 'url' || !ticket ? text.slice(0, 120) : undefined, icon: a.icon, score: 80,
          run: async ({ dispatch, notify }) => {
            try {
              await a.run(text, (o) => dispatch(o.action
                ? { type: 'OPEN_WITH_INTENT', pluginId: o.pluginId, action: o.action, payload: o.payload }
                : { type: 'OPEN_TAB', pluginId: o.pluginId }))
            } catch (e) {
              notify(e instanceof Error ? e.message : String(e), 'error')
            }
          },
        })
      }
    }
    return items
  },
}
