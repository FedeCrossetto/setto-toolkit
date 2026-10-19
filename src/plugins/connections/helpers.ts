/** Pure helpers for the Conexiones module (no React / no IPC). */

export type ConnId = 'openai' | 'anthropic' | 'ollama' | 'github' | 'gitlab' | 'bitbucket' | 'jira' | 'supabase'

export type ConnState = 'checking' | 'connected' | 'unconfigured' | 'error' | 'idle'

export interface ConnStatus {
  state: ConnState
  /** Human detail ("Conectado como fvazquez · 120 ms") or the short error. */
  detail?: string
  latencyMs?: number
  /** epoch ms of the last finished check */
  checkedAt?: number
  /** Supabase only: the user chose "solo local" (`app.local_only`), so it isn't used nor checked. */
  localOnly?: boolean
}

/** `app.local_only` setting ('1' / 'true' = solo local). */
export function isLocalOnly(value: string | null | undefined): boolean {
  return value === '1' || value === 'true'
}

/** Supabase card while the app runs in local-only mode: calm, not an error. */
export function localOnlyStatus(now = Date.now()): ConnStatus {
  return { state: 'idle', localOnly: true, detail: 'Gastos y Claves se guardan sólo en esta computadora', checkedAt: now }
}

// ── Supabase URL / ref ─────────────────────────────────────────────────────────

const REF_RE = /^[a-z0-9]{15,30}$/

/**
 * Accepts a project URL (`https://<ref>.supabase.co[/rest/v1]`), a dashboard URL
 * (`https://supabase.com/dashboard/project/<ref>/...`) or the bare ref and
 * returns the canonical `https://<ref>.supabase.co`. Custom domains / self-hosted
 * URLs are kept as-is (origin only). Returns null when nothing usable was pasted.
 */
export function normalizeSupabaseUrl(input: string): { url: string; ref: string | null } | null {
  const raw = input.trim().replace(/^["'<\s]+|["'>\s]+$/g, '')
  if (!raw) return null
  const lower = raw.toLowerCase()
  if (REF_RE.test(lower)) return { url: `https://${lower}.supabase.co`, ref: lower }

  let parsed: URL
  try {
    parsed = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return null
  }
  const host = parsed.hostname.toLowerCase()
  const dash = /\/project\/([a-z0-9]{15,30})(?:\/|$)/i.exec(parsed.pathname)
  if ((host === 'supabase.com' || host === 'app.supabase.com') && dash?.[1]) {
    const ref = dash[1].toLowerCase()
    return { url: `https://${ref}.supabase.co`, ref }
  }
  const m = /^([a-z0-9]{15,30})\.supabase\.(co|in)$/.exec(host)
  if (m?.[1]) return { url: `https://${m[1]}.supabase.co`, ref: m[1] }
  if (!host.includes('.') && host !== 'localhost') return null
  return { url: `${parsed.protocol}//${parsed.host}`, ref: null }
}

export function supabaseRef(url: string): string | null {
  return normalizeSupabaseUrl(url)?.ref ?? null
}

export function supabaseSqlEditorUrl(ref: string): string {
  return `https://supabase.com/dashboard/project/${ref}/sql/new`
}

export function supabaseApiKeysUrl(ref: string | null): string {
  return ref ? `https://supabase.com/dashboard/project/${ref}/settings/api-keys` : 'https://supabase.com/dashboard/projects'
}

// ── Supabase key kind ──────────────────────────────────────────────────────────

export type SupabaseKeyKind = 'service_role' | 'anon' | 'secret' | 'publishable' | 'other-jwt' | 'unknown' | 'empty'

function decodeBase64Url(seg: string): string | null {
  try {
    const b64 = seg.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    const bin = atob(padded)
    // decode UTF-8 safely
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}

/** Reads the `role` claim of a JWT locally (no signature check). */
export function jwtRole(token: string): string | null {
  const parts = token.trim().split('.')
  if (parts.length !== 3 || !parts[1]) return null
  const json = decodeBase64Url(parts[1])
  if (!json) return null
  try {
    const payload = JSON.parse(json) as { role?: unknown }
    return typeof payload.role === 'string' ? payload.role : null
  } catch {
    return null
  }
}

/** Classifies a pasted Supabase key: legacy JWT (anon / service_role) or new `sb_*` keys. */
export function detectSupabaseKeyKind(key: string): SupabaseKeyKind {
  const k = key.trim()
  if (!k) return 'empty'
  if (k.startsWith('sb_secret_')) return 'secret'
  if (k.startsWith('sb_publishable_')) return 'publishable'
  const role = jwtRole(k)
  if (role === 'service_role') return 'service_role'
  if (role === 'anon') return 'anon'
  if (role) return 'other-jwt'
  return 'unknown'
}

/** True when the key can't be used server-side for Gastos (public keys). */
export function isPublicSupabaseKey(kind: SupabaseKeyKind): boolean {
  return kind === 'anon' || kind === 'publishable'
}

// ── Status summary ─────────────────────────────────────────────────────────────

export interface StatusSummary {
  total: number
  connected: number
  errors: number
  checking: number
  unconfigured: number
  text: string
}

export function summarizeStatuses(statuses: ConnStatus[]): StatusSummary {
  const total = statuses.length
  const count = (s: ConnState): number => statuses.filter((x) => x.state === s).length
  const connected = count('connected')
  const errors = count('error')
  const checking = count('checking')
  const unconfigured = count('unconfigured')
  let text = `${connected} de ${total} conectadas`
  if (errors > 0) text += ` · ${errors} con error`
  if (checking > 0) text += ` · verificando ${checking}`
  return { total, connected, errors, checking, unconfigured, text }
}

/** "hace 5 s", "hace 3 min", "hace 2 h", or a date. */
export function formatCheckedAt(ts: number | undefined, now = Date.now()): string {
  if (!ts) return 'Nunca verificada'
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 10) return 'Recién'
  if (s < 60) return `Hace ${s} s`
  const m = Math.round(s / 60)
  if (m < 60) return `Hace ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `Hace ${h} h`
  return new Date(ts).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

/** Shortens long provider errors for the pill (full text stays in the card / tooltip). */
export function shortError(detail: string | undefined, max = 32): string {
  const d = (detail ?? 'Error').trim().split('\n')[0] ?? 'Error'
  return d.length > max ? `${d.slice(0, max - 1)}…` : d
}

// ── Mapping IPC results → card status ──────────────────────────────────────────

/** Shape returned by `settings:test-connection`. */
export interface TestResult {
  ok: boolean
  configured: boolean
  latencyMs?: number
  detail: string
}

export type SupabaseTable = 'servicios' | 'pagos' | 'gastos' | 'credenciales' | 'queries'
export const SUPABASE_TABLES: SupabaseTable[] = ['servicios', 'pagos', 'gastos', 'credenciales', 'queries']

/** Shape returned by `gastos:supabase-health` / `gastos:supabase-test`. */
export interface SupabaseHealth {
  configured: boolean
  url: string
  reachable: boolean
  authOk: boolean
  error?: string
  latencyMs?: number
  tables: Partial<Record<SupabaseTable, boolean>>
  missingSql: string
}

export function statusFromResult(r: TestResult, now = Date.now()): ConnStatus {
  return {
    state: r.ok ? 'connected' : r.configured ? 'error' : 'unconfigured',
    detail: r.detail,
    latencyMs: r.latencyMs,
    checkedAt: now,
  }
}

export function missingTables(h: SupabaseHealth): SupabaseTable[] {
  return SUPABASE_TABLES.filter((t) => h.tables?.[t] === false)
}

export function statusFromHealth(h: SupabaseHealth, now = Date.now()): ConnStatus {
  const base = { latencyMs: h.latencyMs, checkedAt: now }
  if (!h.configured) return { ...base, state: 'unconfigured', detail: 'Falta la URL o la clave service_role' }
  if (!h.reachable) return { ...base, state: 'error', detail: h.error || 'El proyecto no responde' }
  if (!h.authOk) return { ...base, state: 'error', detail: h.error || 'La clave fue rechazada' }
  const missing = missingTables(h)
  if (missing.length > 0) return { ...base, state: 'error', detail: `Faltan tablas: ${missing.join(', ')}` }
  const ms = h.latencyMs !== undefined ? ` · ${h.latencyMs} ms` : ''
  return { ...base, state: 'connected', detail: `Conectado · ${SUPABASE_TABLES.length} tablas OK${ms}` }
}
