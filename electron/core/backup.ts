import { createCipheriv, createDecipheriv, randomBytes, scrypt, scryptSync } from 'crypto'
import { gunzipSync, gzip, gzipSync } from 'zlib'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'

/**
 * Respaldo de los datos de Setto en un solo archivo `.settobackup`.
 *
 * Los datos sensibles están cifrados con safeStorage (atado al usuario de Windows):
 * copiarlos tal cual no sirve en otra PC. Por eso al exportar se pasan a texto
 * ("portable"), todo se cifra con una contraseña de respaldo (scrypt + AES-256-GCM)
 * y al restaurar se vuelven a cifrar con safeStorage de la PC nueva.
 *
 * Formatos cifrados que existen en userData:
 * - `ENCV1:<base64>` — DatabaseService.writeEncryptedJSON (claves, conexiones SQL…)
 * - `{ v, enc: true, data }` — historial del portapapeles
 * - valores `enc:<base64>` dentro de un JSON (settings.json: claves de API, tokens)
 */

export type EntryKind = 'raw' | 'text' | 'db-enc' | 'clip-enc' | 'enc-values'

export interface BackupEntry {
  /** Ruta relativa a userData, con "/" */
  path: string
  kind: EntryKind
  /** Texto plano (utf-8) salvo `raw`, que va en base64 */
  data: string
}

export interface BackupPayload {
  format: 'setto-backup'
  v: 1
  createdAt: number
  appVersion: string
  entries: BackupEntry[]
  /** localStorage de la ventana principal (tema, fuente, pestañas recordadas…) */
  local: Record<string, string>
}

/** Cifrado de la máquina (safeStorage). Inyectable para los tests. */
export interface Codec {
  available: boolean
  encrypt: (plain: string) => string
  decrypt: (b64: string) => string
}

const DB_MAGIC = 'ENCV1:'
const VALUE_PREFIX = 'enc:'

/** Archivos que no van: sesiones, cachés regenerables, logs, ejecutables, temporales. */
const EXCLUDED_FILES = new Set([
  'google-auth.json', 'file-associations.json', 'ai-cache.json', 'gastos-cache.json', 'credentials-cache.json', 'backup-auto.json',
])
const DATA_FILE_RE = /\.(json|vault)$/i
const SKIP_RE = /\.(tmp|bak)$|corrupt-|^setto-fg-|^restore-backup-/i
/** Carpetas de datos (todo su contenido). `captures` sólo si se pide. */
const DATA_DIRS = ['notes', 'editor-history']

/** Archivos de userData que van en el respaldo (rutas relativas con "/"). */
export function collectFiles(dir: string, opts: { includeCaptures: boolean }): string[] {
  const out: string[] = []
  let top: fs.Dirent[]
  try { top = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of top) {
    if (e.isFile() && DATA_FILE_RE.test(e.name) && !EXCLUDED_FILES.has(e.name) && !SKIP_RE.test(e.name)) out.push(e.name)
  }
  const walk = (rel: string): void => {
    let list: fs.Dirent[]
    try { list = fs.readdirSync(path.join(dir, rel), { withFileTypes: true }) } catch { return }
    for (const e of list) {
      const r = `${rel}/${e.name}`
      if (e.isDirectory()) walk(r)
      else if (e.isFile() && !SKIP_RE.test(e.name)) out.push(r)
    }
  }
  for (const d of [...DATA_DIRS, ...(opts.includeCaptures ? ['captures'] : [])]) walk(d)
  return out.sort()
}

export function dirSizeBytes(dir: string, files: string[]): number {
  let n = 0
  for (const f of files) { try { n += fs.statSync(path.join(dir, f)).size } catch { /* se borró */ } }
  return n
}

const isTextName = (p: string): boolean => /\.(json|vault|md|txt|markdown)$/i.test(p)

/** Un archivo → entrada portable (descifra lo que esté cifrado con la máquina). */
export function toPortable(rel: string, buf: Buffer, codec: Codec): BackupEntry {
  if (!isTextName(rel)) return { path: rel, kind: 'raw', data: buf.toString('base64') }
  const text = buf.toString('utf-8')
  const trimmed = text.trim()
  if (trimmed.startsWith(DB_MAGIC)) {
    return { path: rel, kind: 'db-enc', data: codec.decrypt(trimmed.slice(DB_MAGIC.length)) }
  }
  if (/\.json$/i.test(rel)) {
    let parsed: unknown
    try { parsed = JSON.parse(text) } catch { return { path: rel, kind: 'text', data: text } }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const o = parsed as Record<string, unknown>
      if (typeof o['data'] === 'string' && 'enc' in o && 'v' in o) {
        const data = o['enc'] === true ? codec.decrypt(o['data']) : o['data']
        return { path: rel, kind: 'clip-enc', data }
      }
      const keys = Object.keys(o).filter((k) => typeof o[k] === 'string' && (o[k] as string).startsWith(VALUE_PREFIX))
      if (keys.length) {
        const plain = { ...o }
        for (const k of keys) plain[k] = codec.decrypt((o[k] as string).slice(VALUE_PREFIX.length))
        return { path: rel, kind: 'enc-values', data: JSON.stringify({ values: plain, encrypted: keys }) }
      }
    }
  }
  return { path: rel, kind: 'text', data: text }
}

/** Entrada portable → contenido para escribir en esta máquina (re-cifrado). */
export function fromPortable(e: BackupEntry, codec: Codec): Buffer {
  switch (e.kind) {
    case 'raw': return Buffer.from(e.data, 'base64')
    case 'text': return Buffer.from(e.data, 'utf-8')
    case 'db-enc':
      return Buffer.from(codec.available ? DB_MAGIC + codec.encrypt(e.data) : e.data, 'utf-8')
    case 'clip-enc':
      return Buffer.from(JSON.stringify(codec.available
        ? { v: 1, enc: true, data: codec.encrypt(e.data) }
        : { v: 1, enc: false, data: e.data }), 'utf-8')
    case 'enc-values': {
      const { values, encrypted } = JSON.parse(e.data) as { values: Record<string, unknown>; encrypted: string[] }
      const out = { ...values }
      if (codec.available) for (const k of encrypted) out[k] = VALUE_PREFIX + codec.encrypt(String(values[k] ?? ''))
      return Buffer.from(JSON.stringify(out, null, 2), 'utf-8')
    }
  }
}

/** Ruta relativa segura dentro de userData (nada de "..", absolutas ni unidades). */
export function safeRelPath(rel: string): string | null {
  if (!rel || /^[a-zA-Z]:|^[\\/]/.test(rel)) return null
  const parts = rel.split(/[\\/]+/)
  if (parts.some((p) => p === '..' || p === '' || p === '.')) return null
  return parts.join('/')
}

// ── Sobre cifrado ─────────────────────────────────────────────────────────────

interface Envelope {
  format: 'setto-backup'
  v: 1
  createdAt: number
  kdf: { name: 'scrypt'; salt: string; N: number; r: number; p: number }
  iv: string
  tag: string
  data: string
}

const KDF = { N: 2 ** 15, r: 8, p: 1 }
const deriveKey = (pass: string, salt: Buffer, k = KDF): Buffer => scryptSync(pass.normalize('NFC'), salt, 32, { N: k.N, r: k.r, p: k.p, maxmem: 128 * k.N * k.r * 2 })

export const MIN_PASSPHRASE = 8

export function sealBackup(payload: BackupPayload, pass: string): Buffer {
  if (pass.length < MIN_PASSPHRASE) throw new Error(`La contraseña del respaldo necesita al menos ${MIN_PASSPHRASE} caracteres`)
  const salt = randomBytes(16)
  return envelope(payload, salt, deriveKey(pass, salt), gzipSync(Buffer.from(JSON.stringify(payload), 'utf-8')))
}

const scryptAsync = promisify(scrypt) as (pass: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>
const gzipAsync = promisify(gzip)

/** Igual que sealBackup, pero scrypt y gzip corren en el threadpool: no traban el proceso main. */
export async function sealBackupAsync(payload: BackupPayload, pass: string): Promise<Buffer> {
  if (pass.length < MIN_PASSPHRASE) throw new Error(`La contraseña del respaldo necesita al menos ${MIN_PASSPHRASE} caracteres`)
  const salt = randomBytes(16)
  const key = await scryptAsync(pass.normalize('NFC'), salt, 32, { N: KDF.N, r: KDF.r, p: KDF.p, maxmem: 128 * KDF.N * KDF.r * 2 })
  const zipped = await gzipAsync(Buffer.from(JSON.stringify(payload), 'utf-8'))
  return envelope(payload, salt, key, zipped)
}

function envelope(payload: BackupPayload, salt: Buffer, key: Buffer, zipped: Buffer): Buffer {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(zipped), cipher.final()])
  const env: Envelope = {
    format: 'setto-backup', v: 1, createdAt: payload.createdAt,
    kdf: { name: 'scrypt', salt: salt.toString('base64'), ...KDF },
    iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: enc.toString('base64'),
  }
  return Buffer.from(JSON.stringify(env), 'utf-8')
}

export function openBackup(buf: Buffer, pass: string): BackupPayload {
  let env: Envelope
  try { env = JSON.parse(buf.toString('utf-8')) as Envelope } catch { throw new Error('El archivo no es un respaldo de Setto') }
  if (env?.format !== 'setto-backup' || env.v !== 1) throw new Error('El archivo no es un respaldo de Setto (o es de una versión más nueva)')
  const key = deriveKey(pass, Buffer.from(env.kdf.salt, 'base64'), env.kdf)
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(env.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(env.tag, 'base64'))
  let plain: Buffer
  try {
    plain = Buffer.concat([decipher.update(Buffer.from(env.data, 'base64')), decipher.final()])
  } catch {
    throw new Error('Contraseña incorrecta (o el archivo está dañado)')
  }
  const payload = JSON.parse(gunzipSync(plain).toString('utf-8')) as BackupPayload
  if (payload.format !== 'setto-backup' || !Array.isArray(payload.entries)) throw new Error('El respaldo está dañado')
  return payload
}
