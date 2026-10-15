import { describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { collectFiles, fromPortable, openBackup, safeRelPath, sealBackup, toPortable, type BackupPayload, type Codec } from './backup'

// "Cifrado de máquina" de juguete: reversible y distinto en cada PC.
const machine = (id: string): Codec => ({
  available: true,
  encrypt: (s) => Buffer.from(`${id}|${s}`).toString('base64'),
  decrypt: (b) => { const t = Buffer.from(b, 'base64').toString(); if (!t.startsWith(`${id}|`)) throw new Error('otra máquina'); return t.slice(id.length + 1) },
})
const pcA = machine('A')
const pcB = machine('B')

describe('toPortable / fromPortable', () => {
  it('ENCV1 (DatabaseService): se descifra y se re-cifra para la PC nueva', () => {
    const file = Buffer.from('ENCV1:' + pcA.encrypt('{"x":1}'))
    const e = toPortable('credentials-local.json', file, pcA)
    expect(e).toEqual({ path: 'credentials-local.json', kind: 'db-enc', data: '{"x":1}' })
    const out = fromPortable(e, pcB).toString()
    expect(out.startsWith('ENCV1:')).toBe(true)
    expect(pcB.decrypt(out.slice(6))).toBe('{"x":1}')
  })

  it('historial del portapapeles { v, enc, data }', () => {
    const file = Buffer.from(JSON.stringify({ v: 1, enc: true, data: pcA.encrypt('[{"id":"1"}]') }))
    const e = toPortable('clipboard-recent.json', file, pcA)
    expect(e.kind).toBe('clip-enc')
    expect(e.data).toBe('[{"id":"1"}]')
    const back = JSON.parse(fromPortable(e, pcB).toString())
    expect(back.enc).toBe(true)
    expect(pcB.decrypt(back.data)).toBe('[{"id":"1"}]')
  })

  it('settings.json con valores enc: sueltos', () => {
    const file = Buffer.from(JSON.stringify({ theme: 'dark', 'openai.key': 'enc:' + pcA.encrypt('sk-123') }))
    const e = toPortable('settings.json', file, pcA)
    expect(e.kind).toBe('enc-values')
    const back = JSON.parse(fromPortable(e, pcB).toString())
    expect(back.theme).toBe('dark')
    expect(pcB.decrypt(back['openai.key'].slice(4))).toBe('sk-123')
  })

  it('JSON común, markdown y binarios', () => {
    expect(toPortable('snippets.json', Buffer.from('{"a":[1]}'), pcA)).toEqual({ path: 'snippets.json', kind: 'text', data: '{"a":[1]}' })
    expect(toPortable('notes/hoy.md', Buffer.from('# Hola'), pcA).kind).toBe('text')
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2])
    const e = toPortable('captures/a.png', png, pcA)
    expect(e.kind).toBe('raw')
    expect(fromPortable(e, pcB).equals(png)).toBe(true)
  })
})

describe('sealBackup / openBackup', () => {
  const payload: BackupPayload = { format: 'setto-backup', v: 1, createdAt: 1, appVersion: '2.12.0', entries: [{ path: 'a.json', kind: 'text', data: '{}' }], local: { 'app-theme': 'dark' } }

  it('ida y vuelta con la contraseña correcta', () => {
    const sealed = sealBackup(payload, 'una contraseña larga')
    expect(sealed.toString()).not.toContain('app-theme')
    expect(openBackup(sealed, 'una contraseña larga')).toEqual(payload)
  })

  it('contraseña incorrecta o corta', () => {
    const sealed = sealBackup(payload, 'una contraseña larga')
    expect(() => openBackup(sealed, 'otra contraseña')).toThrow(/Contraseña incorrecta/)
    expect(() => sealBackup(payload, 'corta')).toThrow(/al menos/)
    expect(() => openBackup(Buffer.from('hola'), 'x')).toThrow(/no es un respaldo/)
  })
})

describe('safeRelPath', () => {
  it('rechaza rutas que se salen de userData', () => {
    expect(safeRelPath('notes/a.md')).toBe('notes/a.md')
    expect(safeRelPath('notes\\a.md')).toBe('notes/a.md')
    expect(safeRelPath('../x.json')).toBeNull()
    expect(safeRelPath('C:\\Windows\\x')).toBeNull()
    expect(safeRelPath('/etc/passwd')).toBeNull()
  })
})

describe('collectFiles', () => {
  it('datos sí; sesión, cachés, temporales y capturas (salvo que se pidan) no', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'setto-bk-'))
    for (const f of ['settings.json', 'snippets.json', 'gastos-credenciales-passwords.vault', 'google-auth.json', 'ai-cache.json', 'x.json.tmp', 'Preferences', 'setto-fg-1.exe']) fs.writeFileSync(path.join(dir, f), '{}')
    fs.mkdirSync(path.join(dir, 'notes'))
    fs.writeFileSync(path.join(dir, 'notes', 'hoy.md'), '#')
    fs.mkdirSync(path.join(dir, 'captures'))
    fs.writeFileSync(path.join(dir, 'captures', 'a.png'), 'x')
    expect(collectFiles(dir, { includeCaptures: false })).toEqual(['gastos-credenciales-passwords.vault', 'notes/hoy.md', 'settings.json', 'snippets.json'])
    expect(collectFiles(dir, { includeCaptures: true })).toContain('captures/a.png')
  })
})
