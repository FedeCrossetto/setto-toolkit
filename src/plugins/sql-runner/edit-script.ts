/**
 * Edición de resultados (como DataGrip): de los cambios hechos en la grilla se arma un
 * script UPDATE / INSERT / DELETE identificando cada fila por su clave primaria. Al
 * aplicarlo corre en una transacción y cada UPDATE/DELETE exige tocar exactamente 1 fila.
 */
import { sqlValue } from './export'

/** Valor nuevo de una celda (null = NULL). */
export type CellValue = string | null

export interface GridEdits {
  /** fila original → columna → valor nuevo */
  updates: Map<number, Map<number, CellValue>>
  /** filas originales a eliminar */
  deleted: Set<number>
  /** filas nuevas: columna → valor (las columnas sin valor no van en el INSERT) */
  inserted: Map<number, CellValue>[]
}

export const emptyEdits = (): GridEdits => ({ updates: new Map(), deleted: new Set(), inserted: [] })

export function countEdits(e: GridEdits): number {
  let n = e.deleted.size + e.inserted.filter((r) => r.size > 0).length
  for (const [row, cols] of e.updates) if (!e.deleted.has(row) && cols.size) n += 1
  return n
}

export interface EditTarget {
  /** Tabla tal como se escribió en el FROM (dbo.accounts, [dbo].[accounts]…) */
  table: string
  columns: string[]
  types: string[]
  /** Columnas que identifican la fila: la clave primaria, o todas si la tabla no tiene */
  pk: string[]
  /** 'all' = la tabla no tiene clave primaria y la fila se identifica por todas sus columnas */
  keyMode?: 'pk' | 'all'
  /** Base donde está la tabla cuando la consulta empieza con USE (si no, la de la pestaña) */
  database?: string
}

/** La base del último `USE base` de la consulta (null si no hay). */
export function usedDatabase(sql: string): string | null {
  const all = [...sql.matchAll(/^\s*use\s+(?:\[([^\]]+)\]|([^\s;]+))\s*;?/gim)]
  const m = all[all.length - 1]
  return m ? (m[1] ?? m[2] ?? null) : null
}

/** Tipos que SQL Server no puede comparar con `=` (no sirven para identificar la fila). */
const NOT_COMPARABLE = /^(text|ntext|image|xml|geography|geometry|hierarchyid|sql_variant|timestamp|rowversion)$/i

const q = (name: string): string => `[${name.replace(/]/g, ']]')}]`
export function quoteTable(table: string): string {
  if (table.includes('[')) return table
  return table.split('.').map(q).join('.')
}

/** Por qué no se puede editar este resultado (null = se puede). */
export function editBlocker(sql: string, setCount: number, columns: string[], pk: string[] | null, tableColumns?: string[]): string | null {
  if (setCount !== 1) return 'Para editar, la consulta tiene que devolver un solo resultado.'
  if (/\b(join|union|group\s+by|distinct|intersect|except)\b/i.test(sql)) return 'Para editar, consultá una sola tabla (sin JOIN, UNION, GROUP BY ni DISTINCT).'
  if (pk === null) return 'No se encontró la tabla del FROM.'
  const lower = columns.map((c) => c.toLowerCase())
  const missing = pk.filter((k) => !lower.includes(k.toLowerCase()))
  if (missing.length) return `Incluí la clave primaria en el SELECT (${missing.join(', ')}) para poder editar.`
  if (new Set(lower).size !== lower.length) return 'Hay columnas repetidas en el resultado.'
  if (tableColumns) {
    const cols = new Set(tableColumns.map((c) => c.toLowerCase()))
    const extra = columns.filter((c) => !cols.has(c.toLowerCase()))
    if (extra.length) return `La consulta trae columnas que no son de la tabla (${extra.slice(0, 3).join(', ')}): sacalas o usá sus nombres reales.`
  }
  return null
}

function where(t: EditTarget, row: CellValue[]): string {
  const lower = t.columns.map((c) => c.toLowerCase())
  const keys = t.keyMode === 'all' ? t.columns : t.pk
  return keys.flatMap((k) => {
    const i = lower.indexOf(k.toLowerCase())
    const v = row[i] ?? null
    // Sin clave primaria: se saltean columnas no comparables y binarios cortados en la grilla.
    if (t.keyMode === 'all' && (NOT_COMPARABLE.test(t.types[i] ?? '') || (v !== null && v.endsWith('…')))) return []
    return [v === null ? `${q(t.columns[i]!)} IS NULL` : `${q(t.columns[i]!)} = ${sqlValue(v, t.types[i])}`]
  }).join(' AND ')
}

const check = (what: string): string => `IF @@ROWCOUNT <> 1 BEGIN ROLLBACK; THROW 50000, N'${what.replace(/'/g, "''")}: no se encontró la fila o cambió. No se aplicó nada.', 1; END;`

/** Las sentencias, sin transacción (para mostrar o copiar). */
export function buildStatements(t: EditTarget, rows: CellValue[][], e: GridEdits): string[] {
  const table = quoteTable(t.table)
  const out: string[] = []
  for (const [r, cols] of [...e.updates].sort((a, b) => a[0] - b[0])) {
    if (e.deleted.has(r) || !cols.size) continue
    const row = rows[r]
    if (!row) continue
    const sets = [...cols].sort((a, b) => a[0] - b[0]).map(([c, v]) => `${q(t.columns[c]!)} = ${sqlValue(v, t.types[c])}`)
    out.push(`UPDATE ${table} SET ${sets.join(', ')} WHERE ${where(t, row)};`)
  }
  for (const r of [...e.deleted].sort((a, b) => a - b)) {
    const row = rows[r]
    if (row) out.push(`DELETE FROM ${table} WHERE ${where(t, row)};`)
  }
  for (const ins of e.inserted) {
    if (!ins.size) continue
    const cols = [...ins].sort((a, b) => a[0] - b[0])
    out.push(`INSERT INTO ${table} (${cols.map(([c]) => q(t.columns[c]!)).join(', ')}) VALUES (${cols.map(([c, v]) => sqlValue(v, t.types[c])).join(', ')});`)
  }
  return out
}

/** Script para ejecutar: transacción, y cada UPDATE/DELETE debe afectar exactamente 1 fila. */
export function buildApplyScript(t: EditTarget, rows: CellValue[][], e: GridEdits): string {
  const lines = buildStatements(t, rows, e).flatMap((s, i) => (s.startsWith('INSERT') ? [s] : [s, check(`Cambio ${i + 1}`)]))
  return ['SET XACT_ABORT ON;', 'BEGIN TRAN;', ...lines, 'COMMIT;', ''].join('\n')
}

/** Clave primaria (1er resultado) de la tabla, para `sql:meta` kind 'pk'. */
export function pkSql(table: string): string {
  if (!/^[\w.[\]# -]+$/.test(table)) throw new Error('Nombre de tabla inválido')
  const t = table.replace(/'/g, "''")
  return `SELECT c.name
FROM sys.indexes i
JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE i.is_primary_key = 1 AND i.object_id = OBJECT_ID(N'${t}')
ORDER BY ic.key_ordinal;
SELECT CASE WHEN OBJECTPROPERTY(OBJECT_ID(N'${t}'), 'IsUserTable') = 1 THEN 1 ELSE 0 END AS existe;
SELECT name FROM sys.columns WHERE object_id = OBJECT_ID(N'${t}') ORDER BY column_id;`
}

export const isTextType = (t: string | undefined): boolean => /char|text|xml|sysname/i.test(t ?? '')

/**
 * Lo escrito en una celda → valor: "NULL" (sin comillas) es NULL, como en SSMS. Vacío en
 * columnas de texto es '' (texto vacío); en números, fechas, etc. o si ya era NULL, es NULL.
 */
export function cellInput(raw: string, prev: string | null, type: string | undefined): string | null {
  if (/^null$/i.test(raw.trim())) return null
  if (raw === '' && (prev === null || !isTextType(type))) return null
  return raw
}
