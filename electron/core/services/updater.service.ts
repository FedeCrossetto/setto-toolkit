/**
 * UpdaterService — wraps electron-updater to provide silent background update checks.
 *
 * Flow:
 *  1. On app ready (and every 4 h) a silent automatic check runs.
 *  2. If an update is available, the renderer is notified via IPC ('updater:status').
 *  3. The renderer can call 'updater:download' and then 'updater:install' (quit and install).
 *  4. Ajustes → "Buscar actualizaciones" calls 'updater:check' (manual check).
 *
 * Errors: automatic checks fail often for reasons that aren't the user's (no
 * published release yet, GitHub 404/403, offline). Those are logged as `info`
 * and never reach the renderer. Only manual checks and downloads report errors.
 *
 * Requires the electron-builder publish config to point at a GitHub release:
 *   "publish": { "provider": "github", "owner": "<owner>", "repo": "<repo>" }
 */
import { app, ipcMain, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { logger } from '../logger'
import { friendlyUpdaterError, isQuietUpdaterError } from './updater-errors'

export type UpdaterStatus =
  | { type: 'checking'; manual: boolean }
  | { type: 'available'; version: string; releaseNotes: string }
  | { type: 'not-available'; manual: boolean }
  | { type: 'downloading'; percent: number; transferred: number; total: number; bytesPerSecond: number }
  | { type: 'ready'; version: string }
  | { type: 'error'; message: string; phase: 'check' | 'download' }

export type UpdaterCheckResult =
  | { ok: true; available: boolean; version?: string; current: string }
  | { ok: false; error: string; current: string; dev?: boolean }

/** What the updater is doing right now — decides whether an error is shown. */
type Phase = 'idle' | 'auto-check' | 'manual-check' | 'download'

const CHECK_EVERY_MS = 4 * 60 * 60 * 1000

function sendStatus(win: BrowserWindow | null, status: UpdaterStatus): void {
  if (win && !win.isDestroyed()) win.webContents.send('updater:status', status)
}

const errMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err))

export function initUpdater(getWindow: () => BrowserWindow | null): void {
  const current = app.getVersion()
  const devError = 'Las actualizaciones sólo funcionan en la app instalada.'

  // Dev: electron-updater can't find a feed. The IPC handlers are still registered
  // so the renderer gets a clear answer instead of "No handler registered".
  if (!app.isPackaged) {
    logger.info('Updater', 'Skipping auto-update — running in dev mode')
    ipcMain.handle('updater:check', (): UpdaterCheckResult => ({ ok: false, dev: true, current, error: devError }))
    ipcMain.handle('updater:download', () => ({ ok: false, error: devError }))
    return
  }

  autoUpdater.autoDownload = false       // ask the user before downloading
  autoUpdater.autoInstallOnAppQuit = true

  let phase: Phase = 'idle'

  autoUpdater.on('checking-for-update', () => {
    logger.info('Updater', `Checking for updates… (${phase})`)
    if (phase === 'manual-check') sendStatus(getWindow(), { type: 'checking', manual: true })
  })

  autoUpdater.on('update-available', (info) => {
    logger.info('Updater', `Update available: ${info.version}`)
    sendStatus(getWindow(), {
      type: 'available',
      version: info.version,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : '',
    })
  })

  autoUpdater.on('update-not-available', () => {
    logger.info('Updater', 'Already on latest version')
    sendStatus(getWindow(), { type: 'not-available', manual: phase === 'manual-check' })
  })

  autoUpdater.on('download-progress', (p) => {
    sendStatus(getWindow(), {
      type: 'downloading',
      percent: Math.round(p.percent),
      transferred: p.transferred,
      total: p.total,
      bytesPerSecond: p.bytesPerSecond,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    phase = 'idle'
    logger.info('Updater', `Update downloaded: ${info.version}`)
    sendStatus(getWindow(), { type: 'ready', version: info.version })
  })

  // The 'error' event fires in addition to the rejected promise. Only report it to
  // the renderer when the user is waiting for it (manual check or download).
  autoUpdater.on('error', (err) => {
    const message = errMessage(err)
    if (phase === 'download') {
      logger.error('Updater', 'Download failed', message)
      sendStatus(getWindow(), { type: 'error', phase: 'download', message: friendlyUpdaterError(message) })
    } else if (phase === 'manual-check') {
      logger.warn('Updater', 'Manual check failed', message)
      sendStatus(getWindow(), { type: 'error', phase: 'check', message: friendlyUpdaterError(message) })
    } else if (isQuietUpdaterError(message)) {
      logger.info('Updater', 'Automatic check skipped', message.split('\n')[0])
    } else {
      logger.warn('Updater', 'Automatic check failed', message)
    }
  })

  /** Never rejects: automatic checks used to leave unhandled rejections behind. */
  async function check(manual: boolean): Promise<UpdaterCheckResult> {
    if (phase === 'download') return { ok: false, current, error: 'Ya se está descargando una actualización.' }
    phase = manual ? 'manual-check' : 'auto-check'
    try {
      const result = await autoUpdater.checkForUpdates()
      return { ok: true, available: !!result?.isUpdateAvailable, version: result?.updateInfo?.version, current }
    } catch (err) {
      return { ok: false, current, error: friendlyUpdaterError(errMessage(err)) }
    } finally {
      if ((phase as Phase) !== 'download') phase = 'idle'   // a download may have started meanwhile
    }
  }

  // IPC: manual "Buscar actualizaciones" (Ajustes → Acerca de)
  ipcMain.handle('updater:check', () => check(true))

  // IPC: renderer triggers download (progress and errors arrive via 'updater:status')
  ipcMain.handle('updater:download', async () => {
    phase = 'download'
    try {
      await autoUpdater.downloadUpdate()
      return { ok: true }
    } catch (err) {
      const message = errMessage(err)
      logger.error('Updater', 'downloadUpdate failed', message)
      phase = 'idle'
      return { ok: false, error: friendlyUpdaterError(message) }
    }
  })

  // IPC: renderer triggers quit-and-install
  ipcMain.on('updater:install', () => {
    try {
      autoUpdater.quitAndInstall()
    } catch (err) {
      logger.error('Updater', 'quitAndInstall failed', errMessage(err))
      sendStatus(getWindow(), { type: 'error', phase: 'download', message: friendlyUpdaterError(errMessage(err)) })
    }
  })

  // Check once on startup (a bit later, so it doesn't compete with the first paint),
  // then every 4 hours.
  setTimeout(() => { void check(false) }, 10_000)
  setInterval(() => { void check(false) }, CHECK_EVERY_MS)
}
