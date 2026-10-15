/**
 * Conexiones a SQL Server (Conexiones → Bases de datos). Tipos y helpers puros:
 * los usan el renderer y main (que es el único que ve la contraseña).
 */

export type SqlAuth = 'sql' | 'windows'

/** Lo que ve el renderer: nunca la contraseña. */
export interface SqlProfile {
  id: string
  name: string
  /** `HOST`, `HOST\INSTANCIA` o `host,puerto` (como en SSMS) */
  server: string
  database: string
  auth: SqlAuth
  user: string
  /** Etiqueta libre: Main, LPS, Mirror, QA… */
  tag: string
  trustCert: boolean
  hasPassword: boolean
  lastTest?: SqlTestResult
  lastUsedAt?: number
}

/** Alta/edición. `password` sin definir = conservar la guardada. */
export interface SqlProfileDraft {
  id?: string
  name: string
  server: string
  database: string
  auth: SqlAuth
  user: string
  tag: string
  trustCert: boolean
  password?: string
}

export interface SqlTestResult {
  ok: boolean
  /** Mensaje para mostrar (error o "Conectado a X · SQL 15.0…") */
  detail: string
  serverName?: string
  version?: string
  ms?: number
  at: number
}

export type SqlCopyFormat = 'server' | 'adonet' | 'adonet-safe' | 'sqlcmd'

export const SQL_COPY_LABELS: Record<SqlCopyFormat, string> = {
  server: 'Servidor',
  adonet: 'Cadena ADO.NET',
  'adonet-safe': 'Cadena sin contraseña',
  sqlcmd: 'Comando sqlcmd',
}

/** Valor de una cadena de conexión: entre comillas si tiene `;`, `=`, comillas o espacios en los bordes. */
export function csValue(v: string): string {
  if (!/[;="']|^\s|\s$/.test(v)) return v
  return `"${v.replace(/"/g, '""')}"`
}

/**
 * Cadena ADO.NET (System.Data.SqlClient / Microsoft.Data.SqlClient).
 * `password: null` la omite (para mostrar o compartir); `timeoutSec` para pruebas.
 */
export function buildConnectionString(
  p: Pick<SqlProfileDraft, 'server' | 'database' | 'auth' | 'user' | 'trustCert'>,
  password: string | null,
  opts: { timeoutSec?: number; appName?: string } = {},
): string {
  const parts: string[] = [`Data Source=${csValue(p.server.trim())}`]
  if (p.database.trim()) parts.push(`Initial Catalog=${csValue(p.database.trim())}`)
  if (p.auth === 'windows') parts.push('Integrated Security=True')
  else {
    parts.push(`User ID=${csValue(p.user.trim())}`)
    if (password !== null) parts.push(`Password=${csValue(password)}`)
  }
  if (p.trustCert) parts.push('TrustServerCertificate=True')
  if (opts.timeoutSec) parts.push(`Connect Timeout=${opts.timeoutSec}`)
  if (opts.appName) parts.push(`Application Name=${csValue(opts.appName)}`)
  return parts.join(';') + ';'
}

/** `sqlcmd` sin contraseña (con -U la pide al ejecutar). */
export function buildSqlcmd(p: Pick<SqlProfileDraft, 'server' | 'database' | 'auth' | 'user'>): string {
  const q = (s: string): string => `"${s.replace(/"/g, '\\"')}"`
  const out = ['sqlcmd', '-S', q(p.server.trim())]
  if (p.database.trim()) out.push('-d', q(p.database.trim()))
  if (p.auth === 'windows') out.push('-E')
  else out.push('-U', q(p.user.trim()))
  return out.join(' ')
}

/** Errores de validación del formulario (vacío = válido). */
export function validateDraft(d: SqlProfileDraft, hasStoredPassword: boolean): Partial<Record<'name' | 'server' | 'user' | 'password', string>> {
  const e: Partial<Record<'name' | 'server' | 'user' | 'password', string>> = {}
  if (!d.name.trim()) e.name = 'Poné un nombre'
  if (!d.server.trim()) e.server = 'Falta el servidor (p. ej. CROSSETTO\\MSSQLSERVER02)'
  else if (/[;\s]/.test(d.server.trim())) e.server = 'El servidor no lleva espacios ni ";"'
  if (d.auth === 'sql') {
    if (!d.user.trim()) e.user = 'Falta el usuario'
    if (!d.password && !hasStoredPassword) e.password = 'Falta la contraseña'
  }
  return e
}
