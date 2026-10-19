import fs from 'fs'
import os from 'os'
import path from 'path'
import { createHash } from 'crypto'
import { app, shell } from 'electron'
import type { BrowserWindow, IpcMain } from 'electron'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DatabaseService } from './db.service'
import type { SettingsService } from './settings.service'
import type { GastosStorageService } from './gastos-storage.service'
import { createSupabaseClient } from './supabase-client'
import { conflictCopyId, markConflictContent, planSync, syncGuard, type LocalItem, type RemoteItem, type SyncOp } from './sync-plan'
import { isValidNoteId } from '../../plugins/notes/notes-utils'
import type { Snippet, SnippetCollection } from '../../../src/plugins/snippets/types'
import { logger } from '../logger'

/**
 * Sincroniza Notas y Snippets con la tabla `setto_sync` del mismo Supabase de
 * Gastos (supabase/migrations/003_setto_sync.sql). Opcional: Ajustes →
 * Sincronización. La lógica de quién gana está en sync-plan.ts; acá sólo se lee
 * y escribe cada lado.
 *
 * Reglas de seguridad:
 * - Antes de pisar o borrar algo local se vuelve a leer: si cambió mientras se
 *   sincronizaba, se saltea (queda para la próxima).
 * - Las notas borradas por sincronización van a la papelera del sistema.
 * - Conflicto en una nota: se conserva la local y la remota queda como copia
 *   "(conflicto fecha)". En snippets gana el cambio más reciente.
 */

type Kind = 'note' | 'snippet' | 'snippet-collection'
const KINDS: Kind[] = ['note', 'snippet', 'snippet-collection']
const TABLE = 'setto_sync'
const STATE_FILE = 'sync-state.json'
const SNIPPETS_FILE = 'snippets.json'
const COLLECTIONS_FILE = 'snippets-collections.json'
const NOTES_CONFIG = 'notes-config.json'
const MAX_NOTE_BYTES = 5 * 1024 * 1024
const PAGE = 1000
const CHUNK = 100
export const SYNC_SETTING = 'sync.notes_snippets'
const AUTO_FIRST_MS = 20_000
const AUTO_EVERY_MS = 5 * 60_000

interface SyncState {
  base: Record<Kind, Record<string, string>>
  lastSync: number | null
  lastError: string | null
  lastSummary: SyncSummary | null
}

export interface SyncSummary { pushed: number; pulled: number; deleted: number; conflicts: number; skipped: number }

interface LocalEntry extends LocalItem { payload: unknown }

interface Adapter {
  kind: Kind
  read(): Map<string, LocalEntry>
  /** Hash actual de un ítem (undefined si no existe), sin leer todo. */
  hashOf(id: string): string | undefined
  write(id: string, payload: unknown): void
  remove(id: string): Promise<void>
}

const sha = (s: string): string => createHash('sha256').update(s).digest('hex')

/** JSON con claves ordenadas: el mismo objeto siempre da el mismo hash. */
function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as object).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`).join(',')}}`
  }
  return JSON.stringify(v)
}

/** Lo que viaja de un snippet: sin contadores de uso (son de cada máquina). */
function snippetPayload(s: Snippet): Omit<Snippet, 'lastUsedAt' | 'useCount'> {
  const { lastUsedAt: _u, useCount: _c, ...rest } = s
  return rest
}

export class SyncService {
  private running = false
  private timers: ReturnType<typeof setTimeout>[] = []

  constructor(
    private db: DatabaseService,
    private settings: SettingsService,
    private gastos: GastosStorageService,
    private getWindow: () => BrowserWindow | null,
  ) {}

  // ── Estado ────────────────────────────────────────────────────────────────

  private readState(): SyncState {
    const s = this.db.readJSON<Partial<SyncState>>(STATE_FILE)
    const base = (s?.base ?? {}) as Partial<SyncState['base']>
    return {
      base: { note: base.note ?? {}, snippet: base.snippet ?? {}, 'snippet-collection': base['snippet-collection'] ?? {} },
      lastSync: s?.lastSync ?? null,
      lastError: s?.lastError ?? null,
      lastSummary: s?.lastSummary ?? null,
    }
  }

  private writeState(s: SyncState): void {
    this.db.writeJSON(STATE_FILE, s)
  }

  enabled(): boolean {
    return this.settings.get(SYNC_SETTING) === '1'
  }

  status(): { enabled: boolean; configured: boolean; running: boolean; lastSync: number | null; lastError: string | null; lastSummary: SyncSummary | null } {
    const { url, key } = this.gastos.resolveSupabaseCredentials()
    const st = this.readState()
    return { enabled: this.enabled(), configured: Boolean(url && key), running: this.running, lastSync: st.lastSync, lastError: st.lastError, lastSummary: st.lastSummary }
  }

  // ── Adaptadores locales ───────────────────────────────────────────────────

  private notesDir(): string {
    const cfg = this.db.readJSON<{ dir?: string }>(NOTES_CONFIG)
    const custom = cfg?.dir && path.isAbsolute(cfg.dir) ? cfg.dir : null
    const dir = custom ?? path.join(app.getPath('userData'), 'notes')
    // Una carpeta elegida por el usuario (disco externo, red) que no está NO se
    // recrea vacía: se vería como "borré todas las notas" y se propagaría a la nube.
    if (custom && !fs.existsSync(custom)) throw new Error(`No se encuentra la carpeta de notas (${custom}). Conectala o elegí otra antes de sincronizar.`)
    fs.mkdirSync(dir, { recursive: true })
    try {
      fs.accessSync(dir, fs.constants.R_OK | fs.constants.W_OK)
    } catch {
      throw new Error(`No se puede leer o escribir la carpeta de notas (${dir}).`)
    }
    return dir
  }

  private notesAdapter(): Adapter {
    const dir = this.notesDir()
    const full = (id: string): string => {
      if (!isValidNoteId(id)) throw new Error(`Id de nota inválido: ${id}`)
      const p = path.resolve(dir, id)
      if (path.dirname(p) !== path.resolve(dir)) throw new Error('Ruta de nota inválida')
      return p
    }
    return {
      kind: 'note',
      read: () => {
        const out = new Map<string, LocalEntry>()
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          if (!e.isFile() || !isValidNoteId(e.name)) continue
          try {
            const p = path.join(dir, e.name)
            const st = fs.statSync(p)
            if (st.size > MAX_NOTE_BYTES) continue
            const content = fs.readFileSync(p, 'utf-8')
            out.set(e.name, { hash: sha(content), updatedAt: Math.round(st.mtimeMs), payload: { content } })
          } catch { /* ilegible: se saltea */ }
        }
        return out
      },
      hashOf: (id) => {
        try { return sha(fs.readFileSync(full(id), 'utf-8')) } catch { return undefined }
      },
      write: (id, payload) => {
        const content = (payload as { content?: unknown } | null)?.content
        if (typeof content !== 'string') throw new Error('Nota remota sin contenido')
        const p = full(id)
        fs.writeFileSync(`${p}.tmp`, content, 'utf-8')
        fs.renameSync(`${p}.tmp`, p)
      },
      remove: async (id) => {
        const p = full(id)
        if (!fs.existsSync(p)) return
        try { await shell.trashItem(p) } catch { fs.unlinkSync(p) }
      },
    }
  }

  private jsonListAdapter<T extends { id: string }>(
    kind: Kind, file: string, toPayload: (x: T) => unknown, updatedAt: (x: T) => number, merge: (incoming: T, current: T | undefined) => T,
  ): Adapter {
    const readAll = (): T[] => this.db.readJSON<T[]>(file) ?? []
    return {
      kind,
      read: () => new Map(readAll().map((x) => {
        const payload = toPayload(x)
        return [x.id, { hash: sha(stableJson(payload)), updatedAt: updatedAt(x), payload }]
      })),
      hashOf: (id) => {
        const x = readAll().find((y) => y.id === id)
        return x ? sha(stableJson(toPayload(x))) : undefined
      },
      write: (id, payload) => {
        const all = readAll()
        const idx = all.findIndex((x) => x.id === id)
        const next = merge({ ...(payload as T), id }, idx >= 0 ? all[idx] : undefined)
        if (idx >= 0) all[idx] = next
        else all.unshift(next)
        this.db.writeJSON(file, all)
      },
      remove: async (id) => {
        this.db.writeJSON(file, readAll().filter((x) => x.id !== id))
      },
    }
  }

  private adapters(): Adapter[] {
    return [
      this.notesAdapter(),
      this.jsonListAdapter<Snippet>('snippet', SNIPPETS_FILE, snippetPayload,
        (s) => Date.parse(s.updatedAt) || 0,
        (incoming, cur) => ({ ...incoming, lastUsedAt: cur?.lastUsedAt, useCount: cur?.useCount })),
      this.jsonListAdapter<SnippetCollection>('snippet-collection', COLLECTIONS_FILE, (c) => c,
        (c) => Date.parse(c.createdAt) || 0, (incoming) => incoming),
    ]
  }

  // ── Remoto ────────────────────────────────────────────────────────────────

  /** Protegido para poder reemplazarlo en tests con un Supabase en memoria. */
  protected client(): SupabaseClient {
    const { url, key } = this.gastos.resolveSupabaseCredentials()
    if (!url || !key) throw new Error('Supabase no está configurado (Conexiones → Supabase)')
    return createSupabaseClient(url, key)
  }

  private static friendly(err: { message?: string; code?: string } | null): Error {
    const msg = err?.message ?? 'Error desconocido'
    if (err?.code === '42P01' || err?.code === 'PGRST205' || /setto_sync/.test(msg) && /exist|find/i.test(msg)) {
      return new Error('Falta la tabla setto_sync en Supabase: corré supabase/migrations/003_setto_sync.sql en el SQL Editor')
    }
    return new Error(msg)
  }

  private async remoteIndex(sb: SupabaseClient): Promise<Record<Kind, Map<string, RemoteItem>>> {
    const out = { note: new Map(), snippet: new Map(), 'snippet-collection': new Map() } as Record<Kind, Map<string, RemoteItem>>
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb.from(TABLE).select('kind,id,hash,updated_at,deleted').range(from, from + PAGE - 1)
      if (error) throw SyncService.friendly(error)
      for (const r of data ?? []) {
        const kind = r.kind as Kind
        if (KINDS.includes(kind)) out[kind].set(r.id as string, { hash: r.hash as string, updatedAt: Number(r.updated_at), deleted: Boolean(r.deleted) })
      }
      if (!data || data.length < PAGE) break
    }
    return out
  }

  private async fetchPayloads(sb: SupabaseClient, kind: Kind, ids: string[]): Promise<Map<string, { payload: unknown; hash: string; updatedAt: number }>> {
    const out = new Map<string, { payload: unknown; hash: string; updatedAt: number }>()
    for (let i = 0; i < ids.length; i += CHUNK) {
      const { data, error } = await sb.from(TABLE).select('id,payload,hash,updated_at').eq('kind', kind).in('id', ids.slice(i, i + CHUNK))
      if (error) throw SyncService.friendly(error)
      for (const r of data ?? []) out.set(r.id as string, { payload: r.payload, hash: r.hash as string, updatedAt: Number(r.updated_at) })
    }
    return out
  }

  private async upsert(sb: SupabaseClient, rows: Record<string, unknown>[]): Promise<void> {
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await sb.from(TABLE).upsert(rows.slice(i, i + CHUNK), { onConflict: 'kind,id' })
      if (error) throw SyncService.friendly(error)
    }
  }

  // ── Sincronizar ───────────────────────────────────────────────────────────

  /** `allowMassDelete`: el usuario confirmó los borrados masivos que frena syncGuard. */
  async run(opts: { allowMassDelete?: boolean } = {}): Promise<SyncSummary> {
    if (this.running) throw new Error('Ya hay una sincronización en curso')
    this.running = true
    const state = this.readState()
    const summary: SyncSummary = { pushed: 0, pulled: 0, deleted: 0, conflicts: 0, skipped: 0 }
    const changed = new Set<Kind>()
    try {
      const sb = this.client()
      const remote = await this.remoteIndex(sb)
      const device = os.hostname()

      // Primero se planifica todo y se pasa el freno de seguridad; recién después se toca algo.
      const LABELS: Record<Kind, string> = { note: 'notas', snippet: 'snippets', 'snippet-collection': 'colecciones de snippets' }
      const plans = this.adapters().map((ad) => {
        const local = ad.read()
        return { ad, local, ops: planSync(local, remote[ad.kind], state.base[ad.kind]) }
      })
      if (!opts.allowMassDelete) {
        for (const { ad, local, ops } of plans) {
          const reason = syncGuard(LABELS[ad.kind], local.size, remote[ad.kind], ops)
          if (reason) {
            logger.warn('sync', 'sync aborted by guard', { kind: ad.kind, reason })
            throw new Error(reason)
          }
        }
      }

      for (const { ad, local, ops } of plans) {
        const base = state.base[ad.kind]
        const needPayload = ops.filter((o) => o.type === 'pull' || o.type === 'conflict').map((o) => o.id)
        const payloads = await this.fetchPayloads(sb, ad.kind, needPayload)
        const rows: Record<string, unknown>[] = []
        // La base de lo que se sube se actualiza recién cuando Supabase confirmó: si
        // la subida falla y la base ya dijera "sincronizado", la próxima vez se
        // bajaría la versión remota vieja encima de la local.
        const afterUpload: (() => void)[] = []
        const pushRow = (id: string, e: LocalEntry): void => {
          rows.push({ kind: ad.kind, id, payload: e.payload, hash: e.hash, updated_at: e.updatedAt || Date.now(), deleted: false, device })
          afterUpload.push(() => { base[id] = e.hash })
          summary.pushed++
        }
        // ¿Sigue igual que cuando se planificó? Si no, no tocar (se resuelve la próxima).
        const unchanged = (id: string): boolean => ad.hashOf(id) === local.get(id)?.hash

        for (const op of ops as SyncOp[]) {
          const id = op.id
          const l = local.get(id)
          try {
            switch (op.type) {
              case 'push': pushRow(id, l!); break
              case 'push-delete':
                rows.push({ kind: ad.kind, id, payload: null, hash: base[id], updated_at: Date.now(), deleted: true, device })
                afterUpload.push(() => { delete base[id] })
                summary.pushed++
                break
              case 'pull': {
                const r = payloads.get(id)
                if (!r || !unchanged(id)) { summary.skipped++; break }
                ad.write(id, r.payload)
                base[id] = r.hash
                summary.pulled++
                changed.add(ad.kind)
                break
              }
              case 'delete-local':
                if (!unchanged(id)) { summary.skipped++; break }
                await ad.remove(id)
                delete base[id]
                summary.deleted++
                changed.add(ad.kind)
                break
              case 'conflict': {
                const r = payloads.get(id)
                if (!r || !unchanged(id)) { summary.skipped++; break }
                summary.conflicts++
                if (ad.kind === 'note') {
                  // Se queda la local; la remota se guarda aparte para no perder nada.
                  const now = new Date()
                  const copy = conflictCopyId(id, new Set(local.keys()), now)
                  const remoteContent = (r.payload as { content?: unknown } | null)?.content
                  ad.write(copy, { content: markConflictContent(typeof remoteContent === 'string' ? remoteContent : '', now) })
                  changed.add(ad.kind)
                  pushRow(id, l!)
                } else if (r.updatedAt > l!.updatedAt) {
                  ad.write(id, r.payload)
                  base[id] = r.hash
                  changed.add(ad.kind)
                } else {
                  pushRow(id, l!)
                }
                break
              }
              case 'in-sync': base[id] = l!.hash; break
              case 'forget': delete base[id]; break
            }
          } catch (err) {
            summary.skipped++
            logger.warn('sync', `${ad.kind} ${id}: ${op.type} falló`, err instanceof Error ? err.message : String(err))
          }
        }
        await this.upsert(sb, rows)
        afterUpload.forEach((f) => f())
      }
      state.lastSync = Date.now()
      state.lastError = null
      state.lastSummary = summary
      return summary
    } catch (err) {
      state.lastError = err instanceof Error ? err.message : String(err)
      throw err
    } finally {
      this.writeState(state)
      this.running = false
      const win = this.getWindow()
      if (changed.size && win && !win.isDestroyed()) {
        win.webContents.send('sync:changed', { notes: changed.has('note'), snippets: changed.has('snippet') || changed.has('snippet-collection') })
      }
    }
  }

  // ── IPC + automático ──────────────────────────────────────────────────────

  register(ipcMain: IpcMain): void {
    ipcMain.handle('sync:status', () => this.status())
    ipcMain.handle('sync:run', async (_e, opts?: { allowMassDelete?: unknown }) => {
      try {
        return { ok: true, summary: await this.run({ allowMassDelete: opts?.allowMassDelete === true }) }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    })
    ipcMain.handle('sync:set-enabled', (_e, on: unknown) => {
      this.settings.set(SYNC_SETTING, on === true ? '1' : '0')
      this.schedule()
      return this.status()
    })
    this.schedule()
  }

  private schedule(): void {
    this.timers.forEach(clearTimeout)
    this.timers = []
    if (!this.enabled()) return
    const tick = (): void => {
      if (!this.enabled()) return
      this.run().catch((err) => logger.warn('sync', 'sincronización automática falló', err instanceof Error ? err.message : String(err)))
    }
    this.timers.push(setTimeout(tick, AUTO_FIRST_MS))
    this.timers.push(setInterval(tick, AUTO_EVERY_MS) as unknown as ReturnType<typeof setTimeout>)
  }

  stop(): void {
    this.timers.forEach((t) => { clearTimeout(t); clearInterval(t as unknown as ReturnType<typeof setInterval>) })
    this.timers = []
  }
}
