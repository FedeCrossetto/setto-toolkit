/**
 * End-to-end encryption of Claves passwords (main process only).
 *
 * The master password never leaves main: scrypt derives a 256-bit key and each
 * password travels to Supabase as an AES-256-GCM blob `v1:salt:iv:tag:ct`
 * (base64 parts; salt identifies which key produced it). The credential id is
 * bound as AAD so a blob can't be moved to another row.
 */
import crypto from 'node:crypto'

export interface KdfParams { name: 'scrypt'; N: number; r: number; p: number; keyLen: number }

export const DEFAULT_KDF: KdfParams = { name: 'scrypt', N: 2 ** 15, r: 8, p: 1, keyLen: 32 }
export const SALT_BYTES = 16
const IV_BYTES = 12
const CHECK_PLAINTEXT = 'setto-claves-e2e-check-v1'
const CHECK_AAD = 'vault-check'

export const MASTER_MIN_LENGTH = 10

/** Rejects absurd params (a tampered `vault_meta` must not be able to hang main). */
export function validKdf(k: unknown): k is KdfParams {
  if (!k || typeof k !== 'object') return false
  const { name, N, r, p, keyLen } = k as Record<string, unknown>
  return name === 'scrypt'
    && typeof N === 'number' && N >= 2 ** 14 && N <= 2 ** 20 && (N & (N - 1)) === 0
    && typeof r === 'number' && r >= 1 && r <= 16 && Number.isInteger(r)
    && typeof p === 'number' && p >= 1 && p <= 4 && Number.isInteger(p)
    && keyLen === 32
}

export function newSalt(): Buffer {
  return crypto.randomBytes(SALT_BYTES)
}

export function deriveKey(password: string, salt: Buffer, kdf: KdfParams = DEFAULT_KDF): Promise<Buffer> {
  if (!validKdf(kdf)) return Promise.reject(new Error('Parámetros de derivación inválidos'))
  return new Promise((resolve, reject) => {
    crypto.scrypt(password.normalize('NFC'), salt, kdf.keyLen, {
      N: kdf.N, r: kdf.r, p: kdf.p, maxmem: 256 * kdf.N * kdf.r + 1024 * 1024,
    }, (err, key) => (err ? reject(err) : resolve(key)))
  })
}

export interface ParsedBlob { salt: string; iv: Buffer; tag: Buffer; ct: Buffer }

export function parseBlob(blob: unknown): ParsedBlob | null {
  if (typeof blob !== 'string') return null
  const parts = blob.split(':')
  if (parts.length !== 5 || parts[0] !== 'v1') return null
  const [, salt, iv, tag, ct] = parts as [string, string, string, string, string]
  const ivB = Buffer.from(iv, 'base64')
  const tagB = Buffer.from(tag, 'base64')
  if (ivB.length !== IV_BYTES || tagB.length !== 16) return null
  return { salt, iv: ivB, tag: tagB, ct: Buffer.from(ct, 'base64') }
}

/** Salt (base64) a blob was produced with, or null if it's not a v1 blob. */
export function blobSalt(blob: unknown): string | null {
  return parseBlob(blob)?.salt ?? null
}

export function encryptSecret(key: Buffer, plaintext: string, opts: { salt?: Buffer | string; aad?: string } = {}): string {
  const iv = crypto.randomBytes(IV_BYTES)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  if (opts.aad) cipher.setAAD(Buffer.from(opts.aad, 'utf8'))
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  const salt = typeof opts.salt === 'string' ? opts.salt : opts.salt?.toString('base64') ?? ''
  return ['v1', salt, iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':')
}

/** Throws on a wrong key, a different AAD or any tampering (GCM auth tag). */
export function decryptSecret(key: Buffer, blob: string, aad?: string): string {
  const p = parseBlob(blob)
  if (!p) throw new Error('Formato cifrado desconocido')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, p.iv)
  if (aad) decipher.setAAD(Buffer.from(aad, 'utf8'))
  decipher.setAuthTag(p.tag)
  return Buffer.concat([decipher.update(p.ct), decipher.final()]).toString('utf8')
}

/** Key-check value stored in `vault_meta`: proves a master password without storing it. */
export function makeCheck(key: Buffer, salt: Buffer | string): string {
  return encryptSecret(key, CHECK_PLAINTEXT, { salt, aad: CHECK_AAD })
}

export function verifyCheck(key: Buffer, check: string): boolean {
  try {
    return decryptSecret(key, check, CHECK_AAD) === CHECK_PLAINTEXT
  } catch {
    return false
  }
}

// ── Credential passwords ─────────────────────────────────────────────────────

/** What goes inside each blob: the password plus when it was set (for "newer wins"). */
export interface SecretPayload { p: string; t: number }

const credAad = (id: string): string => `cred:${id}`

export function encryptPassword(key: Buffer, salt: Buffer | string, id: string, payload: SecretPayload): string {
  return encryptSecret(key, JSON.stringify(payload), { salt, aad: credAad(id) })
}

export function decryptPassword(key: Buffer, id: string, blob: string): SecretPayload {
  const raw = decryptSecret(key, blob, credAad(id))
  const v = JSON.parse(raw) as Partial<SecretPayload>
  if (typeof v.p !== 'string') throw new Error('Contenido cifrado inválido')
  return { p: v.p, t: Number(v.t) || 0 }
}
