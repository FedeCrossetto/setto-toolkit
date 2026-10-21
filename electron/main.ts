import { existsSync } from 'fs'
import { app, BrowserWindow, nativeImage, net, shell, session, dialog, globalShortcut } from 'electron'
import path from 'path'
import { DatabaseService } from './core/services/db.service'
import { SettingsService } from './core/services/settings.service'
import { AIService } from './core/services/ai.service'
import { AuthService } from './core/services/auth.service'
import { GastosStorageService } from './core/services/gastos-storage.service'
import { SyncService } from './core/services/sync.service'
import { initUpdater } from './core/services/updater.service'
import { loadWindowState, trackWindowState } from './core/services/window-state.service'
import { loadPlugins } from './core/plugin-loader'
import { ipcMain } from 'electron'
import { registerFileAssociations, getFileArgFromArgv } from './core/file-associations'
import { logger } from './core/logger'
import { setupQuickCapture, teardownQuickCapture } from './core/quick-capture'
import { registerNotifications } from './core/notifications'
import { registerSnippetPicker, teardownSnippetPicker } from './core/snippet-picker'
import { registerClipboardHistory, teardownClipboardHistory } from './core/clipboard-history'
import { registerClipboardActions, teardownClipboardActions } from './core/clipboard-actions'
import { closeStartupSplash, showStartupSplash } from './core/startup-splash'
import { destroyDock, registerDock } from './core/dock'
import { registerBackup } from './core/backup-service'
import { registerCaptureScheme } from './plugins/captures/handlers'
import { installIpcGuard } from './core/ipc-guard'
import { registerRemoteImage } from './core/remote-image'
import { applySavedTheme, micaActive, micaWindowOptions, registerMica } from './core/mica'

// E2E tests pass --user-data-dir so each run gets an isolated profile.
// Must run before app.ready — after that the path is locked in.
const userDataArg = process.argv.find((a) => a.startsWith('--user-data-dir='))
if (userDataArg) app.setPath('userData', userDataArg.slice('--user-data-dir='.length))

// Protocolo de las imágenes del módulo Capturas: tiene que registrarse antes de app.ready.
registerCaptureScheme()

let mainWindow: BrowserWindow | null = null
/** La ventana principal si sigue viva (después de `closed` / destroy es null). */
const liveWindow = (): BrowserWindow | null => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null)
// true cuando la ventana principal se creó: a partir de ahí un error no capturado no cierra la app.
let startupComplete = false
let dbForWindowState: DatabaseService | null = null
let settingsRef: SettingsService | null = null
let syncService: SyncService | null = null
// true desde que el usuario pidió salir (bandeja → Salir, actualización): ahí sí se cierra.
let quitting = false
/** Módulos con cambios sin guardar (los manda el renderer por `app:dirty`). */
let dirtyModules: string[] = []
/** El usuario ya confirmó "Cerrar sin guardar". */
let forceClose = false
ipcMain.on('app:dirty', (_e, names: unknown) => {
  dirtyModules = Array.isArray(names) ? names.filter((n): n is string => typeof n === 'string').slice(0, 20) : []
})

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
//
// Every other uncaught exception (e.g. a DB/network failure during startup) used
// to fall through to Electron's default handler, which in a packaged build just
// terminates the process with zero feedback — the app appears to silently vanish.
// Instead, show the user what happened before quitting, and don't ever re-throw
// (a second exception inside this handler is what causes the silent hard crash).
function reportFatalError(err: unknown): void {
  const message = err instanceof Error ? `${err.message}\n\n${err.stack ?? ''}` : String(err)
  logger.error('main', 'Fatal uncaught exception', message)
  try {
    dialog.showErrorBox('Setto Toolkit — Error inesperado', `La aplicación encontró un error y necesita cerrarse.\n\n${message}`)
  } catch {
    // dialog can fail if called before the app is ready — nothing more we can do here
  }
}

// Después del arranque, un error suelto (casi siempre de un timer: guardar un archivo,
// un callback de red) no justifica cerrar la app y perder lo que el usuario tiene abierto.
// Se registra y se avisa sin bloquear (como mucho un aviso por minuto).
let lastErrorDialogAt = 0
function reportRecoverableError(err: unknown): void {
  const message = err instanceof Error ? `${err.message}\n\n${err.stack ?? ''}` : String(err)
  logger.error('main', 'Uncaught exception (recovered)', message)
  if (Date.now() - lastErrorDialogAt < 60_000) return
  lastErrorDialogAt = Date.now()
  const opts = {
    type: 'warning' as const,
    title: 'Setto — Error inesperado',
    message: 'Algo falló en segundo plano, pero Setto sigue funcionando.',
    detail: `Si notás algo raro, reiniciá la app. El detalle quedó en el registro (Ajustes → Exportar logs).\n\n${err instanceof Error ? err.message : String(err)}`,
    buttons: ['Aceptar'],
    noLink: true,
  }
  const win = liveWindow()
  void (win ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts)).catch(() => undefined)
}

process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE') return
  if (startupComplete) {
    try { reportRecoverableError(err) } catch { /* nunca relanzar desde acá */ }
    return
  }
  // Durante el arranque (no se pudo crear la ventana principal) no hay forma de seguir.
  reportFatalError(err)
  app.exit(1)
})

process.on('unhandledRejection', (reason) => {
  // A rejected promise alone doesn't crash the process, so this is a soft report —
  // log it and keep running rather than treat it as fatal.
  logger.error('main', 'Unhandled promise rejection', reason instanceof Error ? reason.message : String(reason))
})

// Windows taskbar / Jump List / notificaciones: la app instalada usa `build.appId`.
// La copia de desarrollo (electron.exe de node_modules) usa OTRO id: si comparten el
// mismo, Windows asocia la app instalada al acceso "Electron" y muestra su ícono.
const APP_USER_MODEL_ID = app.isPackaged ? 'com.devtoolkit.app' : 'com.devtoolkit.app.dev'
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_USER_MODEL_ID)
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
  const mainWindow = liveWindow()
  logger.info('open-file', 'received', { filePath, rendererReady, hasWindow: !!mainWindow })

  if (rendererReady && mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
    mainWindow.webContents.send('open-file', filePath)
    logger.info('open-file', 'pushed to renderer')
  } else {
    pendingFileToOpen = filePath
    logger.info('open-file', 'queued as pending', { pendingFileToOpen })
    if (app.isReady() && !liveWindow()) {
      logger.info('open-file', 'no windows open — creating window')
      createWindow()
    }
  }
})

// Single instance lock — second launch passes its argv here and quits.
// Sin el lock no se inicializa nada más (ver el guard en whenReady): la segunda
// instancia no debe tocar archivos ni registrar atajos mientras se cierra.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

// En desarrollo no se registran atajos globales: robarían los de la app instalada
// (Ctrl+Shift+Space, Ctrl+Alt+V…). SETTO_DEV_SHORTCUTS=1 los habilita para probarlos.
if (!app.isPackaged && process.env['SETTO_DEV_SHORTCUTS'] !== '1') {
  globalShortcut.register = ((accelerator: string): boolean => {
    logger.info('main', `dev: atajo global ${accelerator} no registrado (SETTO_DEV_SHORTCUTS=1 para habilitar)`)
    return false
  }) as typeof globalShortcut.register
}

app.on('second-instance', (_e, argv) => {
  const mainWindow = liveWindow()
  // Bring existing window to front
  if (mainWindow) {
    if (!mainWindow.isVisible()) mainWindow.show()
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
  const filePath = getFileArgFromArgv(argv)
  if (!filePath) return

  if (rendererReady && mainWindow) {
    // Renderer is mounted and listening — push directly
    mainWindow.webContents.send('open-file', filePath)
    logger.info('second-instance', 'pushed file to renderer', { filePath })
  } else {
    // Window was just (re)created and renderer hasn't mounted yet — queue it
    pendingFileToOpen = filePath
    logger.info('second-instance', 'queued as pending', { filePath })
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
  const savedBounds = dbForWindowState ? loadWindowState(dbForWindowState) : {}
  mainWindow = new BrowserWindow({
    width: savedBounds.width ?? 1400,
    height: savedBounds.height ?? 900,
    x: savedBounds.x,
    y: savedBounds.y,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    // Neutro claro: evita filtrado azulado en bordes con tema light; el contenido oscuro cubre en dark.
    backgroundColor: '#F4F4F5', // igual al fondo de la pantalla de apertura (index.html)
    ...micaWindowOptions(micaActive(settingsRef)),   // Windows 11: fondo Mica (core/mica.ts)
    show: false,
    autoHideMenuBar: true,
    icon: getWindowIcon(),
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      // El preload expone a cada ventana sólo sus canales (ver electron/preload.ts).
      additionalArguments: ['--setto-role=main'],
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

  // Block in-window navigation away from the app (e.g. a dragged link or injected redirect)
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devServer = process.env['ELECTRON_RENDERER_URL']
    if (devServer && url.startsWith(devServer)) return
    if (url.startsWith('file://')) return
    event.preventDefault()
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') shell.openExternal(url)
    } catch { /* invalid URL — drop it */ }
  })

  if (dbForWindowState) trackWindowState(mainWindow, dbForWindowState)

  // Restore maximized state after the window is fully created
  if (savedBounds.maximized) mainWindow.maximize()

  mainWindow.on('ready-to-show', () => {
    liveWindow()?.show()
    closeStartupSplash()
  })

  // Ajustes → "Al cerrar, seguir en la bandeja": la X oculta la ventana (los avisos
  // y los atajos globales siguen funcionando); Salir desde la bandeja cierra de verdad.
  mainWindow.on('close', (e) => {
    if (!quitting && settingsRef?.get('app.close_to_tray') === '1') {
      e.preventDefault()
      liveWindow()?.hide()
      return
    }
    // Cambios sin guardar (el renderer avisa por `app:dirty`): confirmar antes de cerrar.
    // (en los tests automáticos no hay nadie para responder el diálogo)
    if (dirtyModules.length && !forceClose && process.env['SETTO_E2E'] !== '1') {
      e.preventDefault()
      const win = liveWindow()
      if (!win) return
      void dialog.showMessageBox(win, {
        type: 'warning',
        buttons: ['Cerrar sin guardar', 'Cancelar'],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
        title: 'Setto',
        message: 'Hay cambios sin guardar',
        detail: `En: ${dirtyModules.join(', ')}. Si cerrás ahora se pierden.`,
      }).then(({ response }) => {
        if (response === 0) { forceClose = true; liveWindow()?.close() }
        else quitting = false
      }).catch(() => undefined)
    }
  })
  // Sin la ventana principal no tiene sentido mantener el selector de snippets vivo
  // (además impediría que se dispare window-all-closed).
  mainWindow.on('closed', () => { mainWindow = null; teardownSnippetPicker(); destroyDock() })

  // Fallback: show the window after 3 s even if ready-to-show hasn't fired yet.
  // Prevents an invisible window when the renderer has a startup error.
  setTimeout(() => { const w = liveWindow(); if (w && !w.isVisible()) { w.show(); closeStartupSplash() } }, 3000)

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
    liveWindow()?.webContents.send('page:found', result)
  })

  // Watchdog: si la interfaz no respondió en 25 s (carga colgada), recargar una vez.
  setTimeout(() => {
    const w = liveWindow()
    if (!rendererReady && w) {
      logger.warn('main', 'renderer not ready after 25s — reloading')
      w.webContents.reload()
    }
  }, 25_000)

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

// Windows taskbar identity (must be set before app is ready)
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_USER_MODEL_ID)
}

// Si el servicio de red de Chromium se cae mientras la ventana todavía está cargando,
// la carga queda colgada para siempre (sin did-fail-load). Recargar cuando se reinicia.
// Cualquier ventana (principal, barra, selector) cuyo proceso se cae o se cuelga: dejar
// rastro en app.log (en producción no hay consola) para poder diagnosticarlo.
app.on('render-process-gone', (_e, wc, details) => {
  logger.error('main', 'render process gone', { url: wc.getURL().replace(/^.*#/, '#'), reason: details.reason, exitCode: details.exitCode })
})
app.on('web-contents-created', (_e, wc) => {
  wc.on('unresponsive', () => logger.warn('main', 'ventana sin responder', { url: wc.getURL().replace(/^.*#/, '#') }))
})

app.on('child-process-gone', (_e, details) => {
  if (details.type !== 'Utility' || !/network/i.test(details.serviceName ?? details.name ?? '')) return
  logger.warn('main', 'network service gone', { reason: details.reason })
  if (!rendererReady && liveWindow()) {
    setTimeout(() => { if (!rendererReady) liveWindow()?.webContents.reload() }, 800)
  }
})

app.whenReady().then(() => {
  if (!gotLock) return   // segunda instancia: ya le pasó el argv a la primera y se está cerrando
  // Ventanita "Abriendo Setto…" lo antes posible: se cierra cuando la principal está lista.
  showStartupSplash(getWindowIcon())

  // ── Content Security Policy ─────────────────────────────────────────────
  // Applied to every response including local file:// loads.
  // In dev mode we also allow the Vite HMR websocket origin.
  const isDev = !!process.env['ELECTRON_RENDERER_URL']
  const cspConnectExtra = isDev ? ' ws://localhost:* http://localhost:*' : ''
  const cspScriptExtra  = isDev ? " 'unsafe-inline' 'unsafe-eval' http://localhost:*" : ''  // Vite HMR preamble needs inline + eval
  const IMG_SRC = "'self' data: blob: setto-capture: https://www.google.com https://*.gstatic.com https://*.googleusercontent.com https://avatars.githubusercontent.com https://secure.gravatar.com https://gitlab.com https://*.atl-paas.net https://bitbucket.org"
  const csp = [
    "default-src 'self'",
    `script-src 'self'${cspScriptExtra}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    // Sin `https:` genérico: una imagen remota en un .md (Notas, Editor) no se carga sola
    // (core/remote-image.ts). Sólo los hosts de favicons de Claves y avatares de cuentas.
    `img-src ${IMG_SRC}`,
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

  // Register file associations in Windows "Open with" menu — en segundo plano y sólo si
  // cambió algo; no debe demorar la apertura (antes trababa ~15 s). Ver file-associations.ts
  // __filename = compiled main script path (e.g. out/main/index.js) — needed in dev
  setTimeout(() => registerFileAssociations(process.execPath, __filename), 4000)

  // Initialize core services
  const db = new DatabaseService()
  dbForWindowState = db
  const settings = new SettingsService(db)
  settingsRef = settings
  const ai = new AIService(db, settings)
  const auth = new AuthService(db)
  const gastosStorage = new GastosStorageService(db, settings)
  const services = { db, settings, ai, auth, gastosStorage }

  // Canales sensibles (terminal, escribir/borrar archivos, ajustes, claves, respaldos):
  // sólo desde la ventana principal. Tiene que ir antes de registrar los handlers.
  installIpcGuard(ipcMain, (wc) => wc === liveWindow()?.webContents)

  // Register all plugin IPC handlers
  loadPlugins(ipcMain, services)
  registerMica(ipcMain, settings, liveWindow)
  applySavedTheme(settings)

  // ── One-time IPC handlers (must not be inside createWindow — it can be called again on macOS) ──

  // Window controls — registered once here, not inside createWindow().
  // createWindow() can be called multiple times on macOS (Dock re-activate) and
  // ipcMain.on() accumulates listeners rather than replacing them.
  ipcMain.on('window:minimize', () => liveWindow()?.minimize())
  ipcMain.on('window:maximize', () => {
    const w = liveWindow()
    if (!w) return
    if (w.isMaximized()) w.unmaximize()
    else w.maximize()
  })
  ipcMain.on('window:close', () => liveWindow()?.close())

  // Find-in-page
  ipcMain.on('page:find', (_e, text: string, opts: { forward: boolean; findNext: boolean; matchCase: boolean }) => {
    if (typeof text !== 'string' || !text) return
    liveWindow()?.webContents.findInPage(text, opts)
  })
  ipcMain.on('page:find-stop', () => {
    liveWindow()?.webContents.stopFindInPage('clearSelection')
  })

  ipcMain.handle('app:version', () => app.getVersion())

  // Renderer-side errors (async handlers, unhandled rejections) get logged to app.log
  // so packaged-build failures are visible via Settings → Exportar logs.
  ipcMain.on('app:renderer-error', (_e, payload: { kind?: string; message?: string; stack?: string }) => {
    const kind    = typeof payload?.kind === 'string' ? payload.kind.slice(0, 50) : 'unknown'
    const message = typeof payload?.message === 'string' ? payload.message.slice(0, 2000) : 'sin mensaje'
    const stack   = typeof payload?.stack === 'string' ? payload.stack.slice(0, 4000) : ''
    logger.error('renderer', `[${kind}] ${message}`, stack)
  })

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

  try {
    createWindow()
  } catch (err) {
    // Sin ventana principal la app no sirve: éste sí es un error fatal.
    reportFatalError(err)
    app.exit(1)
    return
  }
  startupComplete = true

  // Instalar una actualización cierra la ventana: no debe quedar escondida en la bandeja.
  // (Registrado antes que el handler del updater para correr primero.)
  ipcMain.on('updater:install', () => { quitting = true })

  // Init auto-updater (no-op in dev mode)
  initUpdater(liveWindow)

  // Global quick capture (Ctrl+Shift+Space) + tray icon
  setupQuickCapture(liveWindow, getWindowIcon())

  // Notificaciones nativas + selector global de snippets (Ctrl+Alt+V)
  registerNotifications(ipcMain, liveWindow, getWindowIcon())
  registerSnippetPicker(ipcMain, getWindowIcon())
  registerClipboardHistory(ipcMain, () => settings.get('app.clipboard_history') !== '0')
  registerClipboardActions(ipcMain)
  // Barra flotante a la derecha (Ajustes → Escritorio)
  registerDock(ipcMain, settings, getWindowIcon(), liveWindow)
  registerBackup(ipcMain, db)
  registerRemoteImage(ipcMain, (url, init) => net.fetch(url, init))

  // Sincronización opcional de Notas y Snippets con Supabase (Ajustes → Sincronización)
  syncService = new SyncService(db, settings, gastosStorage, liveWindow)
  syncService.register(ipcMain)

  app.on('activate', () => {
    if (!liveWindow()) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => { quitting = true })

app.on('will-quit', () => { teardownQuickCapture(); teardownSnippetPicker(); teardownClipboardHistory(); teardownClipboardActions(); syncService?.stop() })
