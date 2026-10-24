import { app, BrowserWindow, protocol, shell } from 'electron'
import type { IpcMain } from 'electron'
import { execFile, spawn } from 'child_process'
import os from 'os'
import fs from 'fs'
import path from 'path'
import { Readable } from 'stream'
import { registerHandler } from '../../core/ipc-handler'
import { logger } from '../../core/logger'
import type { VideoItem } from '../../../src/plugins/captures/types'

/**
 * Videos grabados con Recortes (y la Xbox Game Bar): se listan desde sus carpetas de
 * Windows, se reproducen con `setto-video://`, se pueden renombrar, recortar (ffmpeg, sin
 * recodificar), anotar (marcas dibujadas encima, se recodifica) o mandar a la Papelera.
 * Un video copiado desde una carpeta temporal (Recortes → Ctrl+C sin guardar) se guarda en
 * Videos\Setto para que no se pierda.
 */
export const VIDEO_SCHEME = 'setto-video'
const EXT = /\.(mp4|mkv|webm|mov)$/i
/** Subcarpetas de Videos donde graban Recortes (en español o inglés) y la Game Bar. */
const SAVE_FOLDER = 'Setto'
const SUBFOLDERS = ['Grabaciones de pantalla', 'Screen Recordings', 'Captures', 'Capturas', SAVE_FOLDER]
const META_FILE = 'videos-meta.json'
const MIME: Record<string, string> = { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska' }

function folders(): string[] {
  const base = app.getPath('videos')
  return SUBFOLDERS.map((f) => path.join(base, f)).filter((d) => { try { return fs.statSync(d).isDirectory() } catch { return false } })
}

/** ¿Es un video de una de esas carpetas? (el protocolo y las acciones no tocan nada más) */
function isAllowed(p: string): boolean {
  const full = path.resolve(p)
  return EXT.test(full) && folders().some((d) => full.toLowerCase().startsWith(path.resolve(d).toLowerCase() + path.sep))
}

/** Videos\Setto: donde se guardan los videos copiados que estaban en una carpeta temporal. */
function saveDir(): string {
  const d = path.join(app.getPath('videos'), SAVE_FOLDER)
  fs.mkdirSync(d, { recursive: true })
  return d
}

/** Avisar a la ventana principal que cambió la lista (Portapapeles → Videos se refresca). */
function changed(): void {
  for (const w of BrowserWindow.getAllWindows()) if (!w.webContents.getURL().includes('#')) w.webContents.send('videos:changed')
}

/**
 * Recortes → Ctrl+C sin guardar deja el video en su carpeta temporal (se borra sola):
 * se copia a Videos\Setto. Si ya está en una de las carpetas de videos, no se toca.
 */
export async function saveCopiedVideo(src: string): Promise<{ path: string; name: string; saved: boolean } | null> {
  try {
    if (!EXT.test(src) || !fs.existsSync(src)) return null
    if (isAllowed(src)) return { path: src, name: path.basename(src), saved: false }
    const st = fs.statSync(src)
    const d = new Date(st.mtimeMs)
    const pad = (n: number): string => String(n).padStart(2, '0')
    const base = `Grabación ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
    const ext = path.extname(src).toLowerCase()
    const dir = saveDir()
    // El mismo video copiado dos veces: no duplicar.
    for (let i = 1; ; i++) {
      const out = path.join(dir, `${base}${i > 1 ? ` (${i})` : ''}${ext}`)
      if (fs.existsSync(out)) { if (fs.statSync(out).size === st.size) return { path: out, name: path.basename(out), saved: false }; continue }
      await fs.promises.copyFile(src, out)
      logger.info('videos', `video copiado guardado en ${dir}`)
      changed()
      return { path: out, name: path.basename(out), saved: true }
    }
  } catch (err) {
    logger.warn('videos', 'no se pudo guardar el video copiado', err instanceof Error ? err.message : String(err))
    return null
  }
}

type Meta = { opened: Record<string, number> }
const metaPath = (): string => path.join(app.getPath('userData'), META_FILE)
function readMeta(): Meta {
  try { return { opened: (JSON.parse(fs.readFileSync(metaPath(), 'utf-8')) as Partial<Meta>).opened ?? {} } } catch { return { opened: {} } }
}
function markOpened(p: string): void {
  const m = readMeta()
  m.opened[path.resolve(p).toLowerCase()] = Date.now()
  try { fs.writeFileSync(metaPath(), JSON.stringify(m)) } catch { /* nada */ }
}

function list(): VideoItem[] {
  const meta = readMeta()
  const out: VideoItem[] = []
  for (const dir of folders()) {
    let names: string[] = []
    try { names = fs.readdirSync(dir) } catch { continue }
    for (const name of names) {
      if (!EXT.test(name)) continue
      const p = path.join(dir, name)
      try {
        const st = fs.statSync(p)
        if (!st.isFile()) continue
        out.push({ path: p, name, folder: path.basename(dir), size: st.size, modifiedAt: st.mtimeMs, openedAt: meta.opened[path.resolve(p).toLowerCase()] })
      } catch { /* se borró recién */ }
    }
  }
  return out.sort((a, b) => b.modifiedAt - a.modifiedAt)
}

/** ffmpeg incluido (ffmpeg-static): en la app instalada está fuera del .asar. */
function ffmpegPath(): string | null {
  const exe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  const candidates = [
    path.join(app.getAppPath().replace(/app\.asar$/, 'app.asar.unpacked'), 'node_modules', 'ffmpeg-static', exe),
    path.join(process.cwd(), 'node_modules', 'ffmpeg-static', exe),
  ]
  return candidates.find((c) => fs.existsSync(c)) ?? null
}

/** Duración en segundos (para el progreso de la exportación). */
function probeDuration(ff: string, file: string): Promise<number> {
  return new Promise((resolve) => {
    execFile(ff, ['-hide_banner', '-i', file], { windowsHide: true, timeout: 20_000 }, (_err, _o, stderr) => {
      const m = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(String(stderr))
      resolve(m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0)
    })
  })
}

/** "video.mp4" → "video (recorte).mp4" sin pisar uno que ya exista. */
function trimmedName(p: string): string {
  const dir = path.dirname(p)
  const ext = path.extname(p)
  const base = path.basename(p, ext)
  for (let i = 1; ; i++) {
    const out = path.join(dir, `${base} (recorte${i > 1 ? ` ${i}` : ''})${ext}`)
    if (!fs.existsSync(out)) return out
  }
}

export function registerVideoProtocol(): void {
  protocol.handle(VIDEO_SCHEME, async (req) => {
    // setto-video://f/<ruta codificada>
    const p = decodeURIComponent(new URL(req.url).pathname.replace(/^\//, ''))
    if (!isAllowed(p) || !fs.existsSync(p)) return new Response('not found', { status: 404 })
    // Pedidos por rango (206): sin esto el reproductor no puede adelantar ni saltar.
    const size = fs.statSync(p).size
    const type = MIME[path.extname(p).toLowerCase()] ?? 'video/mp4'
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') ?? '')
    if (!m) {
      return new Response(Readable.toWeb(fs.createReadStream(p)) as ReadableStream, {
        status: 200, headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' },
      })
    }
    let start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2] || 0))
    let end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
    start = Math.max(0, start); end = Math.max(start, end)
    return new Response(Readable.toWeb(fs.createReadStream(p, { start, end })) as ReadableStream, {
      status: 206,
      headers: { 'Content-Type': type, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes' },
    })
  })
}

export function registerVideoHandlers(ipcMain: IpcMain): void {
  registerHandler(ipcMain, 'videos:list', () => ({ items: list(), folders: folders(), canTrim: !!ffmpegPath() }))
  registerHandler(ipcMain, 'videos:open', async (_e, p: string) => {
    if (!isAllowed(p)) throw new Error('Video no válido')
    markOpened(p)
    const err = await shell.openPath(p)
    if (err) throw new Error(err)
    return { ok: true }
  })
  registerHandler(ipcMain, 'videos:mark-opened', (_e, p: string) => { if (isAllowed(p)) markOpened(p); return { ok: true } })
  /** Renombrar (mismo lugar, misma extensión, sin pisar otro). */
  registerHandler(ipcMain, 'videos:rename', (_e, req: { path: string; name: string }) => {
    if (!isAllowed(req?.path)) throw new Error('Video no válido')
    const name = String(req.name ?? '').trim().replace(/\.(mp4|mkv|webm|mov)$/i, '')
    if (!name || /[\\/:*?"<>|]/.test(name)) throw new Error('El nombre no puede tener \\ / : * ? " < > |')
    const out = path.join(path.dirname(req.path), name + path.extname(req.path))
    if (out.toLowerCase() === req.path.toLowerCase()) return { ok: true, path: req.path }
    if (fs.existsSync(out)) throw new Error('Ya hay un video con ese nombre')
    fs.renameSync(req.path, out)
    const m = readMeta()
    const old = path.resolve(req.path).toLowerCase()
    if (m.opened[old]) { m.opened[path.resolve(out).toLowerCase()] = m.opened[old]!; delete m.opened[old]; try { fs.writeFileSync(metaPath(), JSON.stringify(m)) } catch { /* nada */ } }
    return { ok: true, path: out }
  })
  /**
   * Exportar con marcas: cada marca es un PNG transparente (del tamaño del video) que se ve
   * entre `start` y `end` segundos. Se recodifica (H.264), así que tarda: avisa el progreso.
   */
  registerHandler(ipcMain, 'videos:annotate', async (e, req: { path: string; layers: { png: string; start: number; end: number }[] }) => {
    const ff = ffmpegPath()
    if (!ff) throw new Error('No está ffmpeg para exportar')
    if (!isAllowed(req?.path)) throw new Error('Video no válido')
    const layers = (req.layers ?? []).filter((l) => typeof l.png === 'string' && l.png.startsWith('data:image/png;base64,') && l.end > l.start)
    if (!layers.length) throw new Error('No hay marcas para exportar')
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'setto-annot-'))
    try {
      const pngs = layers.map((l, i) => {
        const f = path.join(tmp, `marca-${i}.png`)
        fs.writeFileSync(f, Buffer.from(l.png.slice('data:image/png;base64,'.length), 'base64'))
        return f
      })
      // [0:v][1:v]overlay=enable='between(t,a,b)'[v1];[v1][2:v]overlay=...[v2]…
      const chain = layers.map((l, i) => `[${i === 0 ? '0:v' : `v${i}`}][${i + 1}:v]overlay=0:0:enable='between(t,${l.start.toFixed(3)},${l.end.toFixed(3)})'[v${i + 1}]`).join(';')
      const ext = path.extname(req.path)
      const dir = path.dirname(req.path)
      const base = path.basename(req.path, ext)
      let out = path.join(dir, `${base} (editado)${ext}`)
      for (let i = 2; fs.existsSync(out); i++) out = path.join(dir, `${base} (editado ${i})${ext}`)
      const duration = await probeDuration(ff, req.path)
      await new Promise<void>((resolve, reject) => {
        const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', req.path, ...pngs.flatMap((f) => ['-i', f]),
          '-filter_complex', chain, '-map', `[v${layers.length}]`, '-map', '0:a?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
          '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', '-progress', 'pipe:1', out]
        const p = spawn(ff, args, { windowsHide: true })
        let err = ''
        p.stdout.on('data', (d: Buffer) => {
          const m = /out_time_ms=(\d+)/.exec(d.toString())
          if (m && duration) e.sender.send('videos:progress', { path: req.path, ratio: Math.min(1, Number(m[1]) / 1e6 / duration) })
        })
        p.stderr.on('data', (d: Buffer) => { err += d.toString() })
        p.on('error', reject)
        p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err.trim().split('\n').pop() || `ffmpeg terminó con ${code}`))))
      })
      changed()
      return { ok: true, path: out, size: fs.statSync(out).size }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })
  registerHandler(ipcMain, 'videos:reveal', (_e, p: string) => { if (isAllowed(p)) shell.showItemInFolder(p); return { ok: true } })
  /** Abrir la carpeta de cuadros "Para Claude" (solo esa). */
  registerHandler(ipcMain, 'videos:frames-reveal', (_e, dir: string) => {
    const root = path.resolve(saveDir(), 'Para Claude').toLowerCase() + path.sep
    if (typeof dir === 'string' && path.resolve(dir).toLowerCase().startsWith(root)) void shell.openPath(dir)
    return { ok: true }
  })
  /** A la Papelera de Windows (se puede recuperar desde ahí). */
  registerHandler(ipcMain, 'videos:trash', async (_e, paths: string[]) => {
    let done = 0
    for (const p of Array.isArray(paths) ? paths : []) {
      if (!isAllowed(p)) continue
      try { await shell.trashItem(p); done++ } catch (err) { logger.warn('videos', `no se pudo mandar a la Papelera: ${p}`, err instanceof Error ? err.message : String(err)) }
    }
    return { ok: true, done }
  })
  /**
   * Recortar [start, end] (segundos) a un archivo nuevo al lado del original, sin recodificar:
   * es instantáneo y sin pérdida, pero el inicio cae en el cuadro clave más cercano (±1–2 s).
   */
  registerHandler(ipcMain, 'videos:trim', async (_e, req: { path: string; start: number; end: number }) => {
    const ff = ffmpegPath()
    if (!ff) throw new Error('No está ffmpeg para recortar')
    if (!isAllowed(req?.path)) throw new Error('Video no válido')
    const start = Math.max(0, Number(req.start) || 0)
    const end = Number(req.end)
    if (!(end > start)) throw new Error('El fin tiene que ser después del inicio')
    const out = trimmedName(req.path)
    await new Promise<void>((resolve, reject) => {
      execFile(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', start.toFixed(3), '-i', req.path, '-t', (end - start).toFixed(3),
        '-c', 'copy', '-map', '0', '-avoid_negative_ts', 'make_zero', out],
        { windowsHide: true, timeout: 10 * 60_000 },
        (err, _stdout, stderr) => (err ? reject(new Error(String(stderr).trim().split('\n').pop() || err.message)) : resolve()))
    })
    return { ok: true, path: out, size: fs.statSync(out).size }
  })
  /**
   * Para Claude: Claude no lee videos pero sí imágenes. Se sacan los cuadros donde cambia la
   * pantalla (con su minuto) a Videos\Setto\Para Claude\<video>, con una nota que los explica.
   */
  registerHandler(ipcMain, 'videos:frames', async (_e, req: { path: string; max?: number }) => {
    const ff = ffmpegPath()
    if (!ff) throw new Error('No está ffmpeg para sacar los cuadros')
    if (!isAllowed(req?.path)) throw new Error('Video no válido')
    const max = Math.min(30, Math.max(4, Number(req.max) || 12))
    const duration = await probeDuration(ff, req.path)
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'setto-frames-'))
    try {
      // Primero los cambios de escena; si el video casi no cambia, cuadros parejos.
      let frames = await extractFrames(ff, req.path, tmp, "select='eq(n\\,0)+gt(scene\\,0.06)'", 60)
      if (frames.length < Math.min(4, max)) {
        for (const f of fs.readdirSync(tmp)) fs.rmSync(path.join(tmp, f))
        const every = Math.max(1, duration / max)
        frames = await extractFrames(ff, req.path, tmp, `fps=1/${every.toFixed(3)}`, max)
        frames = frames.map((f, i) => ({ ...f, time: Math.min(duration, i * every) }))
      }
      // Demasiados: quedarse con `max` repartidos (siempre el primero y el último).
      if (frames.length > max) frames = Array.from({ length: max }, (_, i) => frames[Math.round((i * (frames.length - 1)) / (max - 1))]!)
      const base = path.basename(req.path, path.extname(req.path))
      const dir = path.join(saveDir(), 'Para Claude', base)
      fs.rmSync(dir, { recursive: true, force: true })
      fs.mkdirSync(dir, { recursive: true })
      const stamp = (t: number): string => `${Math.floor(t / 60)}m${String(Math.floor(t % 60)).padStart(2, '0')}s`
      const out = frames.map((f, i) => {
        const name = `${String(i + 1).padStart(2, '0')} - ${stamp(f.time)}.jpg`
        fs.copyFileSync(f.file, path.join(dir, name))
        return { name, time: f.time, dataUrl: 'data:image/jpeg;base64,' + fs.readFileSync(f.file).toString('base64') }
      })
      const note = [
        `# ${base}`,
        '',
        `Cuadros clave de una grabación de pantalla de ${stamp(duration)}, en orden. Cada imagen es un momento en que cambió la pantalla; el nombre dice el minuto.`,
        '',
        ...out.map((f, i) => `${i + 1}. ${f.name}`),
        '',
      ].join('\n')
      fs.writeFileSync(path.join(dir, 'contexto.md'), note)
      return { ok: true, dir, duration, frames: out }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })
}

/** Cuadros a JPG (máx. 1600 px de ancho) con el segundo de cada uno (showinfo → pts_time). */
function extractFrames(ff: string, file: string, dir: string, filter: string, limit: number): Promise<{ file: string; time: number }[]> {
  return new Promise((resolve, reject) => {
    const args = ['-hide_banner', '-i', file, '-vf', `${filter},showinfo,scale='min(1600,iw)':-2`, '-fps_mode', 'vfr',
      '-frames:v', String(limit), '-q:v', '4', path.join(dir, 'f-%03d.jpg')]
    execFile(ff, args, { windowsHide: true, timeout: 5 * 60_000, maxBuffer: 32 * 1024 * 1024 }, (err, _o, stderr) => {
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jpg')).sort()
      if (err && !files.length) { reject(new Error(String(stderr).trim().split('\n').pop() || err.message)); return }
      const times = [...String(stderr).matchAll(/pts_time:\s*([\d.]+)/g)].map((m) => Number(m[1]))
      resolve(files.map((f, i) => ({ file: path.join(dir, f), time: times[i] ?? 0 })))
    })
  })
}
