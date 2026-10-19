/**
 * Búsqueda unificada del portapapeles (textos copiados + capturas por su OCR, nota,
 * ticket, app y ventana). Puro: lo usa main (`clipboard:search`, electron/core/
 * clipboard-history.ts) y el renderer sólo para partir el snippet en resaltados.
 *
 * Orden: frase exacta > todas las palabras > parecido (errores de tipeo), y dentro
 * de cada nivel suman el campo donde coincidió, el inicio de palabra y lo reciente.
 * Sin tildes ni mayúsculas, pero el snippet y los rangos son del texto original.
 */
import type { ClipKind } from '../../core/clip-utils'

export type ClipSearchKind = 'text' | 'capture'
export type ClipSearchField = 'text' | 'ocr' | 'note' | 'title' | 'ticket' | 'app' | 'window'
export type ClipSearchTier = 'phrase' | 'all' | 'fuzzy' | 'recent'
/** [inicio, fin) dentro de `snippet`. */
export type Range = [number, number]

export interface ClipSearchOpts {
  /** Qué buscar (default: todo). */
  kinds?: ClipSearchKind[]
  limit?: number
}

/** Lo que viaja al renderer: liviano (sin el OCR entero ni el texto completo si es largo). */
export interface ClipSearchItem {
  kind: ClipSearchKind
  id: string
  at: number
  score: number
  tier: ClipSearchTier
  /** Campo de donde salió el snippet. */
  field: ClipSearchField
  snippet: string
  ranges: Range[]
  pinned?: boolean
  app?: string
  // Texto copiado
  clipKind?: ClipKind
  // Captura
  file?: string
  title?: string
  ticket?: string
  ocrState?: 'pending' | 'done' | 'empty'
}

export interface ClipSearchResult { items: ClipSearchItem[]; total: number }

// ── Preparación (se cachea por documento en main) ────────────────────────────

const COMBINING = /[̀-ͯ]/g

interface PreparedField {
  name: ClipSearchField
  orig: string
  folded: string
  /** Por cada carácter de `folded`: dónde empieza / termina su carácter original. */
  start: Uint32Array
  end: Uint32Array
  tokens?: Map<string, number>
}

export interface SearchDoc {
  kind: ClipSearchKind
  id: string
  at: number
  pinned?: boolean
  fields: Partial<Record<ClipSearchField, string | null | undefined>>
}

export interface PreparedDoc { kind: ClipSearchKind; id: string; at: number; pinned: boolean; fields: PreparedField[] }

/** Minúsculas y sin tildes, con el mapa de posiciones al texto original. */
export function foldWithMap(s: string): { folded: string; start: Uint32Array; end: Uint32Array } {
  let folded = ''
  const st: number[] = []
  const en: number[] = []
  let i = 0
  for (const ch of s) {
    const f = ch.normalize('NFD').replace(COMBINING, '').toLowerCase()
    for (let k = 0; k < f.length; k++) { st.push(i); en.push(i + ch.length) }
    folded += f
    i += ch.length
  }
  return { folded, start: Uint32Array.from(st), end: Uint32Array.from(en) }
}

export const foldText = (s: string): string => s.normalize('NFD').replace(COMBINING, '').toLowerCase()

/** Peso del campo (dónde coincidió importa: el título o el ticket valen más que el OCR). */
const FIELD_WEIGHT: Record<ClipSearchField, number> = { title: 30, ticket: 30, text: 26, note: 24, ocr: 20, window: 14, app: 10 }
const ORDER: ClipSearchField[] = ['text', 'title', 'ticket', 'note', 'ocr', 'window', 'app']

export function prepareDoc(d: SearchDoc): PreparedDoc {
  const fields: PreparedField[] = []
  for (const name of ORDER) {
    const v = d.fields[name]
    if (!v || !v.trim()) continue
    const { folded, start, end } = foldWithMap(v)
    fields.push({ name, orig: v, folded, start, end })
  }
  return { kind: d.kind, id: d.id, at: d.at, pinned: !!d.pinned, fields }
}

function tokensOf(f: PreparedField): Map<string, number> {
  if (!f.tokens) {
    f.tokens = new Map()
    for (const m of f.folded.matchAll(/[\p{L}\p{N}]+/gu)) if (!f.tokens.has(m[0])) f.tokens.set(m[0], m.index)
  }
  return f.tokens
}

// ── Parecido (Levenshtein acotado) ───────────────────────────────────────────

/** Distancia de edición si es ≤ max; si no, max + 1 (corta temprano). */
export function boundedLevenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
      cur.push(v)
      if (v < rowMin) rowMin = v
    }
    if (rowMin > max) return max + 1
    prev = cur
  }
  return prev[b.length]!
}

const fuzzyBudget = (w: string): number => (w.length >= 8 ? 2 : w.length >= 4 ? 1 : 0)

/** Un token del campo parecido a la palabra (entero o como prefijo, por si se está tipeando). */
function fuzzyFind(f: PreparedField, w: string): [number, number] | null {
  const k = fuzzyBudget(w)
  if (!k) return null
  for (const [t, at] of tokensOf(f)) {
    if (t.length + k < w.length) continue
    if (boundedLevenshtein(w, t, k) <= k) return [at, at + t.length]
    if (t.length > w.length && boundedLevenshtein(w, t.slice(0, w.length), k) <= k) return [at, at + w.length]
  }
  return null
}

// ── Snippet ──────────────────────────────────────────────────────────────────

const isWordChar = (c: string | undefined): boolean => !!c && /[\p{L}\p{N}]/u.test(c)

/**
 * Recorta `text` alrededor del primer rango (≤ `max` caracteres, espacios colapsados,
 * "…" en los cortes) y devuelve los rangos movidos al recorte.
 */
export function makeSnippet(text: string, ranges: Range[], max = 160): { snippet: string; ranges: Range[] } {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0])
  const first = sorted[0]?.[0] ?? 0
  let from = Math.max(0, first - Math.floor(max / 3))
  if (from > 0) {
    // Empezar en un límite de palabra (si hay uno cerca).
    const ws = text.slice(from, first).search(/\s/)
    if (ws >= 0 && ws < 20) from += ws + 1
  }
  // Saltar espacios iniciales del recorte.
  while (from < first && /\s/.test(text[from]!)) from++
  let out = ''
  const pos = new Map<number, number>()   // posición en text → posición en out
  let i = from
  let lastSpace = false
  while (i < text.length && out.length < max) {
    const c = text[i]!
    if (/\s/.test(c)) {
      if (!lastSpace && out.length) { pos.set(i, out.length); out += ' '; lastSpace = true } else pos.set(i, out.length)
    } else { pos.set(i, out.length); out += c; lastSpace = false }
    i++
  }
  const to = i
  out = out.replace(/\s+$/, '')
  const pre = from > 0 ? 1 : 0
  const outRanges: Range[] = []
  for (const [a, b] of sorted) {
    if (b <= from || a >= to) continue
    const s = pos.get(Math.max(a, from))
    const e = pos.get(Math.min(b, to) - 1)
    if (s === undefined || e === undefined) continue
    const r: Range = [s + pre, Math.min(e + 1, out.length) + pre]
    const last = outRanges[outRanges.length - 1]
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
    else if (r[1] > r[0]) outRanges.push(r)
  }
  return { snippet: (pre ? '…' : '') + out + (to < text.replace(/\s+$/, '').length ? '…' : ''), ranges: outRanges }
}

/** Para pintar: el snippet en trozos marcados o no. */
export function splitHighlights(snippet: string, ranges: Range[]): { text: string; hit: boolean }[] {
  const out: { text: string; hit: boolean }[] = []
  let i = 0
  for (const [a, b] of [...ranges].sort((x, y) => x[0] - y[0])) {
    const s = Math.max(a, i)
    const e = Math.min(b, snippet.length)
    if (e <= s) continue
    if (s > i) out.push({ text: snippet.slice(i, s), hit: false })
    out.push({ text: snippet.slice(s, e), hit: true })
    i = e
  }
  if (i < snippet.length) out.push({ text: snippet.slice(i), hit: false })
  return out
}

// ── Ranking ──────────────────────────────────────────────────────────────────

const TIER_BASE: Record<ClipSearchTier, number> = { phrase: 1000, all: 600, fuzzy: 300, recent: 0 }
const RECENCY_MAX = 80
const RECENCY_HALF_LIFE_H = 72

export const recencyBoost = (at: number, now: number): number =>
  RECENCY_MAX * Math.pow(0.5, Math.max(0, now - at) / 3_600_000 / RECENCY_HALF_LIFE_H)

export interface RankedHit {
  doc: PreparedDoc
  score: number
  tier: ClipSearchTier
  field: ClipSearchField
  snippet: string
  ranges: Range[]
}

function allIndexes(hay: string, needle: string, cap = 12): number[] {
  const out: number[] = []
  let i = hay.indexOf(needle)
  while (i >= 0 && out.length < cap) { out.push(i); i = hay.indexOf(needle, i + needle.length) }
  return out
}

const toOrig = (f: PreparedField, a: number, b: number): Range => [f.start[a]!, f.end[b - 1]!]

/** Evalúa un documento; null si no coincide. */
export function scoreDoc(doc: PreparedDoc, query: string, now: number): RankedHit | null {
  const phrase = foldText(query).replace(/\s+/g, ' ').trim()
  const recency = recencyBoost(doc.at, now) + (doc.pinned ? 5 : 0)
  if (!doc.fields.length) return null
  if (!phrase) {
    const f = doc.fields[0]!
    return { doc, score: recency, tier: 'recent', field: f.name, ...makeSnippet(f.orig, []) }
  }
  const words = [...new Set(phrase.split(' '))]

  // 1) Frase exacta en algún campo (el de más peso gana).
  let best: { f: PreparedField; at: number } | null = null
  for (const f of doc.fields) {
    const at = f.folded.indexOf(phrase)
    if (at >= 0 && (!best || FIELD_WEIGHT[f.name] > FIELD_WEIGHT[best.f.name])) best = { f, at }
  }
  if (best) {
    const { f } = best
    const ranges = allIndexes(f.folded, phrase).map((a) => toOrig(f, a, a + phrase.length))
    const boundary = !isWordChar(f.folded[best.at - 1]) ? 15 : 0
    return {
      doc, tier: 'phrase', field: f.name, score: TIER_BASE.phrase + FIELD_WEIGHT[f.name] + boundary + recency,
      ...makeSnippet(f.orig, ranges),
    }
  }

  // 2) Todas las palabras (en uno o varios campos) y 3) parecido.
  const exactIn = new Map<string, PreparedField[]>()
  for (const w of words) exactIn.set(w, doc.fields.filter((f) => f.folded.includes(w)))
  const allExact = words.every((w) => exactIn.get(w)!.length > 0)
  let tier: ClipSearchTier = 'all'
  const fuzzyHits = new Map<PreparedField, Range[]>()
  if (!allExact) {
    tier = 'fuzzy'
    for (const w of words) {
      if (exactIn.get(w)!.length) continue
      let found = false
      for (const f of doc.fields) {
        const r = fuzzyFind(f, w)
        if (r) { fuzzyHits.set(f, [...(fuzzyHits.get(f) ?? []), toOrig(f, r[0], r[1])]); found = true; break }
      }
      if (!found) return null
    }
  }
  // Campo del snippet: el que tiene más palabras (empate: más peso).
  let field: PreparedField = doc.fields[0]!
  let bestCount = -1
  for (const f of doc.fields) {
    const n = words.filter((w) => exactIn.get(w)!.includes(f)).length + (fuzzyHits.get(f)?.length ?? 0)
    if (n > bestCount || (n === bestCount && FIELD_WEIGHT[f.name] > FIELD_WEIGHT[field.name])) { field = f; bestCount = n }
  }
  const ranges: Range[] = [...(fuzzyHits.get(field) ?? [])]
  let boundaryHits = 0
  for (const w of words) {
    if (!exactIn.get(w)!.includes(field)) continue
    const idx = allIndexes(field.folded, w, 6)
    if (idx.some((a) => !isWordChar(field.folded[a - 1]))) boundaryHits++
    for (const a of idx) ranges.push(toOrig(field, a, a + w.length))
  }
  const sameField = bestCount === words.length ? 10 : 0
  const boundary = Math.round((boundaryHits / words.length) * 10)
  return {
    doc, tier, field: field.name,
    score: TIER_BASE[tier] + FIELD_WEIGHT[field.name] + sameField + boundary + recency,
    ...makeSnippet(field.orig, ranges),
  }
}

/** Ordena por puntaje (y a igualdad, lo más nuevo). */
export function rankDocs(docs: PreparedDoc[], query: string, now: number, limit = 40): { hits: RankedHit[]; total: number } {
  const hits: RankedHit[] = []
  for (const d of docs) {
    const h = scoreDoc(d, query, now)
    if (h) hits.push(h)
  }
  hits.sort((a, b) => b.score - a.score || b.doc.at - a.doc.at)
  return { hits: hits.slice(0, Math.max(1, Math.min(200, limit))), total: hits.length }
}
