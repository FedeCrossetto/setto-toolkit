/**
 * Utilidades de desarrollo: funciones puras (sin React ni IPC) usadas por el
 * módulo "Utilidades" y por Ctrl+K. Testeadas en `tools.test.ts`.
 */

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

const ok = <T,>(value: T): Result<T> => ({ ok: true, value })
const fail = <T,>(error: string): Result<T> => ({ ok: false, error })

// ─── JSON ────────────────────────────────────────────────────────────────────

/** Mensaje de JSON.parse con línea y columna cuando el motor da la posición. */
function jsonError(text: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  const m = /position (\d+)/.exec(msg)
  if (!m) return msg
  const pos = Number(m[1])
  const before = text.slice(0, pos)
  const line = before.split('\n').length
  const col = pos - before.lastIndexOf('\n')
  return `${msg.replace(/ in JSON at position \d+.*/, '')} (línea ${line}, columna ${col})`
}

export function formatJson(text: string, indent: number | '\t' = 2): Result<string> {
  try {
    return ok(JSON.stringify(JSON.parse(text), null, indent))
  } catch (err) {
    return fail(jsonError(text, err))
  }
}

export function minifyJson(text: string): Result<string> {
  try {
    return ok(JSON.stringify(JSON.parse(text)))
  } catch (err) {
    return fail(jsonError(text, err))
  }
}

export function looksLikeJson(text: string): boolean {
  const t = text.trim()
  return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))
}

// ─── Base64 / URL ────────────────────────────────────────────────────────────

export function base64Encode(text: string, urlSafe = false): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  const b64 = btoa(bin)
  return urlSafe ? b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : b64
}

/** Acepta base64 estándar y base64url, con o sin padding. Falla si no es UTF-8 válido. */
export function base64Decode(text: string): Result<string> {
  const clean = text.trim().replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  if (!clean || !/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.replace(/=+$/, '').length % 4 === 1) {
    return fail('No es Base64 válido')
  }
  const padded = clean.replace(/=+$/, '').padEnd(Math.ceil(clean.replace(/=+$/, '').length / 4) * 4, '=')
  try {
    const bin = atob(padded)
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    return ok(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    return fail('El contenido decodificado no es texto UTF-8')
  }
}

export function looksLikeBase64(text: string): boolean {
  const t = text.trim()
  return t.length >= 8 && t.length % 4 !== 1 && /^[A-Za-z0-9+/_-]+={0,2}$/.test(t) && /[A-Z]/.test(t) && /[a-z0-9]/.test(t)
}

export function urlEncode(text: string): string {
  return encodeURIComponent(text)
}

export function urlDecode(text: string): Result<string> {
  try {
    return ok(decodeURIComponent(text.replace(/\+/g, ' ')))
  } catch {
    return fail('Secuencia % inválida')
  }
}

// ─── JWT ─────────────────────────────────────────────────────────────────────

export interface DecodedJwt {
  header: Record<string, unknown>
  payload: Record<string, unknown>
  signature: string
  /** `exp` como fecha, si viene */
  expiresAt?: Date
  issuedAt?: Date
  expired?: boolean
}

export function looksLikeJwt(text: string): boolean {
  return /^eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(text.trim())
}

/** Decodifica sin verificar la firma (no hay clave): sólo para inspeccionar. */
export function decodeJwt(token: string, now = Date.now()): Result<DecodedJwt> {
  const parts = token.trim().replace(/^Bearer\s+/i, '').split('.')
  if (parts.length !== 3) return fail('Un JWT tiene tres partes separadas por punto')
  const part = (s: string, name: string): Result<Record<string, unknown>> => {
    const dec = base64Decode(s)
    if (!dec.ok) return fail(`${name}: ${dec.error}`)
    try {
      const v = JSON.parse(dec.value)
      return v && typeof v === 'object' && !Array.isArray(v) ? ok(v as Record<string, unknown>) : fail(`${name}: no es un objeto JSON`)
    } catch {
      return fail(`${name}: no es JSON`)
    }
  }
  const header = part(parts[0]!, 'Header')
  if (!header.ok) return header
  const payload = part(parts[1]!, 'Payload')
  if (!payload.ok) return payload
  const out: DecodedJwt = { header: header.value, payload: payload.value, signature: parts[2]! }
  const exp = payload.value.exp, iat = payload.value.iat
  if (typeof exp === 'number') { out.expiresAt = new Date(exp * 1000); out.expired = exp * 1000 < now }
  if (typeof iat === 'number') out.issuedAt = new Date(iat * 1000)
  return ok(out)
}

// ─── UUID ────────────────────────────────────────────────────────────────────

export function uuid(): string {
  return crypto.randomUUID()
}

// ─── Fechas / timestamps ─────────────────────────────────────────────────────

export interface DateInfo {
  iso: string
  local: string
  unixSeconds: number
  unixMs: number
  relative: string
}

/** 10 dígitos = segundos, 13 = milisegundos; si no, cualquier fecha que entienda `Date`. */
export function parseDateInput(input: string): Result<Date> {
  const t = input.trim()
  if (!t) return fail('Vacío')
  if (/^-?\d{1,10}(\.\d+)?$/.test(t)) return ok(new Date(Number(t) * 1000))
  if (/^-?\d{11,16}$/.test(t)) return ok(new Date(Number(t)))
  if (/^\d+$/.test(t)) return fail('Número demasiado largo para un timestamp')
  // Sólo texto con forma de fecha: evita que "abc 1" se interprete como año 2001.
  if (!/\d{4}|\d{1,2}[/-]\d{1,2}/.test(t)) return fail('No parece una fecha')
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? fail('Fecha inválida') : ok(d)
}

export function looksLikeTimestamp(text: string): boolean {
  return /^\d{10}(\d{3})?$/.test(text.trim())
}

export function relativeTime(date: Date, now = Date.now()): string {
  const diff = date.getTime() - now
  const abs = Math.abs(diff)
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 365 * 864e5], ['month', 30 * 864e5], ['day', 864e5], ['hour', 36e5], ['minute', 6e4], ['second', 1e3],
  ]
  const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' })
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === 'second') return rtf.format(Math.round(diff / ms), unit)
  }
  return ''
}

export function dateInfo(date: Date, now = Date.now()): DateInfo {
  return {
    iso: date.toISOString(),
    local: date.toLocaleString('es-AR', { dateStyle: 'full', timeStyle: 'medium' }),
    unixSeconds: Math.floor(date.getTime() / 1000),
    unixMs: date.getTime(),
    relative: relativeTime(date, now),
  }
}

// ─── Regex ───────────────────────────────────────────────────────────────────

export interface RegexMatch {
  index: number
  text: string
  groups: (string | undefined)[]
  named?: Record<string, string | undefined>
}

const MAX_MATCHES = 500

export function testRegex(pattern: string, flags: string, text: string): Result<RegexMatch[]> {
  let re: RegExp
  try {
    // Siempre global para listar todas las coincidencias; "d" no hace falta.
    re = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g')
  } catch (err) {
    return fail(err instanceof Error ? err.message.replace(/^Invalid regular expression: /, '') : 'Expresión inválida')
  }
  const out: RegexMatch[] = []
  for (const m of text.matchAll(re)) {
    out.push({ index: m.index ?? 0, text: m[0], groups: m.slice(1), named: m.groups ? { ...m.groups } : undefined })
    if (out.length >= MAX_MATCHES) break
  }
  return ok(out)
}

// ─── Hash ────────────────────────────────────────────────────────────────────

export type HashAlgo = 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-512'
export const HASH_ALGOS: HashAlgo[] = ['MD5', 'SHA-1', 'SHA-256', 'SHA-512']

const toHex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

export async function hash(text: string, algo: HashAlgo): Promise<string> {
  const data = new TextEncoder().encode(text)
  if (algo === 'MD5') return md5(data)
  return toHex(new Uint8Array(await crypto.subtle.digest(algo, data)))
}

/** MD5 (RFC 1321). Web Crypto no lo trae; se usa sólo como checksum, no para seguridad. */
export function md5(data: Uint8Array): string {
  const s = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21]
  const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0)
  const len = data.length
  const total = (((len + 8) >> 6) + 1) * 64
  const buf = new Uint8Array(total)
  buf.set(data)
  buf[len] = 0x80
  const view = new DataView(buf.buffer)
  view.setUint32(total - 8, (len * 8) >>> 0, true)
  view.setUint32(total - 4, Math.floor(len / 0x20000000), true)
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476
  for (let off = 0; off < total; off += 64) {
    let a = a0, b = b0, c = c0, d = d0
    for (let i = 0; i < 64; i++) {
      let f: number, g: number
      if (i < 16) { f = (b & c) | (~b & d); g = i }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16 }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16 }
      else { f = c ^ (b | ~d); g = (7 * i) % 16 }
      const tmp = d
      d = c
      c = b
      const x = (a + f + K[i]! + view.getUint32(off + g * 4, true)) >>> 0
      const r = s[(i >> 4) * 4 + (i % 4)]!
      b = (b + ((x << r) | (x >>> (32 - r)))) >>> 0
      a = tmp
    }
    a0 = (a0 + a) >>> 0; b0 = (b0 + b) >>> 0; c0 = (c0 + c) >>> 0; d0 = (d0 + d) >>> 0
  }
  const out = new Uint8Array(16)
  const ov = new DataView(out.buffer)
  ;[a0, b0, c0, d0].forEach((v, i) => ov.setUint32(i * 4, v, true))
  return toHex(out)
}
