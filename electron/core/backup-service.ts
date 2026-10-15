import { app, BrowserWindow, dialog, safeStorage } from 'electron'
import type { IpcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import type { DatabaseService } from './services/db.service'
import { registerHandler } from './ipc-handler'
import { logger } from './logger'
import {
  collectFiles, dirSizeBytes, fromPortable, openBackup, safeRelPath, sealBackup, toPortable,
  type BackupPayload, type Codec,
} from './backup'

/**
 * Ajustes → Respaldo: exportar / restaurar todos los datos en un `.settobackup`
 * cifrado con una contraseña (ver backup.ts) y un respaldo automático semanal a
 * una carpeta (p. ej. OneDrive), guardando los últimos 5.
 *
 * Restaurar: copia lo actual a `restore-backup-<fecha>/`, escribe los archivos
 * (re-cifrados para esta PC), repone el localStorage y reinicia la app con
 * `app.exit` (sin `will-quit`: nada en memoria pisa lo restaurado).
 */
const EXT = 'settobackup'
const AUTO_FILE = 'backup-auto.json'
const AUTO_EVERY_MS = 7 * 24 * 3600_000
const AUTO_KEEP = 5
const AUTO_FIRST_DELAY_MS = 90_000

interface AutoConfig { dir: string; pass: string; lastAt: number | null; lastError?: string }

const codec: Codec = {
  available: safeStorage.isEncryptionAvailable(),
  encrypt: (s) => safeStorage.encryptString(s).toString('base64'),
  decrypt: (b) => safeStorage.decryptString(Buffer.from(b, 'base64')),
}

const cleanErr = (e: unknown): string => (e instanceof Error ? e.message : String(e))
const stamp = (d = new Date()): string => d.toISOString().slice(0, 10)
const mb = (bytes: number): number => Math.round((bytes / 1048576) * 10) / 10

/** Diálogos anclados a la ventana que los pidió (si existe). */
const saveDialog = (sender: Electron.WebContents, o: Electron.SaveDialogOptions): Promise<Electron.SaveDialogReturnValue> => {
  const w = BrowserWindow.fromWebContents(sender)
  return w ? dialog.showSaveDialog(w, o) : dialog.showSaveDialog(o)
}
const openDialog = (sender: Electron.WebContents, o: Electron.OpenDialogOptions): Promise<Electron.OpenDialogReturnValue> => {
  const w = BrowserWindow.fromWebContents(sender)
  return w ? dialog.showOpenDialog(w, o) : dialog.showOpenDialog(o)
}

/** Ventana principal (la que no es la barra ni el selector). */
function mainWindow(): BrowserWindow | null {
  return BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && !w.webContents.getURL().includes('#') && !w.webContents.getURL().startsWith('data:')) ?? null
}

async function readLocalStorage(): Promise<Record<string, string>> {
  const w = mainWindow()
  if (!w) return {}
  try {
    return await w.webContents.executeJavaScript('JSON.stringify(Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])))')
      .then((s: string) => JSON.parse(s) as Record<string, string>)
  } catch { return {} }
}

async function buildPayload(dir: string, includeCaptures: boolean): Promise<BackupPayload> {
  const entries = []
  for (const rel of collectFiles(dir, { includeCaptures })) {
    try { entries.push(toPortable(rel, fs.readFileSync(path.join(dir, rel)), codec)) } catch (err) {
      // Un archivo cifrado con otra cuenta/PC no se puede leer: se saltea y se sigue.
      logger.warn('backup', `no se pudo incluir ${rel}: ${cleanErr(err)}`)
    }
  }
  return { format: 'setto-backup', v: 1, createdAt: Date.now(), appVersion: app.getVersion(), entries, local: await readLocalStorage() }
}

async function writeBackup(file: string, pass: string, includeCaptures: boolean, dir: string): Promise<{ path: string; sizeMB: number; files: number }> {
  const payload = await buildPayload(dir, includeCaptures)
  const sealed = sealBackup(payload, pass)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(`${file}.tmp`, sealed)
  fs.renameSync(`${file}.tmp`, file)
  return { path: file, sizeMB: mb(sealed.length), files: payload.entries.length }
}

export function registerBackup(ipcMain: IpcMain, db: DatabaseService): void {
  const dir = db.getDataDir()
  const readAuto = (): AutoConfig | null => db.readEncryptedJSON<AutoConfig>(AUTO_FILE)
  const writeAuto = (c: AutoConfig | null): void => {
    if (c) db.writeEncryptedJSON(AUTO_FILE, c)
    else { try { fs.unlinkSync(path.join(dir, AUTO_FILE)) } catch { /* no había */ } }
  }

  registerHandler(ipcMain, 'backup:info', () => {
    const base = collectFiles(dir, { includeCaptures: false })
    const caps = collectFiles(dir, { includeCaptures: true }).filter((f) => f.startsWith('captures/'))
    const auto = readAuto()
    return {
      dataMB: mb(dirSizeBytes(dir, base)), files: base.length, capturesMB: mb(dirSizeBytes(dir, caps)),
      auto: auto ? { dir: auto.dir, lastAt: auto.lastAt, lastError: auto.lastError ?? null } : null,
    }
  })

  registerHandler(ipcMain, 'backup:export', async (e, pass: string, includeCaptures: boolean) => {
    const r = await saveDialog(e.sender, {
      title: 'Guardar respaldo de Setto',
      defaultPath: path.join(app.getPath('documents'), `Setto-respaldo-${stamp()}.${EXT}`),
      filters: [{ name: 'Respaldo de Setto', extensions: [EXT] }],
    })
    if (r.canceled || !r.filePath) return { ok: false, canceled: true }
    const out = await writeBackup(r.filePath, String(pass ?? ''), includeCaptures === true, dir)
    logger.info('backup', `exportado ${out.files} archivos (${out.sizeMB} MB)`)
    return { ok: true, ...out }
  })

  registerHandler(ipcMain, 'backup:pick', async (e) => {
    const r = await openDialog(e.sender, { title: 'Elegir respaldo de Setto', properties: ['openFile'], filters: [{ name: 'Respaldo de Setto', extensions: [EXT] }] })
    return r.canceled || !r.filePaths[0] ? null : r.filePaths[0]
  })

  /** Abrir y describir (sin escribir nada): fecha, versión, cantidad de archivos. */
  registerHandler(ipcMain, 'backup:inspect', (_e, file: string, pass: string) => {
    const p = openBackup(fs.readFileSync(file), String(pass ?? ''))
    return {
      createdAt: p.createdAt, appVersion: p.appVersion, files: p.entries.length,
      captures: p.entries.filter((x) => x.path.startsWith('captures/')).length,
      notes: p.entries.filter((x) => x.path.startsWith('notes/')).length,
    }
  })

  registerHandler(ipcMain, 'backup:restore', async (_e, file: string, pass: string) => {
    const p = openBackup(fs.readFileSync(file), String(pass ?? ''))
    // Copia de seguridad de lo que se va a pisar.
    const safety = path.join(dir, `restore-backup-${Date.now()}`)
    let written = 0
    for (const entry of p.entries) {
      const rel = safeRelPath(entry.path)
      if (!rel) { logger.warn('backup', `ruta ignorada: ${entry.path}`); continue }
      const target = path.join(dir, rel)
      if (fs.existsSync(target)) {
        fs.mkdirSync(path.dirname(path.join(safety, rel)), { recursive: true })
        fs.copyFileSync(target, path.join(safety, rel))
      }
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, fromPortable(entry, codec))
      written++
    }
    // localStorage de la ventana principal (tema, fuente, preferencias de vistas).
    const w = mainWindow()
    if (w && p.local && Object.keys(p.local).length) {
      const js = `(() => { const d = ${JSON.stringify(p.local)}; for (const [k, v] of Object.entries(d)) { try { localStorage.setItem(k, v) } catch {} } })()`
      try { await w.webContents.executeJavaScript(js) } catch { /* sigue igual */ }
    }
    logger.info('backup', `restaurados ${written} archivos; copia previa en ${safety}`)
    // Reiniciar sin will-quit: nada en memoria vuelve a escribir encima de lo restaurado.
    // (Las pruebas automáticas ponen SETTO_NO_RELAUNCH para no dejar una instancia suelta.)
    setTimeout(() => { if (!process.env['SETTO_NO_RELAUNCH']) app.relaunch(); app.exit(0) }, 600)
    return { ok: true, files: written, safety }
  })

  // ── Automático ──────────────────────────────────────────────────────────────
  registerHandler(ipcMain, 'backup:auto-pick-dir', async (e) => {
    const r = await openDialog(e.sender, { title: 'Carpeta para los respaldos automáticos', properties: ['openDirectory', 'createDirectory'] })
    return r.canceled || !r.filePaths[0] ? null : r.filePaths[0]
  })

  registerHandler(ipcMain, 'backup:auto-set', async (_e, cfg: { dir: string; pass: string } | null) => {
    if (!cfg) { writeAuto(null); return { ok: true } }
    if (!cfg.dir || !fs.existsSync(cfg.dir)) throw new Error('Elegí una carpeta que exista')
    if ((cfg.pass ?? '').length < 8) throw new Error('La contraseña del respaldo necesita al menos 8 caracteres')
    writeAuto({ dir: cfg.dir, pass: cfg.pass, lastAt: null })
    // Primer respaldo ya, así se ve que anda.
    return runAuto(true)
  })

  const runAuto = async (force = false): Promise<{ ok: boolean; path?: string; error?: string }> => {
    const cfg = readAuto()
    if (!cfg) return { ok: false, error: 'Respaldo automático apagado' }
    if (!force && cfg.lastAt && Date.now() - cfg.lastAt < AUTO_EVERY_MS) return { ok: true }
    try {
      const file = path.join(cfg.dir, `Setto-respaldo-${stamp()}.${EXT}`)
      const out = await writeBackup(file, cfg.pass, false, dir)
      // Dejar sólo los últimos AUTO_KEEP.
      const mine = fs.readdirSync(cfg.dir).filter((f) => /^Setto-respaldo-\d{4}-\d{2}-\d{2}\.settobackup$/.test(f)).sort()
      for (const old of mine.slice(0, Math.max(0, mine.length - AUTO_KEEP))) { try { fs.unlinkSync(path.join(cfg.dir, old)) } catch { /* en uso */ } }
      writeAuto({ ...cfg, lastAt: Date.now(), lastError: undefined })
      logger.info('backup', `automático: ${out.path}`)
      return { ok: true, path: out.path }
    } catch (err) {
      writeAuto({ ...cfg, lastError: cleanErr(err) })
      logger.warn('backup', `automático falló: ${cleanErr(err)}`)
      return { ok: false, error: cleanErr(err) }
    }
  }
  registerHandler(ipcMain, 'backup:auto-run', () => runAuto(true))

  setTimeout(() => { void runAuto() }, AUTO_FIRST_DELAY_MS)
  setInterval(() => { void runAuto() }, 6 * 3600_000).unref?.()
}
