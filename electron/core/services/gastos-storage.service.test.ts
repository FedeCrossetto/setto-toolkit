import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

let tmpDir: string

vi.mock('electron', () => ({
  app: { getPath: () => tmpDir },
  safeStorage: {
    isEncryptionAvailable: () => false, // disabled in test env — values stored as-is
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString(),
  },
}))

vi.mock('../logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

/** Per-table fake rows, mutated by tests. Reset in beforeEach. */
let tableRows: Record<string, Array<Record<string, unknown>>> = {}
/** Per-table forced error (e.g. simulate a missing table). */
let tableErrors: Record<string, { code?: string; message: string } | undefined> = {}
const upserted: Array<{ table: string; row: unknown }> = []
const deleted: Array<{ table: string; column: string; value: unknown }> = []

/** Every `.range()` requested, to assert pagination. */
const ranges: Array<{ table: string; from: number; to: number }> = []
/** Filters applied (`in`, `gte`, `lt`), to assert the light month query. */
const filters: Array<{ table: string; op: string; column: string; value: unknown }> = []

function makeQueryBuilder(table: string) {
  const err = () => tableErrors[table] ?? null
  let range: [number, number] | null = null
  let limit: number | null = null
  const result = () => {
    if (err()) return { data: null, error: err(), count: null }
    const all = tableRows[table] ?? []
    const data = range ? all.slice(range[0], range[1] + 1) : limit !== null ? all.slice(0, limit) : all
    return { data, error: null, count: all.length }
  }
  const builder = {
    select: () => builder,
    order: () => builder,
    limit: (n: number) => { limit = n; return builder },
    range: (from: number, to: number) => { range = [from, to]; ranges.push({ table, from, to }); return builder },
    in: (column: string, value: unknown) => { filters.push({ table, op: 'in', column, value }); return builder },
    gte: (column: string, value: unknown) => { filters.push({ table, op: 'gte', column, value }); return builder },
    lt: (column: string, value: unknown) => { filters.push({ table, op: 'lt', column, value }); return builder },
    eq: (column: string, value: unknown) => {
      if (err()) return Promise.resolve({ error: err() })
      deleted.push({ table, column, value })
      return Promise.resolve({ error: null })
    },
    upsert: (row: unknown) => {
      if (err()) return Promise.resolve({ error: err() })
      upserted.push({ table, row })
      return Promise.resolve({ error: null })
    },
    delete: () => builder,
    then: (resolve: (v: ReturnType<typeof result>) => void) => resolve(result()),
  }
  return builder
}

vi.mock('./supabase-client', () => ({
  createSupabaseClient: () => ({
    from: (table: string) => makeQueryBuilder(table),
  }),
}))

const { DatabaseService } = await import('./db.service')
const { SettingsService } = await import('./settings.service')
const { GastosStorageService } = await import('./gastos-storage.service')

describe('GastosStorageService', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gastos-storage-test-'))
    tableRows = { servicios: [], pagos: [], credenciales: [], queries: [], gastos: [] }
    tableErrors = {}
    upserted.length = 0
    deleted.length = 0
    ranges.length = 0
    filters.length = 0
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  function makeService() {
    const db = new DatabaseService()
    const settings = new SettingsService(db)
    return new GastosStorageService(db, settings)
  }

  it('rejects with a clear message when Supabase is not configured', async () => {
    const svc = makeService()
    await expect(svc.load()).rejects.toThrow('SUPABASE_NOT_CONFIGURED')
  })

  it('saveSupabaseConfig + getSupabasePublicConfig round-trips url and key-configured flag', () => {
    const svc = makeService()
    expect(svc.getSupabasePublicConfig()).toEqual({ url: '', keyConfigured: false })

    svc.saveSupabaseConfig({ url: 'https://example.supabase.co', serviceKey: 'secret-key' })
    const cfg = svc.getSupabasePublicConfig()
    expect(cfg.url).toBe('https://example.supabase.co')
    expect(cfg.keyConfigured).toBe(true)
  })

  it('saveSupabaseConfig trims a trailing /rest/v1 from the URL', () => {
    const svc = makeService()
    svc.saveSupabaseConfig({ url: 'https://example.supabase.co/rest/v1/', serviceKey: 'secret-key' })
    expect(svc.getSupabasePublicConfig().url).toBe('https://example.supabase.co')
  })

  it('getRemoteVersion returns null when every table is empty', async () => {
    const svc = makeService()
    svc.saveSupabaseConfig({ url: 'https://example.supabase.co', serviceKey: 'secret-key' })
    expect(await svc.getRemoteVersion()).toBeNull()
  })

  it('getRemoteVersion returns the max updated_at across all tables', async () => {
    const svc = makeService()
    svc.saveSupabaseConfig({ url: 'https://example.supabase.co', serviceKey: 'secret-key' })
    tableRows.servicios = [{ updated_at: '2024-01-01T00:00:00.000Z' }]
    tableRows.pagos = [{ updated_at: '2024-06-15T12:00:00.000Z' }]
    tableRows.credenciales = [{ updated_at: '2024-03-01T00:00:00.000Z' }]
    tableRows.queries = []
    expect(await svc.getRemoteVersion()).toMatch(/^2024-06-15T12:00:00\.000Z#/)
  })

  it('getRemoteVersion changes when a row is deleted (same max updated_at)', async () => {
    const svc = makeService()
    svc.saveSupabaseConfig({ url: 'https://example.supabase.co', serviceKey: 'secret-key' })
    tableRows.gastos = [{ updated_at: '2025-01-01T00:00:00.000Z' }, { updated_at: '2024-01-01T00:00:00.000Z' }]
    const before = await svc.getRemoteVersion()
    tableRows.gastos = [{ updated_at: '2025-01-01T00:00:00.000Z' }]
    expect(await svc.getRemoteVersion()).not.toBe(before)
  })

  it('saveServicio upserts a row into the servicios table', async () => {
    const svc = makeService()
    svc.saveSupabaseConfig({ url: 'https://example.supabase.co', serviceKey: 'secret-key' })
    await svc.saveServicio({
      id: 'svc-1', nombre: 'Luz', emoji: '⚡', categoria: 'Casa', activo: true, orden: 0,
    })
    expect(upserted).toHaveLength(1)
    expect(upserted[0]?.table).toBe('servicios')
    expect((upserted[0]?.row as { id: string }).id).toBe('svc-1')
  })

  it('deleteServicio also deletes its pagos (cascade) before deleting the servicio', async () => {
    const svc = makeService()
    svc.saveSupabaseConfig({ url: 'https://example.supabase.co', serviceKey: 'secret-key' })
    await svc.deleteServicio('svc-1')
    expect(deleted.some((d) => d.table === 'pagos' && d.column === 'servicio_id' && d.value === 'svc-1')).toBe(true)
    expect(deleted.some((d) => d.table === 'servicios' && d.value === 'svc-1')).toBe(true)
  })

  // ── Gastos variables (tabla `gastos`, migración 002) ─────────────────────────

  const gasto = {
    id: 'g-1', fecha: '2026-10-10', monto: 1500, descripcion: 'super', categoria: 'Supermercado',
    metodoPago: 'Efectivo', moneda: 'ARS' as const, created_at: '2026-10-10T10:00:00.000Z', updated_at: '2026-10-10T10:00:00.000Z',
  }

  function configured() {
    const svc = makeService()
    svc.saveSupabaseConfig({ url: 'https://example.supabase.co', serviceKey: 'secret-key' })
    return svc
  }

  it('load includes variable gastos mapped from snake_case rows', async () => {
    const svc = configured()
    tableRows.gastos = [{
      id: 'g-1', fecha: '2026-10-10', monto: '1500.50', descripcion: 'super', categoria: 'Supermercado',
      metodo_pago: 'Efectivo', moneda: 'ARS', notas: null, created_at: 'c', updated_at: 'u',
    }]
    const res = await svc.load()
    expect(res.gastosTableReady).toBe(true)
    expect(res.gastos).toEqual([{
      id: 'g-1', fecha: '2026-10-10', monto: 1500.5, descripcion: 'super', categoria: 'Supermercado',
      metodoPago: 'Efectivo', moneda: 'ARS', notas: undefined, created_at: 'c', updated_at: 'u',
    }])
  })

  it('load degrades gracefully when the gastos table does not exist', async () => {
    const svc = configured()
    tableErrors.gastos = { code: 'PGRST205', message: "Could not find the table 'public.gastos' in the schema cache" }
    tableRows.servicios = [{ id: 's1', nombre: 'Luz', orden: 0 }]
    const res = await svc.load()
    expect(res.gastosTableReady).toBe(false)
    expect(res.gastos).toEqual([])
    expect(res.servicios).toHaveLength(1)
  })

  it('load still fails on other gastos errors', async () => {
    const svc = configured()
    tableErrors.gastos = { code: '500', message: 'boom' }
    await expect(svc.load()).rejects.toThrow('boom')
  })

  it('saveGasto upserts a snake_case row', async () => {
    const svc = configured()
    await svc.saveGasto(gasto)
    expect(upserted[0]?.table).toBe('gastos')
    expect(upserted[0]?.row).toMatchObject({ id: 'g-1', metodo_pago: 'Efectivo', moneda: 'ARS', monto: 1500, notas: null })
  })

  it('saveGasto / deleteGasto flag a missing table with GASTOS_TABLE_MISSING', async () => {
    const svc = configured()
    tableErrors.gastos = { code: '42P01', message: 'relation "public.gastos" does not exist' }
    await expect(svc.saveGasto(gasto)).rejects.toThrow('GASTOS_TABLE_MISSING')
    await expect(svc.deleteGasto('g-1')).rejects.toThrow('GASTOS_TABLE_MISSING')
  })

  it('deleteGasto deletes by id', async () => {
    const svc = configured()
    await svc.deleteGasto('g-1')
    expect(deleted).toContainEqual({ table: 'gastos', column: 'id', value: 'g-1' })
  })

  it('getRemoteVersion includes gastos and ignores it when the table is missing', async () => {
    const svc = configured()
    tableRows.pagos = [{ updated_at: '2024-06-15T12:00:00.000Z' }]
    tableRows.gastos = [{ updated_at: '2025-01-01T00:00:00.000Z' }]
    expect(await svc.getRemoteVersion()).toMatch(/^2025-01-01T00:00:00\.000Z#.*gastos=1/)
    tableErrors.gastos = { code: 'PGRST205', message: 'Could not find the table' }
    const v = await svc.getRemoteVersion()
    expect(v).toMatch(/^2024-06-15T12:00:00\.000Z#/)
    expect(v).not.toContain('gastos=')
  })

  it('load degrades a missing servicios/pagos table and reports missingTables', async () => {
    const svc = configured()
    tableErrors.pagos = { code: 'PGRST205', message: 'Could not find the table' }
    tableErrors.gastos = { code: 'PGRST205', message: 'Could not find the table' }
    const res = await svc.load()
    expect(res.pagos).toEqual([])
    expect(res.missingTables).toEqual(['pagos', 'gastos'])
  })

  it('savePago flags a missing pagos table with GASTOS_TABLE_MISSING', async () => {
    const svc = configured()
    tableErrors.pagos = { code: '42P01', message: 'relation does not exist' }
    await expect(svc.savePago({ id: 'p', servicioId: 's', mes: '2026-10', monto: 1, pagado: false })).rejects.toThrow('GASTOS_TABLE_MISSING(pagos)')
  })

  // ── Caché local compartido ───────────────────────────────────────────────────

  it('local cache: empty by default, patches merge, prefs merge', () => {
    const svc = makeService()
    expect(svc.getLocalCache()).toEqual({ data: null, updatedAt: null, lastSynced: null, prefs: {} })
    svc.setLocalCache({ prefs: { presupuesto: 1000 } })
    const data = { servicios: [], pagos: [], gastos: [gasto] }
    const after = svc.setLocalCache({ data, lastSynced: 'v1' })
    expect(after.data?.gastos).toHaveLength(1)
    expect(after.updatedAt).toBeTruthy()
    svc.setLocalCache({ prefs: { lastMetodo: 'MP' } })
    // Otra instancia (= otra ventana / origen) ve lo mismo
    const again = makeService().getLocalCache()
    expect(again.prefs).toEqual({ presupuesto: 1000, lastMetodo: 'MP' })
    expect(again.lastSynced).toBe('v1')
    expect(again.data?.gastos[0]?.id).toBe('g-1')
  })

  it('pending writes round-trip and drop invalid entries', () => {
    const svc = makeService()
    expect(svc.getPendingWrites()).toEqual([])
    svc.setPendingWrites([
      { channel: 'gastos:save-gasto', args: [gasto] },
      { channel: 'settings:set', args: ['x'] },
      { channel: 'gastos:delete-gasto' } as never,
    ])
    expect(svc.getPendingWrites()).toEqual([{ channel: 'gastos:save-gasto', args: [gasto] }])
  })
  // ── Paginación, credenciales sin contraseñas, resumen liviano ───────────────

  it('load paginates every table past the 1000-row cap', async () => {
    const svc = configured()
    tableRows.gastos = Array.from({ length: 2345 }, (_, i) => ({ id: `g${i}`, fecha: '2026-10-01', monto: 1, moneda: 'ARS' }))
    tableRows.pagos = Array.from({ length: 1000 }, (_, i) => ({ id: `p${i}`, servicio_id: 's', mes: '2026-10', monto: 1 }))
    const res = await svc.load()
    expect(res.gastos).toHaveLength(2345)
    expect(res.pagos).toHaveLength(1000)
    expect(ranges.filter((r) => r.table === 'gastos').map((r) => r.from)).toEqual([0, 1000, 2000])
    // Una página justa de 1000 obliga a pedir la siguiente (vacía) para saber que terminó.
    expect(ranges.filter((r) => r.table === 'pagos').map((r) => r.from)).toEqual([0, 1000])
  })

  it('load never returns passwords, even when the vault has them', async () => {
    const svc = configured()
    await svc.saveCredencial({ id: 'c1', nombre: 'Banco', usuario: 'yo', password: 'secreto', orden: 0 })
    tableRows.credenciales = [{ id: 'c1', nombre: 'Banco', usuario: 'yo', orden: 0 }]
    const res = await svc.load()
    expect(res.credenciales).toHaveLength(1)
    expect(res.credenciales[0]?.password).toBe('')
    expect(JSON.stringify(res)).not.toContain('secreto')
    expect((await svc.loadCredenciales())[0]?.password).toBe('')
  })

  it('ignores SUPABASE_* env vars: only Settings or gastos-supabase.local.json configure it', () => {
    process.env.SUPABASE_URL = 'https://env.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'env-key'
    try {
      const svc = makeService()
      expect(svc.getSupabasePublicConfig()).toEqual({ url: '', keyConfigured: false })
      expect(svc.isConfigured()).toBe(false)
    } finally {
      delete process.env.SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
    }
  })

  it('getMonthSummary: light month query with pending writes and budget applied', async () => {
    const svc = configured()
    tableRows.servicios = [{ id: 's1', nombre: 'Luz', activo: true, orden: 0 }]
    tableRows.pagos = [
      { id: 'p1', servicio_id: 's1', mes: '2026-10', monto: 100, pagado: true },
      { id: 'p0', servicio_id: 's1', mes: '2026-09', monto: 80, pagado: true },
    ]
    tableRows.gastos = [{ id: 'g1', fecha: '2026-10-05', monto: 50, moneda: 'ARS' }]
    svc.setLocalCache({ prefs: { presupuesto: 1000 } })
    svc.setPendingWrites([{ channel: 'gastos:save-gasto', args: [{ ...gasto, id: 'gx', fecha: '2026-10-09', monto: 25 }] }])
    const r = await svc.getMonthSummary('2026-10')
    expect(r.status).toBe('ok')
    expect(r.pendingCount).toBe(1)
    expect(r.summary).toMatchObject({ mes: '2026-10', fijos: 100, variables: 75, total: 175, previousTotal: 80, presupuesto: 1000 })
    expect(filters).toContainEqual({ table: 'pagos', op: 'in', column: 'mes', value: ['2026-09', '2026-10'] })
    expect(filters).toContainEqual({ table: 'gastos', op: 'gte', column: 'fecha', value: '2026-09-01' })
    expect(filters).toContainEqual({ table: 'gastos', op: 'lt', column: 'fecha', value: '2026-11-01' })
  })

  it('getMonthSummary: not configured / offline / error fall back to the local cache', async () => {
    const data = { servicios: [], pagos: [], gastos: [{ ...gasto, fecha: '2026-10-02', monto: 10 }] }
    const plain = makeService()
    plain.setLocalCache({ data })
    const nc = await plain.getMonthSummary('2026-10')
    expect(nc.status).toBe('not-configured')
    expect(nc.summary?.variables).toBe(10)

    const svc = configured()
    tableErrors.servicios = { message: 'TypeError: fetch failed' }
    const off = await svc.getMonthSummary('2026-10')
    expect(off.status).toBe('offline')
    expect(off.summary?.variables).toBe(10)

    tableErrors.servicios = { code: '401', message: 'Invalid API key' }
    const bad = await svc.getMonthSummary('2026-10')
    expect(bad.status).toBe('error')
    expect(bad.error).toContain('Invalid API key')
  })
})
