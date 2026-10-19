import { NotebookPen, Pin, Plus } from 'lucide-react'
import { matchesQuery, type SearchItem, type SearchProvider } from '../../core/search'
import type { NoteMeta } from './types'
import { BLOC_ID } from '../../dock/bloc-utils'

function relDate(ms: number): string {
  const d = new Date(ms)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

function toItem(n: NoteMeta, score = 0): SearchItem {
  return {
    id: `notes:${n.id}`,
    title: n.title,
    subtitle: n.preview || undefined,
    icon: n.pinned ? Pin : NotebookPen,
    hint: relDate(n.updatedAt),
    score,
    run: ({ dispatch }) => dispatch({ type: 'OPEN_WITH_INTENT', pluginId: 'notes', action: 'open', payload: n.id }),
  }
}

export const notesSearchProvider: SearchProvider = {
  id: 'notes',
  group: 'Notas',
  pluginId: 'notes',
  async search(query) {
    let notes: NoteMeta[] = []
    try {
      notes = await window.api.invoke<NoteMeta[]>('notes:list')
    } catch {
      notes = []
    }

    if (!query) {
      const pinned = notes.filter((n) => n.pinned)
      const recent = notes.filter((n) => !n.pinned).slice(0, 4)
      return [...pinned, ...recent].map((n) => toItem(n))
    }

    const items = notes
      .filter((n) => matchesQuery(query, n.title, n.preview))
      .slice(0, 8)
      .map((n) => toItem(n, matchesQuery(query, n.title) ? 2 : 1))

    items.push({
      id: 'notes:new-from-query',
      title: `Nueva nota: «${query}»`,
      icon: Plus,
      score: -1,
      run: ({ dispatch }) => dispatch({ type: 'OPEN_WITH_INTENT', pluginId: 'notes', action: 'new', payload: { content: query } }),
    })
    return items
  },
}

/**
 * "Bloc" (el anotador de la barra flotante). Va aparte de `notesSearchProvider`
 * porque Notas viene oculto y los providers con `pluginId` se saltean si el
 * módulo está desactivado. Abre la barra en la pestaña Bloc; si la barra está
 * apagada (Ajustes → Escritorio), abre la nota en Notas.
 */
export const blocSearchProvider: SearchProvider = {
  id: 'bloc',
  group: 'Bloc',
  search(query) {
    if (!query || !matchesQuery(query, 'bloc anotador nota rápida apuntes borrador barra flotante')) return []
    return [{
      id: 'bloc:open',
      title: 'Bloc',
      subtitle: 'Anotador rápido en la barra flotante',
      icon: NotebookPen,
      hint: 'Ctrl+Alt+D',
      score: 3,
      run: async ({ dispatch, notify }) => {
        let dock = true
        try { dock = await window.api.invoke<boolean>('dock:enabled') } catch { /* sin canal: probar igual */ }
        if (dock) { window.api.send('dock:open', 'bloc'); return }
        try { await window.api.invoke('notes:read', BLOC_ID) } catch { await window.api.invoke('notes:write', BLOC_ID, '') }
        notify('La barra flotante está apagada: el Bloc se abre en Notas', 'info')
        dispatch({ type: 'OPEN_WITH_INTENT', pluginId: 'notes', action: 'open', payload: BLOC_ID })
      },
    }]
  },
}
