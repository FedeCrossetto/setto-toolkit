/**
 * Opt-in end-to-end password sync for Claves (main process).
 *
 * Passwords normally live only in this PC's safeStorage vault. With a master
 * password, each one is also uploaded as an AES-256-GCM blob (`password_e2e`)
 * so another PC that knows the master password can decrypt the ones it lacks.
 * The master password and the derived key never leave main; the key stays in
 * memory only while unlocked (or wrapped with safeStorage if the user chose
 * "Recordar en esta computadora").
 *
 * No Electron / Supabase imports here: storage and the remote are injected, so
 * the whole flow is testable with fakes.
 */
import crypto from 'node:crypto'
import type { E2EResult, E2EStatus, E2EState } from '../../../src/plugins/credentials/types'
import {
  blobSalt, decryptPassword, DEFAULT_KDF, deriveKey, encryptPassword, makeCheck, MASTER_MIN_LENGTH,
  newSalt, validKdf, verifyCheck, type KdfParams,
} from './e2e-crypto'
import { countStates, decideMerge, itemSyncState, type ItemSyncState } from './e2e-merge'

export const E2E_MIGRATION_MISSING = 'E2E_MIGRATION_MISSING'

export interface VaultMeta { salt: string; kdf: KdfParams; check: string }
export interface RemoteBlobRow { id: string; blob: string | null; updatedAt: number }

export interface E2ERemote {
  getMeta(): Promise<VaultMeta | null>
  putMeta(meta: VaultMeta): Promise<void>
  deleteMeta(): Promise<void>
  listBlobs(): Promise<RemoteBlobRow[]>
  putBlob(id: string, blob: string | null): Promise<void>
  clearAllBlobs(): Promise<void>
}

/** Encrypted-at-rest JSON files in userData (DatabaseService in production). */
export interface E2EStore {
  read<T>(file: string): T | null
  write(file: string, data: unknown): void
  remove(file: string): void
}

export interface E2EDeps {
  remote: () => E2ERemote
  store: E2EStore
  readVault: () => Record<string, string>
  setVaultPassword: (id: string, password: string | null) => void
  isLocalMode: () => boolean
  /** Minutes the key stays in memory without use (same as the PIN lock). */
  lockMinutes: () => number
  now?: () => number
}

const STATE_FILE = 'credentials-e2e.json'
const REMEMBER_FILE = 'credentials-e2e-key.vault'

interface SyncState {
  /** Salt of the remote vault this PC last saw (null = sync off as far as we know). */
  metaSalt: string | null
  /** Random per-install key for the comparison hashes below. */
  pepper: string
  /** When this PC set / cleared each password (epoch ms). */
  pwdAt: Record<string, number>
  /** Last (local password, remote blob) pair seen in agreement, as hashes. */
  known: Record<string, { pwd: string; blob: string }>
  /** Hash of each remote blob from the last fetch. */
  remote: Record<string, string>
  /** Items whose local password differs from the remote blob (hash) with no way to tell which is newer. */
  conflict: Record<string, string>
  lastSyncAt: number | null
}

interface Remembered { salt: string; key: string }

type Problem = Extract<E2EState, 'migration-missing' | 'offline' | 'error'>

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function classifyE2EError(err: unknown): Problem {
  const msg = errText(err)
  if (msg.includes(E2E_MIGRATION_MISSING)) return 'migration-missing'
  return /fetch failed|network|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket|Tiempo de espera|timeout|SUPABASE_NOT_CONFIGURED|Failed to fetch/i
    .test(msg) ? 'offline' : 'error'
}

export class E2ESync {
  private mem: { key: Buffer; salt: string } | null = null
  private memUntil = 0
  private failed = 0
  private blockedUntil = 0
  private problem: { state: Problem; error: string } | null = null

  constructor(private deps: E2EDeps) {}

  private now(): number { return this.deps.now?.() ?? Date.now() }

  // ── Local state ──────────────────────────────────────────────────────────
  private readState(): SyncState {
    const s = this.deps.store.read<Partial<SyncState>>(STATE_FILE)
    const obj = <T>(v: unknown): Record<string, T> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, T> : {})
    return {
      metaSalt: typeof s?.metaSalt === 'string' ? s.metaSalt : null,
      pepper: typeof s?.pepper === 'string' && s.pepper ? s.pepper : crypto.randomBytes(16).toString('hex'),
      pwdAt: obj<number>(s?.pwdAt),
      known: obj<{ pwd: string; blob: string }>(s?.known),
      remote: obj<string>(s?.remote),
      conflict: obj<string>(s?.conflict),
      lastSyncAt: typeof s?.lastSyncAt === 'number' ? s.lastSyncAt : null,
    }
  }
  private writeState(s: SyncState): void { this.deps.store.write(STATE_FILE, s) }
  private hash(pepper: string, v: string): string {
    return crypto.createHmac('sha256', pepper).update(v, 'utf8').digest('hex')
  }

  // ── Key ──────────────────────────────────────────────────────────────────
  private remembered(): Remembered | null {
    const r = this.deps.store.read<Remembered>(REMEMBER_FILE)
    return r && typeof r.salt === 'string' && typeof r.key === 'string' ? r : null
  }

  /** Key for the vault this PC knows, from memory or (if remembered) from safeStorage. */
  private key(): { key: Buffer; salt: string } | null {
    const salt = this.readState().metaSalt
    if (!salt) return null
    if (this.mem && this.now() < this.memUntil && this.mem.salt === salt) return this.mem
    this.mem = null
    const r = this.remembered()
    if (r && r.salt === salt) return { key: Buffer.from(r.key, 'base64'), salt }
    return null
  }

  private setKey(key: Buffer, salt: string, remember: boolean | undefined): void {
    this.mem = { key, salt }
    this.touch()
    if (remember) this.deps.store.write(REMEMBER_FILE, { salt, key: key.toString('base64') } satisfies Remembered)
    else if (remember === false) this.deps.store.remove(REMEMBER_FILE)
    else if (this.remembered()) this.deps.store.write(REMEMBER_FILE, { salt, key: key.toString('base64') } satisfies Remembered)
  }

  /** Sliding window on explicit use (unlock, save). Background merges don't extend it. */
  touch(): void {
    if (this.mem) this.memUntil = this.now() + Math.max(1, this.deps.lockMinutes()) * 60_000
  }

  /** Drops the in-memory key (lock, blur timeout, suspend). A remembered key stays. */
  lock(): void {
    // Just drop the reference: zeroing the buffer could corrupt a merge still in flight.
    this.mem = null
    this.memUntil = 0
  }

  isUnlocked(): boolean { return !!this.key() }

  // ── Status ───────────────────────────────────────────────────────────────
  itemStates(ids: string[]): Record<string, ItemSyncState> {
    const s = this.readState()
    if (!s.metaSalt || this.deps.isLocalMode()) return {}
    const vault = this.deps.readVault()
    const out: Record<string, ItemSyncState> = {}
    for (const id of ids) {
      const pwd = vault[id]
      const st = itemSyncState({
        localHash: pwd ? this.hash(s.pepper, pwd) : undefined, remoteBlobHash: s.remote[id], known: s.known[id], conflictBlob: s.conflict[id],
      })
      if (st) out[id] = st
    }
    return out
  }

  status(ids: string[]): E2EStatus {
    const s = this.readState()
    const remembered = !!this.remembered() && this.remembered()?.salt === s.metaSalt
    const counts = countStates(Object.values(this.itemStates(ids)))
    const base = { remembered, counts, lastSyncAt: s.lastSyncAt }
    if (this.deps.isLocalMode()) return { ...base, state: 'local-mode', remembered: false }
    if (this.problem) return { ...base, state: this.problem.state, error: this.problem.error }
    if (!s.metaSalt) return { ...base, state: 'off' }
    return { ...base, state: this.isUnlocked() ? 'unlocked' : 'locked' }
  }

  private setProblem(err: unknown): void {
    this.problem = { state: classifyE2EError(err), error: errText(err) }
  }

  /** Reads `vault_meta` and adopts it (sync turned on/off or master password changed elsewhere). */
  private async adoptMeta(): Promise<VaultMeta | null> {
    const meta = await this.deps.remote().getMeta()
    this.problem = null
    const s = this.readState()
    const salt = meta?.salt ?? null
    if (s.metaSalt !== salt) {
      // Different vault (or none): what we knew no longer applies.
      this.lock()
      if (this.remembered()?.salt !== salt) this.deps.store.remove(REMEMBER_FILE)
      this.writeState({ ...s, metaSalt: salt, known: {}, remote: {}, conflict: {} })
    }
    return meta
  }

  /**
   * Called after each list sync: picks up remote changes. With the key, merges
   * both ways; without it, only refreshes which blobs exist (per-item status).
   */
  async refresh(): Promise<{ pulled: number; pushed: number }> {
    if (this.deps.isLocalMode()) return { pulled: 0, pushed: 0 }
    try {
      const meta = await this.adoptMeta()
      if (!meta) return { pulled: 0, pushed: 0 }
      if (this.key()) return await this.merge()
      const rows = await this.deps.remote().listBlobs()
      const s = this.readState()
      this.writeState({ ...s, remote: this.remoteHashes(s.pepper, rows) })
      return { pulled: 0, pushed: 0 }
    } catch (err) {
      this.setProblem(err)
      return { pulled: 0, pushed: 0 }
    }
  }

  private remoteHashes(pepper: string, rows: RemoteBlobRow[]): Record<string, string> {
    const out: Record<string, string> = {}
    for (const r of rows) if (r.blob) out[r.id] = this.hash(pepper, r.blob)
    return out
  }

  /** Two-way merge with the current key. Newer timestamp wins; see decideMerge. */
  private async merge(): Promise<{ pulled: number; pushed: number }> {
    const k = this.key()
    if (!k) return { pulled: 0, pushed: 0 }
    const remote = this.deps.remote()
    const rows = await remote.listBlobs()
    const vault = this.deps.readVault()
    const s = this.readState()
    let pulled = 0
    let pushed = 0
    for (const row of rows) {
      let r: { p: string; t: number } | undefined
      if (row.blob && blobSalt(row.blob) === k.salt) {
        try { r = decryptPassword(k.key, row.id, row.blob) } catch { r = undefined }
      }
      const local = vault[row.id] || ''
      const action = decideMerge({ password: local, at: s.pwdAt[row.id] }, { password: r?.p, at: r ? (r.t || row.updatedAt) : undefined })
      if (action === 'conflict' && row.blob) {
        // Keep the local one untouched; the user chooses (resolveConflict).
        s.conflict[row.id] = this.hash(s.pepper, row.blob)
        delete s.known[row.id]
        continue
      }
      delete s.conflict[row.id]
      if (action === 'pull' && r) {
        this.deps.setVaultPassword(row.id, r.p)
        s.pwdAt[row.id] = r.t || row.updatedAt
        s.known[row.id] = { pwd: this.hash(s.pepper, r.p), blob: this.hash(s.pepper, row.blob!) }
        pulled++
      } else if (action === 'push') {
        if (local) {
          const t = s.pwdAt[row.id] || this.now()
          const blob = encryptPassword(k.key, k.salt, row.id, { p: local, t })
          await remote.putBlob(row.id, blob)
          row.blob = blob
          s.pwdAt[row.id] = t
          s.known[row.id] = { pwd: this.hash(s.pepper, local), blob: this.hash(s.pepper, blob) }
        } else {
          await remote.putBlob(row.id, null)
          row.blob = null
          delete s.known[row.id]
        }
        pushed++
      } else if (local && r && row.blob) {
        s.known[row.id] = { pwd: this.hash(s.pepper, local), blob: this.hash(s.pepper, row.blob) }
        s.pwdAt[row.id] = Math.max(s.pwdAt[row.id] ?? 0, r.t || 0)
      }
    }
    const ids = new Set(rows.map((r) => r.id))
    for (const id of Object.keys(s.known)) if (!ids.has(id)) delete s.known[id]
    for (const id of Object.keys(s.conflict)) if (!ids.has(id)) delete s.conflict[id]
    this.writeState({ ...s, remote: this.remoteHashes(s.pepper, rows), lastSyncAt: this.now() })
    return { pulled, pushed }
  }

  // ── Hooks from save / delete ─────────────────────────────────────────────
  /** The password of `id` was set or cleared on this PC just now. */
  notePasswordChange(id: string): void {
    const s = this.readState()
    this.writeState({ ...s, pwdAt: { ...s.pwdAt, [id]: this.now() } })
  }

  /** Best-effort upload of one password right after saving (the next merge retries). */
  async pushOne(id: string): Promise<boolean> {
    const k = this.key()
    if (!k || this.deps.isLocalMode()) return false
    try {
      const s = this.readState()
      const pwd = this.deps.readVault()[id] || ''
      const t = s.pwdAt[id] || this.now()
      const blob = pwd ? encryptPassword(k.key, k.salt, id, { p: pwd, t }) : null
      await this.deps.remote().putBlob(id, blob)
      const next = this.readState()
      if (blob) {
        next.known[id] = { pwd: this.hash(next.pepper, pwd), blob: this.hash(next.pepper, blob) }
        next.remote[id] = this.hash(next.pepper, blob)
        next.pwdAt[id] = t
      } else {
        delete next.known[id]
        delete next.remote[id]
      }
      delete next.conflict[id]
      this.writeState(next)
      this.touch()
      return true
    } catch (err) {
      this.setProblem(err)
      return false
    }
  }

  forget(id: string): void {
    const s = this.readState()
    delete s.pwdAt[id]
    delete s.known[id]
    delete s.remote[id]
    delete s.conflict[id]
    this.writeState(s)
  }

  /** Last "Usar la sincronizada": the replaced local password, kept in memory only for "Deshacer". */
  private replaced: { id: string; password: string; at?: number } | null = null

  /**
   * Resolves a conflict. `local` re-uploads this PC's password as the newest;
   * `remote` replaces it with the synced one (undoable once with `undo`).
   */
  async resolveConflict(ids: string[], id: string, choice: 'local' | 'remote' | 'undo'): Promise<E2EResult> {
    if (choice === 'undo') {
      const r = this.replaced
      if (!r || r.id !== id) return this.fail(ids, 'No hay nada para deshacer')
      this.replaced = null
      this.deps.setVaultPassword(id, r.password)
      const s = this.readState()
      if (r.at) s.pwdAt[id] = r.at
      else delete s.pwdAt[id]
      delete s.known[id]
      if (s.remote[id]) s.conflict[id] = s.remote[id]!
      this.writeState(s)
      return this.result(ids)
    }
    const k = this.key()
    if (!k) return this.fail(ids, 'Desbloqueá la sincronización primero')
    try {
      if (choice === 'local') {
        this.notePasswordChange(id)
        if (!(await this.pushOne(id))) return this.fail(ids, this.problem?.error ?? 'No se pudo subir')
        return this.result(ids, { pushed: 1 })
      }
      const row = (await this.deps.remote().listBlobs()).find((x) => x.id === id)
      if (!row?.blob || blobSalt(row.blob) !== k.salt) return this.fail(ids, 'La copia sincronizada ya no está')
      const r = decryptPassword(k.key, id, row.blob)
      const s = this.readState()
      const prev = this.deps.readVault()[id]
      this.replaced = prev ? { id, password: prev, at: s.pwdAt[id] } : null
      this.deps.setVaultPassword(id, r.p)
      s.pwdAt[id] = r.t || this.now()
      s.known[id] = { pwd: this.hash(s.pepper, r.p), blob: this.hash(s.pepper, row.blob) }
      s.remote[id] = this.hash(s.pepper, row.blob)
      delete s.conflict[id]
      this.writeState(s)
      this.touch()
      return this.result(ids, { pulled: 1 })
    } catch (err) {
      this.setProblem(err)
      return this.fail(ids, errText(err))
    }
  }

  // ── User operations ──────────────────────────────────────────────────────
  private result(ids: string[], extra: Partial<E2EResult> = {}): E2EResult {
    return { ok: true, status: this.status(ids), ...extra }
  }
  private fail(ids: string[], error: string): E2EResult {
    return { ok: false, status: this.status(ids), error }
  }

  async getStatus(ids: string[]): Promise<E2EStatus> {
    if (this.deps.isLocalMode()) return this.status(ids)
    try {
      await this.adoptMeta()
    } catch (err) {
      this.setProblem(err)
    }
    return this.status(ids)
  }

  /** First PC: creates the vault and uploads every local password. */
  async setup(ids: string[], password: string, remember: boolean): Promise<E2EResult> {
    if (this.deps.isLocalMode()) return this.fail(ids, 'Claves está en modo local: no hay dónde sincronizar')
    if (typeof password !== 'string' || password.length < MASTER_MIN_LENGTH) {
      return this.fail(ids, `La contraseña maestra tiene que tener al menos ${MASTER_MIN_LENGTH} caracteres`)
    }
    try {
      const existing = await this.adoptMeta()
      if (existing) return this.fail(ids, 'La sincronización ya está activada desde otra computadora: ingresá esa contraseña maestra')
      const salt = newSalt()
      const key = await deriveKey(password, salt, DEFAULT_KDF)
      const meta: VaultMeta = { salt: salt.toString('base64'), kdf: DEFAULT_KDF, check: makeCheck(key, salt) }
      await this.deps.remote().putMeta(meta)
      const s = this.readState()
      this.writeState({ ...s, metaSalt: meta.salt, known: {}, remote: {}, conflict: {} })
      this.setKey(key, meta.salt, remember)
      const r = await this.merge()
      return this.result(ids, r)
    } catch (err) {
      this.setProblem(err)
      return this.fail(ids, errText(err))
    }
  }

  private async verify(meta: VaultMeta, password: string): Promise<Buffer | null> {
    if (!validKdf(meta.kdf)) throw new Error('Los parámetros guardados en Supabase no son válidos')
    const key = await deriveKey(String(password ?? ''), Buffer.from(meta.salt, 'base64'), meta.kdf)
    return verifyCheck(key, meta.check) ? key : null
  }

  private throttled(ids: string[]): E2EResult | null {
    const now = this.now()
    if (now < this.blockedUntil) return this.fail(ids, `Demasiados intentos. Probá de nuevo en ${Math.ceil((this.blockedUntil - now) / 1000)} s`)
    return null
  }
  private wrongPassword(ids: string[]): E2EResult {
    this.failed++
    if (this.failed >= 5) this.blockedUntil = this.now() + Math.min(30_000 * 2 ** (this.failed - 5), 5 * 60_000)
    return this.fail(ids, 'La contraseña maestra no es correcta')
  }

  /** Any PC: verifies the master password, keeps the key and merges. */
  async unlock(ids: string[], password: string, remember: boolean): Promise<E2EResult> {
    if (this.deps.isLocalMode()) return this.fail(ids, 'Claves está en modo local')
    const t = this.throttled(ids)
    if (t) return t
    try {
      const meta = await this.adoptMeta()
      if (!meta) return this.fail(ids, 'La sincronización no está activada')
      const key = await this.verify(meta, password)
      if (!key) return this.wrongPassword(ids)
      this.failed = 0
      this.setKey(key, meta.salt, remember)
      const r = await this.merge()
      return this.result(ids, r)
    } catch (err) {
      this.setProblem(err)
      return this.fail(ids, errText(err))
    }
  }

  /** New master password: brings everything down, then re-encrypts and uploads all with the new key. */
  async change(ids: string[], current: string, next: string): Promise<E2EResult> {
    if (typeof next !== 'string' || next.length < MASTER_MIN_LENGTH) {
      return this.fail(ids, `La contraseña maestra tiene que tener al menos ${MASTER_MIN_LENGTH} caracteres`)
    }
    const t = this.throttled(ids)
    if (t) return t
    try {
      const meta = await this.adoptMeta()
      if (!meta) return this.fail(ids, 'La sincronización no está activada')
      const oldKey = await this.verify(meta, current)
      if (!oldKey) return this.wrongPassword(ids)
      this.failed = 0
      this.setKey(oldKey, meta.salt, undefined)
      const before = await this.merge()   // every password is now on this PC
      const salt = newSalt()
      const key = await deriveKey(next, salt, DEFAULT_KDF)
      const newMeta: VaultMeta = { salt: salt.toString('base64'), kdf: DEFAULT_KDF, check: makeCheck(key, salt) }
      await this.deps.remote().putMeta(newMeta)
      const s = this.readState()
      this.writeState({ ...s, metaSalt: newMeta.salt, known: {}, remote: {}, conflict: {} })
      this.setKey(key, newMeta.salt, undefined)
      const after = await this.merge()    // old-salt blobs don't decrypt → local copies get re-uploaded
      return this.result(ids, { pulled: before.pulled, pushed: after.pushed })
    } catch (err) {
      this.setProblem(err)
      return this.fail(ids, errText(err))
    }
  }

  /** Turns it off everywhere: deletes `vault_meta` and every remote blob. Local vaults are untouched. */
  async disable(ids: string[]): Promise<E2EResult> {
    try {
      const remote = this.deps.remote()
      await remote.clearAllBlobs()
      await remote.deleteMeta()
      this.problem = null
      this.lock()
      this.deps.store.remove(REMEMBER_FILE)
      const s = this.readState()
      this.writeState({ ...s, metaSalt: null, known: {}, remote: {}, conflict: {}, lastSyncAt: null })
      return this.result(ids)
    } catch (err) {
      this.setProblem(err)
      return this.fail(ids, errText(err))
    }
  }

  /** "Recordar en esta computadora": stores the key wrapped with safeStorage (needs it unlocked). */
  setRemember(ids: string[], on: boolean): E2EResult {
    if (!on) {
      // Keep it usable for this session, just stop persisting it.
      const k = this.key()
      this.deps.store.remove(REMEMBER_FILE)
      if (k && !this.mem) { this.mem = { key: k.key, salt: k.salt }; this.touch() }
      return this.result(ids)
    }
    const k = this.key()
    if (!k) return this.fail(ids, 'Desbloqueá la sincronización primero')
    this.deps.store.write(REMEMBER_FILE, { salt: k.salt, key: k.key.toString('base64') } satisfies Remembered)
    return this.result(ids)
  }
}
