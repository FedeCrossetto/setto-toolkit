import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: true, getPath: () => '.' } }))
vi.mock('./logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))

import { buildRegFile } from './file-associations'

describe('buildRegFile', () => {
  const reg = buildRegFile('Setto.exe', '"C:\\Users\\Fede\\Setto.exe" "%1"', ['.txt', '.sql'])
  it('starts with the v5 header and uses CRLF', () => {
    expect(reg.startsWith('Windows Registry Editor Version 5.00\r\n')).toBe(true)
    expect(reg.includes('\n') && !/[^\r]\n/.test(reg)).toBe(true)
  })
  it('escapes backslashes and quotes in the open command', () => {
    expect(reg).toContain('[HKEY_CURRENT_USER\\Software\\Classes\\Applications\\Setto.exe\\shell\\open\\command]\r\n@="\\"C:\\\\Users\\\\Fede\\\\Setto.exe\\" \\"%1\\""')
  })
  it('registers every extension as supported type and in OpenWithList', () => {
    expect(reg).toContain('".txt"=""')
    expect(reg).toContain('".sql"=""')
    expect(reg).toContain('[HKEY_CURRENT_USER\\Software\\Classes\\.sql\\OpenWithList\\Setto.exe]\r\n@=""')
  })
})
