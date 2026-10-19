import { normalize, type SearchItem } from './search'

/**
 * Pure helpers for the Ctrl+K palette: matching/scoring of built-in items,
 * grouping provider results and keyboard navigation. No React, no IPC — tested
 * in `palette-logic.test.ts`.
 */

/** Score `title` (+ extra fields) against `query`. -1 = no match; empty query = 0. */
export function scoreMatch(query: string, title: string, ...extra: (string | undefined | null)[]): number {
  const q = normalize(query).trim()
  if (!q) return 0
  const words = q.split(/\s+/).filter(Boolean)
  const t = normalize(title)
  const haystack = normalize([title, ...extra].filter(Boolean).join(' '))
  if (!words.every((w) => haystack.includes(w))) return -1
  if (t === q) return 100
  if (t.startsWith(q)) return 80
  const titleWords = t.split(/[\s\-_/.·:]+/).filter(Boolean)
  if (words.every((w) => titleWords.some((tw) => tw.startsWith(w)))) return 65
  if (t.includes(q)) return 50
  if (words.every((w) => t.includes(w))) return 40
  return 20
}

export interface ProviderResult {
  /** Provider id */
  id: string
  /** Group header */
  group: string
  items: SearchItem[]
  /** Position of the group in the palette (lower first) */
  order: number
  /** Max items shown for this group (default: `limit` of buildGroups) */
  limit?: number
}

export interface PaletteGroup {
  id: string
  label: string
  items: SearchItem[]
}

/**
 * Turn provider results into the groups shown in the palette: groups keep a
 * stable order (so late providers don't reshuffle what's on screen), items are
 * sorted by score desc (stable), deduplicated by id across groups and capped.
 */
export function buildGroups(results: ProviderResult[], limit = 5): PaletteGroup[] {
  const seen = new Set<string>()
  // Groups that only offer "create …" actions (negative score) go after groups
  // with real matches, so "Nueva nota: «x»" never hides the snippet you searched.
  const onlyActions = (r: ProviderResult): number =>
    r.items.length > 0 && r.items.every((i) => (i.score ?? 0) < 0) ? 1 : 0
  return [...results]
    .sort((a, b) => onlyActions(a) - onlyActions(b) || a.order - b.order)
    .map((r) => {
      const items = r.items
        .map((item, i) => ({ item, i }))
        .sort((a, b) => (b.item.score ?? 0) - (a.item.score ?? 0) || a.i - b.i)
        .map(({ item }) => item)
        .filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)))
        .slice(0, r.limit ?? limit)
      return { id: r.id, label: r.group, items }
    })
    .filter((g) => g.items.length > 0)
}

export function flattenGroups(groups: PaletteGroup[]): SearchItem[] {
  return groups.flatMap((g) => g.items)
}

/** Keep the selection on the same item while results stream in; else first item. */
export function resolveSelection(groups: PaletteGroup[], selectedId: string | null): string | null {
  const flat = flattenGroups(groups)
  if (selectedId && flat.some((i) => i.id === selectedId)) return selectedId
  return flat[0]?.id ?? null
}

/** ↑/↓ — wraps around the flattened list. */
export function moveSelection(groups: PaletteGroup[], selectedId: string | null, delta: 1 | -1): string | null {
  const flat = flattenGroups(groups)
  if (flat.length === 0) return null
  const idx = flat.findIndex((i) => i.id === selectedId)
  if (idx === -1) return flat[delta === 1 ? 0 : flat.length - 1]!.id
  return flat[(idx + delta + flat.length) % flat.length]!.id
}

/** Tab / Shift+Tab — jumps to the first item of the next/previous group. */
export function cycleGroup(groups: PaletteGroup[], selectedId: string | null, delta: 1 | -1): string | null {
  if (groups.length === 0) return null
  const gi = groups.findIndex((g) => g.items.some((i) => i.id === selectedId))
  const next = gi === -1 ? 0 : (gi + delta + groups.length) % groups.length
  return groups[next]!.items[0]?.id ?? null
}

/**
 * "Recientes" del palette (sesión): el ítem recién ejecutado va primero, sin
 * duplicados por id, hasta `max`.
 */
export function pushRecent(list: SearchItem[], item: SearchItem, max = 5): SearchItem[] {
  return [item, ...list.filter((i) => i.id !== item.id)].slice(0, max)
}
