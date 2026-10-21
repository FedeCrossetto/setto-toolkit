import { describe, expect, it } from 'vitest'
import { formatSql } from './format-sql'

describe('formatSql', () => {
  it('cláusulas en su línea, columnas y condiciones indentadas, palabras clave en mayúsculas', () => {
    expect(formatSql("select a.ac_id, a.ac_name from accounts a inner join gui_users u on u.gu_id = a.ac_user_id where a.ac_id > 10 and u.gu_name = 'SU' order by a.ac_id desc")).toBe([
      'SELECT',
      '    a.ac_id,',
      '    a.ac_name',
      'FROM accounts a',
      'INNER JOIN gui_users u',
      '    ON u.gu_id = a.ac_user_id',
      'WHERE a.ac_id > 10',
      "    AND u.gu_name = 'SU'",
      'ORDER BY a.ac_id DESC',
    ].join('\n'))
  })
  it('respeta textos, comentarios e identificadores con corchetes', () => {
    const out = formatSql("select [from], 'select x from y' as t -- comentario select\nfrom [dbo].[t]")
    expect(out).toContain("'select x from y' AS t -- comentario select")
    expect(out).toContain('[from],')
    expect(out).toContain('FROM [dbo].[t]')
  })
  it('subconsultas con sangría y funciones en línea', () => {
    const out = formatSql('select count(*) from t where id in (select id from x where y = 1)')
    expect(out).toContain('    COUNT(*)')
    expect(out).toContain('WHERE id IN (')
    expect(out).toContain('    SELECT')
    expect(out.trimEnd().endsWith(')')).toBe(true)
  })
  it('respeta GO y BETWEEN … AND', () => {
    const out = formatSql('select 1\ngo\nselect * from t where d between 1 and 5')
    expect(out).toMatch(/\nGO\n/)
    expect(out).toContain('WHERE d BETWEEN 1 AND 5')
  })
  it('es estable: formatear dos veces da lo mismo', () => {
    const once = formatSql('insert into t (a, b) values (1, 2); update t set a = 1, b = 2 where c = 3')
    expect(formatSql(once)).toBe(once)
  })
})
