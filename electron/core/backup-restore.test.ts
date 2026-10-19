import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { restoreBackupInto } from './backup-restore'
import type { BackupPayload, Codec } from './backup'

const codec: Codec = {
  available: true,
  encrypt: (s) => Buffer.from(`B|${s}`).toString('base64'),
  decrypt: (b) => Buffer.from(b, 'base64').toString().slice(2),
}

const payload = (entries: BackupPayload['entries']): BackupPayload =>
  ({ format: 'setto-backup', v: 1, createdAt: 1, appVersion: '2.14.0', entries, local: {} })

let dir = ''
const write = (rel: string, text: string): void => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
  fs.writeFileSync(path.join(dir, rel), text)
}
const read = (rel: string): string | null => { try { return fs.readFileSync(path.join(dir, rel), 'utf-8') } catch { return null } }

/** Foto de todo el árbol (ruta → contenido), para comparar antes/después. */
function snapshot(root = dir): Record<string, string> {
  const out: Record<string, string> = {}
  const walk = (rel: string): void => {
    for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) walk(r)
      else out[r] = fs.readFileSync(path.join(root, r), 'utf-8')
    }
  }
  walk('')
  return out
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'setto-restore-'))
  write('settings.json', '{"a":"old"}')
  write('snippets.json', '[]')
  write('notes/old-note.md', '# vieja')
  write('notes/keep.md', '# antes')
  write('captures/captures.json', '[]')
  write('captures/x.png', 'PNG')
  write('google-auth.json', '{"session":1}')      // excluido del respaldo: no se toca
  write('backup-auto.json', 'ENCV1:abc')          // ídem
})
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

describe('restoreBackupInto', () => {
  it('reemplaza el conjunto de datos, borra lo que no está en el respaldo y guarda la copia', () => {
    const r = restoreBackupInto(dir, payload([
      { path: 'settings.json', kind: 'text', data: '{"a":"new"}' },
      { path: 'credentials.vault', kind: 'db-enc', data: '{"k":1}' },
      { path: 'notes/keep.md', kind: 'text', data: '# después' },
    ]), codec, { now: 42 })

    expect(r).toMatchObject({ files: 3, removed: 2, skipped: [] })
    expect(read('settings.json')).toBe('{"a":"new"}')
    expect(read('credentials.vault')).toBe('ENCV1:' + codec.encrypt('{"k":1}'))
    expect(read('notes/keep.md')).toBe('# después')
    // No estaban en el respaldo → fuera de los datos vivos, pero en la copia.
    expect(read('snippets.json')).toBeNull()
    expect(read('notes/old-note.md')).toBeNull()
    expect(read('restore-backup-42/snippets.json')).toBe('[]')
    expect(read('restore-backup-42/notes/old-note.md')).toBe('# vieja')
    expect(read('restore-backup-42/settings.json')).toBe('{"a":"old"}')
    // Fuera del conjunto: intacto. Sin capturas en el respaldo: las capturas no se tocan.
    expect(read('google-auth.json')).toBe('{"session":1}')
    expect(read('backup-auto.json')).toBe('ENCV1:abc')
    expect(read('captures/x.png')).toBe('PNG')
    expect(fs.existsSync(path.join(dir, '.restore-staging-42'))).toBe(false)
  })

  it('con capturas en el respaldo, también las reemplaza', () => {
    restoreBackupInto(dir, payload([
      { path: 'settings.json', kind: 'text', data: '{}' },
      { path: 'captures/captures.json', kind: 'text', data: '[1]' },
    ]), codec, { now: 7 })
    expect(read('captures/captures.json')).toBe('[1]')
    expect(read('captures/x.png')).toBeNull()
    expect(read('restore-backup-7/captures/x.png')).toBe('PNG')
  })

  it('ignora rutas peligrosas o ajenas al conjunto de datos', () => {
    const r = restoreBackupInto(dir, payload([
      { path: 'settings.json', kind: 'text', data: '{}' },
      { path: '../evil.json', kind: 'text', data: '{}' },
      { path: 'C:/Windows/x.json', kind: 'text', data: '{}' },
      { path: 'random.exe', kind: 'raw', data: 'AA==' },
      { path: 'google-auth.json', kind: 'text', data: '{"session":"attacker"}' },
    ]), codec, { now: 1 })
    expect(r.files).toBe(1)
    expect(r.skipped).toEqual(expect.arrayContaining(['../evil.json', 'C:/Windows/x.json', 'random.exe', 'google-auth.json']))
    expect(fs.existsSync(path.join(dir, '..', 'evil.json'))).toBe(false)
    expect(read('random.exe')).toBeNull()
    expect(read('google-auth.json')).toBe('{"session":1}')
  })

  it('un respaldo con un JSON dañado no toca nada', () => {
    const before = snapshot()
    expect(() => restoreBackupInto(dir, payload([
      { path: 'settings.json', kind: 'text', data: '{"a":' },
    ]), codec, { now: 3 })).toThrow(/dañado/)
    expect(snapshot()).toEqual(before)
  })

  it('un respaldo vacío no borra los datos', () => {
    const before = snapshot()
    expect(() => restoreBackupInto(dir, payload([]), codec)).toThrow(/no trae datos/)
    expect(snapshot()).toEqual(before)
  })

  it.each([0, 2, 4, 6])('si el intercambio falla en el paso %i, deshace todo', (failAt) => {
    const before = snapshot()
    expect(() => restoreBackupInto(dir, payload([
      { path: 'settings.json', kind: 'text', data: '{"a":"new"}' },
      { path: 'notes/keep.md', kind: 'text', data: '# después' },
      { path: 'notes/nueva.md', kind: 'text', data: '# nueva' },
    ]), codec, { now: 9, failAt })).toThrow(/quedaron como estaban/)
    expect(snapshot()).toEqual(before)
  })
})
