import { describe, it, expect, vi, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { renameWithRetry, writeFileAtomic } from './atomic-write'

const tmpDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-'))

afterEach(() => { vi.restoreAllMocks() })

describe('writeFileAtomic', () => {
  it('escribe el contenido y no deja temporales', () => {
    const dir = tmpDir()
    const file = path.join(dir, 'a.json')
    writeFileAtomic(file, '{"x":1}')
    writeFileAtomic(file, '{"x":2}')
    expect(fs.readFileSync(file, 'utf-8')).toBe('{"x":2}')
    expect(fs.readdirSync(dir)).toEqual(['a.json'])
  })
})

describe('renameWithRetry', () => {
  it('reintenta ante EPERM y termina renombrando', () => {
    const dir = tmpDir()
    const from = path.join(dir, 'f.tmp')
    const to = path.join(dir, 'f.json')
    fs.writeFileSync(from, 'ok')
    const real = fs.renameSync
    let calls = 0
    vi.spyOn(fs, 'renameSync').mockImplementation((a, b) => {
      calls++
      if (calls < 3) throw Object.assign(new Error('locked'), { code: 'EPERM' })
      return real(a, b)
    })
    renameWithRetry(from, to)
    expect(calls).toBe(3)
    expect(fs.readFileSync(to, 'utf-8')).toBe('ok')
  })

  it('si sigue bloqueado copia encima en vez de perder la escritura', () => {
    const dir = tmpDir()
    const from = path.join(dir, 'g.tmp')
    const to = path.join(dir, 'g.json')
    fs.writeFileSync(from, 'nuevo')
    fs.writeFileSync(to, 'viejo')
    vi.spyOn(fs, 'renameSync').mockImplementation(() => { throw Object.assign(new Error('locked'), { code: 'EBUSY' }) })
    renameWithRetry(from, to, 2)
    expect(fs.readFileSync(to, 'utf-8')).toBe('nuevo')
  })

  it('no reintenta errores que no son de bloqueo', () => {
    expect(() => renameWithRetry('/no/existe.tmp', '/no/existe.json')).toThrow()
  })
})
