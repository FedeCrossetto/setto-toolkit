import { app, BrowserWindow, dialog, safeStorage, shell } from 'electron'
import type { IpcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import type { CoreServices, PluginHandlers } from '../../core/types'
import { registerHandler } from '../../core/ipc-handler'
import { logger } from '../../core/logger'
import { isSensitive, redactSecrets } from '../../../src/core/clip-utils'
import { uniqueExportNames } from '../../../src/plugins/captures/naming'
import { isValidCaptureFile } from '../captures/captures-utils'
import type { CaptureEntry } from '../../../src/plugins/captures/types'
import type { Snippet } from '../../../src/plugins/snippets/types'
import type { RecentFile } from '../../../src/plugins/file-editor/types'
import {
  buildIndex, detailFor, normalizeKey, summarize,
  type SourceItem, type TicketDetail, type TicketIndex, type TicketsMeta, type TicketSummary,
} from '../../../src/plugins/tickets/logic'

/**
 * Tickets: una página por ticket con todo lo que lo menciona (capturas, notas,
 * snippets, copiados, archivos recientes).
 *
 * Índice en memoria, incremental por fuente: cada fuente se vuelve a leer sólo
 * si cambió su archivo (mtime) — captures.json al cambiar las capturas, los
 * archivos cifrados del historial del portapapeles al copiar algo, cada nota por
 * su propio mtime. Los copiados sensibles nunca se persisten y además se
 * descartan acá con `isSensitive`; el texto de las fuentes no sale de main.
 */

const META_KEY = 'tickets.meta'
const JIRA_KEY = 'ticket-resolver.jira_url'
const NOTES_CONFIG = 'notes-config.json'
const MAX_NOTE_BYTES = 1024 * 1024
const MAX_TEXT = 20_000
/** Varias llamadas seguidas (lista + detalle) reusan el mismo índice. */
const FRESH_MS = 1500

const userData = (f: string): string => path.join(app.getPath('userData'), f)
const mtime = (p: string): number => { try { return fs.statSync(p).mtimeMs } catch { return 0 } }
const short = (s: string, n = 160): string => { const t = s.replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t }

// ── Caché por fuente ─────────────────────────────────────────────────────────

interface Cached { sig: string; items: SourceItem[] }
const cache = new Map<string, Cached>()
function cached(name: string, sig: string, load: () => SourceItem[]): SourceItem[] {
  const c = cache.get(name)
  if (c && c.sig === sig) return c.items
  let items: SourceItem[] = []
  try { items = load() } catch (err) { logger.warn('tickets', `no se pudo leer ${name}`, err instanceof Error ? err.message : String(err)) }
  cache.set(name, { sig, items })
  return items
}

function captureItems(): SourceItem[] {
  const p = userData(path.join('captures', 'captures.json'))
  return cached('captures', String(mtime(p)), () => {
    const list = JSON.parse(fs.readFileSync(p, 'utf-8')) as CaptureEntry[]
    if (!Array.isArray(list)) return []
    return list.filter((e) => e && typeof e.file === 'string').map((e) => ({
      source: 'capture' as const, id: e.id, title: e.title || 'Captura', at: e.createdAt,
      text: [e.title, e.ticket, ...(e.tags ?? []), e.note, e.window, e.ocr].filter(Boolean).join('\n').slice(0, MAX_TEXT),
      keys: e.ticket ? [e.ticket] : [],
      detail: [e.app, e.window].filter(Boolean).join(' · '),
      extra: { file: e.file, width: e.width, height: e.height },
    }))
  })
}

/** Mismo formato que electron/core/clipboard-history.ts (fijados + recientes, cifrados con safeStorage). */
function readClipFile(file: string): { id: string; text: string; at: number; app?: string }[] {
  let raw: { enc?: boolean; data?: string }
  try { raw = JSON.parse(fs.readFileSync(userData(file), 'utf-8')) as typeof raw } catch { return [] }
  if (!raw.data) return []
  if (raw.enc && !safeStorage.isEncryptionAvailable()) return []
  const json = raw.enc ? safeStorage.decryptString(Buffer.from(raw.data, 'base64')) : raw.data
  const list = JSON.parse(json) as { id: string; text: string; at: number; app?: string }[]
  return Array.isArray(list) ? list.filter((e) => e && typeof e.text === 'string' && e.id) : []
}

function clipItems(): SourceItem[] {
  const files = ['clipboard-pins.json', 'clipboard-recent.json']
  return cached('clips', files.map((f) => mtime(userData(f))).join('|'), () => {
    const seen = new Set<string>()
    const out: SourceItem[] = []
    for (const f of files) {
      for (const e of readClipFile(f)) {
        if (seen.has(e.text) || isSensitive(e.text)) continue
        seen.add(e.text)
        const text = e.text.slice(0, MAX_TEXT)
        out.push({ source: 'clip', id: e.id, title: short(redactSecrets(text), 120), at: e.at, text, detail: e.app, extra: { full: redactSecrets(text).slice(0, 4000) } })
      }
    }
    return out
  })
}

const noteCache = new Map<string, { mtime: number; item: SourceItem }>()
function noteItems(db: CoreServices['db']): SourceItem[] {
  const cfg = db.readJSON<{ dir?: string }>(NOTES_CONFIG)
  const dir = cfg?.dir && path.isAbsolute(cfg.dir) ? cfg.dir : userData('notes')
  let names: string[]
  try { names = fs.readdirSync(dir).filter((n) => /\.md$/i.test(n) && !n.startsWith('.')) } catch { return [] }
  const out: SourceItem[] = []
  const alive = new Set<string>()
  for (const id of names) {
    const full = path.join(dir, id)
    alive.add(full)
    let st: fs.Stats
    try { st = fs.statSync(full) } catch { continue }
    if (!st.isFile() || st.size > MAX_NOTE_BYTES) continue
    const hit = noteCache.get(full)
    if (hit && hit.mtime === st.mtimeMs) { out.push(hit.item); continue }
    try {
      const content = fs.readFileSync(full, 'utf-8')
      const first = content.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? ''
      const item: SourceItem = {
        source: 'note', id, title: first.replace(/^#+\s*/, '') || id.replace(/\.md$/i, ''), at: Math.round(st.mtimeMs),
        text: `${id}\n${content}`.slice(0, MAX_TEXT * 5), detail: short(content.replace(/^#.*$/m, ''), 140),
      }
      noteCache.set(full, { mtime: st.mtimeMs, item })
      out.push(item)
    } catch { /* ilegible: se saltea */ }
  }
  for (const k of noteCache.keys()) if (!alive.has(k)) noteCache.delete(k)
  return out
}

function snippetItems(): SourceItem[] {
  const p = userData('snippets.json')
  return cached('snippets', String(mtime(p)), () => {
    const list = JSON.parse(fs.readFileSync(p, 'utf-8')) as Snippet[]
    if (!Array.isArray(list)) return []
    return list.filter((s) => s && s.id).map((s) => ({
      source: 'snippet' as const, id: s.id, title: s.title || 'Snippet', at: Date.parse(s.updatedAt) || s.lastUsedAt || 0,
      text: [s.title, (s.tags ?? []).join(' '), s.description, s.content].filter(Boolean).join('\n').slice(0, MAX_TEXT),
      detail: s.language, extra: { language: s.language },
    }))
  })
}

function fileItems(settings: CoreServices['settings']): SourceItem[] {
  const list = settings.getJSON<RecentFile[]>('editor.recentFiles') ?? []
  return list.filter((f) => f && typeof f.path === 'string').map((f) => ({
    source: 'file' as const, id: f.path, title: f.name || path.basename(f.path), at: Date.parse(f.openedAt) || 0,
    text: f.path, detail: path.dirname(f.path), extra: { path: f.path },
  }))
}

// ── Meta (fijados, agregados a mano, títulos) ────────────────────────────────

function readMeta(settings: CoreServices['settings']): TicketsMeta {
  const m = settings.getJSON<Partial<TicketsMeta>>(META_KEY) ?? {}
  const keys = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => normalizeKey(String(x))).filter((x): x is string => !!x) : [])
  return {
    pinned: keys(m.pinned), manual: keys(m.manual),
    titles: m.titles && typeof m.titles === 'object' ? m.titles : {},
  }
}

function assertKey(key: unknown): string {
  const k = typeof key === 'string' ? normalizeKey(key) : null
  if (!k) throw new Error('Clave de ticket inválida (ej. WIGOS-132764)')
  return k
}

export const handlers: PluginHandlers = {
  pluginId: 'tickets',

  register(ipcMain: IpcMain, { db, settings }: CoreServices): void {
    let built: { at: number; index: TicketIndex } | null = null
    const index = (): TicketIndex => {
      if (built && Date.now() - built.at < FRESH_MS) return built.index
      const meta = readMeta(settings)
      const items = [...captureItems(), ...clipItems(), ...noteItems(db), ...snippetItems(), ...fileItems(settings)]
      built = { at: Date.now(), index: buildIndex(items, [...meta.pinned, ...meta.manual]) }
      return built.index
    }
    const writeMeta = (fn: (m: TicketsMeta) => void): TicketsMeta => {
      const m = readMeta(settings)
      fn(m)
      settings.setJSON(META_KEY, m)
      built = null
      return m
    }

    registerHandler(ipcMain, 'tickets:list', (): TicketSummary[] => summarize(index(), readMeta(settings)))

    registerHandler(ipcMain, 'tickets:get', (_e, key: string): TicketDetail =>
      detailFor(assertKey(key), index(), readMeta(settings), settings.get(JIRA_KEY)))

    registerHandler(ipcMain, 'tickets:pin', (_e, key: string, pinned: boolean) => {
      const k = assertKey(key)
      writeMeta((m) => { m.pinned = m.pinned.filter((x) => x !== k); if (pinned) m.pinned.unshift(k) })
      return { ok: true }
    })

    registerHandler(ipcMain, 'tickets:add', (_e, key: string) => {
      const k = assertKey(key)
      writeMeta((m) => { if (!m.manual.includes(k)) m.manual.unshift(k) })
      return k
    })

    /** Quita un ticket agregado a mano / fijado (lo detectado sigue apareciendo). */
    registerHandler(ipcMain, 'tickets:forget', (_e, key: string) => {
      const k = assertKey(key)
      writeMeta((m) => { m.manual = m.manual.filter((x) => x !== k); m.pinned = m.pinned.filter((x) => x !== k); delete m.titles[k] })
      return { ok: true }
    })

    registerHandler(ipcMain, 'tickets:set-title', (_e, key: string, title: string) => {
      const k = assertKey(key)
      const t = typeof title === 'string' ? title.trim().slice(0, 200) : ''
      writeMeta((m) => { if (t) m.titles[k] = t; else delete m.titles[k] })
      return { ok: true }
    })

    /** Carpeta `<elegida>/<KEY>` con las imágenes (mismos nombres que el comentario) y `<KEY>.md`. */
    registerHandler(ipcMain, 'tickets:export', async (event, key: string, markdown: string) => {
      const k = assertKey(key)
      if (typeof markdown !== 'string') throw new Error('Contenido inválido')
      const win = BrowserWindow.fromWebContents(event.sender)
      const opts = { title: `Exportar ${k} a…`, properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[] }
      const { canceled, filePaths } = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
      if (canceled || !filePaths[0]) return { canceled: true }
      const out = path.join(filePaths[0], k)
      fs.mkdirSync(out, { recursive: true })
      const caps = (index().get(k) ?? []).filter((r) => r.source === 'capture')
      const all = new Map(captureItems().map((c) => [c.id, c]))
      const entries = caps.map((r) => all.get(r.id)!).filter(Boolean)
        .map((c) => ({ file: String(c.extra!.file), title: c.title, createdAt: c.at, ticket: k }))
        .sort((a, b) => a.createdAt - b.createdAt)
      const names = uniqueExportNames(entries)
      let images = 0
      entries.forEach((e, i) => {
        if (!isValidCaptureFile(e.file)) return
        try { fs.copyFileSync(userData(path.join('captures', e.file)), path.join(out, names[i]!)); images++ } catch { /* borrada */ }
      })
      fs.writeFileSync(path.join(out, `${k}.md`), markdown, 'utf-8')
      void shell.openPath(out)
      return { dir: out, images }
    })
  },
}
