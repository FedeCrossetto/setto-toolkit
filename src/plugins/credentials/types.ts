/**
 * Credential metadata. Mirrors `Credencial` in src/plugins/gastos/types.ts minus
 * the password: plaintext passwords stay in main (safeStorage vault) and only
 * reach the renderer on demand (`credentials:reveal`) or never (copy is done in main).
 */
export interface CredentialMeta {
  id: string
  nombre: string
  usuario: string
  url?: string
  notas?: string
  categoria?: string
  orden: number
}

export interface Credential extends CredentialMeta {
  /** There is a password in this computer's vault. */
  hasPassword: boolean
  /** Saved locally but not yet uploaded to Supabase. */
  pending?: boolean
  /** Times it was copied (user or password) on this computer. */
  useCount: number
  /** Last copy/use on this computer (epoch ms). */
  lastUsedAt?: number
  /** Marked as favorite (only filled by `credentials:top`). */
  favorite?: boolean
}

/** Payload for `credentials:save`. `password` omitted = keep the stored one. */
export interface CredentialDraft extends CredentialMeta {
  password?: string
}

export type SyncStatus = 'synced' | 'offline' | 'error'

export interface CredentialsListResult {
  items: Credential[]
  status: SyncStatus
  error?: string
  /** Epoch ms of the last successful load from Supabase (null = never). */
  syncedAt: number | null
  /** Writes waiting to be uploaded (includes deletions). */
  pendingCount: number
  favorites: string[]
  /** Last time each credential was copied/used (epoch ms). */
  usedAt: Record<string, number>
}

export interface SaveResult {
  ok: true
  /** Could not reach Supabase: saved locally and queued. */
  queued: boolean
  error?: string
}

export interface PasswordAudit {
  /** ids with a weak password */
  weak: string[]
  /** groups of ids sharing the same password (each group has 2+ ids) */
  reused: string[][]
  /** strength score 0–4 per id that has a password */
  scores: Record<string, number>
}

export type SecretResult<T> = ({ ok: true } & T) | { ok: false; locked: true }

/** Result of `credentials:copy-password` / `credentials:copy-username`. */
export type CopyResult = { ok: true; usedAt: number } | { ok: false; error: string; locked?: boolean }

export interface LockStatus {
  pinEnabled: boolean
  unlocked: boolean
  /** Minutes an unlock lasts (sliding; also how long after leaving the app it locks). */
  minutes: number
}

export interface PinVerifyResult {
  ok: boolean
  /** Too many attempts: wait this long. */
  retryInMs?: number
}

export type ImportFormat = 'chrome' | 'bitwarden' | '1password' | 'firefox' | 'generic'

export interface ImportPreviewRow {
  index: number
  nombre: string
  usuario: string
  url?: string
  categoria?: string
  hasPassword: boolean
  duplicate: boolean
}

export interface ImportPreview {
  token: string
  fileName: string
  format: ImportFormat
  rows: ImportPreviewRow[]
  /** Rows ignored (not logins, empty, too long). */
  skipped: number
}
