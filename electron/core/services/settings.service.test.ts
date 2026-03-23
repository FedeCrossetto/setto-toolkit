import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

let tmpDir: string

// Mock electron
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

const { DatabaseService } = await import('./db.service')
const { SettingsService } = await import('./settings.service')

describe('SettingsService', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('get returns null for missing key', () => {
    const db = new DatabaseService()
    const svc = new SettingsService(db)
    expect(svc.get('nonexistent')).toBeNull()
  })

  it('set and get a plain value', () => {
    const db = new DatabaseService()
    const svc = new SettingsService(db)
    svc.set('app.theme', 'dark')
    expect(svc.get('app.theme')).toBe('dark')
  })

  it('persists values across instances (disk round-trip)', () => {
    const db1 = new DatabaseService()
    const svc1 = new SettingsService(db1)
    svc1.set('app.lang', 'es')

    const db2 = new DatabaseService()
    const svc2 = new SettingsService(db2)
    expect(svc2.get('app.lang')).toBe('es')
  })

  it('delete removes a key', () => {
    const db = new DatabaseService()
    const svc = new SettingsService(db)
    svc.set('tmp.key', 'value')
    svc.delete('tmp.key')
    expect(svc.get('tmp.key')).toBeNull()
  })

  it('getAll returns all keys with given prefix', () => {
    const db = new DatabaseService()
    const svc = new SettingsService(db)
    svc.set('ui.theme', 'dark')
    svc.set('ui.font', 'mono')
    svc.set('ai.model', 'gpt-4o')

    const uiSettings = svc.getAll('ui.')
    expect(Object.keys(uiSettings)).toHaveLength(2)
    expect(uiSettings['ui.theme']).toBe('dark')
    expect(uiSettings['ui.font']).toBe('mono')
  })

  it('setJSON / getJSON round-trips complex objects', () => {
    const db = new DatabaseService()
    const svc = new SettingsService(db)
    const payload = { items: [1, 2, 3], nested: { ok: true } }
    svc.setJSON('data.obj', payload)
    expect(svc.getJSON<typeof payload>('data.obj')).toEqual(payload)
  })
})
