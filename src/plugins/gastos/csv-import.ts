/**
 * Importador de movimientos desde CSV (puro): resumen de cuenta de Mercado Pago, exports de
 * home banking (débito/crédito en columnas separadas) o cualquier CSV con fecha/descripción/monto.
 *
 * Flujo: `analyzeCsv(text)` detecta separador, fila de encabezados, columnas y formatos →
 * el usuario puede corregir el mapeo → `buildImportRows` → `markDuplicates` contra lo existente.
 */
import { normKey } from './learning'
import type { Gasto, Moneda } from './types'

export type DateFormat = 'dmy' | 'mdy' | 'ymd'
export type NumberFormat = 'es' | 'en'
export type CsvSource = 'mp' | 'banco' | 'generico'

/** Índice de columna por campo; -1 = no mapeado. */
export interface ColumnMapping {
  fecha: number
  descripcion: number
  monto: number
  debito: number
  credito: number
  moneda: number
}

export interface CsvTable {
  delimiter: string
  headerRow: number
  headers: string[]
  rows: string[][]
}

export interface CsvAnalysis {
  table: CsvTable
  mapping: ColumnMapping
  dateFormat: DateFormat
  numberFormat: NumberFormat
  source: CsvSource
}

export interface ImportRow {
  /** Índice dentro de `table.rows` */
  index: number
  fecha: string | null
  descripcion: string
  /** Siempre positivo */
  monto: number | null
  moneda: Moneda
  kind: 'gasto' | 'ingreso'
  error?: string
  duplicateOf?: string
}

export const EMPTY_MAPPING: ColumnMapping = { fecha: -1, descripcion: -1, monto: -1, debito: -1, credito: -1, moneda: -1 }

// ── CSV ──────────────────────────────────────────────────────────────────────

export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 30)
  let best = ','
  let bestScore = -1
  for (const d of [';', ',', '\t', '|']) {
    const counts = lines.map((l) => splitLine(l, d).length - 1)
    const withSep = counts.filter((c) => c > 0)
    if (!withSep.length) continue
    // Muchas filas con la misma cantidad de separadores = buen candidato.
    const freq = new Map<number, number>()
    for (const c of withSep) freq.set(c, (freq.get(c) ?? 0) + 1)
    const [cols, rowsWithCols] = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]!
    const score = rowsWithCols * 10 + cols
    if (score > bestScore) { best = d; bestScore = score }
  }
  return best
}

function splitLine(line: string, d: string): string[] {
  return parseCsv(line, d)[0] ?? []
}

/** RFC 4180: comillas dobles, "" escapado, saltos de línea dentro de comillas. */
export function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const src = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++ } else quoted = false
      } else cell += c
      continue
    }
    if (c === '"' && cell.trim() === '') { quoted = true; cell = ''; continue }
    if (c === delimiter) { row.push(cell); cell = ''; continue }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
      continue
    }
    cell += c
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows.map((r) => r.map((x) => x.trim()))
}

// ── Encabezados y mapeo ─────────────────────────────────────────────────────

function h(s: string): string {
  return normKey(s.replace(/_/g, ' '))
}

const RE = {
  fecha: /\b(fecha|date|dia)\b/,
  descStrong: /\b(descripcion|concepto|detalle|description|glosa|comercio|leyenda|referencia comercio)\b/,
  descWeak: /\b(transaction type|tipo|movimiento|operacion|referencia)\b/,
  monto: /\b(importe|monto|amount|valor|net amount)\b/,
  debito: /\b(debito|debitos|debits?|debe|egresos?|cargos?|retiros?)\b/,
  credito: /\b(credito|creditos|credits?|haber|ingresos?|abonos?|depositos?)\b/,
  moneda: /\b(moneda|currency|divisa)\b/,
  saldo: /\b(saldo|balance)\b/,
}

function headerScore(cells: string[]): number {
  let score = 0
  const hs = cells.map(h)
  if (hs.some((x) => RE.fecha.test(x))) score += 2
  if (hs.some((x) => RE.descStrong.test(x) || RE.descWeak.test(x))) score += 1
  if (hs.some((x) => (RE.monto.test(x) && !RE.saldo.test(x)) || RE.debito.test(x) || RE.credito.test(x))) score += 1
  // Las filas de datos tienen números/fechas; los encabezados no.
  if (cells.some((c) => /\d{2,}/.test(c))) score -= 2
  return score
}

export function detectTable(text: string): CsvTable {
  const delimiter = detectDelimiter(text)
  const all = parseCsv(text, delimiter)
  let headerRow = 0
  let best = -Infinity
  for (let i = 0; i < Math.min(all.length, 40); i++) {
    const cells = all[i]!
    if (cells.filter(Boolean).length < 2) continue
    const s = headerScore(cells)
    if (s > best) { best = s; headerRow = i }
  }
  const headers = all[headerRow] ?? []
  const rows = all.slice(headerRow + 1).filter((r) => r.some((c) => c !== ''))
  return { delimiter, headerRow, headers, rows }
}

export function detectMapping(headers: string[]): ColumnMapping {
  const hs = headers.map(h)
  const used = new Set<number>()
  const find = (pred: (x: string) => boolean): number => {
    const i = hs.findIndex((x, idx) => !used.has(idx) && pred(x))
    if (i >= 0) used.add(i)
    return i
  }
  const fecha = find((x) => RE.fecha.test(x) && !/vencimiento/.test(x))
  const debito = find((x) => RE.debito.test(x) && !RE.saldo.test(x) && !RE.credito.test(x))
  const credito = find((x) => RE.credito.test(x) && !RE.saldo.test(x) && !RE.debito.test(x))
  const monto = find((x) => RE.monto.test(x) && !RE.saldo.test(x))
  const moneda = find((x) => RE.moneda.test(x))
  let descripcion = find((x) => RE.descStrong.test(x))
  if (descripcion < 0) descripcion = find((x) => RE.descWeak.test(x))
  return { fecha, descripcion, monto, debito, credito, moneda }
}

export function detectSource(headers: string[]): CsvSource {
  const hs = headers.map(h).join('|')
  if (/release date|transaction net amount|transaction type/.test(hs)) return 'mp'
  const m = detectMapping(headers)
  if (m.debito >= 0 || m.credito >= 0) return 'banco'
  return 'generico'
}

// ── Fechas y números ────────────────────────────────────────────────────────

function datePart(raw: string): string {
  return raw.trim().split(/[T\s]/)[0] ?? ''
}

export function detectDateFormat(values: string[]): DateFormat {
  let dmy = 0, mdy = 0, ymd = 0
  for (const v of values.slice(0, 200)) {
    const parts = datePart(v).split(/[/.-]/)
    if (parts.length !== 3) continue
    const [a, b] = parts.map(Number) as [number, number]
    if (parts[0]!.length === 4) ymd++
    else if (a > 12) dmy++
    else if (b > 12) mdy++
  }
  if (ymd && ymd >= dmy + mdy) return 'ymd'
  return mdy > dmy ? 'mdy' : 'dmy'
}

export function parseDateValue(raw: string, fmt: DateFormat): string | null {
  const parts = datePart(raw).split(/[/.-]/)
  if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) return null
  let [y, m, d] = [0, 0, 0]
  const n = parts.map(Number) as [number, number, number]
  if (parts[0]!.length === 4 || fmt === 'ymd') [y, m, d] = n
  else if (fmt === 'mdy') [m, d, y] = n
  else [d, m, y] = n
  if (y < 100) y += 2000
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function cleanNumber(raw: string): { s: string; negative: boolean } {
  let s = raw.trim()
  let negative = false
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1) }
  s = s.replace(/u\$s|us\$|usd|ars|\$|\s/gi, '')
  if (s.endsWith('-')) { negative = true; s = s.slice(0, -1) }
  if (s.startsWith('-')) { negative = !negative; s = s.slice(1) }
  else if (s.startsWith('+')) s = s.slice(1)
  return { s, negative }
}

export function detectNumberFormat(values: string[]): NumberFormat {
  let es = 0, en = 0
  for (const v of values.slice(0, 300)) {
    const { s } = cleanNumber(v)
    if (!s) continue
    if (/,\d{1,2}$/.test(s)) es++
    else if (/\.\d{1,2}$/.test(s)) en++
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) es++
    else if (/^\d{1,3}(,\d{3})+$/.test(s)) en++
  }
  return en > es ? 'en' : 'es'
}

export function parseNumberValue(raw: string, fmt: NumberFormat): number | null {
  const { s, negative } = cleanNumber(raw)
  if (!s) return null
  const normalized = fmt === 'es' ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null
  const n = Math.round(Number(normalized) * 100) / 100
  return negative ? -n : n
}

function monedaOf(raw: string): Moneda | null {
  const t = normKey(raw)
  if (/\b(usd|u s s|us|dolar|dolares|dls)\b/.test(t) || /u\$s|us\$/i.test(raw)) return 'USD'
  if (/\b(ars|pesos?)\b/.test(t) || raw.trim() === '$') return 'ARS'
  return null
}

// ── Análisis completo ───────────────────────────────────────────────────────

export function analyzeCsv(text: string): CsvAnalysis {
  const table = detectTable(text)
  const mapping = detectMapping(table.headers)
  const col = (i: number): string[] => (i < 0 ? [] : table.rows.map((r) => r[i] ?? '').filter(Boolean))
  return {
    table,
    mapping,
    dateFormat: detectDateFormat(col(mapping.fecha)),
    numberFormat: detectNumberFormat([...col(mapping.monto), ...col(mapping.debito), ...col(mapping.credito)]),
    source: detectSource(table.headers),
  }
}

export function buildImportRows(
  table: CsvTable,
  mapping: ColumnMapping,
  opts: { dateFormat: DateFormat; numberFormat: NumberFormat; defaultMoneda?: Moneda },
): ImportRow[] {
  const cell = (r: string[], i: number): string => (i >= 0 ? r[i] ?? '' : '')
  const split = mapping.debito >= 0 || mapping.credito >= 0
  // Con una sola columna de monto: si hay negativos, los gastos son los negativos (MP, la mayoría de los bancos).
  const amounts = split ? [] : table.rows.map((r) => parseNumberValue(cell(r, mapping.monto), opts.numberFormat))
  const expensesNegative = amounts.some((n) => n !== null && n < 0)

  return table.rows.map((r, index): ImportRow => {
    const fecha = parseDateValue(cell(r, mapping.fecha), opts.dateFormat)
    const descripcion = cell(r, mapping.descripcion).replace(/\s+/g, ' ').trim() || 'Movimiento importado'
    let monto: number | null = null
    let kind: ImportRow['kind'] = 'gasto'
    if (split) {
      const deb = parseNumberValue(cell(r, mapping.debito), opts.numberFormat)
      const cred = parseNumberValue(cell(r, mapping.credito), opts.numberFormat)
      if (deb) { monto = Math.abs(deb); kind = 'gasto' }
      else if (cred) { monto = Math.abs(cred); kind = 'ingreso' }
    } else {
      const n = amounts[index] ?? null
      if (n) {
        monto = Math.abs(n)
        kind = expensesNegative && n > 0 ? 'ingreso' : 'gasto'
      }
    }
    const moneda = monedaOf(cell(r, mapping.moneda))
      ?? monedaOf(cell(r, mapping.monto) || cell(r, mapping.debito) || cell(r, mapping.credito))
      ?? opts.defaultMoneda ?? 'ARS'
    const error = !fecha ? 'Fecha inválida' : !monto ? 'Sin monto' : undefined
    return { index, fecha, descripcion, monto, moneda, kind, ...(error ? { error } : {}) }
  })
}

// ── Duplicados ──────────────────────────────────────────────────────────────

function words(s: string): Set<string> {
  return new Set(normKey(s).split(' ').filter((w) => w.length >= 3 && !/^\d+$/.test(w)))
}

/** Descripciones parecidas: iguales, una contiene a la otra, o comparten ≥ la mitad de las palabras de la más corta. */
export function similarDescription(a: string, b: string): boolean {
  const ka = normKey(a), kb = normKey(b)
  if (!ka || !kb || ka === kb || ka.includes(kb) || kb.includes(ka)) return true
  const wa = words(a), wb = words(b)
  if (!wa.size || !wb.size) return true
  let inter = 0
  for (const w of wa) if (wb.has(w)) inter++
  return inter / Math.min(wa.size, wb.size) >= 0.5
}

/** Marca `duplicateOf` cuando ya existe un gasto con la misma fecha, el mismo monto y descripción parecida. */
export function markDuplicates(rows: ImportRow[], existing: Gasto[]): ImportRow[] {
  const byKey = new Map<string, Gasto[]>()
  for (const g of existing) {
    const k = `${g.fecha}|${g.monto.toFixed(2)}`
    const list = byKey.get(k)
    if (list) list.push(g)
    else byKey.set(k, [g])
  }
  return rows.map((r) => {
    if (!r.fecha || r.monto === null) return r
    const hit = byKey.get(`${r.fecha}|${r.monto.toFixed(2)}`)?.find((g) => similarDescription(g.descripcion, r.descripcion))
    return hit ? { ...r, duplicateOf: hit.id } : r
  })
}

/** Id estable de un movimiento importado: re-importar el mismo archivo no duplica. */
export function importedGastoId(r: Pick<ImportRow, 'fecha' | 'monto' | 'descripcion'>, occurrence = 0): string {
  const base = `${r.fecha}|${r.monto?.toFixed(2)}|${normKey(r.descripcion)}|${occurrence}`
  let hash = 5381
  for (let i = 0; i < base.length; i++) hash = ((hash * 33) ^ base.charCodeAt(i)) >>> 0
  return `imp-${(r.fecha ?? '').replace(/-/g, '')}-${hash.toString(36)}`
}
