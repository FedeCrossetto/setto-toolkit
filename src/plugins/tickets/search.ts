import { Ticket } from 'lucide-react'
import type { SearchItem, SearchProvider } from '../../core/search'
import { normalizeKey, type TicketSummary } from './logic'

const open = (key: string): SearchItem['run'] => ({ dispatch }) =>
  dispatch({ type: 'OPEN_WITH_INTENT', pluginId: 'tickets', action: 'open', payload: key })

/**
 * Ctrl+K: escribir una clave (WIGOS-132764) abre su página en Tickets aunque no
 * haya nada todavía; un prefijo o número parcial lista los tickets conocidos.
 */
export const ticketsSearchProvider: SearchProvider = {
  id: 'tickets',
  group: 'Tickets',
  pluginId: 'tickets',
  order: -0.5,
  async search(query) {
    const exact = normalizeKey(query)
    const items: SearchItem[] = []
    if (exact) {
      items.push({ id: `tickets:open:${exact}`, title: `Abrir ${exact}`, subtitle: 'Página del ticket: capturas, notas, snippets, copiados y archivos', icon: Ticket, score: 120, run: open(exact) })
    }
    const q = query.trim().toLowerCase()
    if (q.length < 3 || !/\d|-/.test(q)) return items
    let list: TicketSummary[] = []
    try { list = await window.api.invoke<TicketSummary[]>('tickets:list') } catch { return items }
    for (const t of list.filter((x) => x.key !== exact && (x.key.toLowerCase().includes(q) || (x.title ?? '').toLowerCase().includes(q))).slice(0, 6)) {
      items.push({ id: `tickets:open:${t.key}`, title: t.key, subtitle: t.title ?? `${t.total} referencia${t.total === 1 ? '' : 's'}`, icon: Ticket, score: 60, run: open(t.key) })
    }
    return items
  },
}
