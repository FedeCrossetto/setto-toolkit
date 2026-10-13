import { Code2, Plus } from 'lucide-react'
import { matchesQuery, normalize, type SearchItem, type SearchProvider } from '../../core/search'
import type { Snippet, SnippetCollection } from './types'
import { hasVariables, stripDataUrls } from './template'

const MAX_EMPTY = 5
const MAX_RESULTS = 8

/** Empty query: pinned first, then most recently used. */
export function recentSnippets(snippets: Snippet[], max = MAX_EMPTY): Snippet[] {
  const byUse = (a: Snippet, b: Snippet): number => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0)
  const pinned = snippets.filter((s) => s.pinned).sort(byUse)
  const used = snippets.filter((s) => !s.pinned && s.lastUsedAt).sort(byUse)
  return [...pinned, ...used].slice(0, max)
}

/** Query: every word must appear in title/tags/description/content (images excluded). */
export function matchSnippets(snippets: Snippet[], query: string, max = MAX_RESULTS): { snippet: Snippet; score: number }[] {
  const q = normalize(query)
  return snippets
    .filter((s) => matchesQuery(query, s.title, s.tags.join(' '), s.description, stripDataUrls(s.content)))
    .map((s) => {
      const title = normalize(s.title)
      let score = 0
      if (title.startsWith(q)) score += 30
      else if (title.includes(q)) score += 20
      else if (matchesQuery(query, s.title)) score += 10
      if (s.tags.some((t) => normalize(t) === q)) score += 8
      if (s.pinned) score += 3
      score += Math.min(5, s.useCount ?? 0)
      return { snippet: s, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
}

function toItem(s: Snippet, collections: SnippetCollection[], score = 0): SearchItem {
  const withVars = hasVariables(s.content)
  const col = collections.find((c) => c.id === s.collectionId)?.name
  return {
    id: `snippets:${s.id}`,
    title: s.title || 'Sin título',
    subtitle: [s.language, col, s.description].filter(Boolean).join(' · '),
    icon: Code2,
    hint: withVars ? 'Enter completa variables' : 'Enter copia',
    score,
    run: async ({ dispatch, notify }) => {
      if (withVars) {
        dispatch({ type: 'OPEN_WITH_INTENT', pluginId: 'snippets', action: 'open', payload: s.id })
        return
      }
      try {
        await navigator.clipboard.writeText(s.content)
        notify('Copiado', 'success')
        void window.api.invoke('snippets:mark-used', s.id).catch(() => undefined)
      } catch {
        notify('No se pudo copiar al portapapeles', 'error')
      }
    },
  }
}

export const snippetsSearchProvider: SearchProvider = {
  id: 'snippets',
  group: 'Snippets',
  pluginId: 'snippets',
  async search(query) {
    let data: { snippets: Snippet[]; collections: SnippetCollection[] }
    try {
      data = await window.api.invoke<{ snippets: Snippet[]; collections: SnippetCollection[] }>('snippets:load')
    } catch {
      return []
    }
    if (!query) return recentSnippets(data.snippets).map((s) => toItem(s, data.collections))

    const items = matchSnippets(data.snippets, query).map(({ snippet, score }) => toItem(snippet, data.collections, score))
    items.push({
      id: 'snippets:new',
      title: `Nuevo snippet: «${query}»`,
      icon: Plus,
      score: -100,
      run: ({ dispatch }) => {
        dispatch({ type: 'OPEN_WITH_INTENT', pluginId: 'snippets', action: 'new', payload: { content: query } })
      },
    })
    return items
  },
}
