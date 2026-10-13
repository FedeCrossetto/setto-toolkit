import { describe, expect, it } from 'vitest'
import { detect } from './search'
import { base64Encode } from './tools'

const NOW = 1_800_000_000_000

describe('utilities detect (Ctrl+K)', () => {
  it('recognizes a JWT', () => {
    const t = [base64Encode('{"alg":"HS256"}', true), base64Encode('{"sub":"fede","exp":1700000000}', true), 'x'].join('.')
    const items = detect(t, NOW)
    expect(items[0]!.title).toContain('JWT de fede')
    expect(items[0]!.title).toContain('vencido')
  })
  it('recognizes json, valid and invalid', () => {
    expect(detect('{"a":1}', NOW)[0]!.title).toBe('Copiar JSON formateado')
    expect(detect('{"a":}', NOW)[0]!.title).toBe('JSON inválido')
  })
  it('recognizes timestamps and iso dates', () => {
    expect(detect('1700000000', NOW)[0]!.subtitle).toContain('2023-11-14T22:13:20.000Z')
    expect(detect('2023-11-14T22:13:20Z', NOW)[0]!.title).toBe('1700000000')
  })
  it('decodes base64 and url only when it makes sense', () => {
    expect(detect('SG9sYSBtdW5kbw==', NOW)[0]!.title).toBe('Hola mundo')
    expect(detect('a%20b%26c', NOW)[0]!.title).toBe('a b&c')
    expect(detect('notas del lunes', NOW)).toEqual([])
    expect(detect('Snippets', NOW)).toEqual([])
  })
  it('generates uuid on demand', () => {
    expect(detect('uuid', NOW)[0]!.title).toMatch(/^[0-9a-f-]{36}$/)
  })
})
