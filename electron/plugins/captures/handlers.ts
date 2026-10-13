import { app, BrowserWindow, clipboard, dialog, nativeImage, net, Notification, protocol, shell } from 'electron'
import type { IpcMain } from 'electron'
import { createHash, randomBytes } from 'crypto'
import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import type { CoreServices, PluginHandlers } from '../../core/types'
import type { SettingsService } from '../../core/services/settings.service'
import { registerHandler } from '../../core/ipc-handler'
import { logger } from '../../core/logger'
import { isPrivateClipboard } from '../../core/clipboard-history'
import { foregroundWindow, ocrImage, stopWinHelper, warmWinHelper } from '../../core/win-helper'
import { showWindow } from '../../core/notifications'
import type { CaptureQuery, CaptureQueryResult, CaptureSettings } from '../../../src/plugins/captures/types'
import {
  buildTitle, captureFacets, captureFileName, detectTicket, expiredCaptures, uniqueExportNames, isExcludedApp,
  isValidCaptureFile, normalizeSource, overQuota, queryCaptures, searchText, thumbFileName, toLite, type CaptureEntry,
} from './captures-utils'

/**
 * Capturas: historial de imágenes copiadas (Win+Shift+S, Recortes o cualquier imagen).
 *
 * Escala: el índice (`captures.json`) vive en memoria; búsqueda/orden/paginado se
 * resuelven acá y al renderer sólo viaja la página visible sin OCR. La galería usa
 * miniaturas JPEG (`thumbs/`), no los PNG completos. El origen (app/ventana) y el
 * OCR los da un único proceso de Windows de larga vida (core/win-helper.ts).
 * Las imágenes se sirven con el protocolo `setto-capture://img|thumb/<archivo>`.
 */

export const CAPTURE_SCHEME = 'setto-capture'
const INDEX = 'captures.json'
const THUMBS = 'thumbs'
const THUMB_WIDTH = 480
const POLL_MS = 900
const MAX_PIXELS = 40_000_000
const K = {
  auto: 'captures.auto', keep: 'captures.keep_days', maxMb: 'captures.max_mb',
  notify: 'captures.notify', exclude: 'captures.exclude_apps',
} as const

let dir = ''
let entries: CaptureEntry[] = []
const hashes = new Set<string>()
const haystacks = new Map<string, string>()
let lastHash = ''
let timer: ReturnType<typeof setInterval> | null = null
let busy = false
let settingsRef: SettingsService | null = null

const capturesDir = (): string => {
  if (!dir) {
    dir = path.join(app.getPath('userData'), 'captures')
    fs.mkdirSync(path.join(dir, THUMBS), { recursive: true })
  }
  return dir
}
const filePath = (file: string): string => {
  if (!isValidCaptureFile(file)) throw new Error('Archivo de captura inválido')
  return path.join(capturesDir(), file)
}
const thumbPath = (file: string): string => {
  if (!isValidCaptureFile(file)) throw new Error('Archivo de captura inválido')
  return path.join(capturesDir(), THUMBS, thumbFileName(file))
}

const haystack = (c: CaptureEntry): string => {
  let h = haystacks.get(c.id)
  if (h === undefined) { h = searchText(c); haystacks.set(c.id, h) }
  return h
}
const touch = (c: CaptureEntry): void => { haystacks.delete(c.id) }

// ── Ajustes ──────────────────────────────────────────────────────────────────

function readSettings(): CaptureSettings {
  const s = settingsRef!
  return {
    auto: s.get(K.auto) !== '0',
    keepDays: Number(s.get(K.keep) ?? '0') || 0,
    maxMb: Number(s.get(K.maxMb) ?? '0') || 0,
    notify: s.get(K.notify) === '1',
    excludeApps: (s.get(K.exclude) ?? '').split(',').map((x) => x.trim()).filter(Boolean),
  }
}

// ── Índice ───────────────────────────────────────────────────────────────────

function loadIndex(): void {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(capturesDir(), INDEX), 'utf-8')) as unknown
    entries = Array.isArray(raw)
      ? (raw as CaptureEntry[]).filter((e) => isValidCaptureFile(e.file) && fs.existsSync(filePath(e.file)))
      : []
  } catch {
    entries = []
  }
  hashes.clear()
  for (const e of entries) if (e.hash) hashes.add(e.hash)
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
function saveIndex(now = false): void {
  const write = (): void => {
    saveTimer = null
    const p = path.join(capturesDir(), INDEX)
    fs.writeFileSync(`${p}.tmp`, JSON.stringify(entries), 'utf-8')
    fs.renameSync(`${p}.tmp`, p)
  }
  if (saveTimer) clearTimeout(saveTimer)
  if (now) { write(); return }
  saveTimer = setTimeout(write, 400)
}

// Varias capturas/OCR seguidos → un solo aviso al renderer.
let changedTimer: ReturnType<typeof setTimeout> | null = null
function broadcastChanged(): void {
  if (changedTimer) return
  changedTimer = setTimeout(() => {
    changedTimer = null
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('captures:changed')
  }, 200)
}

// ── Miniaturas ───────────────────────────────────────────────────────────────

function makeThumb(img: Electron.NativeImage, file: string): void {
  const { width } = img.getSize()
  const small = width > THUMB_WIDTH ? img.resize({ width: THUMB_WIDTH, quality: 'good' }) : img
  fs.writeFileSync(thumbPath(file), small.toJPEG(82))
}

/** Capturas viejas (de antes de las miniaturas): de a poco y sin trabar el proceso. */
function backfillThumbs(): void {
  const missing = entries.filter((e) => !fs.existsSync(thumbPath(e.file)))
  const step = (): void => {
    const batch = missing.splice(0, 4)
    for (const e of batch) {
      try { makeThumb(nativeImage.createFromPath(filePath(e.file)), e.file) } catch { /* archivo raro: queda la original */ }
    }
    if (batch.length) { broadcastChanged(); setTimeout(step, 50) }
  }
  setTimeout(step, 1500)
}

// ── Guardar una captura ──────────────────────────────────────────────────────

const mainWindow = (): BrowserWindow | undefined =>
  BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && !w.webContents.getURL().includes('#snippet-picker'))

function notifySaved(e: CaptureEntry): void {
  if (!readSettings().notify || !Notification.isSupported()) return
  const n = new Notification({ title: 'Captura guardada', body: [e.ticket, e.title].filter(Boolean).join(' · '), silent: true })
  n.on('click', () => {
    const w = mainWindow()
    if (!w) return
    showWindow(w)
    w.webContents.send('app:notification-click', { pluginId: 'captures', action: 'open', payload: e.id })
  })
  n.show()
}

function addImage(img: Electron.NativeImage, hash: string, extra: Partial<CaptureEntry> = {}): CaptureEntry {
  const now = new Date()
  const png = img.toPNG()
  const file = captureFileName(now, randomBytes(3).toString('hex'))
  fs.writeFileSync(filePath(file), png)
  try { makeThumb(img, file) } catch (err) { logger.warn('captures', 'thumb failed', String(err)) }
  const { width, height } = img.getSize()
  const entry: CaptureEntry = {
    id: randomBytes(8).toString('hex'), file, createdAt: now.getTime(), width, height, bytes: png.length,
    title: buildTitle(null, now), ticket: '', tags: [], note: '', pinned: false, ocr: null, hash, ...extra,
  }
  entries.unshift(entry)
  hashes.add(hash)
  enforceLimits()
  saveIndex()
  broadcastChanged()
  queueOcr(entry.id)
  return entry
}

async function poll(): Promise<void> {
  if (busy) return
  busy = true
  try {
    const formats = clipboard.availableFormats()
    if (!formats.some((f) => f.startsWith('image/'))) return
    if (isPrivateClipboard()) return
    const img = clipboard.readImage()
    if (img.isEmpty()) return
    const { width, height } = img.getSize()
    if (width < 8 || height < 8 || width * height > MAX_PIXELS) return
    const h = createHash('sha1').update(img.toBitmap()).digest('hex')
    if (h === lastHash) return
    lastHash = h
    if (hashes.has(h)) return   // la misma imagen ya está guardada
    // De dónde salió: la ventana que queda en primer plano al cerrar el recorte.
    const raw = await foregroundWindow().catch(() => null)
    const source = normalizeSource(raw)
    if (isExcludedApp(source?.app, readSettings().excludeApps) || isExcludedApp(raw?.app, readSettings().excludeApps)) return
    const e = addImage(img, h, { title: buildTitle(source, new Date()), app: source?.app, window: source?.window })
    notifySaved(e)
  } catch (err) {
    logger.warn('captures', 'poll failed', err instanceof Error ? err.message : String(err))
  } finally {
    busy = false
  }
}

function startWatching(): void {
  if (timer) return
  // Lo que ya estaba en el portapapeles al abrir la app no cuenta como captura nueva.
  try {
    const img = clipboard.readImage()
    if (!img.isEmpty()) lastHash = createHash('sha1').update(img.toBitmap()).digest('hex')
  } catch { /* nada */ }
  warmWinHelper()
  timer = setInterval(() => { void poll() }, POLL_MS)
}

function stopWatching(): void {
  if (timer) clearInterval(timer)
  timer = null
}

// ── Límites ──────────────────────────────────────────────────────────────────

function removeEntries(list: CaptureEntry[], trash: boolean): Promise<void> {
  const ids = new Set(list.map((e) => e.id))
  entries = entries.filter((e) => !ids.has(e.id))
  for (const e of list) {
    if (e.hash) hashes.delete(e.hash)
    haystacks.delete(e.id)
  }
  return Promise.all(list.map(async (e) => {
    const p = filePath(e.file)
    if (trash) { try { await shell.trashItem(p) } catch { try { fs.unlinkSync(p) } catch { /* nada */ } } }
    else { try { fs.unlinkSync(p) } catch { /* nada */ } }
    try { fs.unlinkSync(thumbPath(e.file)) } catch { /* nada */ }
  })).then(() => undefined)
}

function enforceLimits(): void {
  const s = readSettings()
  const drop = [...expiredCaptures(entries, s.keepDays, Date.now()), ...overQuota(entries, s.maxMb * 1024 * 1024)]
  if (drop.length) void removeEntries([...new Map(drop.map((e) => [e.id, e])).values()], false)
}

// ── OCR (de a una, en segundo plano) ─────────────────────────────────────────

const ocrQueue: string[] = []
let ocrBusy = false

function queueOcr(id: string): void {
  if (process.platform !== 'win32') return
  ocrQueue.push(id)
  void drainOcr()
}

async function drainOcr(): Promise<void> {
  if (ocrBusy) return
  ocrBusy = true
  try {
    while (ocrQueue.length) {
      const e = entries.find((x) => x.id === ocrQueue[0])
      ocrQueue.shift()
      if (!e || e.ocr !== null) continue
      try {
        e.ocr = (await ocrImage(filePath(e.file))) ?? ''
      } catch (err) {
        e.ocr = ''   // no reintentar en bucle
        logger.warn('captures', 'OCR failed', err instanceof Error ? err.message : String(err))
      }
      if (!e.ticket) e.ticket = detectTicket(e.ocr) || detectTicket(e.window)
      touch(e)
      saveIndex()
      broadcastChanged()
    }
  } finally {
    ocrBusy = false
  }
}

// ── Protocolo para mostrar las imágenes ──────────────────────────────────────

/** Antes de app.ready (main.ts). */
export function registerCaptureScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: CAPTURE_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }])
}

function registerCaptureProtocol(): void {
  protocol.handle(CAPTURE_SCHEME, async (req) => {
    // setto-capture://img/<archivo> · setto-capture://thumb/<archivo>
    const url = new URL(req.url)
    const file = decodeURIComponent(url.pathname.replace(/^\//, ''))
    if (!isValidCaptureFile(file)) return new Response('not found', { status: 404 })
    let p = filePath(file)
    let type = 'image/png'
    if (url.hostname === 'thumb' && fs.existsSync(thumbPath(file))) { p = thumbPath(file); type = 'image/jpeg' }
    const res = await net.fetch(pathToFileURL(p).toString())
    // CORS: el anotador dibuja la imagen en un <canvas> y lo exporta; sin este
    // header el canvas queda "contaminado" y toDataURL falla.
    return new Response(res.body, {
      status: res.status,
      headers: { 'content-type': type, 'access-control-allow-origin': '*', 'cache-control': 'max-age=31536000, immutable' },
    })
  })
}

// ── IPC ──────────────────────────────────────────────────────────────────────

const find = (id: unknown): CaptureEntry => {
  const e = entries.find((x) => x.id === id)
  if (!e) throw new Error('La captura ya no existe')
  return e
}

type Patch = Partial<Pick<CaptureEntry, 'title' | 'ticket' | 'tags' | 'note' | 'pinned'>>

function applyPatch(e: CaptureEntry, patch: Patch): void {
  if (typeof patch.title === 'string') e.title = patch.title.slice(0, 200)
  if (typeof patch.ticket === 'string') e.ticket = patch.ticket.trim().toUpperCase().slice(0, 40)
  if (Array.isArray(patch.tags)) e.tags = [...new Set(patch.tags.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim().toLowerCase().slice(0, 40)))].slice(0, 20)
  if (typeof patch.note === 'string') e.note = patch.note.slice(0, 4000)
  if (typeof patch.pinned === 'boolean') e.pinned = patch.pinned
  touch(e)
}

export const handlers: PluginHandlers = {
  pluginId: 'captures',

  register(ipcMain: IpcMain, { settings }: CoreServices): void {
    settingsRef = settings
    loadIndex()
    registerCaptureProtocol()
    enforceLimits()
    backfillThumbs()
    // Las que quedaron sin OCR (app cerrada a mitad) se procesan ahora.
    entries.filter((e) => e.ocr === null).forEach((e) => queueOcr(e.id))
    if (readSettings().auto) startWatching()

    registerHandler(ipcMain, 'captures:query', (_e, q: CaptureQuery = {}): CaptureQueryResult => {
      const { items, total } = queryCaptures(entries, q, haystack)
      return { items: items.map(toLite), total, facets: captureFacets(entries), settings: readSettings(), dir: capturesDir() }
    })

    registerHandler(ipcMain, 'captures:get', (_e, id: string) => find(id))

    registerHandler(ipcMain, 'captures:settings', (_e, patch: Partial<CaptureSettings>) => {
      if (typeof patch?.auto === 'boolean') {
        settings.set(K.auto, patch.auto ? '1' : '0')
        if (patch.auto) startWatching(); else stopWatching()
      }
      if (typeof patch?.keepDays === 'number' && patch.keepDays >= 0) settings.set(K.keep, String(Math.round(patch.keepDays)))
      if (typeof patch?.maxMb === 'number' && patch.maxMb >= 0) settings.set(K.maxMb, String(Math.round(patch.maxMb)))
      if (typeof patch?.notify === 'boolean') settings.set(K.notify, patch.notify ? '1' : '0')
      if (Array.isArray(patch?.excludeApps)) settings.set(K.exclude, patch.excludeApps.map((x) => String(x).trim()).filter(Boolean).slice(0, 50).join(','))
      enforceLimits()
      saveIndex()
      broadcastChanged()
      return readSettings()
    })

    registerHandler(ipcMain, 'captures:update', (_e, id: string, patch: Patch) => {
      const e = find(id)
      applyPatch(e, patch)
      saveIndex()
      return e
    })

    /** Lo mismo para varias (asignar ticket, fijar, agregar etiquetas). */
    registerHandler(ipcMain, 'captures:update-many', (_e, ids: string[], patch: Patch & { addTags?: string[] }) => {
      for (const e of entries.filter((x) => ids.includes(x.id))) {
        applyPatch(e, { ...patch, tags: patch.addTags ? [...e.tags, ...patch.addTags] : patch.tags })
      }
      saveIndex()
      broadcastChanged()
      return { ok: true }
    })

    registerHandler(ipcMain, 'captures:delete', async (_e, ids: string[]) => {
      await removeEntries(entries.filter((x) => (Array.isArray(ids) ? ids : [ids]).includes(x.id)), true)
      saveIndex(true)
      broadcastChanged()
      return { ok: true }
    })

    registerHandler(ipcMain, 'captures:copy', (_e, id: string) => {
      const img = nativeImage.createFromPath(filePath(find(id).file))
      lastHash = createHash('sha1').update(img.toBitmap()).digest('hex')   // que no vuelva a entrar como nueva
      clipboard.writeImage(img)
      return { ok: true }
    })

    registerHandler(ipcMain, 'captures:reveal', (_e, id?: string) => {
      if (id) shell.showItemInFolder(filePath(find(id).file))
      else void shell.openPath(capturesDir())
      return { ok: true }
    })

    /** Copia los PNG a una carpeta con nombres legibles (para adjuntar a un ticket). */
    registerHandler(ipcMain, 'captures:export', async (event, ids: string[]) => {
      // Orden cronológico y nombres únicos: los mismos que referencia el comentario de Jira.
      const list = entries.filter((e) => ids.includes(e.id)).sort((a, b) => a.createdAt - b.createdAt)
      if (!list.length) return { canceled: true }
      const win = BrowserWindow.fromWebContents(event.sender)
      const opts = { title: 'Exportar capturas a…', properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[] }
      const { canceled, filePaths } = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
      if (canceled || !filePaths[0]) return { canceled: true }
      const names = uniqueExportNames(list)
      // Si ya estaba (exportación anterior de la misma evidencia) se reemplaza.
      list.forEach((e, i) => fs.copyFileSync(filePath(e.file), path.join(filePaths[0]!, names[i]!)))
      void shell.openPath(filePaths[0])
      return { count: list.length, dir: filePaths[0] }
    })

    /** Guarda la versión anotada como captura nueva (la original queda intacta). */
    registerHandler(ipcMain, 'captures:save-annotated', (_e, id: string, dataUrl: string, copy: boolean) => {
      const src = find(id)
      if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) throw new Error('Imagen inválida')
      const img = nativeImage.createFromDataURL(dataUrl)
      if (img.isEmpty()) throw new Error('Imagen vacía')
      const h = createHash('sha1').update(img.toBitmap()).digest('hex')
      if (copy) { lastHash = h; clipboard.writeImage(img) }
      return addImage(img, h, {
        title: `${src.title} (anotada)`, ticket: src.ticket, tags: [...src.tags], annotatedFrom: src.id, app: src.app, window: src.window,
      })
    })

    /** Arrastrar una o varias capturas fuera de la app (a Jira, Confluence, el explorador…). */
    ipcMain.on('captures:start-drag', (event, ids: string | string[]) => {
      try {
        const list = (Array.isArray(ids) ? ids : [ids]).map(find)
        const files = list.map((e) => filePath(e.file))
        const icon = nativeImage.createFromPath(fs.existsSync(thumbPath(list[0]!.file)) ? thumbPath(list[0]!.file) : files[0]!).resize({ width: 96 })
        event.sender.startDrag(files.length > 1 ? { file: files[0]!, files, icon } : { file: files[0]!, icon })
      } catch (err) {
        logger.warn('captures', 'drag failed', err instanceof Error ? err.message : String(err))
      }
    })

    app.on('will-quit', () => {
      stopWatching()
      stopWinHelper()
      if (saveTimer) { clearTimeout(saveTimer); saveIndex(true) }
    })
  },
}
