import { app, clipboard, Notification, safeStorage, shell } from 'electron'
import type { IpcMain } from 'electron'
import { createHash, randomUUID } from 'crypto'
import fs from 'fs'
import path from 'path'
import { detectKind, isSensitive, maskSecret, type ClipKind } from '../../src/core/clip-utils'
import { foregroundWindow } from './win-helper'
import { normalizeSource } from '../plugins/captures/captures-utils'
import { logger } from './logger'

/**
 * Historial del portapapeles (texto).
 *
 * - Los **fijados** y los **últimos RECENT_KEEP** se guardan cifrados con safeStorage
 *   (`clipboard-pins.json` / `clipboard-recent.json`); el resto vive sólo en memoria.
 * - Cada texto lleva su tipo (ticket, ruta, JSON, tabla…) y la app de donde salió.
 * - Lo que parece contraseña/token se guarda **enmascarado** hacia el renderer y se
 *   borra solo a los SENSITIVE_TTL_MS. No se puede fijar.
 * - Cola de "pegado en secuencia": se cargan varios textos y cada atajo pega el siguiente.
 *
 * Nunca guarda: lo que copia Credenciales (`ignoreClipboardText`), lo que otras apps
 * marcan como privado (gestores de contraseñas), textos vacíos o enormes.
 */
export interface ClipEntry {
  id: string
  text: string
  at: number
  kind: ClipKind
  sensitive: boolean
  pinned: boolean
  app?: string
}

/** Lo que viaja al renderer: los sensibles sin el texto real. */
export type ClipEntryView = Omit<ClipEntry, 'text'> & { text: string; masked?: string }

const POLL_MS = 800
const MAX_ENTRIES = 80
const MAX_TEXT = 20_000
const SENSITIVE_TTL_MS = 60_000
const PINS_FILE = 'clipboard-pins.json'
const RECENT_FILE = 'clipboard-recent.json'
/** Cuántos textos (no fijados ni sensibles) sobreviven al cerrar la app. */
const RECENT_KEEP = 20
/** Formatos que, con sólo estar, marcan el contenido como privado. */
const PRIVATE_FORMATS = ['ExcludeClipboardContentFromMonitorProcessing', 'Clipboard Viewer Ignore']

let entries: ClipEntry[] = []
let last = ''
let timer: ReturnType<typeof setInterval> | null = null
let sweeper: ReturnType<typeof setInterval> | null = null
const ignored = new Set<string>()
const addedListeners = new Set<(kind: ClipKind) => void>()

/** Aviso de copia nueva (sin el texto: sólo el tipo). Lo usa la barra flotante. */
export function onClipAdded(cb: (kind: ClipKind) => void): () => void {
  addedListeners.add(cb)
  return () => { addedListeners.delete(cb) }
}

const digest = (text: string): string => createHash('sha256').update(text).digest('hex')

/** Para Credenciales: este texto no entra al historial (se guarda sólo el hash). */
export function ignoreClipboardText(text: string): void {
  ignored.add(digest(text))
  if (ignored.size > 200) ignored.delete(ignored.values().next().value!)
  entries = entries.filter((e) => e.text !== text)
  last = text
}

/** Lo que hay en el portapapeles lo marcó como privado otra app (gestores de contraseñas). */
export function isPrivateClipboard(): boolean {
  try {
    const formats = clipboard.availableFormats().map((x) => x.toLowerCase())
    if (PRIVATE_FORMATS.some((f) => formats.includes(f.toLowerCase()))) return true
    // CanIncludeInClipboardHistory = DWORD 0 → la app pidió que no se guarde.
    if (formats.includes('canincludeinclipboardhistory')) {
      const buf = clipboard.readBuffer('CanIncludeInClipboardHistory')
      return buf.length >= 4 && buf.readUInt32LE(0) === 0
    }
    return false
  } catch {
    return false
  }
}

// ── Persistencia (fijados y últimos RECENT_KEEP, cifrados) ───────────────────

const dataPath = (file: string): string => path.join(app.getPath('userData'), file)

function readEncrypted(file: string): ClipEntry[] {
  try {
    const raw = JSON.parse(fs.readFileSync(dataPath(file), 'utf-8')) as { enc?: boolean; data?: string }
    if (!raw.data) return []
    const json = raw.enc ? safeStorage.decryptString(Buffer.from(raw.data, 'base64')) : raw.data
    const list = JSON.parse(json) as ClipEntry[]
    // El tipo se recalcula: la detección mejora entre versiones.
    return Array.isArray(list) ? list.filter((e) => typeof e.text === 'string' && e.id).map((e) => ({ ...e, kind: detectKind(e.text), sensitive: false })) : []
  } catch {
    return []
  }
}

function writeEncrypted(file: string, list: ClipEntry[]): void {
  const json = JSON.stringify(list)
  const enc = safeStorage.isEncryptionAvailable()
  const data = enc ? safeStorage.encryptString(json).toString('base64') : json
  const p = dataPath(file)
  fs.writeFileSync(`${p}.tmp`, JSON.stringify({ v: 1, enc, data }), 'utf-8')
  fs.renameSync(`${p}.tmp`, p)
}

function loadPersisted(): ClipEntry[] {
  const pins = readEncrypted(PINS_FILE).map((e) => ({ ...e, pinned: true }))
  const recent = readEncrypted(RECENT_FILE).map((e) => ({ ...e, pinned: false }))
  const seen = new Set(pins.map((e) => e.text))
  return [...pins, ...recent.filter((e) => !seen.has(e.text))].sort((a, b) => b.at - a.at)
}

function savePins(): void {
  writeEncrypted(PINS_FILE, entries.filter((e) => e.pinned))
}

let recentTimer: ReturnType<typeof setTimeout> | null = null
/** Guarda los últimos RECENT_KEEP (no fijados, no sensibles), con un pequeño retardo. */
function saveRecentSoon(): void {
  if (recentTimer) clearTimeout(recentTimer)
  recentTimer = setTimeout(() => {
    recentTimer = null
    try { writeEncrypted(RECENT_FILE, entries.filter((e) => !e.pinned && !e.sensitive).slice(0, RECENT_KEEP)) } catch { /* best-effort */ }
  }, 1000)
}

// ── Vigilar el portapapeles ──────────────────────────────────────────────────

function add(text: string): void {
  const sensitive = isSensitive(text)
  const existing = entries.find((e) => e.text === text)
  const entry: ClipEntry = existing
    ? { ...existing, at: Date.now() }
    : { id: randomUUID(), text, at: Date.now(), kind: detectKind(text), sensitive, pinned: false }
  entries = [entry, ...entries.filter((e) => e.id !== entry.id)]
  // Tope: los fijados no cuentan ni se descartan.
  const unpinned = entries.filter((e) => !e.pinned)
  if (unpinned.length > MAX_ENTRIES) {
    const drop = new Set(unpinned.slice(MAX_ENTRIES).map((e) => e.id))
    entries = entries.filter((e) => !drop.has(e.id))
  }
  // De qué app vino (no bloquea: se completa cuando responde Windows).
  if (!existing) {
    void foregroundWindow().then((raw) => {
      const src = normalizeSource(raw)
      if (src) entry.app = src.app
      if (!sensitive) saveRecentSoon()
    }).catch(() => undefined)
  }
  if (!sensitive) saveRecentSoon()
  for (const cb of addedListeners) { try { cb(sensitive ? 'text' : entry.kind) } catch { /* nada */ } }
}

function poll(): void {
  let text: string
  try { text = clipboard.readText() } catch { return }
  if (text === last) return
  last = text
  if (!text.trim() || text.length > MAX_TEXT) return
  if (ignored.has(digest(text)) || isPrivateClipboard()) return
  add(text)
}

function sweep(): void {
  const limit = Date.now() - SENSITIVE_TTL_MS
  const before = entries.length
  entries = entries.filter((e) => !(e.sensitive && e.at < limit))
  if (entries.length !== before) logger.debug('clipboard', 'secretos vencidos borrados del historial')
}

function start(): void {
  if (timer) return
  try { last = clipboard.readText() } catch { last = '' }  // lo que ya estaba no cuenta como copia nueva
  timer = setInterval(poll, POLL_MS)
  sweeper = setInterval(sweep, 10_000)
}

function stop(): void {
  if (timer) clearInterval(timer)
  if (sweeper) clearInterval(sweeper)
  timer = null
  sweeper = null
  entries = entries.filter((e) => e.pinned)
  // Historial apagado: tampoco se conservan los últimos en disco.
  try { writeEncrypted(RECENT_FILE, []) } catch { /* nada */ }
}

const view = (e: ClipEntry): ClipEntryView => (e.sensitive ? { ...e, text: '', masked: maskSecret(e.text) } : e)

// ── Pegado en secuencia ──────────────────────────────────────────────────────

let queue: string[] = []
let queuePos = 0

export function queueState(): { total: number; pos: number; next: string | null } {
  const next = queue[queuePos]
  return { total: queue.length, pos: queuePos, next: next === undefined ? null : next.slice(0, 80) }
}

/** Siguiente texto de la secuencia (o null si no hay o terminó). Lo deja en el portapapeles. */
export function takeNextFromQueue(): { text: string; pos: number; total: number } | null {
  if (queuePos >= queue.length) return null
  const text = queue[queuePos]!
  queuePos++
  last = text   // que no vuelva a entrar al historial como copia nueva
  clipboard.writeText(text)
  if (queuePos >= queue.length && Notification.isSupported()) {
    new Notification({ title: 'Secuencia terminada', body: `Se pegaron los ${queue.length} elementos.`, silent: true }).show()
  }
  return { text, pos: queuePos, total: queue.length }
}

/** El texto real de una entrada (para pegar un sensible sin mandarlo al renderer). */
export function clipText(id: string): string | null {
  return entries.find((e) => e.id === id)?.text ?? null
}

// ── IPC ──────────────────────────────────────────────────────────────────────

/** `enabled()` lee el ajuste app.clipboard_history (default activado). */
export function registerClipboardHistory(ipcMain: IpcMain, enabled: () => boolean): void {
  entries = loadPersisted()
  if (enabled()) start()

  ipcMain.handle('clipboard:history', () => entries.map(view))
  ipcMain.handle('clipboard:clear', () => {
    entries = entries.filter((e) => e.pinned)
    saveRecentSoon()
    return { ok: true }
  })
  ipcMain.handle('clipboard:remove', (_e, id: unknown) => {
    const wasPinned = entries.some((x) => x.id === id && x.pinned)
    entries = entries.filter((x) => x.id !== id)
    if (wasPinned) savePins()
    saveRecentSoon()
    return { ok: true }
  })
  ipcMain.handle('clipboard:copy', (_e, id: unknown) => {
    const entry = entries.find((x) => x.id === id)
    if (!entry) throw new Error('Ya no está en el historial')
    clipboard.writeText(entry.text)
    last = entry.text
    entries = [{ ...entry, at: Date.now() }, ...entries.filter((x) => x.id !== id)]
    return { ok: true }
  })
  ipcMain.handle('clipboard:pin', (_e, id: unknown, pinned: unknown) => {
    const entry = entries.find((x) => x.id === id)
    if (!entry) throw new Error('Ya no está en el historial')
    if (entry.sensitive && pinned) throw new Error('Los textos que parecen contraseñas o tokens no se pueden fijar')
    entry.pinned = pinned === true
    savePins()
    saveRecentSoon()
    return view(entry)
  })
  /** Abrir una ruta copiada (carpeta o archivo). Sólo si existe. */
  ipcMain.handle('clipboard:open-path', async (_e, p: unknown) => {
    if (typeof p !== 'string' || !p.trim()) throw new Error('Ruta inválida')
    const target = p.trim().replace(/^"|"$/g, '')
    if (!fs.existsSync(target)) throw new Error('La ruta no existe en este equipo')
    if (fs.statSync(target).isDirectory()) await shell.openPath(target)
    else shell.showItemInFolder(target)
    return { ok: true }
  })
  /** Items en orden: `{ text }` o `{ id }` (un sensible se pasa por id: su texto no sale de main). */
  ipcMain.handle('clipboard:queue-set', (_e, items: unknown) => {
    const list = Array.isArray(items) ? items : []
    queue = list
      .map((it: { text?: unknown; id?: unknown }) => (typeof it?.text === 'string' ? it.text : typeof it?.id === 'string' ? clipText(it.id) : null))
      .filter((t): t is string => !!t)
      .slice(0, 100)
    queuePos = 0
    return queueState()
  })
  /** Deja el siguiente de la secuencia en el portapapeles (el renderer después pide pegar). */
  ipcMain.handle('clipboard:queue-advance', () => takeNextFromQueue())
  ipcMain.handle('clipboard:queue-state', () => queueState())
  ipcMain.handle('clipboard:queue-clear', () => { queue = []; queuePos = 0; return queueState() })
  /** Llamado desde Ajustes al cambiar el interruptor. */
  ipcMain.handle('clipboard:set-enabled', (_e, on: unknown) => {
    if (on === true) start()
    else stop()
    return { ok: true }
  })
}

export function teardownClipboardHistory(): void {
  if (timer) clearInterval(timer)
  if (sweeper) clearInterval(sweeper)
  timer = null
  sweeper = null
  // Si quedó un guardado pendiente, hacerlo ahora (al salir no hay "después").
  if (recentTimer) {
    clearTimeout(recentTimer)
    recentTimer = null
    try { writeEncrypted(RECENT_FILE, entries.filter((e) => !e.pinned && !e.sensitive).slice(0, RECENT_KEEP)) } catch { /* nada */ }
  }
}
