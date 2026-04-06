import { app, BrowserWindow, shell, session } from 'electron'
import path from 'path'
import { DatabaseService } from './core/services/db.service'
import { SettingsService } from './core/services/settings.service'
import { AIService } from './core/services/ai.service'
import { AuthService } from './core/services/auth.service'
import { initUpdater } from './core/services/updater.service'
import { loadPlugins } from './core/plugin-loader'
import { ipcMain } from 'electron'
import { registerFileAssociations, getFileArgFromArgv } from './core/file-associations'

let mainWindow: BrowserWindow | null = null

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

// Resolve icon path for both dev and packaged builds
const iconPath = app.isPackaged
  ? path.join(__dirname, '../renderer/icon.ico')
  : path.join(__dirname, '../../public/icon.ico')

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0c0e17',
    show: false,
    autoHideMenuBar: true,
    icon: iconPath,
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

  // App metadata
  ipcMain.handle('app:version', () => app.getVersion())

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
    "img-src 'self' data: blob:",
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

  createWindow()

  // Init auto-updater (no-op in dev mode)
  initUpdater(() => mainWindow)

  // Send file path to renderer once the window is ready
  const fileArg = getFileArgFromArgv(process.argv)
  if (fileArg) {
    mainWindow?.webContents.once('did-finish-load', () => {
      mainWindow?.webContents.send('open-file', fileArg)
    })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
