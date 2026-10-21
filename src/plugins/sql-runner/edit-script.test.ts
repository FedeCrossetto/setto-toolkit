import { describe, expect, it } from 'vitest'
import { buildApplyScript, buildStatements, countEdits, editBlocker, emptyEdits, pkSql, usedDatabase, cellInput, type EditTarget } from './edit-script'

const t: EditTarget = { table: 'dbo.accounts', columns: ['ac_id', 'ac_name', 'ac_balance'], types: ['bigint', 'nvarchar', 'money'], pk: ['AC_ID'] }
const rows = [['1', 'Ana', '10.00'], ['2', "O'Neil", null]]

describe('edit-script', () => {
  it('UPDATE sólo con lo cambiado, DELETE e INSERT por clave primaria', () => {
    const e = emptyEdits()
    e.updates.set(0, new Map([[1, 'Ana María'], [2, null]]))
    e.deleted.add(1)
    e.inserted.push(new Map([[1, 'Nuevo'], [2, '5']]))
    expect(buildStatements(t, rows, e)).toEqual([
      "UPDATE [dbo].[accounts] SET [ac_name] = N'Ana María', [ac_balance] = NULL WHERE [ac_id] = 1;",
      'DELETE FROM [dbo].[accounts] WHERE [ac_id] = 2;',
      "INSERT INTO [dbo].[accounts] ([ac_name], [ac_balance]) VALUES (N'Nuevo', 5);",
    ])
    expect(countEdits(e)).toBe(3)
  })
  it('una fila borrada no genera además su UPDATE', () => {
    const e = emptyEdits()
    e.updates.set(1, new Map([[1, 'x']]))
    e.deleted.add(1)
    expect(buildStatements(t, rows, e)).toEqual(['DELETE FROM [dbo].[accounts] WHERE [ac_id] = 2;'])
  })
  it('el script para aplicar va en transacción y verifica 1 fila por cambio', () => {
    const e = emptyEdits()
    e.updates.set(0, new Map([[1, 'B']]))
    const s = buildApplyScript(t, rows, e)
    expect(s.startsWith('SET XACT_ABORT ON;\nBEGIN TRAN;\nUPDATE')).toBe(true)
    expect(s).toContain('IF @@ROWCOUNT <> 1 BEGIN ROLLBACK; THROW 50000')
    expect(s.trim().endsWith('COMMIT;')).toBe(true)
  })
  it('editBlocker explica por qué no se puede editar', () => {
    expect(editBlocker('SELECT * FROM a JOIN b ON 1=1', 1, ['x'], ['x'])).toMatch(/JOIN/)
    expect(editBlocker('SELECT ac_name FROM accounts', 1, ['ac_name'], ['ac_id'])).toMatch(/ac_id/)
    expect(editBlocker('SELECT * FROM t', 1, ['a'], [])).toBeNull()
    expect(editBlocker('SELECT * FROM accounts', 1, ['ac_id', 'ac_name'], ['ac_id'])).toBeNull()
    expect(editBlocker('SELECT ac_id, 1 AS x FROM accounts', 1, ['ac_id', 'x'], ['ac_id'], ['ac_id', 'ac_name'])).toMatch(/\(x\)/)
  })
  it('sin clave primaria identifica la fila por todas las columnas comparables', () => {
    const all: EditTarget = { table: 't', columns: ['a', 'b', 'notas'], types: ['int', 'nvarchar', 'ntext'], pk: [], keyMode: 'all' }
    const e = emptyEdits()
    e.deleted.add(0)
    expect(buildStatements(all, [['1', null, 'largo']], e)).toEqual(['DELETE FROM [t] WHERE [a] = 1 AND [b] IS NULL;'])
  })
  it('usedDatabase toma el último USE', () => {
    expect(usedDatabase('USE wgdb_000;\n\nSELECT 1')).toBe('wgdb_000')
    expect(usedDatabase('use [mi base]\nselect 1')).toBe('mi base')
    expect(usedDatabase('SELECT 1 -- use x')).toBeNull()
  })
  it('pkSql rechaza nombres raros', () => {
    expect(() => pkSql("x'); DROP TABLE y; --")).toThrow()
    expect(pkSql('[dbo].[accounts]')).toContain("OBJECT_ID(N'[dbo].[accounts]')")
  })
})

describe('cellInput', () => {
  it('NULL escrito, vacío en números/fechas y vacío sobre NULL son NULL; vacío en texto es texto vacío', () => {
    expect(cellInput('null', 'x', 'nvarchar')).toBeNull()
    expect(cellInput('', 'Ana', 'nvarchar')).toBe('')
    expect(cellInput('', '5', 'int')).toBeNull()
    expect(cellInput('', null, 'varchar')).toBeNull()
    expect(cellInput('Ana', null, 'nvarchar')).toBe('Ana')
  })
})
