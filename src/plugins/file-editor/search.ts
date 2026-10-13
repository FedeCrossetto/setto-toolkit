import { Clock, FileText } from 'lucide-react'
import { matchesQuery, type SearchItem, type SearchProvider } from '../../core/search'
import { getOpenFiles, type OpenFileRef } from './openFilesStore'
import type { RecentFile } from './types'

const dirOf = (p: string): string => p.replace(/[/\\][^/\\]+$/, '')

function openItem(f: OpenFileRef, score: number): SearchItem {
  return {
    id: `file-editor:open:${f.path ?? f.id}`,
    title: f.name,
    subtitle: f.path ? dirOf(f.path) : 'Sin guardar en disco',
    icon: FileText,
    hint: f.isDirty ? 'Abierto · sin guardar' : 'Abierto',
    score,
    run: ({ dispatch }) => {
      if (f.path) dispatch({ type: 'OPEN_IN_EDITOR', path: f.path })
      else dispatch({ type: 'OPEN_WITH_INTENT', pluginId: 'file-editor', action: 'activate-tab', payload: { id: f.id, name: f.name } })
    },
  }
}

function recentItem(r: RecentFile, score: number): SearchItem {
  return {
    id: `file-editor:recent:${r.path}`,
    title: r.name,
    subtitle: dirOf(r.path),
    icon: Clock,
    hint: 'Reciente',
    score,
    run: ({ dispatch }) => dispatch({ type: 'OPEN_IN_EDITOR', path: r.path, line: r.line }),
  }
}

/** Ctrl+K: archivos abiertos en el Editor y recientes. Sin consulta → sólo los abiertos. */
export const fileEditorSearchProvider: SearchProvider = {
  id: 'file-editor',
  group: 'Archivos',
  pluginId: 'file-editor',
  async search(query) {
    const open = getOpenFiles()
    if (!query) return open.slice(0, 8).map((f) => openItem(f, 1))

    const items = open
      .filter((f) => matchesQuery(query, f.name, f.path))
      .map((f) => openItem(f, matchesQuery(query, f.name) ? 3 : 2))

    let recents: RecentFile[] = []
    try {
      recents = await window.api.invoke<RecentFile[]>('editor:recent-get')
    } catch {
      recents = []
    }
    const openPaths = new Set(open.map((f) => f.path).filter(Boolean))
    items.push(...recents
      .filter((r) => !openPaths.has(r.path) && matchesQuery(query, r.name, r.path))
      .slice(0, 6)
      .map((r) => recentItem(r, matchesQuery(query, r.name) ? 1 : 0)))
    return items.slice(0, 12)
  },
}
