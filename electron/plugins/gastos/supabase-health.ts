/**
 * Chequeo de salud de Supabase para Gastos (contrato `gastos:supabase-health` / `-test`).
 * Puro salvo por `fetch` (inyectable para tests). Nunca lanza y nunca devuelve ni loguea la key.
 */
import type { SupabaseHealth, SupabaseTableName } from '../../../src/plugins/gastos/types'
import { SUPABASE_TABLES, buildMissingSql } from './schema-sql'

export type TableCheck = 'ok' | 'missing' | 'auth' | 'server' | 'network'

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; signal?: AbortSignal }) =>
  Promise<{ status: number; text: () => Promise<string> }>

export function normalizeSupabaseUrl(raw: string): string {
  return (raw ?? '').trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '')
}

/** Clasifica la respuesta HTTP de `GET /rest/v1/<tabla>?select=id&limit=1`. */
export function classifyTableResponse(status: number, body: string): TableCheck {
  if (status >= 200 && status < 300) return 'ok'
  let code = ''
  let message = ''
  try {
    const j = JSON.parse(body) as { code?: unknown; message?: unknown }
    code = typeof j.code === 'string' ? j.code : ''
    message = typeof j.message === 'string' ? j.message : ''
  } catch { /* cuerpo no JSON (HTML de Cloudflare, etc.) */ }
  if (code === 'PGRST205' || code === '42P01' || /could not find the table|does not exist/i.test(message)) return 'missing'
  if (status === 401 || status === 403 || code === 'PGRST301' || /invalid api key|jwt/i.test(message)) return 'auth'
  if (status === 404) return 'missing'
  return 'server'
}

/** Rol de la key: JWT legacy (`role` del payload) o claves nuevas `sb_secret_` / `sb_publishable_`. */
export function keyRole(key: string): 'service' | 'anon' | 'unknown' {
  const k = key.trim()
  if (k.startsWith('sb_secret_')) return 'service'
  if (k.startsWith('sb_publishable_')) return 'anon'
  const parts = k.split('.')
  if (parts.length !== 3) return 'unknown'
  try {
    const json = Buffer.from(parts[1]!.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    const role = (JSON.parse(json) as { role?: unknown }).role
    if (role === 'service_role') return 'service'
    if (role === 'anon' || role === 'authenticated') return 'anon'
  } catch { /* no es un JWT legible */ }
  return 'unknown'
}

function emptyTables(value: boolean): Record<SupabaseTableName, boolean> {
  return Object.fromEntries(SUPABASE_TABLES.map((t) => [t, value])) as Record<SupabaseTableName, boolean>
}

function networkMessage(e: unknown): string {
  const raw = e instanceof Error ? `${e.name} ${e.message} ${String((e as { cause?: unknown }).cause ?? '')}` : String(e)
  if (/abort|timeout/i.test(raw)) return 'Supabase no respondió a tiempo. Revisá tu conexión o si el proyecto está pausado.'
  if (/ENOTFOUND|EAI_AGAIN/i.test(raw)) return 'No se encontró el servidor de Supabase. Revisá la URL del proyecto o tu conexión.'
  return 'No se pudo conectar con Supabase. Revisá tu conexión.'
}

export async function checkSupabaseHealth(opts: {
  url: string
  key: string
  fetchImpl?: FetchLike
  timeoutMs?: number
  now?: () => number
}): Promise<SupabaseHealth> {
  const url = normalizeSupabaseUrl(opts.url)
  const key = (opts.key ?? '').trim()
  const base: SupabaseHealth = { configured: Boolean(url && key), url, reachable: false, authOk: false, tables: emptyTables(false), missingSql: '' }
  if (!base.configured) {
    return { ...base, error: !url ? 'Falta la URL del proyecto de Supabase.' : 'Falta la Service Role Key de Supabase.' }
  }
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('protocol')
  } catch {
    return { ...base, error: 'La URL de Supabase no es válida (debería ser https://<proyecto>.supabase.co).' }
  }

  const doFetch: FetchLike = opts.fetchImpl ?? ((u, init) => fetch(u, init))
  const now = opts.now ?? (() => Date.now())
  const timeoutMs = opts.timeoutMs ?? 8000
  const started = now()
  let networkError: string | undefined
  const results = await Promise.all(SUPABASE_TABLES.map(async (t): Promise<TableCheck> => {
    try {
      const res = await doFetch(`${url}/rest/v1/${t}?select=id&limit=1`, {
        method: 'GET',
        headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      })
      const body = res.status >= 200 && res.status < 300 ? '' : await res.text().catch(() => '')
      return classifyTableResponse(res.status, body)
    } catch (e) {
      networkError = networkError ?? networkMessage(e)
      return 'network'
    }
  }))
  const latencyMs = Math.max(0, Math.round(now() - started))
  const byTable = Object.fromEntries(SUPABASE_TABLES.map((t, i) => [t, results[i]!])) as Record<SupabaseTableName, TableCheck>
  const checks = Object.values(byTable)

  const reachable = checks.some((c) => c !== 'network')
  if (!reachable) return { ...base, error: networkError ?? 'No se pudo conectar con Supabase.' }

  const tables = Object.fromEntries(SUPABASE_TABLES.map((t) => [t, byTable[t] === 'ok'])) as Record<SupabaseTableName, boolean>
  if (checks.some((c) => c === 'auth')) {
    return { ...base, reachable, latencyMs, tables, error: 'Supabase rechazó la key. Copiá la service_role (secret) key desde Project Settings → API.' }
  }

  const role = keyRole(key)
  const authOk = role !== 'anon'
  // Sólo se ofrece SQL para las tablas que de verdad faltan (no las que dieron error de servidor/red).
  const missingSql = buildMissingSql(Object.fromEntries(SUPABASE_TABLES.map((t) => [t, byTable[t] !== 'missing'])) as Record<SupabaseTableName, boolean>)
  let error: string | undefined
  if (!authOk) error = 'Esa es la anon/publishable key: Gastos necesita la service_role (secret) key para poder guardar.'
  else if (checks.some((c) => c === 'server' || c === 'network')) error = 'Supabase respondió con errores en algunas tablas (puede estar pausado). Probá de nuevo en un minuto.'
  return { ...base, reachable, authOk, latencyMs, tables, missingSql, ...(error ? { error } : {}) }
}
