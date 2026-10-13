import { describe, expect, it } from 'vitest'
import {
  clipCategory, detectKind, findTicket, guessLanguage, isSensitive, maskSecret, redactSecrets, splitValues, toCSharpString, toJiraTable, toMarkdownTable, toSqlIn,
  toSqlString, transformsFor,
} from './clip-utils'

// Tokens de mentira armados por partes: con el formato literal, el escaneo de secretos
// de GitHub los toma por claves reales y bloquea el push.
const FAKE_GH = ['ghp', 'abcdefghijklmnopqrstuvwxyz0123456789'].join('_')
const FAKE_SK = ['sk', 'ant', 'api03', 'AbCdEfGhIjKlMnOpQrStUv'].join('-')

describe('detectKind', () => {
  it.each([
    ['WIGOS-123967', 'ticket'],
    ['https://jira.example.com/browse/WIGOS-1', 'url'],
    ['C:\\Program Files (x86)\\WinSystem\\BitBucket', 'path'],
    ['\\\\server\\share\\logs', 'path'],
    ['{"a":1}', 'json'],
    ['3f2504e0-4f89-11d3-9a0c-0305e82c3301', 'guid'],
    ['1700000000', 'timestamp'],
    ['SELECT * FROM accounts WHERE ac_id = 1', 'sql'],
    ['fede@example.com', 'email'],
    ['id\tnombre\n1\tAna\n2\tLuis', 'table'],
    ['1001\n1002\n1003', 'list'],
    ['System.NullReferenceException: Object reference\n   at WSI.Common.Cashier.Open() in C:\\x.cs:line 12', 'stacktrace'],
    ['hola, esto es una frase normal', 'text'],
  ])('%s → %s', (input, kind) => {
    expect(detectKind(input)).toBe(kind)
  })
  it('finds a ticket inside text', () => {
    expect(findTicket('ver el error de WIGOS-130026 en caja')).toBe('WIGOS-130026')
    expect(findTicket('nada')).toBeNull()
  })
})

describe('isSensitive', () => {
  it('flags passwords, tokens and keys', () => {
    expect(isSensitive('Server=db;User Id=sa;Password=Secreta123;')).toBe(true)
    expect(isSensitive(FAKE_GH)).toBe(true)
    expect(isSensitive(FAKE_SK)).toBe(true)
    expect(isSensitive('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk')).toBe(true)
    expect(isSensitive('Xk9#mP2$vL7qW4!z')).toBe(true)
  })
  it('does not flag everyday things', () => {
    for (const t of [
      'WIGOS-123967', '3f2504e0-4f89-11d3-9a0c-0305e82c3301', 'a94a8fe5ccb19ba61c4c0873d391e987982fbbd3',
      'C:\\Repos\\mytools-app\\src', 'https://example.com/path?a=1', 'SELECT * FROM x', 'hola mundo',
      'feature/usa3/wigos-123967-dual', 'ConsoleBuilderWithSecondConnection',
    ]) expect(isSensitive(t), t).toBe(false)
  })
  it('does not hide identifiers made of words', () => {
    expect(isSensitive('WindowsSystem32Drivers')).toBe(false)
    expect(isSensitive('ConsoleBuilderWithSecondConnection2')).toBe(false)
  })
  it('redacts secrets inside longer text', () => {
    expect(redactSecrets('Usuario: operador.caja • Clave: Secreta123\nAceptar')).toBe('Usuario: operador.caja • Clave: ••••••\nAceptar')
    expect(redactSecrets('Server=db;Password=abc;Database=x')).toBe('Server=db;Password=••••••;Database=x')
    expect(redactSecrets(`token ${FAKE_GH} ok`)).toBe('token •••••• ok')
    expect(redactSecrets('Mensaje 05142: Not connected')).toBe('Mensaje 05142: Not connected')
  })
  it('masks keeping a hint', () => {
    expect(maskSecret('Secreta123')).toBe('Se••••••23')
    expect(maskSecret('abc')).toBe('••••••')
  })
})

describe('transforms', () => {
  it('builds SQL IN for numbers and strings, deduped', () => {
    expect(toSqlIn('1001\n1002\n1001\n')).toBe('IN (1001, 1002)')
    expect(toSqlIn("ana\nO'Brien")).toBe("IN ('ana', 'O''Brien')")
    expect(splitValues('a, b;c\td')).toEqual(['a', 'b', 'c', 'd'])
    expect(toSqlIn(Array.from({ length: 12 }, (_, i) => String(i)).join('\n'))).toBe('IN (0, 1, 2, 3, 4, 5, 6, 7, 8, 9,\n    10, 11)')
  })
  it('converts SSMS results to Jira and Markdown tables', () => {
    const tsv = 'id\tnombre\n1\tAna\n2\t'
    expect(toJiraTable(tsv)).toBe('||id||nombre||\n|1|Ana|\n|2| |')
    expect(toMarkdownTable(tsv)).toBe('| id | nombre |\n| --- | --- |\n| 1 | Ana |\n| 2 |  |')
  })
  it('escapes strings', () => {
    expect(toCSharpString('dijo "hola"')).toBe('@"dijo ""hola"""')
    expect(toSqlString("O'Brien")).toBe("N'O''Brien'")
  })
  it('suggests the right transforms first', () => {
    expect(transformsFor('table')[0]!.id).toBe('jira-table')
    expect(transformsFor('list')[0]!.id).toBe('sql-in')
  })
})

describe('código', () => {
  const cs = 'public class Caja\n{\n    public void Abrir() { var s = new Session(); }\n}'
  const js = 'const total = items.reduce((s, x) => s + x.monto, 0);\nreturn total;'
  const ps = '$path = "C:\\logs"\nGet-ChildItem $path | Remove-Item'
  it('detecta código y adivina el lenguaje', () => {
    expect(detectKind(cs)).toBe('code')
    expect(guessLanguage(cs, 'code')).toBe('csharp')
    expect(detectKind(js)).toBe('code')
    expect(guessLanguage(js, 'code')).toBe('javascript')
    expect(detectKind(ps)).toBe('code')
    expect(guessLanguage(ps, 'code')).toBe('powershell')
    expect(guessLanguage('SELECT 1', 'sql')).toBe('sql')
  })
  it('no confunde texto común con código', () => {
    expect(detectKind('Hola Juan,\nte paso el resumen de la reunión.\nSaludos')).toBe('text')
  })
  it('clasifica en categorías', () => {
    expect(clipCategory('code', '')).toBe('code')
    expect(clipCategory('stacktrace', '')).toBe('code')
    expect(clipCategory('path', '')).toBe('links')
    expect(clipCategory('ticket', 'WIGOS-1')).toBe('tickets')
    expect(clipCategory('text', 'revisar WIGOS-130026 mañana')).toBe('tickets')
    expect(clipCategory('text', 'hola')).toBe('text')
  })
})
