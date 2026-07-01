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
const upserted: Array<{ table: string; row: unknown }> = []
const deleted: Array<{ table: string; column: string; value: unknown }> = []

function makeQueryBuilder(table: string) {
  const result = () => ({ data: tableRows[table] ?? [], error: null })
  const builder = {
    select: () => builder,
    order: () => builder,
    limit: () => builder,
    eq: (column: string, value: unknown) => {
      deleted.push({ table, column, value })
      return Promise.resolve({ error: null })
    },
    upsert: (row: unknown) => {
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
    tableRows = { servicios: [], pagos: [], credenciales: [], queries: [] }
    upserted.length = 0
    deleted.length = 0
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

  it('getRemoteVersion returns the max updated_at across all 4 tables', async () => {
    const svc = makeService()
    svc.saveSupabaseConfig({ url: 'https://example.supabase.co', serviceKey: 'secret-key' })
    tableRows.servicios = [{ updated_at: '2024-01-01T00:00:00.000Z' }]
    tableRows.pagos = [{ updated_at: '2024-06-15T12:00:00.000Z' }]
    tableRows.credenciales = [{ updated_at: '2024-03-01T00:00:00.000Z' }]
    tableRows.queries = []
    expect(await svc.getRemoteVersion()).toBe('2024-06-15T12:00:00.000Z')
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
})
