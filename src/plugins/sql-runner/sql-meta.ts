/**
 * Explorador de objetos y diagnóstico de conexión: consultas al catálogo de SQL Server
 * (sys.*) y helpers puros para armar scripts. Los usan main (que corre las consultas)
 * y el renderer (que arma el árbol y los scripts).
 */
import type { QueryResult } from './types'

export type MetaKind = 'databases' | 'objects' | 'children' | 'definition' | 'completion' | 'pk' | 'locate'

/** Tipos de sys.objects que muestra el explorador. */
export type SqlObjectType = 'U' | 'V' | 'P' | 'FN' | 'IF' | 'TF' | 'TR' | 'SN'

export interface SqlObject {
  schema: string
  name: string
  type: SqlObjectType
  id: number
  modified: string
  /** Tabla de un disparador */
  parent: string | null
  /** Filas aproximadas (sólo tablas) */
  rows: number | null
}

export interface SqlColumn {
  name: string
  type: string
  nullable: boolean
  identity: boolean
  pk: boolean
  default: string | null
}

export interface SqlParam { name: string; type: string; output: boolean }

export interface ObjectGroup { id: string; label: string; types: SqlObjectType[] }

export const OBJECT_GROUPS: ObjectGroup[] = [
  { id: 'tables', label: 'Tablas', types: ['U'] },
  { id: 'views', label: 'Vistas', types: ['V'] },
  { id: 'procs', label: 'Procedimientos', types: ['P'] },
  { id: 'functions', label: 'Funciones', types: ['FN', 'IF', 'TF'] },
  { id: 'triggers', label: 'Disparadores', types: ['TR'] },
  { id: 'synonyms', label: 'Sinónimos', types: ['SN'] },
]

export const DATABASES_SQL = `SELECT name FROM sys.databases
WHERE state = 0 AND HAS_DBACCESS(name) = 1
ORDER BY CASE WHEN database_id <= 4 THEN 1 ELSE 0 END, name`

/**
 * Objeto que la consulta no encontró (Msg 208, "Invalid object name 'X'"): suele ser
 * que corrió en otra base (la conexión no tiene base elegida → master).
 */
export function missingObject(r: Pick<QueryResult, 'ok' | 'number' | 'error'>): string | null {
  if (r.ok) return null
  const m = /(?:invalid object name|nombre de objeto) '([^']+)'/i.exec(r.error ?? '')
  return r.number === 208 || m ? m?.[1] ?? null : null
}

/** Base actual y las bases (con acceso) donde existe `name`, para `sql:meta` kind 'locate'. */
export function locateSql(name: string): string {
  if (!/^[\w.[\]# -]+$/.test(name) || name.split('.').length > 2) throw new Error('Nombre de objeto inválido')
  const obj = (name.includes('.') ? name : `dbo.${name}`).replace(/'/g, "''")
  return `SELECT DB_NAME() AS actual;
SELECT name FROM sys.databases
WHERE state = 0 AND HAS_DBACCESS(name) = 1 AND OBJECT_ID(QUOTENAME(name) + N'.${obj}') IS NOT NULL
ORDER BY name`
}

export const OBJECTS_SQL = `SELECT s.name AS sch, o.name, RTRIM(o.type) AS type, o.object_id,
  CONVERT(varchar(16), o.modify_date, 120) AS modified,
  CASE WHEN o.type = 'TR' THEN OBJECT_NAME(o.parent_object_id) END AS parent,
  r.rows
FROM sys.objects o
JOIN sys.schemas s ON s.schema_id = o.schema_id
LEFT JOIN (SELECT object_id, SUM(rows) AS rows FROM sys.partitions WHERE index_id IN (0, 1) GROUP BY object_id) r
  ON r.object_id = o.object_id AND o.type = 'U'
WHERE o.is_ms_shipped = 0 AND o.type IN ('U','V','P','FN','IF','TF','TR','SN')
ORDER BY s.name, o.name`

/** Columnas (1er resultado) y parámetros (2do) de un objeto. */
export function childrenSql(objectId: number): string {
  const id = safeId(objectId)
  return `SELECT c.name, TYPE_NAME(c.user_type_id) AS type, c.max_length, c.precision, c.scale, c.is_nullable, c.is_identity,
  CASE WHEN EXISTS (SELECT 1 FROM sys.index_columns ic JOIN sys.indexes i ON i.object_id = ic.object_id AND i.index_id = ic.index_id
    WHERE i.is_primary_key = 1 AND ic.object_id = c.object_id AND ic.column_id = c.column_id) THEN 1 ELSE 0 END AS pk,
  OBJECT_DEFINITION(c.default_object_id) AS dflt
FROM sys.columns c WHERE c.object_id = ${id} ORDER BY c.column_id;
SELECT p.name, TYPE_NAME(p.user_type_id) AS type, p.max_length, p.precision, p.scale, p.is_output
FROM sys.parameters p WHERE p.object_id = ${id} AND p.parameter_id > 0 ORDER BY p.parameter_id;`
}

/** Texto del objeto (procedimientos, vistas, funciones, disparadores) o destino del sinónimo. */
export function definitionSql(objectId: number): string {
  const id = safeId(objectId)
  return `SELECT OBJECT_DEFINITION(${id}) AS def, (SELECT base_object_name FROM sys.synonyms WHERE object_id = ${id}) AS syn`
}

function safeId(n: number): number {
  if (!Number.isInteger(n)) throw new Error('Id de objeto inválido')
  return n
}

export function quoteName(n: string): string {
  return `[${n.replace(/]/g, ']]')}]`
}

export const fullName = (o: Pick<SqlObject, 'schema' | 'name'>): string => `${quoteName(o.schema)}.${quoteName(o.name)}`

/** `nvarchar(50)`, `decimal(18,2)`, `varchar(MAX)`… a partir de sys.columns. */
export function formatType(type: string, maxLength: number, precision: number, scale: number): string {
  const t = type.toLowerCase()
  if (['varchar', 'char', 'varbinary', 'binary'].includes(t)) return `${type}(${maxLength === -1 ? 'MAX' : maxLength})`
  if (['nvarchar', 'nchar'].includes(t)) return `${type}(${maxLength === -1 ? 'MAX' : maxLength / 2})`
  if (['decimal', 'numeric'].includes(t)) return `${type}(${precision},${scale})`
  if (['datetime2', 'time', 'datetimeoffset'].includes(t)) return `${type}(${scale})`
  return type
}

const num = (v: string | null | undefined): number => Number(v ?? 0) || 0
const bool = (v: string | null | undefined): boolean => v === '1' || v?.toLowerCase() === 'true'

export function parseObjects(r: QueryResult): SqlObject[] {
  return (r.sets[0]?.rows ?? []).map((x) => ({
    schema: x[0] ?? '', name: x[1] ?? '', type: (x[2] ?? 'U') as SqlObjectType, id: num(x[3]),
    modified: x[4] ?? '', parent: x[5] ?? null, rows: x[6] == null ? null : num(x[6]),
  }))
}

export function parseChildren(r: QueryResult): { columns: SqlColumn[]; params: SqlParam[] } {
  return {
    columns: (r.sets[0]?.rows ?? []).map((x) => ({
      name: x[0] ?? '', type: formatType(x[1] ?? '', num(x[2]), num(x[3]), num(x[4])),
      nullable: bool(x[5]), identity: bool(x[6]), pk: bool(x[7]), default: x[8] ?? null,
    })),
    params: (r.sets[1]?.rows ?? []).map((x) => ({ name: x[0] ?? '', type: formatType(x[1] ?? '', num(x[2]), num(x[3]), num(x[4])), output: bool(x[5]) })),
  }
}

/** CREATE TABLE aproximado (columnas, identidad, nulos, defaults y clave primaria). */
export function tableScript(o: Pick<SqlObject, 'schema' | 'name'>, cols: SqlColumn[]): string {
  const lines = cols.map((c) => `    ${quoteName(c.name)} ${c.type}${c.identity ? ' IDENTITY' : ''}${c.nullable ? ' NULL' : ' NOT NULL'}${c.default ? ` DEFAULT ${c.default}` : ''}`)
  const pk = cols.filter((c) => c.pk).map((c) => quoteName(c.name))
  if (pk.length) lines.push(`    PRIMARY KEY (${pk.join(', ')})`)
  return `-- Generado desde las columnas (sin índices ni claves foráneas)\nCREATE TABLE ${fullName(o)} (\n${lines.join(',\n')}\n)\n`
}

export function selectTopScript(o: Pick<SqlObject, 'schema' | 'name'>, n = 100): string {
  return `SELECT TOP (${n}) *\nFROM ${fullName(o)}\n`
}

/** Plantilla para ejecutar un procedimiento o una función con sus parámetros. */
export function execScript(o: Pick<SqlObject, 'schema' | 'name' | 'type'>, params: SqlParam[]): string {
  if (o.type === 'P') {
    if (!params.length) return `EXEC ${fullName(o)}\n`
    return `EXEC ${fullName(o)}\n${params.map((p, i) => `    ${p.name} = NULL${p.output ? ' OUTPUT' : ''}${i < params.length - 1 ? ',' : ''}  -- ${p.type}`).join('\n')}\n`
  }
  const args = params.map(() => 'NULL').join(', ')
  return o.type === 'FN' ? `SELECT ${fullName(o)}(${args})\n` : `SELECT *\nFROM ${fullName(o)}(${args})\n`
}

/** El primer CREATE (o CREATE OR ALTER) del texto pasa a ALTER, como "Modificar" en SSMS. */
export function createToAlter(def: string): string {
  return def.replace(/^((?:\s|--[^\n]*\n|\/\*[\s\S]*?\*\/)*)CREATE(\s+OR\s+ALTER)?\b/i, '$1ALTER')
}

/**
 * ¿La consulta falló al conectar? `auth`: usuario o contraseña (vencida, cambiada,
 * bloqueada); `server`: no se llega al servidor (IP, nombre, instancia o puerto).
 * null: conectó bien y el error es de la consulta.
 */
export function connectionProblem(r: Pick<QueryResult, 'ok' | 'phase' | 'number' | 'error'>): 'auth' | 'server' | null {
  if (r.ok || r.phase !== 'connect') return null
  if ([18456, 18487, 18488, 18470, 18486].includes(r.number ?? 0)) return 'auth'
  if (/login failed|password|contraseña|error de inicio de sesi/i.test(r.error ?? '')) return 'auth'
  if (r.number === 4060) return null // conecta, pero no puede abrir la base
  return 'server'
}

/** "10.0.0.5,44058" → host y puerto por separado (el formulario los muestra en dos campos). */
export function splitServer(server: string): { host: string; port: string } {
  const m = /^(.*?)\s*,\s*(\d*)\s*$/.exec(server)
  return m ? { host: m[1]!, port: m[2]! } : { host: server, port: '' }
}

/** Host + puerto → como lo guarda la conexión y lo escribe SSMS ("host,puerto"). */
export function joinServer(host: string, port: string): string {
  const h = host.trim(); const p = port.trim()
  return p ? `${h},${p}` : h
}

/** Lo escrito o pegado en el campo Servidor: si trae su propio ",puerto" (copiado de SSMS), ese manda. */
export function serverFromHostInput(value: string, port: string): string {
  if (!/,\s*\d*\s*$/.test(value)) return joinServer(value, port)
  const own = splitServer(value)
  return joinServer(own.host, own.port)
}

export interface FriendlyError { title: string; hint: string }

/** Un error de SQL Server / SqlClient en una línea que se entiende (el detalle queda aparte). */
export function friendlyError(raw: string | undefined, problem: 'auth' | 'server' | null): FriendlyError {
  const e = raw ?? ''
  if (problem === 'auth' || /login failed|inicio de sesi[oó]n/i.test(e)) return { title: 'Usuario o contraseña rechazados', hint: 'La contraseña puede haber vencido o cambiado.' }
  if (/timeout|timed out|tiempo de espera/i.test(e)) return { title: 'El servidor no responde', hint: 'Revisá la VPN, la IP o el puerto.' }
  if (/network-related|not found|no se (encuentra|encontr)|ya no est[aá] disponible|could not open a connection|instance|instancia/i.test(e)) {
    return { title: 'No se encuentra el servidor', hint: 'Puede haber cambiado la IP, el nombre o la instancia.' }
  }
  if (/cannot open database|no se puede abrir la base/i.test(e)) return { title: 'No se puede abrir la base', hint: 'Revisá el nombre de la base o tus permisos.' }
  if (problem === 'server') return { title: 'No se pudo conectar', hint: 'Revisá el servidor y la VPN.' }
  const first = e.split(/\r?\n/)[0]!.trim()
  return { title: 'Algo falló', hint: first.length > 110 ? `${first.slice(0, 110)}…` : first }
}

/** Todo lo que necesita el autocompletado: objetos y columnas de tablas, vistas y funciones de tabla. */
export const COMPLETION_SQL = `SELECT s.name AS sch, o.name, RTRIM(o.type) AS type, c.name AS col
FROM sys.objects o
JOIN sys.schemas s ON s.schema_id = o.schema_id
LEFT JOIN sys.columns c ON c.object_id = o.object_id AND o.type IN ('U','V','IF','TF')
WHERE o.is_ms_shipped = 0 AND o.type IN ('U','V','P','FN','IF','TF','SN')
ORDER BY s.name, o.name, c.column_id`

export interface CompletionLabel { label: string; type: string; detail?: string }
/** Formato de @codemirror/lang-sql: { esquema: { objeto: columnas } } + objetos de dbo sueltos. */
export type SqlSchemaTree = Record<string, { self: CompletionLabel; children: Record<string, { self: CompletionLabel; children: CompletionLabel[] }> } | { self: CompletionLabel; children: CompletionLabel[] }>

const KIND: Record<string, { type: string; detail: string }> = {
  U: { type: 'type', detail: 'tabla' }, V: { type: 'type', detail: 'vista' }, P: { type: 'function', detail: 'procedimiento' },
  FN: { type: 'function', detail: 'función' }, IF: { type: 'function', detail: 'función de tabla' }, TF: { type: 'function', detail: 'función de tabla' }, SN: { type: 'type', detail: 'sinónimo' },
}

/** Arma el árbol de autocompletado a partir de COMPLETION_SQL. Los objetos de `dbo` también van sin esquema. */
export function buildSqlSchema(rows: (string | null)[][]): SqlSchemaTree {
  const tree: Record<string, { self: CompletionLabel; children: Record<string, { self: CompletionLabel; children: CompletionLabel[] }> }> = {}
  for (const [sch, name, type, col] of rows) {
    if (!sch || !name || !type) continue
    const k = KIND[type] ?? { type: 'type', detail: '' }
    const ns = (tree[sch] ??= { self: { label: sch, type: 'namespace', detail: 'esquema' }, children: {} })
    const obj = (ns.children[name] ??= { self: { label: name, type: k.type, detail: k.detail }, children: [] })
    if (col) obj.children.push({ label: col, type: 'property', detail: name })
  }
  const out: SqlSchemaTree = { ...tree }
  for (const [name, obj] of Object.entries(tree.dbo?.children ?? {})) if (!(name in out)) out[name] = obj
  return out
}
