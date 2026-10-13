/**
 * Helpers puros de navegación entre archivos abiertos: orden MRU (Ctrl+Tab),
 * filtro/agrupado/fijados de la lista "Abiertos" y cierres en bloque.
 */
import { normalize } from '../../core/search'

export interface TabLike {
  id: string
  name: string
  path: string | null
  isDirty?: boolean
}

// ── MRU ────────────────────────────────────────────────────────────────────────

/** Mueve `id` al frente del MRU. */
export function touchMru(mru: readonly string[], id: string): string[] {
  return [id, ...mru.filter((x) => x !== id)]
}

/** Descarta ids que ya no existen y agrega al final los nuevos (en su orden). */
export function syncMru(mru: readonly string[], ids: readonly string[]): string[] {
  const alive = new Set(ids)
  const kept = mru.filter((id) => alive.has(id))
  const known = new Set(kept)
  return [...kept, ...ids.filter((id) => !known.has(id))]
}

/** Pestañas ordenadas por uso reciente (las que no están en el MRU, al final). */
export function orderByMru<T extends TabLike>(tabs: readonly T[], mru: readonly string[]): T[] {
  const rank = new Map(mru.map((id, i) => [id, i]))
  return [...tabs].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity))
}

/** Índice siguiente/anterior con vuelta circular. */
export function cycleIndex(length: number, index: number, dir: 1 | -1): number {
  if (length <= 0) return 0
  return (index + dir + length) % length
}

// ── Lista "Abiertos" ───────────────────────────────────────────────────────────

export const getParentDir = (p: string): string => p.replace(/[/\\][^/\\]+$/, '')
const lastSegment = (p: string): string => p.split(/[/\\]/).filter(Boolean).pop() ?? p

export function matchesTab(tab: TabLike, query: string): boolean {
  const q = normalize(query.trim())
  if (!q) return true
  const hay = normalize(`${tab.name} ${tab.path ?? ''}`)
  return q.split(/\s+/).every((w) => hay.includes(w))
}

export interface OpenFilesGroup<T> {
  key: string
  /** null = sin encabezado (lista plana) */
  label: string | null
  /** Ruta completa de la carpeta (tooltip) */
  title?: string
  items: T[]
}

/**
 * Arma la lista "Abiertos": filtra, pone los fijados arriba y, si se pide,
 * agrupa por carpeta (respetando el orden de aparición).
 */
export function arrangeOpenFiles<T extends TabLike>(
  tabs: readonly T[],
  opts: { isPinned: (t: T) => boolean; query?: string; groupByFolder?: boolean },
): OpenFilesGroup<T>[] {
  const visible = tabs.filter((t) => matchesTab(t, opts.query ?? ''))
  const pinned = visible.filter((t) => opts.isPinned(t))
  const rest = visible.filter((t) => !opts.isPinned(t))
  if (!opts.groupByFolder) {
    return visible.length ? [{ key: 'all', label: null, items: [...pinned, ...rest] }] : []
  }
  const groups: OpenFilesGroup<T>[] = []
  if (pinned.length) groups.push({ key: 'pinned', label: 'Fijados', items: pinned })
  const byDir = new Map<string, OpenFilesGroup<T>>()
  for (const t of rest) {
    const dir = t.path ? getParentDir(t.path) : ''
    let g = byDir.get(dir)
    if (!g) {
      g = dir
        ? { key: `dir:${dir}`, label: lastSegment(dir), title: dir, items: [] }
        : { key: 'buffers', label: 'Sin guardar en disco', items: [] }
      byDir.set(dir, g)
      groups.push(g)
    }
    g.items.push(t)
  }
  return groups
}

export type BulkCloseMode = 'others' | 'below' | 'saved'

/**
 * Ids a cerrar en un cierre en bloque, siguiendo el orden visible `ordered`.
 * Los fijados nunca se cierran en bloque.
 */
export function tabsToClose<T extends TabLike>(
  ordered: readonly T[], targetId: string, mode: BulkCloseMode, isPinned: (t: T) => boolean,
): string[] {
  const idx = ordered.findIndex((t) => t.id === targetId)
  return ordered.filter((t, i) => {
    if (isPinned(t)) return false
    if (mode === 'others') return t.id !== targetId
    if (mode === 'below') return idx !== -1 && i > idx
    return !t.isDirty
  }).map((t) => t.id)
}
