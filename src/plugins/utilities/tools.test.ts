import { describe, expect, it } from 'vitest'
import {
  base64Decode, base64Encode, dateInfo, decodeJwt, formatJson, hash, looksLikeBase64, looksLikeJwt,
  looksLikeTimestamp, md5, minifyJson, parseDateInput, testRegex, urlDecode, urlEncode,
} from './tools'

const enc = (s: string): Uint8Array => new TextEncoder().encode(s)

describe('json', () => {
  it('formats and minifies', () => {
    expect(formatJson('{"a":[1,2]}')).toEqual({ ok: true, value: '{\n  "a": [\n    1,\n    2\n  ]\n}' })
    expect(minifyJson('{ "a" : 1 }')).toEqual({ ok: true, value: '{"a":1}' })
  })
  it('reports invalid json', () => {
    const r = formatJson('{"a":}')
    expect(r.ok).toBe(false)
  })
})

describe('base64', () => {
  it('round-trips utf-8', () => {
    const b = base64Encode('año ñandú ✓')
    expect(base64Decode(b)).toEqual({ ok: true, value: 'año ñandú ✓' })
  })
  it('accepts base64url without padding', () => {
    expect(base64Decode(base64Encode('??>>', true))).toEqual({ ok: true, value: '??>>' })
  })
  it('rejects garbage and binary', () => {
    expect(base64Decode('***').ok).toBe(false)
    expect(base64Decode('/w==').ok).toBe(false) // 0xFF no es UTF-8
  })
  it('detects plausible base64', () => {
    expect(looksLikeBase64('SG9sYSBtdW5kbw==')).toBe(true)
    expect(looksLikeBase64('hola')).toBe(false)
  })
})

describe('url', () => {
  it('encodes and decodes', () => {
    expect(urlEncode('a b&c=ñ')).toBe('a%20b%26c%3D%C3%B1')
    expect(urlDecode('a+b%26c')).toEqual({ ok: true, value: 'a b&c' })
    expect(urlDecode('%E0%A4%A').ok).toBe(false)
  })
})

describe('jwt', () => {
  const token = [
    base64Encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }), true),
    base64Encode(JSON.stringify({ sub: '42', name: 'Ñoño', iat: 1_700_000_000, exp: 1_700_003_600 }), true),
    'sig',
  ].join('.')

  it('decodes header, payload and expiry', () => {
    const r = decodeJwt(token, 1_800_000_000_000)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.header.alg).toBe('HS256')
    expect(r.value.payload.name).toBe('Ñoño')
    expect(r.value.expired).toBe(true)
    expect(r.value.expiresAt?.toISOString()).toBe('2023-11-14T23:13:20.000Z')
  })
  it('strips Bearer and detects shape', () => {
    expect(decodeJwt('Bearer ' + token).ok).toBe(true)
    expect(looksLikeJwt(token)).toBe(true)
    expect(looksLikeJwt('a.b.c')).toBe(false)
  })
})

describe('dates', () => {
  it('parses seconds, millis and iso', () => {
    const s = parseDateInput('1700000000')
    const ms = parseDateInput('1700000000000')
    expect(s.ok && s.value.getTime()).toBe(1_700_000_000_000)
    expect(ms.ok && ms.value.getTime()).toBe(1_700_000_000_000)
    expect(parseDateInput('2024-02-29T10:00:00Z').ok).toBe(true)
    expect(parseDateInput('hola 1').ok).toBe(false)
    expect(looksLikeTimestamp('1700000000')).toBe(true)
  })
  it('builds info', () => {
    const info = dateInfo(new Date(1_700_000_000_000), 1_700_000_060_000)
    expect(info.unixSeconds).toBe(1_700_000_000)
    expect(info.iso).toBe('2023-11-14T22:13:20.000Z')
    expect(info.relative).toBe('hace 1 minuto')
  })
})

describe('regex', () => {
  it('lists matches with groups', () => {
    const r = testRegex('(\\w)(?<n>\\d)', '', 'a1 b2')
    expect(r.ok && r.value.map((m) => m.text)).toEqual(['a1', 'b2'])
    expect(r.ok && r.value[1]!.named?.n).toBe('2')
  })
  it('reports invalid patterns', () => {
    expect(testRegex('(', '', 'x').ok).toBe(false)
  })
})

describe('hash', () => {
  it('md5 known vectors', () => {
    expect(md5(enc(''))).toBe('d41d8cd98f00b204e9800998ecf8427e')
    expect(md5(enc('abc'))).toBe('900150983cd24fb0d6963f7d28e17f72')
    expect(md5(enc('The quick brown fox jumps over the lazy dog'))).toBe('9e107d9d372bb6826bd81d3542a419d6')
    expect(md5(enc('a'.repeat(1000)))).toBe('cabe45dcc9ae5b66ba86600cca6b8ba8')
  })
  it('sha-256', async () => {
    expect(await hash('abc', 'SHA-256')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})
