import { app, BrowserWindow, clipboard, globalShortcut, screen } from 'electron'
import type { IpcMain, NativeImage } from 'electron'
import path from 'path'
import type { SettingsService } from './services/settings.service'
import { foregroundWindow } from './win-helper'
import { simulatePaste } from './snippet-picker'
import { clipText } from './clipboard-history'
import { showWindow } from './notifications'
import { logger } from './logger'

/**
 * Barra flotante a la derecha de la pantalla ("dock"): una pestañita fina pegada
 * al borde que al pasar el mouse (o con Ctrl+Alt+D) se despliega con lo último
 * copiado, capturas, snippets fijados, tickets y acciones rápidas.
 *
 * - No roba el foco (ventana no "focusable"): un clic pega directo en la app que
 *   estabas usando. Sólo al escribir en su buscador se vuelve focusable.
 * - Se oculta sola si la app de adelante está en pantalla completa (juegos, videos).
 * - Mismo renderer, ruta `#dock` (ver src/main.tsx y src/dock/Dock.tsx).
 */

const SETTING = 'app.dock'
const SHORTCUTS = ['CommandOrControl+Alt+D', 'CommandOrControl+Alt+J']
const HANDLE = { width: 10, height: 132 }
const PANEL_WIDTH = 360
const MARGIN = 8
const FULLSCREEN_POLL_MS = 2000

let dock: BrowserWindow | null = null
let expanded = false
let pinned = false
let hiddenForFullscreen = false
let shortcut: string | null = null
let poller: ReturnType<typeof setInterval> | null = null
let getMain: () => BrowserWindow | null = () => null

const area = (): Electron.Rectangle => screen.getPrimaryDisplay().workArea

function boundsFor(isExpanded: boolean): Electron.Rectangle {
  const a = area()
  if (!isExpanded) {
    return { x: a.x + a.width - HANDLE.width, y: Math.round(a.y + (a.height - HANDLE.height) / 2), ...HANDLE }
  }
  const height = Math.min(a.height - MARGIN * 2, 760)
  return { x: a.x + a.width - PANEL_WIDTH - MARGIN, y: Math.round(a.y + (a.height - height) / 2), width: PANEL_WIDTH, height }
}

function send(): void {
  if (dock && !dock.isDestroyed()) dock.webContents.send('dock:state', { expanded, pinned, shortcut })
}

function setExpanded(next: boolean, focus = false): void {
  if (!dock || dock.isDestroyed() || hiddenForFullscreen) return
  if (!next && pinned) return
  expanded = next
  dock.setBounds(boundsFor(next))
  if (!next) dock.setFocusable(false)
  if (next && focus) { dock.setFocusable(true); dock.focus() }
  send()
}

function rendererUrl(): { url?: string; file?: string } {
  const dev = process.env['ELECTRON_RENDERER_URL']
  return dev ? { url: `${dev}#dock` } : { file: path.join(__dirname, '../renderer/index.html') }
}

function create(icon: NativeImage | string): void {
  if (dock && !dock.isDestroyed()) return
  dock = new BrowserWindow({
    ...boundsFor(false),
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,         // un clic no le saca el foco a la app que estás usando
    alwaysOnTop: true,
    icon,
    title: 'Setto',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  dock.setAlwaysOnTop(true, 'floating')
  dock.webContents.on('will-navigate', (e) => e.preventDefault())
  dock.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  dock.on('blur', () => { if (expanded && !pinned) setExpanded(false) })
  dock.on('closed', () => { dock = null; expanded = false })
  dock.once('ready-to-show', () => { if (!hiddenForFullscreen) dock?.showInactive() })
  const { url, file } = rendererUrl()
  if (url) void dock.loadURL(url)
  else void dock.loadFile(file!, { hash: 'dock' })
}

/** Sin la ventana principal la barra no debe impedir que la app se cierre. */
export function destroyDock(): void { destroy() }

function destroy(): void {
  if (poller) clearInterval(poller)
  poller = null
  if (dock && !dock.isDestroyed()) dock.destroy()
  dock = null
  expanded = false
  pinned = false
}

/** Pantalla completa adelante (juego, video, presentación) → esconder la barra. */
function startFullscreenWatch(): void {
  if (poller || process.platform !== 'win32') return
  poller = setInterval(() => {
    if (!dock || dock.isDestroyed()) return
    void foregroundWindow().then((fg) => {
      if (!dock || dock.isDestroyed() || !fg) return
      const own = /^(setto|electron)$/i.test(fg.app)
      const full = !!fg.full && !own
      if (full === hiddenForFullscreen) return
      hiddenForFullscreen = full
      if (full) { expanded = false; dock.hide() }
      else { dock.setBounds(boundsFor(false)); dock.showInactive() }
      send()
    }).catch(() => undefined)
  }, FULLSCREEN_POLL_MS)
}

function enable(icon: NativeImage | string): void {
  create(icon)
  startFullscreenWatch()
}

function registerShortcut(icon: NativeImage | string, settings: SettingsService): void {
  for (const accel of SHORTCUTS) {
    try {
      if (globalShortcut.register(accel, () => {
        if (settings.get(SETTING) === '0') return
        if (!dock) enable(icon)
        if (hiddenForFullscreen) { hiddenForFullscreen = false; dock?.showInactive() }
        setExpanded(!expanded, true)
      })) { shortcut = accel.replace('CommandOrControl', 'Ctrl'); logger.info('dock', `Atajo global: ${accel}`); return }
    } catch { /* probar el siguiente */ }
  }
}

export function registerDock(ipcMain: IpcMain, settings: SettingsService, icon: NativeImage | string, getMainWindow: () => BrowserWindow | null): void {
  getMain = getMainWindow
  registerShortcut(icon, settings)
  // Activada por defecto; Ajustes → Escritorio la apaga. Arranca un poco después
  // para no competir con la ventana principal al abrir.
  if (settings.get(SETTING) !== '0') setTimeout(() => enable(icon), 2500)
  screen.on('display-metrics-changed', () => { if (dock && !dock.isDestroyed()) dock.setBounds(boundsFor(expanded)) })

  ipcMain.on('dock:expand', () => setExpanded(true))
  ipcMain.on('dock:collapse', () => setExpanded(false))
  ipcMain.on('dock:pin', (_e, on: unknown) => { pinned = on === true; if (!pinned) setExpanded(false); send() })
  /** El buscador necesita teclado: sólo entonces la barra toma el foco. */
  ipcMain.on('dock:want-focus', () => { if (dock && !dock.isDestroyed()) { dock.setFocusable(true); dock.focus() } })
  ipcMain.handle('dock:state', () => ({ expanded, pinned, shortcut }))
  ipcMain.handle('dock:enabled', () => settings.get(SETTING) !== '0')
  ipcMain.handle('dock:set-enabled', (_e, on: unknown) => {
    settings.set(SETTING, on === true ? '1' : '0')
    if (on === true) enable(icon)
    else destroy()
    return { ok: true }
  })

  /**
   * Pegar en la app que estaba adelante. Si la barra tomó el foco (buscador), se
   * colapsa primero para que Windows le devuelva el foco a esa app.
   */
  // `current`: el renderer ya dejó algo en el portapapeles (p. ej. una captura con captures:copy).
  ipcMain.handle('dock:paste', async (_e, payload: { text?: string; clipId?: string; current?: boolean }) => {
    if (typeof payload?.text === 'string') clipboard.writeText(payload.text)
    else if (typeof payload?.clipId === 'string') {
      const t = clipText(payload.clipId)
      if (t === null) throw new Error('Ya no está en el historial')
      clipboard.writeText(t)
    } else if (payload?.current !== true) throw new Error('Nada para pegar')
    const hadFocus = !!dock?.isFocused()
    if (hadFocus) { pinned = false; setExpanded(false) }
    await new Promise((r) => setTimeout(r, hadFocus ? 180 : 60))
    simulatePaste()
    return { ok: true }
  })

  /** Captura rápida en la ventana principal (como Ctrl+Shift+Espacio). */
  ipcMain.on('dock:quick-capture', () => {
    const w = getMain()
    if (!w || w.isDestroyed()) return
    showWindow(w)
    w.webContents.send('app:quick-capture', { action: 'capture' })
  })

  app.on('will-quit', () => {
    if (shortcut) globalShortcut.unregister(shortcut.replace('Ctrl', 'CommandOrControl'))
    destroy()
  })
}
