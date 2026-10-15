import { describe, expect, it } from 'vitest'
import { buildConnectionString, buildSqlcmd, csValue, validateDraft, type SqlProfileDraft } from './sql'

const base: SqlProfileDraft = { name: 'Local', server: 'CROSSETTO\\MSSQLSERVER02', database: 'wgdb_000', auth: 'sql', user: 'sa', tag: '', trustCert: true }

describe('csValue', () => {
  it('comillas sólo cuando hace falta', () => {
    expect(csValue('wgdb_000')).toBe('wgdb_000')
    expect(csValue('pa;ss')).toBe('"pa;ss"')
    expect(csValue('a"b=c')).toBe('"a""b=c"')
    expect(csValue(' x')).toBe('" x"')
  })
})

describe('buildConnectionString', () => {
  it('SQL auth con contraseña', () => {
    expect(buildConnectionString(base, 'Secreta;1')).toBe(
      'Data Source=CROSSETTO\\MSSQLSERVER02;Initial Catalog=wgdb_000;User ID=sa;Password="Secreta;1";TrustServerCertificate=True;')
  })
  it('sin contraseña para compartir', () => {
    expect(buildConnectionString(base, null)).not.toContain('Password')
  })
  it('Windows auth, sin base y con timeout de prueba', () => {
    expect(buildConnectionString({ ...base, auth: 'windows', database: '', trustCert: false }, 'x', { timeoutSec: 8 }))
      .toBe('Data Source=CROSSETTO\\MSSQLSERVER02;Integrated Security=True;Connect Timeout=8;')
  })
})

describe('buildSqlcmd', () => {
  it('nunca lleva la contraseña', () => {
    expect(buildSqlcmd(base)).toBe('sqlcmd -S "CROSSETTO\\MSSQLSERVER02" -d "wgdb_000" -U "sa"')
    expect(buildSqlcmd({ ...base, auth: 'windows' })).toBe('sqlcmd -S "CROSSETTO\\MSSQLSERVER02" -d "wgdb_000" -E')
  })
})

describe('validateDraft', () => {
  it('pide lo mínimo según la autenticación', () => {
    expect(validateDraft(base, false)).toEqual({ password: 'Falta la contraseña' })
    expect(validateDraft(base, true)).toEqual({})
    expect(validateDraft({ ...base, auth: 'windows', user: '' }, false)).toEqual({})
    expect(Object.keys(validateDraft({ ...base, name: ' ', server: 'host db' }, true))).toEqual(['name', 'server'])
  })
})
