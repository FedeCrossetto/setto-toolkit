import { describe, expect, it } from 'vitest'
import { applyParams, compareCells, declareFor, findParams, parseStats, prettyValue, toJiraTable, toMarkdownTable, withStatistics } from './sql-tools'

describe('parámetros', () => {
  it('encuentra @x usadas y no declaradas', () => {
    expect(findParams("SELECT * FROM accounts WHERE ac_account_id = @cuenta AND ac_name LIKE @nombre + '%'")).toEqual(['cuenta', 'nombre'])
    expect(findParams('DECLARE @x INT = 1; SELECT @x, @@ROWCOUNT, @y')).toEqual(['y'])
    expect(findParams("SELECT '@no' -- @tampoco\nFROM t WHERE [@col] = @si")).toEqual(['si'])
    expect(findParams('EXEC dbo.p @Id = @cuenta, @Flag = 1')).toEqual(['cuenta'])
  })
  it('declara con el tipo según el valor', () => {
    expect(declareFor('c', '123')).toBe('DECLARE @c BIGINT = 123;')
    expect(declareFor('c', '1.5')).toBe('DECLARE @c DECIMAL(38, 10) = 1.5;')
    expect(declareFor('c', "O'Neil")).toBe("DECLARE @c NVARCHAR(4000) = N'O''Neil';")
    expect(declareFor('c', 'null')).toBe('DECLARE @c NVARCHAR(4000) = NULL;')
  })
  it('agrega los DECLARE en la primera línea de cada lote que los usa (sin mover líneas)', () => {
    const out = applyParams('SELECT @a\nGO\nSELECT 1\nGO\nSELECT @a', { a: '5' })
    expect(out.split('\n')).toEqual(['DECLARE @a BIGINT = 5; SELECT @a', 'GO', 'SELECT 1', 'GO', 'DECLARE @a BIGINT = 5; SELECT @a'])
  })
})

describe('copiar como tabla', () => {
  it('Jira y Markdown', () => {
    expect(toJiraTable(['id', 'n'], [['1', 'a|b'], ['2', null]])).toBe('||id||n||\n|1|a\\|b|\n|2|NULL|')
    expect(toMarkdownTable(['id', 'n'], [['1', 'x']], ['int', 'nvarchar'])).toBe('| id | n |\n| ---: | --- |\n| 1 | x |')
  })
})

describe('estadísticas', () => {
  it('suma lecturas y tiempos (inglés y español)', () => {
    const s = parseStats([
      "Table 'accounts'. Scan count 1, logical reads 120, physical reads 2, read-ahead reads 0.",
      "Tabla 'gui_users'. Número de examen 1, lecturas lógicas 8, lecturas físicas 0.",
      ' SQL Server Execution Times:\n   CPU time = 15 ms,  elapsed time = 40 ms.',
    ])
    expect(s).toMatchObject({ logicalReads: 128, physicalReads: 2, cpuMs: 15, elapsedMs: 40 })
    expect(s!.tables[0]).toEqual({ table: 'accounts', logical: 120 })
    expect(parseStats(['(3 filas afectadas)'])).toBeNull()
  })
  it('activa estadísticas sin mover líneas', () => {
    expect(withStatistics('SELECT 1\nGO\nSELECT 2').split('\n')[2]).toBe('SET STATISTICS IO, TIME ON; SELECT 2')
  })
})

describe('orden y visor', () => {
  it('números como números y NULL al final', () => {
    const v = ['10', null, '9', '100'].sort((a, b) => compareCells(a, b, 'int', 1))
    expect(v).toEqual(['9', '10', '100', null])
    expect(['b', 'A', 'c'].sort((a, b) => compareCells(a, b, 'nvarchar', -1))).toEqual(['c', 'b', 'A'])
  })
  it('formatea JSON y XML', () => {
    expect(prettyValue('{"a":1,"b":[1,2]}')).toEqual({ text: '{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ]\n}', kind: 'json' })
    expect(prettyValue('<a><b>1</b><c/></a>').text).toBe('<a>\n  <b>1</b>\n  <c/>\n</a>')
    expect(prettyValue('hola').kind).toBe('text')
  })
})
