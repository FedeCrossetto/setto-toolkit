import { describe, expect, it } from 'vitest'
import { compareSets, findRisks, splitBatches, tabTitle, toCsv, toTsv } from './sql-text'

describe('splitBatches', () => {
  it('separa por GO en su propia línea y recuerda dónde empieza cada lote', () => {
    const b = splitBatches('SELECT 1\nGO\n\nSELECT 2\nSELECT 3\ngo 2\nSELECT 4')
    expect(b.map((x) => [x.sql.trim(), x.startLine, x.repeat])).toEqual([
      ['SELECT 1', 1, 1], ['SELECT 2\nSELECT 3', 3, 2], ['SELECT 4', 7, 1],
    ])
  })
  it('GO dentro de una línea no corta; lotes vacíos se ignoran', () => {
    expect(splitBatches("SELECT 'GO'\nGO\nGO\n")).toHaveLength(1)
    expect(splitBatches('   ')).toEqual([])
  })
})

describe('findRisks', () => {
  it('UPDATE/DELETE sin WHERE, DROP y TRUNCATE', () => {
    expect(findRisks('UPDATE accounts SET ac_blocked = 1').map((r) => r.kind)).toEqual(['update-no-where'])
    expect(findRisks('DELETE FROM accounts').map((r) => r.kind)).toEqual(['delete-no-where'])
    expect(findRisks('DROP TABLE x; TRUNCATE TABLE y').map((r) => r.kind)).toEqual(['drop', 'truncate'])
  })
  it('con WHERE, en comentarios o strings no avisa', () => {
    expect(findRisks('UPDATE accounts SET a = 1 WHERE ac_id = 5')).toEqual([])
    expect(findRisks("-- DELETE FROM accounts\nSELECT 'DROP TABLE x'")).toEqual([])
    expect(findRisks('/* UPDATE t SET a=1 */ SELECT * FROM t')).toEqual([])
  })
  it('separa sentencias pegadas sin punto y coma', () => {
    expect(findRisks('SELECT * FROM a WHERE x = 1\nDELETE FROM b').map((r) => r.kind)).toEqual(['delete-no-where'])
  })
})

describe('tabTitle', () => {
  it('verbo y tabla', () => {
    expect(tabTitle('SELECT ac_id\nFROM dbo.accounts WHERE 1=1', 'x')).toBe('SELECT · dbo.accounts')
    expect(tabTitle('-- revisar\nUPDATE [accounts] SET a = 1', 'x')).toBe('UPDATE · accounts')
    expect(tabTitle('EXEC sp_who2', 'x')).toBe('EXEC · sp_who2')
    expect(tabTitle('  ', 'Consulta 3')).toBe('Consulta 3')
  })
})

describe('compareSets', () => {
  const cols = ['GROUP', 'SUBJECT', 'VALUE']
  it('sólo lo distinto, por clave (sin importar mayúsculas)', () => {
    const a = { columns: cols, rows: [['Cashier', 'Mode', '1'], ['Account', 'AllowDuplicate', '0'], ['Only', 'A', 'x']] }
    const b = { columns: cols, rows: [['cashier', 'mode', '1'], ['Account', 'AllowDuplicate', '1'], ['Only', 'B', null]] }
    const r = compareSets(a, b, 2)
    expect(r.same).toBe(1)
    expect(r.rows.map((x) => [x.status, x.key.join('.'), x.changed])).toEqual([
      ['diff', 'Account.AllowDuplicate', [2]],
      ['only-a', 'Only.A', []],
      ['only-b', 'Only.B', []],
    ])
  })
  it('NULL distinto de vacío', () => {
    const r = compareSets({ columns: ['k', 'v'], rows: [['1', null]] }, { columns: ['k', 'v'], rows: [['1', '']] }, 1)
    expect(r.rows[0]?.status).toBe('diff')
  })
})

describe('toTsv / toCsv', () => {
  it('NULL y separadores', () => {
    expect(toTsv(['a', 'b'], [['x\ty', null]])).toBe('a\tb\nx y\tNULL')
    expect(toCsv(['a', 'b'], [['x;y', null], ['say "hi"', '1']])).toBe('a;b\r\n"x;y";\r\n"say ""hi""";1')
  })
})
