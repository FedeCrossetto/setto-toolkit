/**
 * Consultas SQL: helpers puros (los usan el renderer y main).
 */

export interface SqlBatch {
  sql: string
  /** Línea (1-based) del editor donde empieza el lote: para ubicar los errores. */
  startLine: number
  /** `GO 3` repite el lote 3 veces, como en SSMS. */
  repeat: number
}

const GO_RE = /^\s*GO(?:\s+(\d+))?\s*(?:--.*)?$/i

/** Separa por líneas `GO` (sólo la palabra en su línea, como SSMS). Ignora lotes vacíos. */
export function splitBatches(text: string): SqlBatch[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const out: SqlBatch[] = []
  let buf: string[] = []
  let start = 1
  const flush = (repeat: number): void => {
    const sql = buf.join('\n')
    if (sql.trim()) out.push({ sql, startLine: start, repeat })
    buf = []
  }
  lines.forEach((line, i) => {
    const m = GO_RE.exec(line)
    if (m) {
      flush(Math.max(1, Math.min(1000, Number(m[1] ?? 1))))
      start = i + 2
    } else {
      buf.push(line)
    }
  })
  flush(1)
  return out
}

/** Quita comentarios y strings para buscar palabras clave sin falsos positivos. */
function codeOnly(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/N?'(?:[^']|'')*'/g, "''")
}

export interface SqlRisk { kind: 'update-no-where' | 'delete-no-where' | 'drop' | 'truncate'; label: string }

/**
 * Sentencias que cambian datos sin filtro o borran objetos: se avisa antes de ejecutar
 * fuera del modo lectura. Heurística por sentencia (separadas por `;` o por lote).
 */
export function findRisks(sql: string): SqlRisk[] {
  const risks: SqlRisk[] = []
  const add = (r: SqlRisk): void => { if (!risks.some((x) => x.kind === r.kind)) risks.push(r) }
  for (const batch of splitBatches(sql)) {
    const code = codeOnly(batch.sql)
    // Cortar en sentencias: `;` o el comienzo de otra sentencia DML.
    const stmts = code.split(/;|(?=\b(?:UPDATE|DELETE|INSERT|SELECT|DROP|TRUNCATE|MERGE)\b)/i)
    for (const st of stmts) {
      const s = st.trim()
      if (/^UPDATE\b/i.test(s) && !/\bWHERE\b/i.test(s)) add({ kind: 'update-no-where', label: 'UPDATE sin WHERE' })
      if (/^DELETE\b/i.test(s) && !/\bWHERE\b/i.test(s)) add({ kind: 'delete-no-where', label: 'DELETE sin WHERE' })
      if (/^DROP\b/i.test(s)) add({ kind: 'drop', label: 'DROP' })
      if (/^TRUNCATE\b/i.test(s)) add({ kind: 'truncate', label: 'TRUNCATE' })
    }
  }
  return risks
}

/** Título de una pestaña a partir de su contenido ("SELECT … FROM accounts"). */
export function tabTitle(sql: string, fallback: string): string {
  const first = codeOnly(sql).split('\n').map((l) => l.trim()).find(Boolean)
  if (!first) return fallback
  const from = /\bFROM\s+([\w.[\]]+)/i.exec(codeOnly(sql))
  const verb = /^(\w+)/.exec(first)?.[1]?.toUpperCase() ?? ''
  if (from && /^(SELECT|DELETE|WITH)$/.test(verb)) return `${verb === 'WITH' ? 'SELECT' : verb} · ${from[1]!.replace(/[[\]]/g, '')}`
  const upd = /^(UPDATE|INSERT\s+INTO|EXEC(?:UTE)?)\s+([\w.[\]]+)/i.exec(first)
  if (upd) return `${upd[1]!.split(/\s+/)[0]!.toUpperCase()} · ${upd[2]!.replace(/[[\]]/g, '')}`
  return first.length > 32 ? `${first.slice(0, 31)}…` : first
}

// ── Comparar resultados entre dos conexiones ──────────────────────────────────

export interface ResultSet { columns: string[]; rows: (string | null)[][] }

export interface CompareRow {
  key: string[]
  status: 'only-a' | 'only-b' | 'diff'
  a?: (string | null)[]
  b?: (string | null)[]
  /** Índices de columnas (no clave) que difieren */
  changed: number[]
}

export interface CompareResult { columns: string[]; keyCount: number; rows: CompareRow[]; same: number }

/**
 * Compara dos resultados con las mismas columnas. Las primeras `keyCount` columnas
 * identifican la fila; el resto se compara. Devuelve sólo lo distinto (y cuántas iguales).
 */
export function compareSets(a: ResultSet, b: ResultSet, keyCount: number): CompareResult {
  const cols = a.columns
  const k = Math.max(1, Math.min(keyCount, cols.length))
  const keyOf = (r: (string | null)[]): string => JSON.stringify(r.slice(0, k).map((v) => (v ?? '').trim().toLowerCase()))
  const mapB = new Map<string, (string | null)[]>()
  for (const r of b.rows) mapB.set(keyOf(r), r)
  const rows: CompareRow[] = []
  let same = 0
  const seen = new Set<string>()
  for (const ra of a.rows) {
    const key = keyOf(ra)
    seen.add(key)
    const rb = mapB.get(key)
    if (!rb) { rows.push({ key: ra.slice(0, k).map((v) => v ?? ''), status: 'only-a', a: ra, changed: [] }); continue }
    const changed: number[] = []
    for (let i = k; i < cols.length; i++) if ((ra[i] ?? null) !== (rb[i] ?? null)) changed.push(i)
    if (changed.length) rows.push({ key: ra.slice(0, k).map((v) => v ?? ''), status: 'diff', a: ra, b: rb, changed })
    else same++
  }
  for (const rb of b.rows) {
    if (!seen.has(keyOf(rb))) rows.push({ key: rb.slice(0, k).map((v) => v ?? ''), status: 'only-b', b: rb, changed: [] })
  }
  const order = { diff: 0, 'only-a': 1, 'only-b': 2 } as const
  rows.sort((x, y) => order[x.status] - order[y.status] || x.key.join('|').localeCompare(y.key.join('|')))
  return { columns: cols, keyCount: k, rows, same }
}

/** Consulta sugerida para comparar los General Params de Wigos. */
export const GP_COMPARE_SQL = 'SELECT GP_GROUP_KEY, GP_SUBJECT_KEY, GP_KEY_VALUE\nFROM GENERAL_PARAMS\nORDER BY GP_GROUP_KEY, GP_SUBJECT_KEY'

/** Resultados como texto separado por tabs (para pegar en Excel o en un mail). */
export function toTsv(columns: string[], rows: (string | null)[][]): string {
  const cell = (v: string | null): string => (v === null ? 'NULL' : v.replace(/[\t\r\n]+/g, ' '))
  return [columns.join('\t'), ...rows.map((r) => r.map(cell).join('\t'))].join('\n')
}

/** CSV (separador ";" por configuración regional es-AR de Excel). */
export function toCsv(columns: string[], rows: (string | null)[][]): string {
  const cell = (v: string | null): string => {
    if (v === null) return ''
    return /[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
  }
  return [columns.map(cell).join(';'), ...rows.map((r) => r.map(cell).join(';'))].join('\r\n')
}
