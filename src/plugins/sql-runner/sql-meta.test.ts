import { describe, expect, it } from 'vitest'
import { childrenSql, connectionProblem, createToAlter, execScript, formatType, friendlyError, joinServer, locateSql, serverFromHostInput, missingObject, quoteName, splitServer, tableScript } from './sql-meta'

describe('connectionProblem', () => {
  it('distingue contraseña de servidor y sólo mira errores al conectar', () => {
    expect(connectionProblem({ ok: false, phase: 'connect', number: 18456, error: "Login failed for user 'wg'." })).toBe('auth')
    expect(connectionProblem({ ok: false, phase: 'connect', number: 18487, error: 'Password expired' })).toBe('auth')
    expect(connectionProblem({ ok: false, phase: 'connect', number: 53, error: 'A network-related error occurred' })).toBe('server')
    expect(connectionProblem({ ok: false, phase: 'connect', number: -2, error: 'Timeout expired' })).toBe('server')
    expect(connectionProblem({ ok: false, phase: 'connect', number: 4060, error: 'Cannot open database' })).toBeNull()
    expect(connectionProblem({ ok: false, phase: 'run', number: 208, error: "Invalid object name 'x'" })).toBeNull()
    expect(connectionProblem({ ok: true, phase: 'connect' })).toBeNull()
  })
})

describe('scripts', () => {
  it('formatType como SSMS', () => {
    expect(formatType('nvarchar', 100, 0, 0)).toBe('nvarchar(50)')
    expect(formatType('varchar', -1, 0, 0)).toBe('varchar(MAX)')
    expect(formatType('decimal', 9, 18, 2)).toBe('decimal(18,2)')
    expect(formatType('int', 4, 10, 0)).toBe('int')
  })
  it('quoteName escapa corchetes', () => {
    expect(quoteName('a]b')).toBe('[a]]b]')
  })
  it('CREATE TABLE con identidad y clave primaria', () => {
    const s = tableScript({ schema: 'dbo', name: 'accounts' }, [
      { name: 'ac_id', type: 'bigint', nullable: false, identity: true, pk: true, default: null },
      { name: 'ac_name', type: 'nvarchar(50)', nullable: true, identity: false, pk: false, default: "('')" },
    ])
    expect(s).toContain('CREATE TABLE [dbo].[accounts] (')
    expect(s).toContain('[ac_id] bigint IDENTITY NOT NULL,')
    expect(s).toContain("[ac_name] nvarchar(50) NULL DEFAULT ('')")
    expect(s).toContain('PRIMARY KEY ([ac_id])')
  })
  it('EXEC con parámetros y SELECT para funciones', () => {
    expect(execScript({ schema: 'dbo', name: 'p', type: 'P' }, [{ name: '@a', type: 'int', output: false }, { name: '@b', type: 'int', output: true }]))
      .toBe('EXEC [dbo].[p]\n    @a = NULL,  -- int\n    @b = NULL OUTPUT  -- int\n')
    expect(execScript({ schema: 'dbo', name: 'f', type: 'FN' }, [{ name: '@a', type: 'int', output: false }])).toBe('SELECT [dbo].[f](NULL)\n')
    expect(execScript({ schema: 'dbo', name: 't', type: 'IF' }, [])).toBe('SELECT *\nFROM [dbo].[t]()\n')
  })
  it('createToAlter respeta comentarios iniciales', () => {
    expect(createToAlter('-- hola\n/* x */\nCREATE PROCEDURE dbo.p AS SELECT 1')).toBe('-- hola\n/* x */\nALTER PROCEDURE dbo.p AS SELECT 1')
    expect(createToAlter('create or alter view v as select 1')).toBe('ALTER view v as select 1')
  })
  it('childrenSql sólo acepta ids enteros', () => {
    expect(() => childrenSql(1.5)).toThrow()
    expect(childrenSql(42)).toContain('c.object_id = 42')
  })
})

describe('friendlyError', () => {
  it('resume los errores típicos en una línea', () => {
    expect(friendlyError('Tiempo de espera de la operación de espera agotado', 'server').title).toBe('El servidor no responde')
    expect(friendlyError("Login failed for user 'sa'.", 'auth').title).toBe('Usuario o contraseña rechazados')
    expect(friendlyError('El nombre de red especificado ya no está disponible', 'server').title).toBe('No se encuentra el servidor')
    expect(friendlyError('raro', 'server').title).toBe('No se pudo conectar')
  })
})

describe('splitServer / joinServer', () => {
  it('separa y vuelve a unir host y puerto', () => {
    expect(splitServer('13.38.6.166,44058')).toEqual({ host: '13.38.6.166', port: '44058' })
    expect(splitServer('CROSSETTO\\MSSQLSERVER02')).toEqual({ host: 'CROSSETTO\\MSSQLSERVER02', port: '' })
    expect(joinServer('10.0.0.5 ', ' 1433')).toBe('10.0.0.5,1433')
    expect(joinServer('10.0.0.5', '')).toBe('10.0.0.5')
    // Cambiar la IP deja el puerto como estaba.
    const { port } = splitServer('13.38.6.166,44058')
    expect(joinServer('35.180.191.168', port)).toBe('35.180.191.168,44058')
  })
  it('pegar "ip,puerto" en el campo Servidor reemplaza el puerto anterior', () => {
    expect(serverFromHostInput('13.38.6.166,44058', '1433')).toBe('13.38.6.166,44058')
    expect(serverFromHostInput('10.0.0.9', '44058')).toBe('10.0.0.9,44058')
    expect(serverFromHostInput('10.0.0.9,', '44058')).toBe('10.0.0.9')
  })
})

describe('missingObject / locateSql', () => {
  it('reconoce "Invalid object name" en inglés y en español', () => {
    expect(missingObject({ ok: false, number: 208, error: "Invalid object name 'GUI_USERS'." })).toBe('GUI_USERS')
    expect(missingObject({ ok: false, number: 208, error: "El nombre de objeto 'dbo.X' no es válido." })).toBe('dbo.X')
    expect(missingObject({ ok: false, number: 207, error: "Invalid column name 'A'." })).toBeNull()
    expect(missingObject({ ok: true, error: undefined })).toBeNull()
  })
  it('busca en las bases con dbo por defecto y rechaza nombres raros', () => {
    expect(locateSql('GUI_USERS')).toContain("N'.dbo.GUI_USERS'")
    expect(locateSql('ops.T')).toContain("N'.ops.T'")
    expect(() => locateSql("x'; DROP TABLE y--")).toThrow()
  })
})
