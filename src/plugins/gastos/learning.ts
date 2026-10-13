/**
 * Aprendizaje a partir del historial de gastos variables (puro, sin React ni IPC):
 * - descripción → categoría / método / moneda más usados y monto típico,
 * - autocompletado de descripciones (prefijo > inicio de palabra > contiene; luego frecuencia+recencia),
 * - favoritos (los más frecuentes recientes),
 * - sugerencia de categoría para el importador.
 * Se recalcula del historial, que ya vive en el caché compartido del main.
 */
import { CATEGORIAS_VARIABLES, parseQuickAdd, type QuickAddResult } from './quick-add-parser'
import type { Gasto, Moneda } from './types'

export interface LearnedEntry {
  key: string
  /** Descripción como la escribió el usuario la última vez */
  descripcion: string
  count: number
  /** YYYY-MM-DD del uso más reciente */
  lastFecha: string
  categoria: string
  metodoPago: string
  moneda: Moneda
  /** Mediana de los últimos montos (en la moneda más usada) */
  montoTipico: number
  lastMonto: number
}

export type Learning = Map<string, LearnedEntry>

export function normKey(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function mode<T extends string>(values: T[]): T | undefined {
  const counts = new Map<T, number>()
  let best: T | undefined
  let bestN = 0
  // Recorre de más nuevo a más viejo: ante empate gana el más reciente.
  for (const v of values) {
    if (!v) continue
    const n = (counts.get(v) ?? 0) + 1
    counts.set(v, n)
    if (n > bestN) { best = v; bestN = n }
  }
  return best
}

function median(nums: number[]): number {
  if (!nums.length) return 0
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : Math.round(((s[mid - 1]! + s[mid]!) / 2) * 100) / 100
}

export function buildLearning(gastos: Gasto[]): Learning {
  const groups = new Map<string, Gasto[]>()
  for (const g of gastos) {
    const key = normKey(g.descripcion)
    if (!key) continue
    const list = groups.get(key)
    if (list) list.push(g)
    else groups.set(key, [g])
  }
  const out: Learning = new Map()
  for (const [key, list] of groups) {
    list.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.created_at.localeCompare(a.created_at))
    const recent = list[0]!
    const moneda = mode(list.map((g) => g.moneda)) ?? 'ARS'
    const montos = list.filter((g) => g.moneda === moneda).slice(0, 5).map((g) => g.monto)
    out.set(key, {
      key,
      descripcion: recent.descripcion.trim(),
      count: list.length,
      lastFecha: recent.fecha,
      categoria: mode(list.map((g) => g.categoria)) ?? 'Otro',
      metodoPago: mode(list.map((g) => g.metodoPago)) ?? '',
      moneda,
      montoTipico: median(montos),
      lastMonto: recent.monto,
    })
  }
  return out
}

function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000
}

/** Frecuencia con decaimiento por recencia (vida media ~60 días). */
export function frecency(e: LearnedEntry, today: string): number {
  const age = Number.isFinite(daysBetween(e.lastFecha, today)) ? daysBetween(e.lastFecha, today) : 365
  return e.count * Math.pow(0.5, age / 60) + 1 / (1 + age)
}

/** Sugerencias para el texto que se está escribiendo (sólo la parte de descripción). */
export function suggestDescriptions(learning: Learning, query: string, today: string, limit = 6): LearnedEntry[] {
  const q = normKey(query)
  if (!q) return []
  const scored: Array<{ e: LearnedEntry; s: number }> = []
  for (const e of learning.values()) {
    if (e.key === q) continue // ya está escrita entera
    let match = 0
    if (e.key.startsWith(q)) match = 3
    else if (e.key.split(' ').some((w) => w.startsWith(q))) match = 2
    else if (q.length >= 3 && e.key.includes(q)) match = 1
    if (!match) continue
    scored.push({ e, s: match * 1000 + frecency(e, today) })
  }
  return scored.sort((a, b) => b.s - a.s || a.e.descripcion.localeCompare(b.e.descripcion)).slice(0, limit).map((x) => x.e)
}

/** Los N gastos más frecuentes/recientes (para los chips de "rápidos"). */
export function topFavorites(learning: Learning, today: string, n = 6): LearnedEntry[] {
  return [...learning.values()]
    .filter((e) => e.count >= 2 && e.montoTipico > 0)
    .sort((a, b) => frecency(b, today) - frecency(a, today))
    .slice(0, n)
}

export function lookup(learning: Learning, descripcion: string): LearnedEntry | undefined {
  return learning.get(normKey(descripcion))
}

/**
 * Completa lo que el parser no detectó con lo aprendido para esa descripción:
 * categoría (si no hubo palabra clave/#tag), método (si no se escribió) y moneda (si no se escribió).
 */
export function applyLearning(parsed: QuickAddResult, learning: Learning): QuickAddResult & { learned: boolean } {
  const e = lookup(learning, parsed.descripcion)
  if (!e) return { ...parsed, learned: false }
  return {
    ...parsed,
    categoria: parsed.categoriaDetectada ? parsed.categoria : e.categoria,
    metodoPago: parsed.metodoPago ?? (e.metodoPago || null),
    moneda: parsed.monedaExplicita ? parsed.moneda : e.moneda,
    learned: true,
  }
}

/** Categoría sugerida para una descripción importada (banco/MP). */
export function suggestCategory(learning: Learning, descripcion: string): string | null {
  const exact = lookup(learning, descripcion)
  if (exact) return exact.categoria
  const words = normKey(descripcion).split(' ').filter((w) => w.length >= 3 && !/^\d+$/.test(w))
  if (words.length) {
    let best: { cat: string; score: number } | null = null
    for (const e of learning.values()) {
      const ew = new Set(e.key.split(' '))
      const hits = words.filter((w) => ew.has(w)).length
      if (!hits) continue
      const score = hits / Math.max(words.length, ew.size) + e.count / 1000
      if (!best || score > best.score) best = { cat: e.categoria, score }
    }
    if (best && best.score >= 0.34) return best.cat
  }
  const parsed = parseQuickAdd(descripcion)
  if (parsed.categoriaDetectada && (CATEGORIAS_VARIABLES as readonly string[]).includes(parsed.categoria)) return parsed.categoria
  return null
}
