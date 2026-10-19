import { describe, it, expect } from 'vitest'
import {
  normalizeSupabaseUrl, supabaseRef, supabaseSqlEditorUrl, jwtRole, detectSupabaseKeyKind,
  isPublicSupabaseKey, summarizeStatuses, formatCheckedAt, shortError, isLocalOnly, localOnlyStatus,
  statusFromResult, statusFromHealth, missingTables, type SupabaseHealth,
} from './helpers'

const REF = 'kspheaodcktvgkwjexjr'

function fakeJwt(payload: Record<string, unknown>): string {
  const enc = (o: unknown): string =>
    Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc(payload)}.signature`
}

describe('normalizeSupabaseUrl', () => {
  it('accepts a bare ref', () => {
    expect(normalizeSupabaseUrl(REF)).toEqual({ url: `https://${REF}.supabase.co`, ref: REF })
    expect(normalizeSupabaseUrl(`  ${REF.toUpperCase()} `)?.url).toBe(`https://${REF}.supabase.co`)
  })
  it('accepts project URLs with path, slash or no scheme', () => {
    expect(normalizeSupabaseUrl(`https://${REF}.supabase.co/rest/v1/`)?.url).toBe(`https://${REF}.supabase.co`)
    expect(normalizeSupabaseUrl(`${REF}.supabase.co`)?.url).toBe(`https://${REF}.supabase.co`)
    expect(normalizeSupabaseUrl(`http://${REF}.supabase.co`)?.url).toBe(`https://${REF}.supabase.co`)
  })
  it('accepts dashboard URLs', () => {
    expect(normalizeSupabaseUrl(`https://supabase.com/dashboard/project/${REF}/settings/api`))
      .toEqual({ url: `https://${REF}.supabase.co`, ref: REF })
  })
  it('keeps custom domains / local instances without a ref', () => {
    expect(normalizeSupabaseUrl('https://db.example.com/rest/v1')).toEqual({ url: 'https://db.example.com', ref: null })
    expect(normalizeSupabaseUrl('http://localhost:54321')).toEqual({ url: 'http://localhost:54321', ref: null })
  })
  it('rejects garbage', () => {
    expect(normalizeSupabaseUrl('')).toBeNull()
    expect(normalizeSupabaseUrl('hola')).toBeNull()
  })
  it('builds the SQL editor link', () => {
    expect(supabaseRef(`https://${REF}.supabase.co`)).toBe(REF)
    expect(supabaseSqlEditorUrl(REF)).toBe(`https://supabase.com/dashboard/project/${REF}/sql/new`)
  })
})

describe('Supabase key detection', () => {
  it('reads the role claim', () => {
    expect(jwtRole(fakeJwt({ role: 'service_role', ref: REF }))).toBe('service_role')
    expect(jwtRole('not-a-jwt')).toBeNull()
    expect(jwtRole('a.@@@.c')).toBeNull()
  })
  it('classifies keys', () => {
    expect(detectSupabaseKeyKind(fakeJwt({ role: 'anon' }))).toBe('anon')
    expect(detectSupabaseKeyKind(fakeJwt({ role: 'service_role' }))).toBe('service_role')
    expect(detectSupabaseKeyKind(fakeJwt({ role: 'authenticated' }))).toBe('other-jwt')
    expect(detectSupabaseKeyKind('sb_secret_abc')).toBe('secret')
    expect(detectSupabaseKeyKind('sb_publishable_abc')).toBe('publishable')
    expect(detectSupabaseKeyKind('whatever')).toBe('unknown')
    expect(detectSupabaseKeyKind('  ')).toBe('empty')
  })
  it('flags public keys', () => {
    expect(isPublicSupabaseKey('anon')).toBe(true)
    expect(isPublicSupabaseKey('publishable')).toBe(true)
    expect(isPublicSupabaseKey('service_role')).toBe(false)
    expect(isPublicSupabaseKey('secret')).toBe(false)
  })
})

describe('summarizeStatuses', () => {
  it('counts states and builds the header text', () => {
    const s = summarizeStatuses([
      { state: 'connected' }, { state: 'connected' }, { state: 'error', detail: 'x' },
      { state: 'unconfigured' }, { state: 'checking' },
    ])
    expect(s).toMatchObject({ total: 5, connected: 2, errors: 1, checking: 1, unconfigured: 1 })
    expect(s.text).toBe('2 de 5 conectadas · 1 con error · verificando 1')
  })
  it('omits zero counters', () => {
    expect(summarizeStatuses([{ state: 'connected' }, { state: 'unconfigured' }]).text).toBe('1 de 2 conectadas')
  })
})

describe('formatting', () => {
  it('formats relative times', () => {
    const now = 1_000_000_000
    expect(formatCheckedAt(undefined, now)).toBe('Nunca verificada')
    expect(formatCheckedAt(now - 3_000, now)).toBe('Recién')
    expect(formatCheckedAt(now - 30_000, now)).toBe('Hace 30 s')
    expect(formatCheckedAt(now - 5 * 60_000, now)).toBe('Hace 5 min')
    expect(formatCheckedAt(now - 3 * 3_600_000, now)).toBe('Hace 3 h')
  })
  it('shortens errors', () => {
    expect(shortError('Credenciales inválidas (401)')).toBe('Credenciales inválidas (401)')
    expect(shortError('a'.repeat(50), 10)).toBe(`${'a'.repeat(9)}…`)
    expect(shortError(undefined)).toBe('Error')
  })
})

describe('result mapping', () => {
  const health = (over: Partial<SupabaseHealth> = {}): SupabaseHealth => ({
    configured: true, url: `https://${REF}.supabase.co`, reachable: true, authOk: true, latencyMs: 80,
    tables: { servicios: true, pagos: true, gastos: true, credenciales: true, queries: true }, missingSql: '', ...over,
  })
  it('maps settings:test-connection results', () => {
    expect(statusFromResult({ ok: true, configured: true, detail: 'ok' }, 1).state).toBe('connected')
    expect(statusFromResult({ ok: false, configured: true, detail: 'x' }, 1).state).toBe('error')
    expect(statusFromResult({ ok: false, configured: false, detail: 'x' }, 1)).toMatchObject({ state: 'unconfigured', checkedAt: 1 })
  })
  it('maps Supabase health', () => {
    expect(statusFromHealth(health()).state).toBe('connected')
    expect(statusFromHealth(health({ configured: false })).state).toBe('unconfigured')
    expect(statusFromHealth(health({ reachable: false, error: 'ENOTFOUND' }))).toMatchObject({ state: 'error', detail: 'ENOTFOUND' })
    expect(statusFromHealth(health({ authOk: false })).detail).toBe('La clave fue rechazada')
    const h = health({ tables: { servicios: true, pagos: true, gastos: false, credenciales: true, queries: true }, missingSql: 'create table gastos ()' })
    expect(missingTables(h)).toEqual(['gastos'])
    expect(statusFromHealth(h)).toMatchObject({ state: 'error', detail: 'Faltan tablas: gastos' })
  })
})

describe('local-only mode', () => {
  it('reads the setting', () => {
    expect(isLocalOnly('1')).toBe(true)
    expect(isLocalOnly('true')).toBe(true)
    expect(isLocalOnly('0')).toBe(false)
    expect(isLocalOnly(null)).toBe(false)
  })
  it('is a calm status, not an error nor "sin configurar"', () => {
    const s = localOnlyStatus(5)
    expect(s).toMatchObject({ state: 'idle', localOnly: true, checkedAt: 5 })
    expect(summarizeStatuses([s]).errors).toBe(0)
  })
})
