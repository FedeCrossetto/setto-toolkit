import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

// Mock electron before importing the service
vi.mock('electron', () => ({
  app: { getPath: () => tmpDir },
}))

// Mock logger to avoid electron dependency in tests
vi.mock('../logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

let tmpDir: string

// Import after mocks are set up
const { DatabaseService } = await import('./db.service')

describe('DatabaseService', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'db-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns null for non-existent file', () => {
    const db = new DatabaseService()
    expect(db.readJSON('missing.json')).toBeNull()
  })

  it('writes and reads JSON round-trip', () => {
    const db = new DatabaseService()
    const data = { foo: 'bar', num: 42, arr: [1, 2, 3] }
    db.writeJSON('test.json', data)
    expect(db.readJSON('test.json')).toEqual(data)
  })

  it('atomic write: tmp file is cleaned up after rename', () => {
    const db = new DatabaseService()
    db.writeJSON('test.json', { ok: true })
    const tmpPath = path.join(tmpDir, 'test.json.tmp')
    expect(fs.existsSync(tmpPath)).toBe(false)
    expect(fs.existsSync(path.join(tmpDir, 'test.json'))).toBe(true)
  })

  it('returns null and creates backup for corrupted JSON', () => {
    const db = new DatabaseService()
    const filePath = path.join(tmpDir, 'corrupt.json')
    fs.writeFileSync(filePath, '{ not valid json !!!', 'utf-8')

    const result = db.readJSON('corrupt.json')
    expect(result).toBeNull()

    // A .bak file should be created
    const files = fs.readdirSync(tmpDir)
    const backups = files.filter((f) => f.startsWith('corrupt.json.corrupt-') && f.endsWith('.bak'))
    expect(backups.length).toBe(1)
  })

  it('overwrite existing file correctly', () => {
    const db = new DatabaseService()
    db.writeJSON('data.json', { v: 1 })
    db.writeJSON('data.json', { v: 2 })
    expect(db.readJSON<{ v: number }>('data.json')).toEqual({ v: 2 })
  })
})
