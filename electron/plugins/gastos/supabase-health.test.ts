import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { checkSupabaseHealth, classifyTableResponse, keyRole, normalizeSupabaseUrl } from './supabase-health'
import { buildMissingSql, SUPABASE_TABLES, TABLE_SQL } from './schema-sql'

function jwt(payload: object): string {
  const b64 = (o: object): string => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`
}
const SERVICE_KEY = jwt({ role: 'service_role' })

type Resp = { status: number; body?: string } | 'network'
function fakeFetch(byTable: Record<string, Resp>, seen: string[] = []) {
  return async (url: string, init: { headers: Record<string, string> }) => {
    seen.push(`${url}|${init.headers.apikey ? 'key' : 'nokey'}`)
    const table = /rest\/v1\/([a-z]+)/.exec(url)![1]!
    const r = byTable[table] ?? { status: 200, body: '[]' }
    if (r === 'network') throw new TypeError('fetch failed')
    return { status: r.status, text: async () => r.body ?? '' }
  }
}

describe('classifyTableResponse', () => {
  it('distingue tabla faltante de errores de auth/servidor', () => {
    expect(classifyTableResponse(200, '')).toBe('ok')
    expect(classifyTableResponse(404, JSON.stringify({ code: 'PGRST205', message: "Could not find the table 'public.gastos' in the schema cache" }))).toBe('missing')
    expect(classifyTableResponse(400, JSON.stringify({ code: '42P01', message: 'relation does not exist' }))).toBe('missing')
    expect(classifyTableResponse(404, '')).toBe('missing')
    expect(classifyTableResponse(401, JSON.stringify({ message: 'Invalid API key' }))).toBe('auth')
    expect(classifyTableResponse(403, '')).toBe('auth')
    expect(classifyTableResponse(540, '<!DOCTYPE html>paused')).toBe('server')
    expect(classifyTableResponse(500, '{}')).toBe('server')
  })
})

describe('keyRole / normalizeSupabaseUrl', () => {
  it('detecta service_role, anon y claves nuevas', () => {
    expect(keyRole(SERVICE_KEY)).toBe('service')
    expect(keyRole(jwt({ role: 'anon' }))).toBe('anon')
    expect(keyRole('sb_secret_abc')).toBe('service')
    expect(keyRole('sb_publishable_abc')).toBe('anon')
    expect(keyRole('whatever')).toBe('unknown')
  })
  it('normaliza la URL', () => {
    expect(normalizeSupabaseUrl(' https://x.supabase.co/rest/v1/ ')).toBe('https://x.supabase.co')
    expect(normalizeSupabaseUrl('https://x.supabase.co/')).toBe('https://x.supabase.co')
  })
})

describe('checkSupabaseHealth', () => {
  it('sin configurar → configured false, sin red', async () => {
    const seen: string[] = []
    const h = await checkSupabaseHealth({ url: '', key: '', fetchImpl: fakeFetch({}, seen) })
    expect(h.configured).toBe(false)
    expect(h.reachable).toBe(false)
    expect(h.missingSql).toBe('')
    expect(seen).toHaveLength(0)
  })

  it('todo ok', async () => {
    const h = await checkSupabaseHealth({ url: 'https://p.supabase.co', key: SERVICE_KEY, fetchImpl: fakeFetch({}) })
    expect(h).toMatchObject({ configured: true, reachable: true, authOk: true, missingSql: '' })
    expect(Object.values(h.tables).every(Boolean)).toBe(true)
    expect(h.error).toBeUndefined()
    expect(typeof h.latencyMs).toBe('number')
  })

  it('falta gastos → SQL sólo de gastos', async () => {
    const h = await checkSupabaseHealth({
      url: 'https://p.supabase.co', key: SERVICE_KEY,
      fetchImpl: fakeFetch({ gastos: { status: 404, body: JSON.stringify({ code: 'PGRST205', message: 'Could not find the table' }) } }),
    })
    expect(h.authOk).toBe(true)
    expect(h.tables.gastos).toBe(false)
    expect(h.tables.servicios).toBe(true)
    expect(h.missingSql).toContain('create table if not exists public.gastos')
    expect(h.missingSql).not.toContain('public.servicios (')
    expect(h.missingSql).toContain("notify pgrst, 'reload schema'")
  })

  it('key rechazada → authOk false, sin SQL', async () => {
    const all401 = Object.fromEntries(SUPABASE_TABLES.map((t) => [t, { status: 401, body: '{"message":"Invalid API key"}' }]))
    const h = await checkSupabaseHealth({ url: 'https://p.supabase.co', key: SERVICE_KEY, fetchImpl: fakeFetch(all401) })
    expect(h).toMatchObject({ reachable: true, authOk: false, missingSql: '' })
    expect(h.error).toMatch(/rechazó la key/)
  })

  it('anon key → authOk false aunque las tablas respondan', async () => {
    const h = await checkSupabaseHealth({ url: 'https://p.supabase.co', key: jwt({ role: 'anon' }), fetchImpl: fakeFetch({}) })
    expect(h.authOk).toBe(false)
    expect(h.error).toMatch(/anon/)
  })

  it('red caída → reachable false', async () => {
    const all = Object.fromEntries(SUPABASE_TABLES.map((t) => [t, 'network' as const]))
    const h = await checkSupabaseHealth({ url: 'https://p.supabase.co', key: SERVICE_KEY, fetchImpl: fakeFetch(all) })
    expect(h).toMatchObject({ configured: true, reachable: false, authOk: false })
    expect(h.error).toMatch(/conectar/)
  })

  it('nunca incluye la key en el resultado', async () => {
    const key = 'sb_secret_SUPERSECRET123'
    const h = await checkSupabaseHealth({ url: 'https://p.supabase.co', key, fetchImpl: fakeFetch({ gastos: { status: 401 } }) })
    expect(JSON.stringify(h)).not.toContain('SUPERSECRET123')
  })

  it('URL inválida', async () => {
    const h = await checkSupabaseHealth({ url: 'ftp//nope', key: SERVICE_KEY, fetchImpl: fakeFetch({}) })
    expect(h.reachable).toBe(false)
    expect(h.error).toMatch(/no es válida/)
  })
})

describe('schema-sql', () => {
  it('buildMissingSql respeta el orden de dependencias y es vacío si no falta nada', () => {
    const none = Object.fromEntries(SUPABASE_TABLES.map((t) => [t, true])) as Record<(typeof SUPABASE_TABLES)[number], boolean>
    expect(buildMissingSql(none)).toBe('')
    const sql = buildMissingSql({ ...none, servicios: false, pagos: false })
    expect(sql.indexOf('public.servicios (')).toBeLessThan(sql.indexOf('public.pagos ('))
  })

  it('las columnas coinciden con las migraciones de supabase/', () => {
    const dir = path.resolve(__dirname, '../../../supabase/migrations')
    const migrations = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n')
    const cols = (sql: string, table: string): string[] => {
      const m = new RegExp(`create table if not exists public\\.${table} \\(([\\s\\S]*?)\\n\\);`).exec(sql.replace(/\r\n/g, '\n'))
      expect(m, table).not.toBeNull()
      return m![1]!.split('\n').map((l) => l.trim().split(/\s+/)[0]!).filter(Boolean)
    }
    for (const t of SUPABASE_TABLES) expect(cols(TABLE_SQL[t], t)).toEqual(cols(migrations, t))
  })
})
