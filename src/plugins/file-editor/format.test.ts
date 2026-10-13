import { describe, it, expect } from 'vitest'
import { formatDocument, formatJson, formatXml, formatSql, detectIndentUnit } from './format'

describe('formatJson', () => {
  it('pretty-prints with 2 spaces and keeps the trailing newline', () => {
    expect(formatJson('{"a":1,"b":[1,2,{}],"c":{"d":null}}\n')).toBe(
      '{\n  "a": 1,\n  "b": [\n    1,\n    2,\n    {}\n  ],\n  "c": {\n    "d": null\n  }\n}\n',
    )
    expect(formatJson('[]')).toBe('[]')
  })

  it('keeps number literals and string escapes byte-for-byte', () => {
    expect(formatJson('{"big":12345678901234567890123,"s":"a\\u00e9\\"b"}')).toBe(
      '{\n  "big": 12345678901234567890123,\n  "s": "a\\u00e9\\"b"\n}',
    )
  })

  it('reports invalid JSON with position', () => {
    expect(() => formatJson('{"a":1,}')).toThrow(/JSON inválido.*línea 1/)
    expect(() => formatJson('{"a":1} x')).toThrow('contenido extra')
  })
})

describe('formatXml', () => {
  it('indents nested elements, keeps short text inline and preserves comments/CDATA/declaration', () => {
    const src = '<?xml version="1.0"?><Project Sdk="x"><!-- c --><PropertyGroup><A>1</A><B/></PropertyGroup><Data><![CDATA[ <raw> ]]></Data></Project>\n'
    expect(formatXml(src)).toBe([
      '<?xml version="1.0"?>',
      '<Project Sdk="x">',
      '  <!-- c -->',
      '  <PropertyGroup>',
      '    <A>1</A>',
      '    <B/>',
      '  </PropertyGroup>',
      '  <Data>',
      '    <![CDATA[ <raw> ]]>',
      '  </Data>',
      '</Project>',
    ].join('\n') + '\n')
  })

  it('reuses the existing indent unit (tabs / 4 spaces)', () => {
    expect(detectIndentUnit('<a>\n\t<b/>\n</a>')).toBe('\t')
    expect(detectIndentUnit('<a>\n    <b/>\n</a>')).toBe('    ')
    expect(formatXml('<a>\n    <b><c/></b>\n</a>')).toBe('<a>\n    <b>\n        <c/>\n    </b>\n</a>')
  })

  it('handles ">" inside attribute values', () => {
    expect(formatXml('<a x="1 > 0"><b/></a>')).toBe('<a x="1 > 0">\n  <b/>\n</a>')
  })

  it('is idempotent', () => {
    const once = formatXml('<configuration><appSettings><add key="k" value="v"/></appSettings></configuration>')
    expect(formatXml(once)).toBe(once)
  })

  it('fails on mismatched tags in XML', () => {
    expect(() => formatXml('<a><b></a>')).toThrow('Se esperaba </b>')
    expect(() => formatXml('<a>')).toThrow('Falta cerrar <a>')
  })

  it('HTML: void elements and raw <pre>/<script> content', () => {
    const out = formatXml('<div><br><pre>  a\n   b</pre><p>hi</p></div>', true)
    expect(out).toBe('<div>\n  <br>\n  <pre>  a\n   b</pre>\n  <p>hi</p>\n</div>')
  })
})

describe('formatSql', () => {
  it('uppercases reserved words and breaks major clauses', () => {
    expect(formatSql("select a, b from dbo.t inner join u on t.id = u.id where a = 'from x' order by b"))
      .toBe("SELECT a, b\nFROM dbo.t\nINNER JOIN u ON t.id = u.id\nWHERE a = 'from x'\nORDER BY b")
  })

  it('does not touch strings, comments, [identifiers], @vars or qualified names', () => {
    expect(formatSql("select [from], @select, t.select -- select from\nfrom t"))
      .toBe('SELECT [from], @select, t.select -- select from\nFROM t')
  })

  it('keeps subqueries, LEFT(), ON DELETE and DELETE FROM together', () => {
    expect(formatSql('select left(a, 2), (select max(x) from y) from t'))
      .toBe('SELECT LEFT(a, 2), (SELECT max(x) FROM y)\nFROM t')
    expect(formatSql('delete from t where id = 1')).toBe('DELETE FROM t\nWHERE id = 1')
    expect(formatSql('references p(id) on delete set null')).toBe('REFERENCES p(id) ON DELETE SET NULL')
  })

  it('keeps indentation and is idempotent', () => {
    const once = formatSql('    select a from t where b = 1')
    expect(once).toBe('    SELECT a\n    FROM t\n    WHERE b = 1')
    expect(formatSql(once)).toBe(once)
  })
})

describe('formatDocument', () => {
  it('returns an error for unsupported languages or invalid input', () => {
    expect(formatDocument('x', 'csharp')).toMatchObject({ ok: false })
    expect(formatDocument('{', 'json')).toMatchObject({ ok: false })
    expect(formatDocument('{"a":1}', 'json')).toEqual({ ok: true, text: '{\n  "a": 1\n}' })
  })
})
