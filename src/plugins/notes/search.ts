import { NotebookPen, Pin, Plus } from 'lucide-react'
import { matchesQuery, type SearchItem, type SearchProvider } from '../../core/search'
import type { NoteMeta } from './types'

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
