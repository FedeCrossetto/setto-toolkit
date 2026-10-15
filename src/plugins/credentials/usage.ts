/**
 * Usage ranking for credentials (pure; shared by main and renderer).
 *
 * Score = log2(1 + useCount) weighted by a recency factor with a 14-day
 * half-life, plus a small bonus for very recent use. A credential copied 40
 * times last year ranks below one copied 6 times this week.
 */

export interface UsageInfo {
  id: string
  nombre: string
  categoria?: string
  useCount?: number
  lastUsedAt?: number
}

export type CredentialSort = 'usage' | 'recent' | 'az' | 'category'

export const SORT_LABELS: Record<CredentialSort, string> = {
  usage: 'Más usadas',
  recent: 'Recientes',
  az: 'A–Z',
  category: 'Categoría',
}

const DAY_MS = 86_400_000
const HALF_LIFE_DAYS = 14

export function usageScore(useCount: number | undefined, lastUsedAt: number | undefined, now = Date.now()): number {
  const n = Math.max(0, useCount ?? 0)
  if (!n && !lastUsedAt) return 0
  const ageDays = lastUsedAt ? Math.max(0, (now - lastUsedAt) / DAY_MS) : 365
  const decay = Math.pow(0.5, ageDays / HALF_LIFE_DAYS)
  // Floor of 0.15 so heavily used credentials never fall to zero.
  const base = Math.log2(1 + Math.max(n, lastUsedAt ? 1 : 0)) * (0.15 + 0.85 * decay)
  const fresh = ageDays < 1 ? 0.5 : 0
  return base + fresh
}

const byName = (a: UsageInfo, b: UsageInfo): number => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })

/** Highest usage score first; ties by last use, then name. Does not mutate. */
export function sortByUsage<T extends UsageInfo>(items: T[], now = Date.now()): T[] {
  return [...items]
    .map((item) => ({ item, s: usageScore(item.useCount, item.lastUsedAt, now) }))
    .sort((a, b) => b.s - a.s || (b.item.lastUsedAt ?? 0) - (a.item.lastUsedAt ?? 0) || byName(a.item, b.item))
    .map((x) => x.item)
}

/** Favorites first (each block ranked by usage), cut to `limit`. */
export function topByUsage<T extends UsageInfo>(items: T[], favorites: Iterable<string>, limit = 8, now = Date.now()): T[] {
  const fav = new Set(favorites)
  const ranked = sortByUsage(items, now)
  return [...ranked.filter((c) => fav.has(c.id)), ...ranked.filter((c) => !fav.has(c.id))].slice(0, Math.max(0, limit))
}

/** Flat sort for the list. `category` sorts by category then name (grouping is done by the caller). */
export function sortCredentialsBy<T extends UsageInfo>(items: T[], mode: CredentialSort, now = Date.now()): T[] {
  switch (mode) {
    case 'usage': return sortByUsage(items, now)
    case 'recent': return [...items].sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0) || byName(a, b))
    case 'az': return [...items].sort(byName)
    case 'category': return [...items].sort((a, b) => {
      const ca = a.categoria?.trim() ?? ''
      const cb = b.categoria?.trim() ?? ''
      if (!ca !== !cb) return ca ? -1 : 1
      return ca.localeCompare(cb, 'es', { sensitivity: 'base' }) || byName(a, b)
    })
  }
}

/** "Copiada 12 veces · hace 2 h" / "Copiada 1 vez · ayer" / "" (never used). */
export function usageHint(useCount: number | undefined, when: string): string {
  const n = useCount ?? 0
  if (!n) return when ? `Usada ${when}` : ''
  const times = n === 1 ? '1 vez' : `${n} veces`
  return when ? `Copiada ${times} · ${when}` : `Copiada ${times}`
}
