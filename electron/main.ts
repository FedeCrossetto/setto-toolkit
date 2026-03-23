import { app, BrowserWindow, shell } from 'electron'
import path from 'path'
import { DatabaseService } from './core/services/db.service'
import { SettingsService } from './core/services/settings.service'
import { AIService } from './core/services/ai.service'
import { loadPlugins } from './core/plugin-loader'
import { ipcMain } from 'electron'
import { registerFileAssociations, getFileArgFromArgv } from './core/file-associations'

let mainWindow: BrowserWindow | null = null

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
  ? path.join(__dirname, '../renderer/dev-logo.ico')
  : path.join(__dirname, '../../public/dev-logo.ico')

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
  // Register file associations in Windows "Open with" menu
  // __filename = compiled main script path (e.g. out/main/index.js) — needed in dev
  registerFileAssociations(process.execPath, __filename)

  // Initialize core services
  const db = new DatabaseService()
  const settings = new SettingsService(db)
  const ai = new AIService(db, settings)
  const services = { db, settings, ai }

  // Register all plugin IPC handlers
  loadPlugins(ipcMain, services)

  createWindow()

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
