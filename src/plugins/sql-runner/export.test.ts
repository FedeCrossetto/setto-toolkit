import { describe, expect, it } from 'vitest'
import { buildXlsx, buildXlsxBook, crc32, toInsertSql } from './export'
import { buildSqlSchema } from './sql-meta'

describe('toInsertSql', () => {
  it('números sin comillas, texto N\'..\' escapado y NULL', () => {
    expect(toInsertSql('dbo.accounts', ['id', 'name', 'x'], [['1', "O'Neil", null]], ['bigint', 'nvarchar', 'int']))
      .toBe("INSERT INTO [dbo].[accounts] ([id], [name], [x])\nVALUES\n    (1, N'O''Neil', NULL);\n")
  })
  it('de a 1000 filas', () => {
    const rows = Array.from({ length: 2001 }, (_, i) => [String(i)])
    expect(toInsertSql('t', ['a'], rows, ['int']).match(/INSERT INTO/g)).toHaveLength(3)
  })
})

describe('buildXlsx', () => {
  it('crc32 conocido', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })
  it('zip válido con las partes del libro y números como números', () => {
    const z = buildXlsx(['id', 'nombre'], [['1', 'Ana & <Bo>'], ['2', null]], ['int', 'nvarchar'])
    const dv = new DataView(z.buffer)
    expect(dv.getUint32(0, true)).toBe(0x04034b50)
    expect(dv.getUint32(z.length - 22, true)).toBe(0x06054b50)
    expect(dv.getUint16(z.length - 12, true)).toBe(6)
    const text = new TextDecoder().decode(z)
    expect(text).toContain('xl/worksheets/sheet1.xml')
    expect(text).toContain('<c r="A2"><v>1</v></c>')
    expect(text).toContain('Ana &amp; &lt;Bo&gt;')
    expect(text).toContain('<autoFilter ref="A1:B3"/>')
  })
  it('libro con varias hojas: una por resultado, nombres sin repetir', () => {
    const z = buildXlsxBook([
      { name: 'Resultado 1', columns: ['a'], rows: [['1']] },
      { name: 'Resultado 1', columns: ['b', 'c'], rows: [['x', 'y']] },
    ])
    const dv = new DataView(z.buffer)
    expect(dv.getUint16(z.length - 12, true)).toBe(7)
    const text = new TextDecoder().decode(z)
    expect(text).toContain('xl/worksheets/sheet2.xml')
    expect(text).toContain('<sheet name="Resultado 1" sheetId="1"')
    expect(text).toContain('<sheet name="Resultado 1 (2)" sheetId="2"')
    expect(text).toContain('localSheetId="1"')
  })
})

describe('buildSqlSchema', () => {
  it('agrupa por esquema y deja dbo también sin prefijo', () => {
    const t = buildSqlSchema([['dbo', 'accounts', 'U', 'ac_id'], ['dbo', 'accounts', 'U', 'ac_name'], ['rep', 'v_x', 'V', 'a'], ['dbo', 'p_do', 'P', null]])
    const dbo = t.dbo as { children: Record<string, { children: { label: string }[] }> }
    expect(dbo.children.accounts!.children.map((c) => c.label)).toEqual(['ac_id', 'ac_name'])
    expect('accounts' in t).toBe(true)
    expect('p_do' in t).toBe(true)
    expect('v_x' in t).toBe(false)
  })
})
