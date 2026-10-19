import { describe, expect, it } from 'vitest'
import { boundedLevenshtein, foldWithMap, makeSnippet, prepareDoc, rankDocs, splitHighlights, type SearchDoc } from './clip-search'

const NOW = Date.UTC(2026, 9, 19, 12)
const H = 3_600_000
const doc = (id: string, fields: SearchDoc['fields'], at = NOW - H, kind: SearchDoc['kind'] = 'text'): SearchDoc => ({ kind, id, at, fields })
const rank = (docs: SearchDoc[], q: string) => rankDocs(docs.map(prepareDoc), q, NOW)

describe('foldWithMap', () => {
  it('saca tildes y mayúsculas manteniendo las posiciones originales', () => {
    const r = foldWithMap('Canción Ñ')
    expect(r.folded).toBe('cancion n')
    expect(r.start[5]).toBe(5)
    expect(r.end[5]).toBe(6)
  })
})

describe('boundedLevenshtein', () => {
  it('distancia y corte temprano', () => {
    expect(boundedLevenshtein('factura', 'factrua', 2)).toBe(2)
    expect(boundedLevenshtein('error', 'eror', 1)).toBe(1)
    expect(boundedLevenshtein('abc', 'xyzw', 1)).toBe(2)
  })
})

describe('rankDocs', () => {
  it('frase exacta > todas las palabras > parecido', () => {
    const r = rank([
      doc('fuzzy', { text: 'el servidr no responde' }),
      doc('all', { text: 'no se puede conectar al servidor' }),
      doc('phrase', { text: 'Error: servidor no responde' }, NOW - 400 * H),
      doc('none', { text: 'otra cosa' }),
    ], 'servidor no responde')
    expect(r.hits.map((h) => h.doc.id)).toEqual(['phrase', 'fuzzy'])
    const r2 = rank([
      doc('all', { text: 'no se puede conectar al servidor' }),
      doc('fuzzy', { text: 'servidr caido, no anda' }),
    ], 'servidor no')
    expect(r2.hits.map((h) => [h.doc.id, h.tier])).toEqual([['all', 'all'], ['fuzzy', 'fuzzy']])
  })

  it('a igual nivel gana lo más reciente', () => {
    const r = rank([doc('viejo', { text: 'ticket abierto' }, NOW - 30 * 24 * H), doc('nuevo', { text: 'ticket abierto' }, NOW - H)], 'ticket')
    expect(r.hits.map((h) => h.doc.id)).toEqual(['nuevo', 'viejo'])
  })

  it('busca el texto de las capturas (OCR) y marca el rango', () => {
    const ocr = `${'linea de relleno '.repeat(20)}Excepción NullReference en CashierSession ${'mas texto '.repeat(20)}`
    const r = rank([doc('cap', { title: 'Captura de WigosGUI', ocr }, NOW, 'capture')], 'excepcion nullreference')
    const h = r.hits[0]!
    expect(h.field).toBe('ocr')
    expect(h.snippet.startsWith('…')).toBe(true)
    const marked = splitHighlights(h.snippet, h.ranges).filter((p) => p.hit).map((p) => p.text)
    expect(marked).toEqual(['Excepción NullReference'])
  })

  it('palabras repartidas en varios campos (ticket + ocr)', () => {
    const r = rank([doc('cap', { ticket: 'WIGOS-1234', ocr: 'error al guardar la cuenta' }, NOW, 'capture')], 'wigos-1234 guardar')
    expect(r.hits[0]?.tier).toBe('all')
  })

  it('sin consulta: lo más reciente', () => {
    const r = rank([doc('a', { text: 'a' }, NOW - 2 * H), doc('b', { text: 'b' }, NOW - H)], '  ')
    expect(r.hits.map((h) => h.doc.id)).toEqual(['b', 'a'])
  })
})

describe('makeSnippet', () => {
  it('colapsa espacios y corre los rangos', () => {
    const s = makeSnippet('hola   mundo\n\nlindo', [[7, 12]])
    expect(s.snippet).toBe('hola mundo lindo')
    expect(s.snippet.slice(...s.ranges[0]!)).toBe('mundo')
  })
  it('recorta con … al final', () => {
    const s = makeSnippet('x'.repeat(500), [[0, 1]], 50)
    expect(s.snippet.length).toBe(51)
    expect(s.snippet.endsWith('…')).toBe(true)
  })
})
