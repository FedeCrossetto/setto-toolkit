/**
 * Utilidades puras de Consultas: parámetros (@x), copiar como tabla de Jira/Markdown,
 * estadísticas (SET STATISTICS IO/TIME), orden por columna y visor de valores.
 */
import { splitBatches } from './sql-text'

// ── Parámetros ───────────────────────────────────────────────────────────────

/** Quita textos, comentarios y [identificadores] (para buscar @variables sin falsos positivos). */
function stripLiterals(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/N?'(?:[^']|'')*'/gi, "''")
    .replace(/\[[^\]]*\]/g, '[]')
}

/**
 * Variables @x que se usan pero no se declaran: son los parámetros que hay que pedir.
 * No cuentan @@globales, las DECLAREd, ni los nombres de parámetro en `EXEC sp @p = …`.
 */
export function findParams(sql: string): string[] {
  const clean = stripLiterals(sql)
  const declared = new Set<string>()
  for (const m of clean.matchAll(/\bdeclare\s+([^;]+)/gi)) {
    for (const d of m[1]!.matchAll(/@([A-Za-z_][\w$#]*)/g)) declared.add(d[1]!.toLowerCase())
  }
  for (const m of clean.matchAll(/\b(?:fetch\s+next\s+from\s+\w+\s+into|declare)\s+@([A-Za-z_][\w$#]*)/gi)) declared.add(m[1]!.toLowerCase())
  const out: string[] = []
  const seen = new Set<string>()
  for (const line of clean.split('\n')) {
    const isExec = /\bexec(ute)?\b/i.test(line)
    for (const m of line.matchAll(/(?<![@\w])@([A-Za-z_][\w$#]*)(\s*=(?!=))?/g)) {
      const name = m[1]!
      const key = name.toLowerCase()
      if (declared.has(key) || seen.has(key)) continue
      if (isExec && m[2]) continue // EXEC sp @param = valor → es el nombre del parámetro del procedimiento
      seen.add(key)
      out.push(name)
    }
  }
  return out
}

/** DECLARE con el tipo según el valor: entero, decimal, NULL o texto. */
export function declareFor(name: string, raw: string): string {
  const v = raw.trim()
  if (/^null$/i.test(v)) return `DECLARE @${name} NVARCHAR(4000) = NULL;`
  if (/^-?\d{1,18}$/.test(v)) return `DECLARE @${name} BIGINT = ${v};`
  if (/^-?\d+\.\d+$/.test(v)) return `DECLARE @${name} DECIMAL(38, 10) = ${v};`
  return `DECLARE @${name} NVARCHAR(4000) = N'${raw.replace(/'/g, "''")}';`
}

/**
 * Agrega los DECLARE de los parámetros al principio de cada lote (GO) que los usa, en la
 * MISMA primera línea: así los números de línea de los errores no cambian.
 */
export function applyParams(sql: string, values: Record<string, string>): string {
  const names = Object.keys(values)
  if (!names.length) return sql
  const lines = sql.split('\n')
  for (const b of splitBatches(sql)) {
    const used = findParams(b.sql).filter((p) => names.some((n) => n.toLowerCase() === p.toLowerCase()))
    if (!used.length) continue
    const decl = used.map((p) => declareFor(p, values[names.find((n) => n.toLowerCase() === p.toLowerCase())!]!)).join(' ')
    const i = b.startLine - 1
    lines[i] = `${decl} ${lines[i] ?? ''}`
  }
  return lines.join('\n')
}

// ── Copiar como tabla ────────────────────────────────────────────────────────

const cellText = (v: string | null): string => (v === null ? 'NULL' : v.replace(/\r?\n/g, ' '))

/** Tabla de Jira (wiki markup): `||col||col||` y `|v|v|`. */
export function toJiraTable(columns: string[], rows: (string | null)[][]): string {
  const esc = (s: string): string => (s === '' ? ' ' : s.replace(/\|/g, '\\|'))
  return [`||${columns.map((c) => esc(c)).join('||')}||`, ...rows.map((r) => `|${r.map((v) => esc(cellText(v))).join('|')}|`)].join('\n')
}

/** Tabla Markdown (GitHub, Confluence, Teams). */
export function toMarkdownTable(columns: string[], rows: (string | null)[][], types: string[] = []): string {
  const esc = (s: string): string => s.replace(/\|/g, '\\|')
  const numeric = (t?: string): boolean => /^(int|bigint|smallint|tinyint|decimal|numeric|money|smallmoney|float|real)$/i.test(t ?? '')
  return [
    `| ${columns.map(esc).join(' | ')} |`,
    `| ${columns.map((_, i) => (numeric(types[i]) ? '---:' : '---')).join(' | ')} |`,
    ...rows.map((r) => `| ${r.map((v) => esc(cellText(v))).join(' | ')} |`),
  ].join('\n')
}

// ── Estadísticas ─────────────────────────────────────────────────────────────

export interface StatsSummary { logicalReads: number; physicalReads: number; cpuMs: number; elapsedMs: number; tables: { table: string; logical: number }[] }

/** Resume los mensajes de SET STATISTICS IO, TIME (en inglés o en español). */
export function parseStats(messages: string[]): StatsSummary | null {
  let logical = 0, physical = 0, cpu = 0, elapsed = 0, found = false
  const byTable = new Map<string, number>()
  for (const m of messages) {
    const t = /(?:Table|Tabla) '([^']+)'.*?(?:logical reads|lecturas l[oó]gicas) (\d+)(?:.*?(?:physical reads|lecturas f[ií]sicas) (\d+))?/i.exec(m)
    if (t) {
      found = true
      const n = Number(t[2])
      logical += n
      physical += Number(t[3] ?? 0)
      byTable.set(t[1]!, (byTable.get(t[1]!) ?? 0) + n)
    }
    for (const x of m.matchAll(/(?:CPU time|tiempo de CPU) = (\d+) ms,\s*(?:elapsed time|tiempo transcurrido) = (\d+) ms/gi)) {
      found = true
      cpu += Number(x[1]); elapsed += Number(x[2])
    }
  }
  if (!found) return null
  const tables = [...byTable].map(([table, l]) => ({ table, logical: l })).sort((a, b) => b.logical - a.logical)
  return { logicalReads: logical, physicalReads: physical, cpuMs: cpu, elapsedMs: elapsed, tables }
}

/** Antepone SET STATISTICS IO, TIME ON en la primera línea de cada lote (sin mover las líneas). */
export function withStatistics(sql: string): string {
  const lines = sql.split('\n')
  for (const b of splitBatches(sql)) {
    const i = b.startLine - 1
    lines[i] = `SET STATISTICS IO, TIME ON; ${lines[i] ?? ''}`
  }
  return lines.join('\n')
}

// ── Orden por columna ────────────────────────────────────────────────────────

const NUM = /^(int|bigint|smallint|tinyint|decimal|numeric|money|smallmoney|float|real|bit)$/i

/** Comparador para ordenar filas por una columna (números como números, NULL al final). */
export function compareCells(a: string | null, b: string | null, type: string | undefined, dir: 1 | -1): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  if (NUM.test(type ?? '')) return (Number(a) - Number(b)) * dir
  return a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' }) * dir
}

// ── Visor de valores ─────────────────────────────────────────────────────────

/** Formatea JSON o XML para leerlo; si no es ninguno, lo devuelve igual. */
export function prettyValue(v: string): { text: string; kind: 'json' | 'xml' | 'text' } {
  const s = v.trim()
  if (/^[[{]/.test(s)) {
    try { return { text: JSON.stringify(JSON.parse(s), null, 2), kind: 'json' } } catch { /* no es JSON */ }
  }
  if (/^<[\s\S]*>$/.test(s)) {
    const toks = [...s.matchAll(/<[^>]+>|[^<]+/g)].map((m) => m[0]).filter((t) => t.trim())
    const out: string[] = []
    let depth = 0
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i]!
      const ind = '  '.repeat(Math.max(0, depth))
      if (t.startsWith('</')) { depth--; out.push('  '.repeat(Math.max(0, depth)) + t); continue }
      if (t.startsWith('<') && !t.endsWith('/>') && !t.startsWith('<?') && !t.startsWith('<!')) {
        // <b>texto</b> queda en una línea
        if (toks[i + 1] && !toks[i + 1]!.startsWith('<') && toks[i + 2]?.startsWith('</')) { out.push(ind + t + toks[i + 1]!.trim() + toks[i + 2]); i += 2; continue }
        out.push(ind + t); depth++; continue
      }
      out.push(ind + t.trim())
    }
    return { text: out.join('\n'), kind: 'xml' }
  }
  return { text: v, kind: 'text' }
}
