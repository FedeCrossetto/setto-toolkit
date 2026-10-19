/**
 * Tickets — lógica pura compartida por main (electron/plugins/tickets/handlers.ts)
 * y el renderer. Sin Electron ni DOM: testeada en logic.test.ts.
 *
 * Extrae claves de ticket (`WIGOS-132764`) de textos de distintas fuentes y arma
 * un índice clave → referencias, ordenado por última actividad.
 */

export type TicketSource = 'capture' | 'clip' | 'note' | 'snippet' | 'file'
export const TICKET_SOURCES: TicketSource[] = ['capture', 'note', 'snippet', 'clip', 'file']

/** Lo que una fuente aporta al índice (el texto no viaja al renderer). */
export interface SourceItem {
  source: TicketSource
  id: string
  title: string
  /** epoch ms de la última actividad */
  at: number
  /** Texto donde se buscan claves */
  text: string
  /** Claves asignadas explícitamente (p. ej. el campo ticket de una captura) */
  keys?: string[]
  /** Texto corto para mostrar (ya sin secretos) */
  detail?: string
  /** Datos extra que necesita la UI (archivo de la captura, ruta, lenguaje…) */
  extra?: Record<string, string | number>
}

export type TicketRef = Omit<SourceItem, 'text' | 'keys'>

export type SourceCounts = Record<TicketSource, number>

export interface TicketSummary {
  key: string
  lastAt: number
  counts: SourceCounts
  total: number
  title?: string
  pinned: boolean
  manual: boolean
}

export interface TicketDetail extends TicketSummary {
  refs: Record<TicketSource, TicketRef[]>
  jiraBase: string | null
}

export interface TicketsMeta {
  pinned: string[]
  manual: string[]
  titles: Record<string, string>
}

export const emptyMeta = (): TicketsMeta => ({ pinned: [], manual: [], titles: {} })

// ─── Claves ──────────────────────────────────────────────────────────────────

const KEY_RE = /(?<![A-Za-z0-9_-])([A-Z][A-Z0-9]{1,9})-(\d{1,7})(?![A-Za-z0-9_]|-\d|\.\d)/g
const EXACT_RE = /^[A-Z][A-Z0-9]{1,9}-\d{1,7}$/

/** Prefijos que parecen ticket pero son codificaciones, hashes, normas… */
const NOT_PROJECTS = new Set([
  'UTF', 'UCS', 'SHA', 'MD', 'ISO', 'IEC', 'IEEE', 'CP', 'WIN', 'WINDOWS', 'LATIN', 'KOI', 'GB', 'EUC', 'BIG',
  'AES', 'RSA', 'DES', 'HMAC', 'CRC', 'ECDSA', 'ED', 'PBKDF', 'TLS', 'SSL', 'HTTP', 'HTTPS', 'IPV', 'IP',
  'RFC', 'ECMA', 'ES', 'CVE', 'CWE', 'COVID', 'MP', 'H', 'X', 'TCP', 'UDP', 'PORT', 'COM', 'LPT', 'USB',
  'DDR', 'PCI', 'GPT', 'CLAUDE', 'NET', 'NETCORE', 'NETFRAMEWORK', 'VS', 'SQL', 'TSQL', 'PG', 'ASCII',
])

const validKey = (prefix: string, num: string): boolean =>
  !NOT_PROJECTS.has(prefix) && /[A-Z]/.test(prefix) && !/^0+$/.test(num)

export function isTicketKey(text: string): boolean {
  const t = text.trim()
  if (!EXACT_RE.test(t)) return false
  const [prefix, num] = t.split('-') as [string, string]
  return validKey(prefix, num)
}

export function normalizeKey(text: string): string | null {
  const t = text.trim().toUpperCase()
  return isTicketKey(t) ? t : null
}

/** Todas las claves (únicas, en orden de aparición). Distingue mayúsculas: "wigos-1" no cuenta. */
export function extractKeys(text: string): string[] {
  if (!text) return []
  const out: string[] = []
  const seen = new Set<string>()
  KEY_RE.lastIndex = 0
  for (let m = KEY_RE.exec(text); m; m = KEY_RE.exec(text)) {
    const key = `${m[1]}-${m[2]}`
    if (validKey(m[1]!, m[2]!) && !seen.has(key)) { seen.add(key); out.push(key) }
  }
  return out
}

/**
 * Claves conocidas que aparecen en un texto sin importar mayúsculas (rutas de
 * archivos como `wigos-130026-propuesta.md`). Sólo las ya conocidas: así un
 * nombre en minúsculas no inventa tickets.
 */
export function knownKeysIn(text: string, known: Set<string>): string[] {
  return extractKeys(text.toUpperCase()).filter((k) => known.has(k))
}

// ─── Índice ──────────────────────────────────────────────────────────────────

export const zeroCounts = (): SourceCounts => ({ capture: 0, clip: 0, note: 0, snippet: 0, file: 0 })

export type TicketIndex = Map<string, TicketRef[]>

const toRef = ({ text: _t, keys: _k, ...ref }: SourceItem): TicketRef => ref

/**
 * Índice clave → referencias. Las fuentes de tipo `file` sólo se asocian a
 * claves que aparecen en alguna otra fuente o en `extraKnown` (fijadas/manuales).
 */
export function buildIndex(items: SourceItem[], extraKnown: Iterable<string> = []): TicketIndex {
  const index: TicketIndex = new Map()
  const add = (key: string, item: SourceItem): void => {
    const list = index.get(key)
    const ref = toRef(item)
    if (!list) index.set(key, [ref])
    else if (!list.some((r) => r.source === ref.source && r.id === ref.id)) list.push(ref)
  }
  const files: SourceItem[] = []
  for (const it of items) {
    if (it.source === 'file') { files.push(it); continue }
    const keys = new Set<string>()
    for (const k of it.keys ?? []) { const n = normalizeKey(k); if (n) keys.add(n) }
    for (const k of extractKeys(it.text)) keys.add(k)
    for (const k of keys) add(k, it)
  }
  const known = new Set<string>([...index.keys(), ...[...extraKnown].map((k) => k.toUpperCase())])
  for (const f of files) for (const k of knownKeysIn(f.text, known)) add(k, f)
  for (const list of index.values()) list.sort((a, b) => b.at - a.at)
  return index
}

export function summarize(index: TicketIndex, meta: TicketsMeta): TicketSummary[] {
  const pinned = new Set(meta.pinned)
  const manual = new Set(meta.manual)
  const keys = new Set<string>([...index.keys(), ...meta.manual, ...meta.pinned])
  const out: TicketSummary[] = []
  for (const key of keys) {
    const refs = index.get(key) ?? []
    const counts = zeroCounts()
    for (const r of refs) counts[r.source]++
    out.push({
      key, counts, total: refs.length, lastAt: refs[0]?.at ?? 0,
      title: meta.titles[key] || undefined, pinned: pinned.has(key), manual: manual.has(key),
    })
  }
  return sortSummaries(out)
}

/** Fijados primero; después por última actividad; los sin actividad (manuales) al final por clave. */
export function sortSummaries(list: TicketSummary[]): TicketSummary[] {
  return [...list].sort((a, b) =>
    Number(b.pinned) - Number(a.pinned) || b.lastAt - a.lastAt || a.key.localeCompare(b.key, 'en', { numeric: true }))
}

export function detailFor(key: string, index: TicketIndex, meta: TicketsMeta, jiraBase: string | null): TicketDetail {
  const summary = summarize(new Map([[key, index.get(key) ?? []]]), { ...meta, manual: [...meta.manual, key] })[0]!
  const refs = { capture: [], clip: [], note: [], snippet: [], file: [] } as Record<TicketSource, TicketRef[]>
  for (const r of index.get(key) ?? []) refs[r.source].push(r)
  return { ...summary, manual: meta.manual.includes(key), refs, jiraBase }
}

export function filterSummaries(list: TicketSummary[], query: string): TicketSummary[] {
  const q = query.trim().toLowerCase()
  if (!q) return list
  return list.filter((t) => t.key.toLowerCase().includes(q) || (t.title ?? '').toLowerCase().includes(q))
}

// ─── Notas y exportación ─────────────────────────────────────────────────────

export const noteIdFor = (key: string): string => `${key}.md`

export function noteTemplate(key: string, title?: string): string {
  const head = title?.trim() ? `# ${key} — ${title.trim()}` : `# ${key}`
  return `${head}\n\n## Resumen\n\n\n## Análisis\n\n\n## Pasos\n\n1. \n\n## Pendientes\n\n- [ ] \n`
}

export function jiraUrl(base: string | null, key: string): string | null {
  const b = base?.trim().replace(/\/+$/, '')
  return b && /^https?:\/\//i.test(b) ? `${b}/browse/${encodeURIComponent(key)}` : null
}

/** README del export: el comentario de evidencia + las notas del ticket + archivos relacionados. */
export function exportMarkdown(key: string, title: string | undefined, evidence: string, notes: { title: string; content: string }[], files: string[]): string {
  const out = [title?.trim() ? `# ${key} — ${title.trim()}` : `# ${key}`, '', evidence.trim(), '']
  for (const n of notes) out.push('---', '', `## Nota: ${n.title}`, '', n.content.trim(), '')
  if (files.length) out.push('---', '', '## Archivos relacionados', '', ...files.map((f) => `- \`${f}\``), '')
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

export const SOURCE_LABEL: Record<TicketSource, string> = {
  capture: 'Capturas', note: 'Notas', snippet: 'Snippets', clip: 'Copiado', file: 'Archivos',
}
