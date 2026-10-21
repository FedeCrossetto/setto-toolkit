import { History, Plus, Star } from 'lucide-react'
import type { SearchItem, SearchProvider } from '../../core/search'
import { matchesQuery } from '../../core/search'
import type { QueryFavorite, QueryHistoryEntry } from './types'

/**
 * Ctrl+K → Consultas: abrir una favorita o algo del historial en una pestaña nueva.
 * Sin texto muestra las favoritas; con texto busca también en el historial.
 */
const oneLine = (sql: string): string => sql.replace(/\s+/g, ' ').trim().slice(0, 110)

export const sqlRunnerSearchProvider: SearchProvider = {
  id: 'sql-runner',
  group: 'Consultas',
  pluginId: 'sql-runner',
  async search(query) {
    const [favs, hist] = await Promise.all([
      window.api.invoke<QueryFavorite[]>('sql:favs-get').catch(() => [] as QueryFavorite[]),
      query ? window.api.invoke<QueryHistoryEntry[]>('sql:history-get').catch(() => [] as QueryHistoryEntry[]) : Promise.resolve([] as QueryHistoryEntry[]),
    ])
    const items: SearchItem[] = []
    for (const f of favs) {
      if (query && !matchesQuery(query, f.title, f.sql, 'favorita consulta sql')) continue
      items.push({
        id: `sql-runner:fav:${f.id}`, title: f.title, subtitle: oneLine(f.sql), icon: Star, hint: 'Favorita', score: 20,
        run: ({ dispatch }) => dispatch({ type: 'OPEN_WITH_INTENT', pluginId: 'sql-runner', action: 'open-sql', payload: { title: f.title, sql: f.sql, profileId: f.profileId, database: f.database } }),
      })
      if (!query && items.length >= 6) break
    }
    if (query) {
      const seen = new Set(favs.map((f) => f.sql.trim()))
      let n = 0
      for (const h of hist) {
        const key = h.sql.trim()
        if (seen.has(key) || !matchesQuery(query, h.sql, h.profileName, h.database)) continue
        seen.add(key)
        items.push({
          id: `sql-runner:hist:${h.id}`, title: oneLine(h.sql), subtitle: `${h.profileName}${h.database ? ` · ${h.database}` : ''} · ${new Date(h.at).toLocaleDateString('es-AR')}`,
          icon: History, score: 5,
          run: ({ dispatch }) => dispatch({ type: 'OPEN_WITH_INTENT', pluginId: 'sql-runner', action: 'open-sql', payload: { sql: h.sql, profileId: h.profileId, database: h.database } }),
        })
        if (++n >= 8) break
      }
      if (matchesQuery(query, 'nueva consulta sql query')) {
        items.push({
          id: 'sql-runner:new', title: 'Nueva consulta SQL', icon: Plus, score: 1,
          run: ({ dispatch }) => dispatch({ type: 'OPEN_WITH_INTENT', pluginId: 'sql-runner', action: 'open-sql', payload: { sql: '' } }),
        })
      }
    }
    return items
  },
}
