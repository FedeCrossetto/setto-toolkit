/**
 * Detección y conversión de codificación / fin de línea para el editor.
 *
 * Módulo puro (sin Electron ni fs): recibe bytes y devuelve texto, y viceversa.
 * El editor trabaja siempre con texto normalizado a `\n`; al guardar se vuelve a
 * aplicar el fin de línea y la codificación originales del archivo, así un `.vb`
 * en Windows-1252 + CRLF sale igual que entró.
 */

import type { FileEncoding, EolKind } from '../../../src/plugins/file-editor/types'

export type { FileEncoding, EolKind }

export const ENCODING_LABELS: Record<FileEncoding, string> = {
  utf8: 'UTF-8',
  utf8bom: 'UTF-8 con BOM',
  utf16le: 'UTF-16 LE',
  utf16be: 'UTF-16 BE',
  windows1252: 'Windows-1252',
}

// ── Windows-1252 ─────────────────────────────────────────────────────────────
// 0x00–0x7F y 0xA0–0xFF coinciden con Latin-1 (mismo code point). Solo el rango
// 0x80–0x9F difiere. Los 5 bytes sin asignar (81, 8D, 8F, 90, 9D) se decodifican
// al control C1 del mismo valor —como hace Windows— para que el ida y vuelta no
// pierda nada.
const CP1252_HIGH: readonly number[] = [
  0x20AC, 0x0081, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, // 80–87
  0x02C6, 0x2030, 0x0160, 0x2039, 0x0152, 0x008D, 0x017D, 0x008F, // 88–8F
  0x0090, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014, // 90–97
  0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0x009D, 0x017E, 0x0178, // 98–9F
]

const CP1252_REVERSE = new Map<number, number>(CP1252_HIGH.map((cp, i) => [cp, 0x80 + i]))

export function decodeWindows1252(bytes: Uint8Array): string {
  let out = ''
  const CHUNK = 8192
  for (let start = 0; start < bytes.length; start += CHUNK) {
    const end = Math.min(start + CHUNK, bytes.length)
    const codes = new Array<number>(end - start)
    for (let i = start; i < end; i++) {
      const b = bytes[i]!
      codes[i - start] = b >= 0x80 && b <= 0x9F ? CP1252_HIGH[b - 0x80]! : b
    }
    out += String.fromCharCode(...codes)
  }
  return out
}

/** Error al codificar: el texto tiene caracteres que la codificación destino no puede representar. */
export class UnmappableCharError extends Error {
  constructor(
    public readonly encoding: FileEncoding,
    public readonly char: string,
    public readonly line: number,
    public readonly column: number,
    public readonly count: number,
  ) {
    const cp = char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')
    const more = count > 1 ? ` (y ${count - 1} más)` : ''
    super(`No se puede guardar como ${ENCODING_LABELS[encoding]}: el carácter "${char}" (U+${cp}) de la línea ${line}, columna ${column} no existe en esa codificación${more}.`)
    this.name = 'UnmappableCharError'
  }
}

/** Codifica a Windows-1252. Lanza UnmappableCharError si hay caracteres no representables (nunca reemplaza en silencio). */
export function encodeWindows1252(text: string): Buffer {
  const out = Buffer.allocUnsafe(text.length)
  let n = 0
  let first: { char: string; line: number; column: number } | null = null
  let bad = 0
  let line = 1, lineStart = 0
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (c === 0x0A) { line++; lineStart = i + 1 }
    let byte: number | undefined
    if (c < 0x80 || (c >= 0xA0 && c <= 0xFF)) byte = c
    else byte = CP1252_REVERSE.get(c)
    if (byte === undefined) {
      bad++
      if (!first) {
        const cp = text.codePointAt(i)!
        first = { char: String.fromCodePoint(cp), line, column: i - lineStart + 1 }
      }
      // Saltar la mitad baja de un par sustituto (es un solo carácter)
      if (c >= 0xD800 && c <= 0xDBFF && i + 1 < text.length) {
        const lo = text.charCodeAt(i + 1)
        if (lo >= 0xDC00 && lo <= 0xDFFF) i++
      }
      continue
    }
    out[n++] = byte
  }
  if (first) throw new UnmappableCharError('windows1252', first.char, first.line, first.column, bad)
  return out.subarray(0, n)
}

// ── Detección ────────────────────────────────────────────────────────────────

const utf8Fatal = new TextDecoder('utf-8', { fatal: true })

export function isValidUtf8(bytes: Uint8Array): boolean {
  try { utf8Fatal.decode(bytes); return true } catch { return false }
}

/** Detecta la codificación a partir de los bytes: BOM → UTF-8 válido → Windows-1252. */
export function detectEncoding(bytes: Uint8Array): FileEncoding {
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) return 'utf8bom'
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) return 'utf16le'
  if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) return 'utf16be'
  return isValidUtf8(bytes) ? 'utf8' : 'windows1252'
}

/** Heurística de binario: hay un byte NUL en los primeros 8 KB (los UTF-16 con BOM no cuentan). */
export function looksBinary(bytes: Uint8Array, encoding?: FileEncoding): boolean {
  if (encoding === 'utf16le' || encoding === 'utf16be') return false
  const end = Math.min(bytes.length, 8192)
  for (let i = 0; i < end; i++) if (bytes[i] === 0) return true
  return false
}

function swapBytes(bytes: Uint8Array): Buffer {
  const out = Buffer.alloc(bytes.length - (bytes.length % 2))
  for (let i = 0; i + 1 < bytes.length; i += 2) { out[i] = bytes[i + 1]!; out[i + 1] = bytes[i]! }
  return out
}

/** Decodifica bytes con la codificación indicada (sin BOM en el resultado). */
export function decodeBytes(bytes: Uint8Array, encoding: FileEncoding): string {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  switch (encoding) {
    case 'utf8bom': return buf.subarray(3).toString('utf8')
    case 'utf8': return buf.toString('utf8')
    case 'utf16le': return buf.subarray(2).toString('utf16le')
    case 'utf16be': return swapBytes(buf.subarray(2)).toString('utf16le')
    case 'windows1252': return decodeWindows1252(buf)
  }
}

/** Codifica texto (ya con el EOL final aplicado), agregando BOM cuando corresponde. */
export function encodeText(text: string, encoding: FileEncoding): Buffer {
  switch (encoding) {
    case 'utf8': return Buffer.from(text, 'utf8')
    case 'utf8bom': return Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(text, 'utf8')])
    case 'utf16le': return Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(text, 'utf16le')])
    case 'utf16be': return Buffer.concat([Buffer.from([0xFE, 0xFF]), swapBytes(Buffer.from(text, 'utf16le'))])
    case 'windows1252': return encodeWindows1252(text)
  }
}

// ── Fin de línea ─────────────────────────────────────────────────────────────

export interface EolInfo {
  /** EOL predominante, o null si el texto no tiene saltos de línea */
  eol: EolKind | null
  /** Conviven CRLF y LF sueltos */
  mixed: boolean
  crlf: number
  lf: number
}

/** Cuenta CRLF vs LF sueltos; gana la mayoría (empate → CRLF). Los CR sueltos se ignoran. */
export function detectEol(text: string): EolInfo {
  let crlf = 0, lf = 0
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) {
    if (i > 0 && text.charCodeAt(i - 1) === 0x0D) crlf++
    else lf++
  }
  const eol: EolKind | null = crlf === 0 && lf === 0 ? null : crlf >= lf ? 'crlf' : 'lf'
  return { eol, mixed: crlf > 0 && lf > 0, crlf, lf }
}

/** Normaliza cualquier salto (CRLF, CR suelto) a `\n`, igual que CodeMirror. */
export function normalizeEol(text: string): string {
  return text.replace(/\r\n?/g, '\n')
}

/** Aplica el EOL indicado a un texto (acepta texto ya normalizado o no). */
export function applyEol(text: string, eol: EolKind): string {
  const norm = normalizeEol(text)
  return eol === 'crlf' ? norm.replace(/\n/g, '\r\n') : norm
}

// ── API de alto nivel ────────────────────────────────────────────────────────

export interface DecodedFile {
  /** Texto normalizado a `\n` */
  content: string
  encoding: FileEncoding
  eol: EolKind
  eolMixed: boolean
  binary: boolean
}

export function decodeFile(bytes: Uint8Array, defaultEol: EolKind): DecodedFile {
  const encoding = detectEncoding(bytes)
  const raw = decodeBytes(bytes, encoding)
  const info = detectEol(raw)
  return {
    content: normalizeEol(raw),
    encoding,
    eol: info.eol ?? defaultEol,
    eolMixed: info.mixed,
    binary: looksBinary(bytes, encoding),
  }
}

export function encodeFile(content: string, opts: { encoding: FileEncoding; eol: EolKind }): Buffer {
  return encodeText(applyEol(content, opts.eol), opts.encoding)
}

export function isFileEncoding(v: unknown): v is FileEncoding {
  return v === 'utf8' || v === 'utf8bom' || v === 'utf16le' || v === 'utf16be' || v === 'windows1252'
}

export function isEolKind(v: unknown): v is EolKind {
  return v === 'crlf' || v === 'lf'
}
