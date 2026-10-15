import { Copy, Server } from 'lucide-react'
import type { SearchItem, SearchProvider } from '../../core/search'
import { matchesQuery } from '../../core/search'
import type { SqlProfile } from './sql'

/**
 * Ctrl+K → conexiones SQL: buscar por nombre, servidor, base o etiqueta y copiar
 * el servidor o la cadena (la arma main, con la contraseña, directo al portapapeles).
 */
const cleanErr = (e: unknown): string => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

export const sqlConnectionsSearchProvider: SearchProvider = {
  id: 'sql-connections',
  group: 'Bases de datos',
  pluginId: 'connections',
  async search(query) {
    if (!query) return []
    let list: SqlProfile[]
    try { list = await window.api.invoke<SqlProfile[]>('sql:list') } catch { return [] }
    const items: SearchItem[] = []
    for (const p of list) {
      if (!matchesQuery(query, p.name, p.server, p.database, p.tag, 'sql base datos servidor conexion')) continue
      const where = `${p.server}${p.database ? ` · ${p.database}` : ''}`
      items.push({
        id: `sql:server:${p.id}`, title: `Copiar servidor de ${p.name}`, subtitle: where, icon: Server, hint: p.tag || undefined, score: 10,
        run: async ({ notify }) => {
          try { await window.api.invoke('sql:copy', p.id, 'server'); notify(`Servidor de ${p.name} copiado`, 'success') } catch (e) { notify(cleanErr(e), 'error') }
        },
      })
      items.push({
        id: `sql:cs:${p.id}`, title: `Copiar cadena de conexión de ${p.name}`, subtitle: p.auth === 'sql' ? 'ADO.NET con contraseña · se borra en 60 s' : 'ADO.NET · Windows', icon: Copy, score: 5,
        run: async ({ notify }) => {
          try { await window.api.invoke('sql:copy', p.id, 'adonet'); notify(`Cadena de ${p.name} copiada`, 'success') } catch (e) { notify(cleanErr(e), 'error') }
        },
      })
    }
    return items
  },
}
