import { describe, it, expect } from 'vitest'
import {
  detectEncoding, decodeBytes, encodeText, decodeWindows1252, encodeWindows1252,
  detectEol, normalizeEol, applyEol, decodeFile, encodeFile, looksBinary, UnmappableCharError,
} from './encoding'

const bytes = (...b: number[]): Buffer => Buffer.from(b)

describe('detectEncoding', () => {
  it('detects BOMs', () => {
    expect(detectEncoding(bytes(0xEF, 0xBB, 0xBF, 0x41))).toBe('utf8bom')
    expect(detectEncoding(bytes(0xFF, 0xFE, 0x41, 0x00))).toBe('utf16le')
    expect(detectEncoding(bytes(0xFE, 0xFF, 0x00, 0x41))).toBe('utf16be')
  })

  it('detects valid UTF-8 without BOM (including plain ASCII and empty)', () => {
    expect(detectEncoding(Buffer.from('hola', 'utf8'))).toBe('utf8')
    expect(detectEncoding(Buffer.from('canción ñandú €', 'utf8'))).toBe('utf8')
    expect(detectEncoding(Buffer.alloc(0))).toBe('utf8')
  })

  it('falls back to Windows-1252 for invalid UTF-8', () => {
    // "canción" in cp1252: ó = 0xF3 (lone lead byte in UTF-8)
    expect(detectEncoding(bytes(0x63, 0x61, 0x6E, 0x63, 0x69, 0xF3, 0x6E))).toBe('windows1252')
  })
})

describe('Windows-1252', () => {
  it('decodes latin1 range and the 0x80–0x9F table', () => {
    expect(decodeWindows1252(bytes(0xE1, 0xE9, 0xED, 0xF3, 0xFA, 0xF1, 0xD1))).toBe('áéíóúñÑ')
    expect(decodeWindows1252(bytes(0x80, 0x93, 0x94, 0x96, 0x97, 0x85, 0x99))).toBe('€“”–—…™')
  })

  it('round-trips every byte 0x00–0xFF losslessly (including unassigned 81/8D/8F/90/9D)', () => {
    const all = Buffer.from(Array.from({ length: 256 }, (_, i) => i))
    const text = decodeWindows1252(all)
    expect(Buffer.compare(encodeWindows1252(text), all)).toBe(0)
  })

  it('throws on unmappable chars with position info instead of replacing', () => {
    try {
      encodeWindows1252('línea uno\nok 漢 y 😀')
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(UnmappableCharError)
      const err = e as UnmappableCharError
      expect(err.char).toBe('漢')
      expect(err.line).toBe(2)
      expect(err.column).toBe(4)
      expect(err.count).toBe(2) // the emoji (surrogate pair) counts once
    }
  })
})

describe('decode/encode UTF variants', () => {
  it('round-trips UTF-16 LE/BE with BOM', () => {
    for (const enc of ['utf16le', 'utf16be'] as const) {
      const buf = encodeText('Hola ñ €', enc)
      expect(detectEncoding(buf)).toBe(enc)
      expect(decodeBytes(buf, enc)).toBe('Hola ñ €')
    }
  })

  it('UTF-8 BOM is stripped on decode and re-added on encode', () => {
    const buf = encodeText('x', 'utf8bom')
    expect([...buf]).toEqual([0xEF, 0xBB, 0xBF, 0x78])
    expect(decodeBytes(buf, 'utf8bom')).toBe('x')
  })
})

describe('EOL', () => {
  it('detects CRLF, LF, mixed (majority wins) and none', () => {
    expect(detectEol('a\r\nb\r\n')).toMatchObject({ eol: 'crlf', mixed: false })
    expect(detectEol('a\nb\n')).toMatchObject({ eol: 'lf', mixed: false })
    expect(detectEol('a\r\nb\r\nc\n')).toMatchObject({ eol: 'crlf', mixed: true, crlf: 2, lf: 1 })
    expect(detectEol('a\nb\nc\r\n')).toMatchObject({ eol: 'lf', mixed: true })
    expect(detectEol('sin saltos')).toMatchObject({ eol: null, mixed: false })
  })

  it('normalizes and re-applies', () => {
    expect(normalizeEol('a\r\nb\rc\n')).toBe('a\nb\nc\n')
    expect(applyEol('a\nb\n', 'crlf')).toBe('a\r\nb\r\n')
    expect(applyEol('a\r\nb\n', 'lf')).toBe('a\nb\n')
    // already-CRLF input must not double the CR
    expect(applyEol('a\r\nb', 'crlf')).toBe('a\r\nb')
  })
})

describe('decodeFile / encodeFile', () => {
  it('round-trips a cp1252 + CRLF VB file byte-for-byte', () => {
    const original = encodeWindows1252("' Configuración\r\nDim s = \"año €\"\r\n")
    const d = decodeFile(original, 'lf')
    expect(d).toMatchObject({ encoding: 'windows1252', eol: 'crlf', eolMixed: false, binary: false })
    expect(d.content).toBe("' Configuración\nDim s = \"año €\"\n")
    const out = encodeFile(d.content, { encoding: d.encoding, eol: d.eol })
    expect(Buffer.compare(out, original)).toBe(0)
  })

  it('uses the default EOL when the file has no line breaks', () => {
    expect(decodeFile(Buffer.from('x'), 'crlf').eol).toBe('crlf')
  })

  it('flags binary content (NUL bytes) but not UTF-16', () => {
    expect(looksBinary(bytes(0x50, 0x4B, 0x00, 0x03))).toBe(true)
    expect(decodeFile(encodeText('ab', 'utf16le'), 'lf').binary).toBe(false)
  })
})
