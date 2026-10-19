import { Clock, FileText, FileX } from 'lucide-react'
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

function recentItem(r: RecentFile, score: number, missing: boolean): SearchItem {
  return {
    id: `file-editor:recent:${r.path}`,
    title: r.name,
    subtitle: missing ? `No se encuentra · ${dirOf(r.path)}` : dirOf(r.path),
    icon: missing ? FileX : Clock,
    hint: missing ? 'Ya no existe' : 'Reciente',
    // Los que ya no existen van al final del grupo.
    score: missing ? score - 10 : score,
    run: ({ dispatch, notify }) => {
      if (missing) { notify('Ese archivo ya no existe (se movió o se borró)', 'error'); return }
      dispatch({ type: 'OPEN_IN_EDITOR', path: r.path, line: r.line })
    },
  }
}

// ── Existencia de los recientes (perezosa, con caché) ────────────────────────
// Se consulta en segundo plano y se usa en la próxima búsqueda: nunca demora Ctrl+K.
const EXISTS_TTL_MS = 30_000
const EXISTS_WAIT_MS = 250
const exists = new Map<string, { ok: boolean; at: number }>()
let inflight: Promise<void> | null = null

function checkExists(paths: string[]): Promise<void> {
  const now = Date.now()
  const stale = paths.filter((p) => { const e = exists.get(p); return !e || now - e.at > EXISTS_TTL_MS })
  if (!stale.length) return Promise.resolve()
  if (inflight) return inflight
  inflight = window.api.invoke<Record<string, boolean>>('editor:exists', stale)
    .then((r) => { const at = Date.now(); for (const p of stale) if (typeof r?.[p] === 'boolean') exists.set(p, { ok: r[p]!, at }) })
    .catch(() => undefined)   // sin el canal: no se marca nada
    .finally(() => { inflight = null })
  return inflight
}

/** true sólo si se sabe que no existe (sin dato → se muestra normal). */
export function isMissing(path: string): boolean {
  return exists.get(path)?.ok === false
}

/** Ordena para la paleta: primero los abiertos, después los recientes que no están abiertos. */
export function recentCandidates(recents: RecentFile[], openPaths: Set<string | null | undefined>, query: string, max: number): RecentFile[] {
  return recents
    .filter((r) => !openPaths.has(r.path) && (!query || matchesQuery(query, r.name, r.path)))
    .slice(0, max)
}

/** Ctrl+K: archivos abiertos en el Editor y recientes. Sin consulta → abiertos y después los recientes. */
export const fileEditorSearchProvider: SearchProvider = {
  id: 'file-editor',
  group: 'Archivos',
  pluginId: 'file-editor',
  async search(query) {
    const open = getOpenFiles()
    const items = query
      ? open.filter((f) => matchesQuery(query, f.name, f.path)).map((f) => openItem(f, matchesQuery(query, f.name) ? 3 : 2))
      : open.slice(0, 8).map((f) => openItem(f, 3))

    let recents: RecentFile[] = []
    try {
      recents = await window.api.invoke<RecentFile[]>('editor:recent-get')
    } catch {
      recents = []
    }
    const openPaths = new Set(open.map((f) => f.path).filter(Boolean))
    const list = recentCandidates(recents, openPaths, query, query ? 6 : Math.max(0, 8 - items.length))
    if (list.length) {
      // Espera corta: si main contesta rápido ya se marcan; si no, en la próxima búsqueda.
      await Promise.race([checkExists(list.map((r) => r.path)), new Promise((r) => setTimeout(r, EXISTS_WAIT_MS))])
    }
    items.push(...list.map((r) => recentItem(r, query && matchesQuery(query, r.name) ? 1 : 0, isMissing(r.path))))
    return items.slice(0, 12)
  },
}
