import { Images } from 'lucide-react'
import type { SearchItem, SearchProvider } from '../../core/search'
import type { CaptureQueryResult } from './types'

const BROWSE = /^(capturas?|recortes?|screenshots?)$/i

/**
 * Ctrl+K: "capturas" lista las últimas; cualquier búsqueda (3+ letras) encuentra
 * capturas por el texto que tienen adentro, ticket, app o título. Enter copia la imagen.
 * La búsqueda la hace main (no viaja el índice entero).
 */
export const capturesSearchProvider: SearchProvider = {
  id: 'captures',
  group: 'Capturas',
  pluginId: 'captures',
  async search(query) {
    const browse = BROWSE.test(query)
    if (!browse && query.length < 3) return []
    let res: CaptureQueryResult
    try {
      res = await window.api.invoke<CaptureQueryResult>('captures:query', { text: browse ? '' : query, limit: browse ? 6 : 4 })
    } catch { return [] }
    return res.items.map((c, i): SearchItem => ({
      id: `captures:${c.id}`,
      title: c.title,
      subtitle: [c.ticket, c.app, new Date(c.createdAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })].filter(Boolean).join(' · '),
      icon: Images,
      hint: 'Enter copia',
      score: browse ? 100 - i : 0,
      run: async (ctx) => {
        await window.api.invoke('captures:copy', c.id)
        ctx.notify('Imagen copiada', 'success')
      },
    }))
  },
}
