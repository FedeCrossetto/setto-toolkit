/**
 * Real connection checks for the Conexiones module.
 * Secrets are read from settings (or taken from `values` for "Probar sin guardar"),
 * sent only to the provider, and scrubbed from every message returned/logged.
 */

export type TestableConnection = 'openai' | 'anthropic' | 'ollama' | 'github' | 'gitlab' | 'bitbucket' | 'jira'

export interface ConnectionTestResult {
  ok: boolean
  /** false when the integration has no credentials at all (UI shows "Sin configurar"). */
  configured: boolean
  latencyMs?: number
  detail: string
}

type GetSetting = (key: string) => string | null
type FetchFn = typeof fetch

const SENTINEL = '__CONFIGURED__'
const TIMEOUT_MS = 10_000

export const TESTABLE_CONNECTIONS = new Set<TestableConnection>(['openai', 'anthropic', 'ollama', 'github', 'gitlab', 'bitbucket', 'jira'])

/** Value from the form if given (and not the sentinel), else the stored setting. */
function pick(values: Record<string, string> | undefined, field: string, get: GetSetting, key: string): string {
  const v = values?.[field]
  if (typeof v === 'string' && v.trim() && v !== SENTINEL) return v.trim()
  return (get(key) ?? '').trim()
}

function scrub(text: string, secrets: string[]): string {
  let out = text
  for (const s of secrets) if (s && s.length >= 4) out = out.split(s).join('••••')
  return out.length > 160 ? `${out.slice(0, 159)}…` : out
}

function httpError(status: number, providerMsg?: string): string {
  if (status === 401) return 'Credenciales inválidas (401)'
  if (status === 403) return 'Sin permisos para esta operación (403)'
  if (status === 404) return 'No encontrado (404) — revisá la URL'
  if (status === 429) return 'Demasiadas solicitudes (429), probá en un rato'
  return providerMsg ? `${providerMsg} (${status})` : `Error HTTP ${status}`
}

function networkError(err: unknown): string {
  const e = err as { name?: string; message?: string; cause?: { code?: string } }
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return 'Sin respuesta (timeout de 10 s)'
  const code = e?.cause?.code
  if (code === 'ECONNREFUSED') return 'Conexión rechazada — ¿el servicio está corriendo?'
  if (code === 'ENOTFOUND') return 'No se encontró el host — revisá la URL'
  return `No se pudo conectar: ${e?.message ?? 'error de red'}`
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try { return (await res.json()) as Record<string, unknown> } catch { return {} }
}

function providerMessage(body: Record<string, unknown>): string | undefined {
  const err = body.error as { message?: string } | string | undefined
  if (typeof err === 'string') return err
  if (err && typeof err.message === 'string') return err.message
  if (typeof body.message === 'string') return body.message
  return undefined
}

async function timed(
  fetchFn: FetchFn, url: string, init: RequestInit,
): Promise<{ res: Response; ms: number }> {
  const t0 = Date.now()
  const res = await fetchFn(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
  return { res, ms: Date.now() - t0 }
}

const notConfigured = (detail: string): ConnectionTestResult => ({ ok: false, configured: false, detail })

export async function testConnection(
  id: TestableConnection,
  values: Record<string, string> | undefined,
  get: GetSetting,
  fetchFn: FetchFn = fetch,
): Promise<ConnectionTestResult> {
  const secrets: string[] = []
  try {
    switch (id) {
      case 'openai': {
        const key = pick(values, 'key', get, 'ai.openai_key')
        if (!key) return notConfigured('Falta la clave de API')
        secrets.push(key)
        const { res, ms } = await timed(fetchFn, 'https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } })
        const body = await readJson(res)
        if (!res.ok) return { ok: false, configured: true, latencyMs: ms, detail: scrub(httpError(res.status, providerMessage(body)), secrets) }
        const n = Array.isArray(body.data) ? body.data.length : 0
        return { ok: true, configured: true, latencyMs: ms, detail: `Clave válida · ${n} modelos · ${ms} ms` }
      }
      case 'anthropic': {
        const key = pick(values, 'key', get, 'ai.anthropic_key')
        if (!key) return notConfigured('Falta la clave de API')
        secrets.push(key)
        const { res, ms } = await timed(fetchFn, 'https://api.anthropic.com/v1/models?limit=100', {
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        })
        const body = await readJson(res)
        if (!res.ok) return { ok: false, configured: true, latencyMs: ms, detail: scrub(httpError(res.status, providerMessage(body)), secrets) }
        const n = Array.isArray(body.data) ? body.data.length : 0
        return { ok: true, configured: true, latencyMs: ms, detail: `Clave válida · ${n} modelos · ${ms} ms` }
      }
      case 'ollama': {
        const base = pick(values, 'url', get, 'ai.ollama_url')
        if (!base) return notConfigured('Falta la URL del servidor')
        const model = pick(values, 'model', get, 'ai.ollama_model')
        const { res, ms } = await timed(fetchFn, `${base.replace(/\/+$/, '')}/api/tags`, {})
        if (!res.ok) return { ok: false, configured: true, latencyMs: ms, detail: httpError(res.status) }
        const body = await readJson(res)
        const names = Array.isArray(body.models)
          ? (body.models as Array<{ name?: string }>).map((m) => m.name ?? '').filter(Boolean)
          : []
        if (model && !names.some((n) => n === model || n.split(':')[0] === model)) {
          return { ok: false, configured: true, latencyMs: ms, detail: `El servidor responde, pero falta el modelo "${model}" (ollama pull ${model})` }
        }
        return { ok: true, configured: true, latencyMs: ms, detail: `${names.length} modelos instalados · ${ms} ms` }
      }
      case 'github':
      case 'gitlab': {
        const token = (get(`repo-search.${id}.token`) ?? '').trim()
        if (!token) return notConfigured('No iniciaste sesión')
        secrets.push(token)
        const url = id === 'github' ? 'https://api.github.com/user' : 'https://gitlab.com/api/v4/user'
        const headers: Record<string, string> = id === 'github'
          ? { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'setto-toolkit' }
          : { Authorization: `Bearer ${token}` }
        const { res, ms } = await timed(fetchFn, url, { headers })
        const body = await readJson(res)
        if (!res.ok) {
          const msg = res.status === 401 ? 'La sesión expiró o se revocó (401) — volvé a iniciar sesión' : httpError(res.status, providerMessage(body))
          return { ok: false, configured: true, latencyMs: ms, detail: scrub(msg, secrets) }
        }
        const user = (id === 'github' ? body.login : body.username) as string | undefined
        return { ok: true, configured: true, latencyMs: ms, detail: `Conectado como ${user ?? 'usuario'} · ${ms} ms` }
      }
      case 'bitbucket': {
        const token = pick(values, 'token', get, 'repo-search.bitbucket.token')
        const username = pick(values, 'username', get, 'repo-search.bitbucket.username')
        const workspace = pick(values, 'workspace', get, 'repo-search.bitbucket.workspace') || (get('bitbucket.workspace') ?? '').trim()
        if (!token) return notConfigured('Falta el token de acceso')
        secrets.push(token)
        const bearer = token.startsWith('ATCTT')
        if (!bearer && !username) return { ok: false, configured: true, detail: 'Falta el usuario / email' }
        const auth = bearer ? `Bearer ${token}` : `Basic ${Buffer.from(`${username}:${token}`).toString('base64')}`
        const headers = { Authorization: auth, Accept: 'application/json' }
        const { res, ms } = await timed(fetchFn, 'https://api.bitbucket.org/2.0/user', { headers })
        if (res.ok) {
          const body = await readJson(res)
          const name = (body.username ?? body.display_name ?? username) as string
          return { ok: true, configured: true, latencyMs: ms, detail: `Conectado como ${name}${workspace ? ` · ${workspace}` : ''} · ${ms} ms` }
        }
        // Repo-only tokens can't read /user: validate against the workspace instead.
        if (workspace && (res.status === 401 || res.status === 403)) {
          const r2 = await timed(fetchFn, `https://api.bitbucket.org/2.0/repositories/${encodeURIComponent(workspace)}?pagelen=1`, { headers })
          if (r2.res.ok) return { ok: true, configured: true, latencyMs: r2.ms, detail: `Acceso al workspace ${workspace} · ${r2.ms} ms` }
          return { ok: false, configured: true, latencyMs: r2.ms, detail: httpError(r2.res.status) }
        }
        return { ok: false, configured: true, latencyMs: ms, detail: httpError(res.status) }
      }
      case 'jira': {
        const base = pick(values, 'url', get, 'ticket-resolver.jira_url').replace(/\/+$/, '')
        const user = pick(values, 'user', get, 'ticket-resolver.jira_user')
        const token = pick(values, 'token', get, 'ticket-resolver.jira_token')
        if (!base && !user && !token) return notConfigured('Faltan URL, email y token')
        if (!base || !user || !token) {
          const missing = [!base && 'URL', !user && 'email', !token && 'token'].filter(Boolean).join(', ')
          return { ok: false, configured: true, detail: `Falta completar: ${missing}` }
        }
        secrets.push(token)
        const url = /^https?:\/\//i.test(base) ? base : `https://${base}`
        const auth = Buffer.from(`${user}:${token}`).toString('base64')
        const { res, ms } = await timed(fetchFn, `${url}/rest/api/3/myself`, { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' } })
        const body = await readJson(res)
        if (!res.ok) return { ok: false, configured: true, latencyMs: ms, detail: scrub(httpError(res.status), secrets) }
        const name = (body.displayName ?? body.emailAddress ?? user) as string
        return { ok: true, configured: true, latencyMs: ms, detail: `Conectado como ${name} · ${ms} ms` }
      }
      default:
        return notConfigured('Integración desconocida')
    }
  } catch (err) {
    return { ok: false, configured: true, detail: scrub(networkError(err), secrets) }
  }
}
