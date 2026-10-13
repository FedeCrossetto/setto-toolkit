import { app, clipboard, dialog } from 'electron'
import { ignoreClipboardText } from '../../core/clipboard-history'
import type { IpcMain } from 'electron'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { CoreServices, PluginHandlers } from '../../core/types'
import { registerHandler } from '../../core/ipc-handler'
import { logger } from '../../core/logger'
import type {
  Credential, CredentialDraft, CredentialMeta, CredentialsListResult, ImportPreview, LockStatus,
  PasswordAudit, PinVerifyResult, SaveResult, SecretResult, SyncStatus,
} from '../../../src/plugins/credentials/types'
import { applyQueue, dequeue, enqueue, flushQueue, type QueueOp } from '../../../src/plugins/credentials/offline-queue'
import { estimateStrength, WEAK_MAX_SCORE } from '../../../src/plugins/credentials/strength'
import {
  credentialsToCsv, markDuplicates, parseCredentialsCsv, type ImportedCredential,
} from '../../../src/plugins/credentials/csv'

// ── Files in <userData> ─────────────────────────────────────────────────────
/** Owned by GastosStorageService; read-only here (writes go through saveCredencial/deleteCredencial). */
const PASSWORD_VAULT_FILE = 'gastos-credenciales-passwords.vault'
/** Last list loaded from Supabase — metadata only, never passwords (encrypted at rest anyway). */
const CACHE_FILE = 'credentials-cache.json'
const QUEUE_FILE = 'credentials-queue.json'
const LOCAL_FILE = 'credentials-local.json'
const PIN_FILE = 'credentials-pin.vault'

const MAX_CLEAR_MS = 5 * 60_000
const PASSWORD_CLEAR_MS = 30_000
const NETWORK_TIMEOUT_MS = 12_000
const MAX_IMPORT_BYTES = 5 * 1024 * 1024

interface CacheData { items: CredentialMeta[]; syncedAt: number | null }
interface LocalData { favorites: string[]; usedAt: Record<string, number> }
interface PinData { salt: string; hash: string; minutes: number }

let pendingClear: ReturnType<typeof setTimeout> | null = null

function writeClipboard(text: string, clearAfterMs: number): void {
  ignoreClipboardText(text)   // los secretos nunca entran al historial del portapapeles
  clipboard.writeText(text)
  if (pendingClear) clearTimeout(pendingClear)
  pendingClear = null
  const ms = clearAfterMs > 0 ? Math.min(clearAfterMs, MAX_CLEAR_MS) : 0
  if (ms) {
    pendingClear = setTimeout(() => {
      pendingClear = null
      if (clipboard.readText() === text) clipboard.clear()
    }, ms)
  }
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function withTimeout<T>(p: Promise<T>, ms = NETWORK_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Tiempo de espera agotado al contactar Supabase')), ms)
    p.then((v) => { clearTimeout(t); resolve(v) }, (e) => { clearTimeout(t); reject(e) })
  })
}

/** Network/configuration problems → "offline" (show local copy); anything else → "error". */
function classify(err: unknown): SyncStatus {
  return /fetch failed|network|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket|Tiempo de espera|timeout|SUPABASE_NOT_CONFIGURED|Failed to fetch/i
    .test(errText(err)) ? 'offline' : 'error'
}

function friendlyError(err: unknown): string {
  const msg = errText(err)
  if (/SUPABASE_NOT_CONFIGURED/.test(msg)) return 'Supabase no está configurado (Conexiones → Supabase)'
  return msg
}

function metaOf(c: CredentialMeta): CredentialMeta {
  return {
    id: c.id, nombre: c.nombre, usuario: c.usuario ?? '', url: c.url || undefined,
    notas: c.notas || undefined, categoria: c.categoria || undefined, orden: Number(c.orden) || 0,
  }
}

function validateDraft(d: CredentialDraft): void {
  if (!d || typeof d !== 'object' || typeof d.id !== 'string' || !d.id) throw new Error('Payload inválido')
  if (typeof d.nombre !== 'string' || !d.nombre.trim()) throw new Error('El nombre es requerido')
  if (d.nombre.length > 200) throw new Error('Nombre demasiado largo')
  if (typeof d.usuario !== 'string' || d.usuario.length > 500) throw new Error('Usuario inválido')
  if (d.password !== undefined && (typeof d.password !== 'string' || d.password.length > 500)) throw new Error('Contraseña inválida')
  if (d.url !== undefined && (typeof d.url !== 'string' || d.url.length > 2000)) throw new Error('URL inválida')
  if (d.notas !== undefined && (typeof d.notas !== 'string' || d.notas.length > 5000)) throw new Error('Notas demasiado largas')
  if (d.categoria !== undefined && (typeof d.categoria !== 'string' || d.categoria.length > 100)) throw new Error('Categoría inválida')
}

function sha(s: string): string {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex')
}

export const handlers: PluginHandlers = {
  pluginId: 'credentials',

  register(ipcMain: IpcMain, { db, gastosStorage }: CoreServices): void {
    // ── Persistence helpers ────────────────────────────────────────────────
    const readVault = (): Record<string, string> => db.readEncryptedJSON<Record<string, string>>(PASSWORD_VAULT_FILE) ?? {}
    const readCache = (): CacheData => {
      const c = db.readEncryptedJSON<CacheData>(CACHE_FILE)
      return { items: Array.isArray(c?.items) ? c.items : [], syncedAt: c?.syncedAt ?? null }
    }
    const writeCache = (c: CacheData): void => db.writeEncryptedJSON(CACHE_FILE, c)
    const readQueue = (): QueueOp[] => {
      const q = db.readEncryptedJSON<QueueOp[]>(QUEUE_FILE)
      return Array.isArray(q) ? q : []
    }
    const writeQueue = (q: QueueOp[]): void => db.writeEncryptedJSON(QUEUE_FILE, q)
    const readLocal = (): LocalData => {
      const l = db.readEncryptedJSON<LocalData>(LOCAL_FILE)
      return { favorites: Array.isArray(l?.favorites) ? l.favorites : [], usedAt: l?.usedAt && typeof l.usedAt === 'object' ? l.usedAt : {} }
    }
    const writeLocal = (l: LocalData): void => db.writeEncryptedJSON(LOCAL_FILE, l)
    const markUsed = (id: string): number => {
      const l = readLocal()
      const now = Date.now()
      l.usedAt[id] = now
      writeLocal(l)
      return now
    }

    /** Serialises everything that touches the cache/queue so concurrent calls don't lose writes. */
    let chain: Promise<unknown> = Promise.resolve()
    const serial = <T>(fn: () => Promise<T>): Promise<T> => {
      const next = chain.then(fn, fn)
      chain = next.catch(() => undefined)
      return next
    }

    const execOp = async (op: QueueOp): Promise<void> => {
      if (op.kind === 'delete') {
        await withTimeout(gastosStorage.deleteCredencial(op.id))
      } else {
        const password = readVault()[op.id] ?? ''
        await withTimeout(gastosStorage.saveCredencial({ ...op.meta, password }))
      }
    }

    const buildResult = (meta: CredentialMeta[], queue: QueueOp[], status: SyncStatus, syncedAt: number | null, error?: string): CredentialsListResult => {
      const vault = readVault()
      const local = readLocal()
      const items: Credential[] = applyQueue(meta, queue)
        .map((c) => ({ ...metaOf(c), hasPassword: !!vault[c.id], ...(c.pending ? { pending: true } : {}) }))
        .sort((a, b) => a.orden - b.orden)
      return { items, status, error, syncedAt, pendingCount: queue.length, favorites: local.favorites, usedAt: local.usedAt }
    }

    const currentItems = (): CredentialMeta[] => applyQueue(readCache().items, readQueue()).map(metaOf)

    const saveOne = async (draft: CredentialDraft): Promise<SaveResult> => {
      const meta = metaOf(draft)
      const password = draft.password ?? readVault()[meta.id] ?? ''
      const cache = readCache()
      const i = cache.items.findIndex((c) => c.id === meta.id)
      if (i >= 0) cache.items[i] = meta
      else cache.items.push(meta)
      writeCache(cache)
      try {
        // saveCredencial writes the local vault first, so the password survives a network failure.
        await withTimeout(gastosStorage.saveCredencial({ ...meta, password }))
        writeQueue(dequeue(readQueue(), meta.id))
        return { ok: true, queued: false }
      } catch (err) {
        if (classify(err) !== 'offline') {
          // Not a connectivity problem (e.g. schema error): keep it queued anyway so nothing is lost.
          logger.warn('credentials', `Guardado remoto falló, queda pendiente: ${errText(err)}`)
        }
        writeQueue(enqueue(readQueue(), { kind: 'upsert', id: meta.id, meta, at: Date.now() }))
        return { ok: true, queued: true, error: friendlyError(err) }
      }
    }

    // ── PIN lock ───────────────────────────────────────────────────────────
    let unlockedUntil = 0
    let failedAttempts = 0
    let blockedUntil = 0
    let blurTimer: ReturnType<typeof setTimeout> | null = null

    const readPin = (): PinData | null => {
      const p = db.readEncryptedJSON<PinData>(PIN_FILE)
      return p && typeof p.salt === 'string' && typeof p.hash === 'string' ? p : null
    }
    const pinMinutes = (): number => readPin()?.minutes ?? 5
    const isUnlocked = (): boolean => !readPin() || Date.now() < unlockedUntil
    /** Sliding window: every secret access extends the unlock. */
    const touchUnlock = (): void => {
      const p = readPin()
      if (p) unlockedUntil = Date.now() + p.minutes * 60_000
    }
    const hashPin = (pin: string, salt: string): string => crypto.scryptSync(pin, salt, 32).toString('hex')
    const checkPin = (pin: string, p: PinData): boolean => {
      const a = Buffer.from(hashPin(pin, p.salt), 'hex')
      const b = Buffer.from(p.hash, 'hex')
      return a.length === b.length && crypto.timingSafeEqual(a, b)
    }
    const validPin = (pin: unknown): pin is string => typeof pin === 'string' && /^\d{4,12}$/.test(pin)
    const lockStatus = (): LockStatus => ({ pinEnabled: !!readPin(), unlocked: isUnlocked(), minutes: pinMinutes() })

    /** Lock N minutes after the app loses focus. */
    app.on('browser-window-blur', () => {
      if (!readPin()) return
      if (blurTimer) clearTimeout(blurTimer)
      blurTimer = setTimeout(() => { unlockedUntil = 0; blurTimer = null }, pinMinutes() * 60_000)
    })
    app.on('browser-window-focus', () => {
      if (blurTimer) clearTimeout(blurTimer)
      blurTimer = null
    })

    let pendingImport: { token: string; rows: ImportedCredential[] } | null = null

    // ── IPC ────────────────────────────────────────────────────────────────

    /**
     * Copies a secret to the system clipboard and clears it after `clearAfterMs`
     * if it still holds the same value. Done in main so it works even when the
     * window is not focused. The value is never logged.
     */
    registerHandler(ipcMain, 'credentials:copy-secret', (_e, text: string, clearAfterMs?: number) => {
      if (typeof text !== 'string') throw new Error('Valor inválido')
      writeClipboard(text, typeof clearAfterMs === 'number' ? clearAfterMs : 0)
      return { ok: true }
    })

    /** List: uploads pending writes, loads from Supabase and refreshes the cache; falls back to the cache. */
    let lastStatus: { status: SyncStatus; error?: string } | null = null

    registerHandler(ipcMain, 'credentials:list', (_e, opts?: { localOnly?: boolean }) => {
      // Instant answer from the local copy (first paint, Ctrl+K) — no network.
      if (opts?.localOnly) {
        const cache = readCache()
        const st = lastStatus ?? { status: (cache.syncedAt ? 'synced' : 'offline') as SyncStatus }
        return buildResult(cache.items, readQueue(), st.status, cache.syncedAt, st.error)
      }
      return serial(async () => {
        const r = await syncList()
        lastStatus = { status: r.status, error: r.error }
        return r
      })
    })

    const syncList = async (): Promise<CredentialsListResult> => {
      let queue = readQueue()
      let flushError: string | undefined
      try {
        if (queue.length) {
          const r = await flushQueue(queue, execOp)
          queue = r.remaining
          writeQueue(queue)
          flushError = r.error
          if (r.error && classify(r.error) === 'offline') throw new Error(r.error)
        }
        const data = await withTimeout(gastosStorage.load())
        const meta = (data.credenciales ?? []).map(metaOf)
        const syncedAt = Date.now()
        writeCache({ items: meta, syncedAt })
        return buildResult(meta, queue, flushError ? 'error' : 'synced', syncedAt, flushError ? friendlyError(flushError) : undefined)
      } catch (err) {
        const cache = readCache()
        return buildResult(cache.items, queue, classify(err), cache.syncedAt, friendlyError(err))
      }
    }

    registerHandler(ipcMain, 'credentials:save', (_e, draft: CredentialDraft) => {
      validateDraft(draft)
      return serial(() => saveOne(draft))
    })

    registerHandler(ipcMain, 'credentials:delete', (_e, id: string) => {
      if (typeof id !== 'string' || !id) throw new Error('Id inválido')
      return serial(async (): Promise<SaveResult> => {
        const cache = readCache()
        writeCache({ ...cache, items: cache.items.filter((c) => c.id !== id) })
        const local = readLocal()
        delete local.usedAt[id]
        writeLocal({ favorites: local.favorites.filter((f) => f !== id), usedAt: local.usedAt })
        try {
          await withTimeout(gastosStorage.deleteCredencial(id))
          writeQueue(dequeue(readQueue(), id))
          return { ok: true, queued: false }
        } catch (err) {
          writeQueue(enqueue(readQueue(), { kind: 'delete', id, at: Date.now() }))
          return { ok: true, queued: true, error: friendlyError(err) }
        }
      })
    })

    registerHandler(ipcMain, 'credentials:toggle-favorite', (_e, id: string) => {
      if (typeof id !== 'string' || !id) throw new Error('Id inválido')
      const l = readLocal()
      l.favorites = l.favorites.includes(id) ? l.favorites.filter((f) => f !== id) : [...l.favorites, id]
      writeLocal(l)
      return l.favorites
    })

    registerHandler(ipcMain, 'credentials:mark-used', (_e, id: string) => {
      if (typeof id !== 'string' || !id) throw new Error('Id inválido')
      return markUsed(id)
    })

    /** Copies the stored password (it never crosses to the renderer); clears the clipboard after 30 s. */
    registerHandler(ipcMain, 'credentials:copy-password', (_e, id: string): SecretResult<{ usedAt: number }> => {
      if (!isUnlocked()) return { ok: false, locked: true }
      const pwd = readVault()[id]
      if (!pwd) throw new Error('No hay contraseña guardada en esta computadora')
      writeClipboard(pwd, PASSWORD_CLEAR_MS)
      touchUnlock()
      return { ok: true, usedAt: markUsed(id) }
    })

    /** Returns one password in plaintext (reveal / edit). Respects the PIN lock. */
    registerHandler(ipcMain, 'credentials:reveal', (_e, id: string): SecretResult<{ password: string }> => {
      if (!isUnlocked()) return { ok: false, locked: true }
      touchUnlock()
      return { ok: true, password: readVault()[id] ?? '' }
    })

    /** Weak and reused passwords, computed here so other items' passwords never reach the renderer. */
    registerHandler(ipcMain, 'credentials:password-audit', (): PasswordAudit => {
      const vault = readVault()
      const byHash = new Map<string, string[]>()
      const weak: string[] = []
      const scores: Record<string, number> = {}
      for (const c of currentItems()) {
        const pwd = vault[c.id]
        if (!pwd) continue
        const score = estimateStrength(pwd).score
        scores[c.id] = score
        if (score <= WEAK_MAX_SCORE) weak.push(c.id)
        const h = sha(pwd)
        byHash.set(h, [...(byHash.get(h) ?? []), c.id])
      }
      return { weak, reused: [...byHash.values()].filter((g) => g.length > 1), scores }
    })

    /** Ids of other credentials that use `password` (edit form warning). */
    registerHandler(ipcMain, 'credentials:check-reuse', (_e, password: string, excludeId?: string): string[] => {
      if (typeof password !== 'string' || !password) return []
      const vault = readVault()
      const ids = new Set(currentItems().map((c) => c.id))
      return Object.entries(vault)
        .filter(([id, pwd]) => id !== excludeId && ids.has(id) && pwd === password)
        .map(([id]) => id)
    })

    // ── Lock ───────────────────────────────────────────────────────────────
    registerHandler(ipcMain, 'credentials:lock-status', (): LockStatus => lockStatus())

    registerHandler(ipcMain, 'credentials:lock', (): LockStatus => {
      unlockedUntil = 0
      return lockStatus()
    })

    registerHandler(ipcMain, 'credentials:pin-verify', (_e, pin: string): PinVerifyResult => {
      const p = readPin()
      if (!p) return { ok: true }
      const now = Date.now()
      if (now < blockedUntil) return { ok: false, retryInMs: blockedUntil - now }
      if (typeof pin === 'string' && checkPin(pin, p)) {
        failedAttempts = 0
        unlockedUntil = now + p.minutes * 60_000
        return { ok: true }
      }
      failedAttempts++
      if (failedAttempts >= 5) {
        const ms = Math.min(30_000 * 2 ** (failedAttempts - 5), 5 * 60_000)
        blockedUntil = now + ms
        return { ok: false, retryInMs: ms }
      }
      return { ok: false }
    })

    /**
     * Enables, changes or disables the PIN. `pin: null` disables, `pin: undefined`
     * only updates `minutes`. With a PIN already set, `currentPin` is required
     * (or, to change only the minutes, being unlocked).
     */
    registerHandler(ipcMain, 'credentials:pin-set', (_e, payload: { pin?: string | null; currentPin?: string; minutes?: number }): LockStatus => {
      if (!payload || typeof payload !== 'object') throw new Error('Payload inválido')
      const existing = readPin()
      const minutes = Math.min(120, Math.max(1, Math.round(Number(payload.minutes ?? existing?.minutes ?? 5)) || 5))
      if (existing) {
        const authorized = (typeof payload.currentPin === 'string' && checkPin(payload.currentPin, existing)) ||
          (payload.pin === undefined && isUnlocked())
        if (!authorized) {
          throw new Error(payload.pin === undefined ? 'Desbloqueá las credenciales para cambiar este ajuste' : 'El PIN actual no es correcto')
        }
      }
      if (payload.pin === null) {
        fs.rmSync(path.join(app.getPath('userData'), PIN_FILE), { force: true })
        unlockedUntil = 0
        return lockStatus()
      }
      if (payload.pin === undefined) {
        if (!existing) throw new Error('No hay PIN configurado')
        db.writeEncryptedJSON(PIN_FILE, { ...existing, minutes } satisfies PinData)
        return lockStatus()
      }
      if (!validPin(payload.pin)) throw new Error('El PIN tiene que tener entre 4 y 12 números')
      const salt = crypto.randomBytes(16).toString('hex')
      db.writeEncryptedJSON(PIN_FILE, { salt, hash: hashPin(payload.pin, salt), minutes } satisfies PinData)
      unlockedUntil = Date.now() + minutes * 60_000
      return lockStatus()
    })

    // ── Import / export ────────────────────────────────────────────────────

    /** Opens a CSV, parses it here and returns a preview without passwords. */
    registerHandler(ipcMain, 'credentials:import-pick', async (): Promise<ImportPreview | { canceled: true } | { error: string }> => {
      const { filePaths, canceled } = await dialog.showOpenDialog({
        title: 'Importar contraseñas (CSV)',
        filters: [{ name: 'CSV', extensions: ['csv'] }],
        properties: ['openFile'],
      })
      const file = filePaths[0]
      if (canceled || !file) return { canceled: true }
      if (fs.statSync(file).size > MAX_IMPORT_BYTES) return { error: 'El archivo es demasiado grande (máx. 5 MB)' }
      const parsed = parseCredentialsCsv(fs.readFileSync(file, 'utf-8'))
      if (parsed.error) return { error: parsed.error }
      const dup = markDuplicates(parsed.rows, currentItems())
      const token = crypto.randomUUID()
      pendingImport = { token, rows: parsed.rows }
      return {
        token,
        fileName: path.basename(file),
        format: parsed.format,
        skipped: parsed.skipped,
        rows: parsed.rows.map((r, index) => ({
          index, nombre: r.nombre, usuario: r.usuario, url: r.url, categoria: r.categoria,
          hasPassword: !!r.password, duplicate: dup[index] ?? false,
        })),
      }
    })

    registerHandler(ipcMain, 'credentials:import-commit', (_e, token: string, indexes: number[]) => {
      if (!pendingImport || pendingImport.token !== token) throw new Error('La importación expiró; elegí el archivo de nuevo')
      if (!Array.isArray(indexes)) throw new Error('Payload inválido')
      const { rows } = pendingImport
      pendingImport = null
      return serial(async () => {
        let orden = currentItems().reduce((m, c) => Math.max(m, c.orden), 0)
        let imported = 0
        let queued = 0
        for (const i of [...new Set(indexes)]) {
          const r = typeof i === 'number' ? rows[i] : undefined
          if (!r) continue
          const res = await saveOne({ id: crypto.randomUUID(), ...r, orden: ++orden })
          imported++
          if (res.queued) queued++
        }
        return { imported, queued }
      })
    })

    registerHandler(ipcMain, 'credentials:import-cancel', () => {
      pendingImport = null
    })

    /** Exports every credential with its password in plaintext (CSV, Chrome/Edge format). */
    registerHandler(ipcMain, 'credentials:export-csv', async (): Promise<SecretResult<{ canceled?: boolean; filePath?: string; count?: number }>> => {
      if (!isUnlocked()) return { ok: false, locked: true }
      const { filePath, canceled } = await dialog.showSaveDialog({
        title: 'Exportar contraseñas (sin cifrar)',
        defaultPath: `credenciales-${new Date().toISOString().slice(0, 10)}.csv`,
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      })
      if (canceled || !filePath) return { ok: true, canceled: true }
      const vault = readVault()
      const items = currentItems().map((c) => ({ ...c, password: vault[c.id] ?? '' }))
      fs.writeFileSync(filePath, credentialsToCsv(items), { encoding: 'utf-8', mode: 0o600 })
      touchUnlock()
      logger.info('credentials', `Exportadas ${items.length} credenciales a CSV`)
      return { ok: true, filePath, count: items.length }
    })
  },
}
