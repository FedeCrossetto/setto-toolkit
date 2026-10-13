import { describe, it, expect } from 'vitest'
import { buildMatcher, replaceInText } from './replace'

describe('buildMatcher', () => {
  it('escapes literal queries and is case-insensitive', () => {
    const re = buildMatcher('a.b(', false)
    expect('A.B('.match(re)).toBeTruthy()
    expect('axb('.match(re)).toBeNull()
  })

  it('rejects dangerous, invalid and empty-matching regexes', () => {
    expect(() => buildMatcher('(a+)+', true)).toThrow('peligroso')
    expect(() => buildMatcher('(', true)).toThrow('inválida')
    expect(() => buildMatcher('x*', true)).toThrow('vacío')
    expect(() => buildMatcher('', false)).toThrow()
  })
})

describe('replaceInText', () => {
  it('replaces literally (no $ expansion) and preserves mixed EOLs', () => {
    const text = 'foo = 1\r\nFOO = 2\nbar\r'
    const r = replaceInText(text, buildMatcher('foo', false), '$x', false)
    expect(r.output).toBe('$x = 1\r\n$x = 2\nbar\r')
    expect(r.count).toBe(2)
    expect(r.samples).toEqual([
      { lineNumber: 1, before: 'foo = 1', after: '$x = 1' },
      { lineNumber: 2, before: 'FOO = 2', after: '$x = 2' },
    ])
  })

  it('supports regex groups and lookbehind context', () => {
    const r = replaceInText('Dim a As Integer\nDim b As String', buildMatcher('Dim (\\w+) As', true), 'Dim $1 :', true)
    expect(r.output).toBe('Dim a : Integer\nDim b : String')
    const lb = replaceInText('ab cb', buildMatcher('(?<=a)b', true), 'X', true)
    expect(lb.output).toBe('aX cb')
    expect(lb.count).toBe(1)
  })

  it('returns the same string when nothing matches', () => {
    const text = 'nada\r\n'
    const r = replaceInText(text, buildMatcher('zzz', false), 'y', false)
    expect(r.output).toBe(text)
    expect(r.count).toBe(0)
  })
})
