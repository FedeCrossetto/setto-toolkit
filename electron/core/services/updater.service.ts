/**
 * UpdaterService — wraps electron-updater to provide silent background update checks.
 *
 * Flow:
 *  1. On app ready, call checkForUpdates() — runs silently in background.
 *  2. If an update is available, the renderer is notified via IPC ('updater:status').
 *  3. The renderer can call 'updater:install' to quit and install.
 *
 * Requires the electron-builder publish config to point at a GitHub release:
 *   "publish": { "provider": "github", "owner": "<owner>", "repo": "<repo>" }
 */
import { app, ipcMain, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { logger } from '../logger'

export type UpdaterStatus =
  | { type: 'checking' }
  | { type: 'available'; version: string; releaseNotes: string }
  | { type: 'not-available' }
  | { type: 'downloading'; percent: number }
  | { type: 'ready'; version: string }
  | { type: 'error'; message: string }

function sendStatus(win: BrowserWindow | null, status: UpdaterStatus): void {
  win?.webContents.send('updater:status', status)
}

export function initUpdater(getWindow: () => BrowserWindow | null): void {
  // Disable in dev — electron-updater can't find a feed in dev mode
  if (!app.isPackaged) {
    logger.info('Updater', 'Skipping auto-update — running in dev mode')
    return
  }

  autoUpdater.autoDownload = false       // ask the user before downloading
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    logger.info('Updater', 'Checking for updates…')
    sendStatus(getWindow(), { type: 'checking' })
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
    sendStatus(getWindow(), { type: 'not-available' })
  })

  autoUpdater.on('download-progress', (progress) => {
    sendStatus(getWindow(), { type: 'downloading', percent: Math.round(progress.percent) })
  })

  autoUpdater.on('update-downloaded', (info) => {
    logger.info('Updater', `Update downloaded: ${info.version}`)
    sendStatus(getWindow(), { type: 'ready', version: info.version })
  })

  autoUpdater.on('error', (err) => {
    logger.error('Updater', 'Auto-update error', err.message)
    sendStatus(getWindow(), { type: 'error', message: err.message })
  })

  // IPC: renderer triggers download
  ipcMain.handle('updater:download', async () => {
    await autoUpdater.downloadUpdate()
    return { ok: true }
  })

  // IPC: renderer triggers quit-and-install
  ipcMain.on('updater:install', () => {
    autoUpdater.quitAndInstall()
  })

  // Check once on startup, then every 4 hours
  void autoUpdater.checkForUpdates()
  setInterval(() => { void autoUpdater.checkForUpdates() }, 4 * 60 * 60 * 1000)
}
