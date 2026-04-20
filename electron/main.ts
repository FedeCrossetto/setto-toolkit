import { existsSync } from 'fs'
import { app, BrowserWindow, nativeImage, shell, session } from 'electron'
import path from 'path'
import { DatabaseService } from './core/services/db.service'
import { SettingsService } from './core/services/settings.service'
import { AIService } from './core/services/ai.service'
import { AuthService } from './core/services/auth.service'
import { initUpdater } from './core/services/updater.service'
import { loadPlugins } from './core/plugin-loader'
import { ipcMain } from 'electron'
import { registerFileAssociations, getFileArgFromArgv } from './core/file-associations'
import { logger } from './core/logger'

let mainWindow: BrowserWindow | null = null

// File path queued by the OS before the renderer was ready to receive it.
// The renderer pulls this via app:pending-file once React has mounted.
let pendingFileToOpen: string | null = null

// Set to true the first time the renderer calls app:pending-file (React is mounted).
// Allows open-file to push directly instead of queuing when the renderer is already up.
// Reset to false each time createWindow() is called so a fresh renderer starts clean.
let rendererReady = false

// Suppress EPIPE errors thrown by node-pty's internal ConPTY pipes when a
// child process exits while the main process still holds a read handle.
// These are benign — the PTY exit handler already cleans up the session.
// IMPORTANT: must not re-throw inside uncaughtException — that causes a fatal
// double-exception crash. We remove the listener first so Electron's default
// crash reporter handles all non-EPIPE errors normally.
function epipeHandler(err: NodeJS.ErrnoException): void {
  if (err.code === 'EPIPE') return
  process.removeListener('uncaughtException', epipeHandler)
  throw err
}
process.on('uncaughtException', epipeHandler)

// Windows taskbar / Jump List: must match package.json `build.appId` or the shell keeps a stale/generic icon.
if (process.platform === 'win32') {
  app.setAppUserModelId('com.devtoolkit.app')
}

// macOS: Finder double-click / "Open with" fires this event instead of populating argv.
// Must be registered before app.whenReady() — it can fire during the launch sequence.
//
// Push vs pull strategy:
//   rendererReady=true  → renderer is mounted and listening → push via send()
//   rendererReady=false → renderer not loaded yet (cold start, new window) → store and let
//                         the renderer pull via app:pending-file on mount
//
// This avoids the race where on macOS cold start open-file fires AFTER app.whenReady()
// (so mainWindow already exists) but BEFORE React has mounted and registered its listener.
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  logger.info('open-file', 'received', { filePath, rendererReady, hasWindow: !!mainWindow })

  if (rendererReady && mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
    mainWindow.webContents.send('open-file', filePath)
    logger.info('open-file', 'pushed to renderer')
  } else {
    pendingFileToOpen = filePath
    logger.info('open-file', 'queued as pending', { pendingFileToOpen })
    if (app.isReady() && BrowserWindow.getAllWindows().length === 0) {
      logger.info('open-file', 'no windows open — creating window')
      createWindow()
    }
  }
})

// Single instance lock — second launch passes its argv here and quits
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

app.on('second-instance', (_e, argv) => {
  // Bring existing window to front
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
  const filePath = getFileArgFromArgv(argv)
  if (filePath && mainWindow) {
    mainWindow.webContents.send('open-file', filePath)
  }
})

/** Window / taskbar icon. Prefer copy outside app.asar — Windows often ignores icons loaded from inside the archive. */
function resolveWindowIconPath(): string {
  if (!app.isPackaged) {
    return path.join(__dirname, '../../public/icon.ico')
  }
  const unpacked = path.join(process.resourcesPath, 'app.asar.unpacked', 'out', 'renderer', 'icon.ico')
  if (existsSync(unpacked)) {
    return unpacked
  }
  return path.join(__dirname, '../renderer/icon.ico')
}

const iconPath = resolveWindowIconPath()

function getWindowIcon(): Electron.NativeImage | string {
  const img = nativeImage.createFromPath(iconPath)
  return img.isEmpty() ? iconPath : img
}

function createWindow(): void {
  rendererReady = false   // fresh window = renderer not ready until it calls app:pending-file
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    // Neutro claro: evita filtrado azulado en bordes con tema light; el contenido oscuro cubre en dark.
    backgroundColor: '#ffffff',
    show: false,
    autoHideMenuBar: true,
    icon: getWindowIcon(),
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Open external links in the default browser — only allow http/https
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        shell.openExternal(url)
      }
    } catch {
      // Invalid URL — ignore
    }
    return { action: 'deny' }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // Fallback: show the window after 3 s even if ready-to-show hasn't fired yet.
  // Prevents an invisible window when the renderer has a startup error.
  setTimeout(() => { if (mainWindow && !mainWindow.isVisible()) mainWindow.show() }, 3000)

  if (process.env['ELECTRON_RENDERER_URL']) {
    // Auto-open DevTools in dev mode to see renderer errors
    mainWindow.webContents.openDevTools({ mode: 'detach' })

    // Log renderer crashes so we can diagnose startup failures
    mainWindow.webContents.on('render-process-gone', (_e, details) => {
      console.error('[main] Renderer process gone:', details.reason, details.exitCode)
    })
    mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
      console.error('[main] Failed to load renderer:', code, desc, url)
    })
  }

  // Forward found-in-page results back to renderer
  mainWindow.webContents.on('found-in-page', (_e, result) => {
    mainWindow?.webContents.send('page:found', result)
  })

  // Window controls IPC
  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })
  ipcMain.on('window:close', () => mainWindow?.close())

  // Find-in-page
  ipcMain.on('page:find', (_e, text: string, opts: { forward: boolean; findNext: boolean; matchCase: boolean }) => {
    mainWindow?.webContents.findInPage(text, opts)
  })
  ipcMain.on('page:find-stop', () => {
    mainWindow?.webContents.stopFindInPage('clearSelection')
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

// Windows taskbar identity (must be set before app is ready)
if (process.platform === 'win32') {
  app.setAppUserModelId('com.devtoolkit.app')
}

app.whenReady().then(() => {
  // ── Content Security Policy ─────────────────────────────────────────────
  // Applied to every response including local file:// loads.
  // In dev mode we also allow the Vite HMR websocket origin.
  const isDev = !!process.env['ELECTRON_RENDERER_URL']
  const cspConnectExtra = isDev ? ' ws://localhost:* http://localhost:*' : ''
  const cspScriptExtra  = isDev ? " 'unsafe-inline' 'unsafe-eval' http://localhost:*" : ''  // Vite HMR preamble needs inline + eval
  const csp = [
    "default-src 'self'",
    `script-src 'self'${cspScriptExtra}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    `connect-src 'self' https://api.openai.com https://api.bitbucket.org https://api.github.com${cspConnectExtra}`,
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; ')

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    })
  })

  // Register file associations in Windows "Open with" menu
  // __filename = compiled main script path (e.g. out/main/index.js) — needed in dev
  registerFileAssociations(process.execPath, __filename)

  // Initialize core services
  const db = new DatabaseService()
  const settings = new SettingsService(db)
  const ai = new AIService(db, settings)
  const auth = new AuthService(db)
  const services = { db, settings, ai, auth }

  // Register all plugin IPC handlers
  loadPlugins(ipcMain, services)

  // ── One-time IPC handlers (must not be inside createWindow — it can be called again on macOS) ──
  ipcMain.handle('app:version', () => app.getVersion())

  // Renderer pulls this once mounted. Calling this signals that React is up and listening,
  // so subsequent open-file events can be pushed directly without queueing.
  // Returns the pending file path without consuming it immediately.
  // The renderer retries up to 3 times with delays so that open-file events
  // arriving after the first poll (common on macOS cold start) are still caught.
  // pendingFileToOpen is cleared only once the renderer has received a non-null value.
  ipcMain.handle('app:pending-file', () => {
    rendererReady = true
    const filePath = pendingFileToOpen
    if (filePath) pendingFileToOpen = null   // consume only when there is something to return
    logger.info('app:pending-file', 'polled by renderer', { filePath })
    return filePath
  })

  // Capture file from argv before creating the window so it is available the moment
  // the renderer mounts and calls app:pending-file. On macOS this is already set by
  // the open-file event handler above; on Windows/Linux it comes from argv.
  if (!pendingFileToOpen) {
    pendingFileToOpen = getFileArgFromArgv(process.argv)
  }
  logger.info('main', 'app ready', { pendingFileToOpen, argv: process.argv })

  createWindow()

  // Init auto-updater (no-op in dev mode)
  initUpdater(() => mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
