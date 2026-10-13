import { app, BrowserWindow, clipboard, globalShortcut, screen } from 'electron'
import type { IpcMain, NativeImage } from 'electron'
import path from 'path'
import type { SettingsService } from './services/settings.service'
import { foregroundWindow } from './win-helper'
import { simulatePaste } from './snippet-picker'
import { clipText, onClipAdded } from './clipboard-history'
import { showWindow } from './notifications'
import { logger } from './logger'

/**
 * Barra flotante a la derecha de la pantalla ("dock"): una pestaña angosta con el
 * logo pegada al borde que al pasar el mouse (o con Ctrl+Alt+D) se despliega con
 * lo último copiado, capturas, snippets fijados, tickets y acciones rápidas.
 * La pestaña se arrastra arriba/abajo por el borde (la altura se recuerda).
 *
 * - No roba el foco (ventana no "focusable"): un clic pega directo en la app que
 *   estabas usando. Sólo al escribir en su buscador se vuelve focusable.
 * - Se oculta sola si la app de adelante está en pantalla completa (juegos, videos).
 * - Mismo renderer, ruta `#dock` (ver src/main.tsx y src/dock/Dock.tsx).
 */

const SETTING = 'app.dock'
const SHORTCUTS = ['CommandOrControl+Alt+D', 'CommandOrControl+Alt+J']
/** Ventana plegada: la pestaña visible mide ~40 px; el resto es aire para animar (rebote, globito). */
const HANDLE = { width: 56, height: 84 }
const PANEL_WIDTH = 360
const PANEL_MAX_HEIGHT = 640
/** Al plegar, el renderer anima la salida del panel antes de achicar la ventana. */
const COLLAPSE_ANIM_MS = 190
const Y_SETTING = 'app.dock_y'
const MARGIN = 8
const FULLSCREEN_POLL_MS = 2000

let dock: BrowserWindow | null = null
let expanded = false
let pinned = false
let hiddenForFullscreen = false
/** App en pantalla completa sobre la que el usuario pidió la barra igual (Ctrl+Alt+D): no volver a esconderla hasta cambiar de app. */
let overrideApp: string | null = null
let shortcut: string | null = null
let poller: ReturnType<typeof setInterval> | null = null
let getMain: () => BrowserWindow | null = () => null
let settingsRef: SettingsService | null = null
/** Altura de la pestaña en el borde: 0 = arriba, 1 = abajo. */
let yRatio = 0.5
let shrinkTimer: ReturnType<typeof setTimeout> | null = null

const area = (): Electron.Rectangle => screen.getPrimaryDisplay().workArea

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

function handleTop(): number {
  const a = area()
  return Math.round(a.y + clamp(yRatio, 0, 1) * (a.height - HANDLE.height))
}

function boundsFor(isExpanded: boolean): Electron.Rectangle {
  const a = area()
  if (!isExpanded) return { x: a.x + a.width - HANDLE.width, y: handleTop(), ...HANDLE }
  // El panel se abre a la altura de la pestaña (centrado en ella, sin salirse de la pantalla).
  const height = Math.min(a.height - MARGIN * 2, PANEL_MAX_HEIGHT)
  const center = handleTop() + HANDLE.height / 2
  const y = clamp(Math.round(center - height / 2), a.y + MARGIN, a.y + a.height - MARGIN - height)
  return { x: a.x + a.width - PANEL_WIDTH - MARGIN, y, width: PANEL_WIDTH, height }
}

function send(): void {
  if (dock && !dock.isDestroyed()) dock.webContents.send('dock:state', { expanded, pinned, shortcut })
}

function setExpanded(next: boolean, focus = false): void {
  if (!dock || dock.isDestroyed() || hiddenForFullscreen) return
  if (!next && pinned) return
  if (shrinkTimer) { clearTimeout(shrinkTimer); shrinkTimer = null }
  const was = expanded
  expanded = next
  if (next) {
    // Primero agrandar la ventana (transparente) y después avisar: el panel entra animado.
    dock.setBounds(boundsFor(true))
    if (focus) { dock.setFocusable(true); dock.focus() }
    send()
    return
  }
  dock.setFocusable(false)
  send()
  if (!was) { dock.setBounds(boundsFor(false)); return }
  // Plegar: el renderer anima la salida y recién ahí se achica la ventana.
  shrinkTimer = setTimeout(() => {
    shrinkTimer = null
    if (dock && !dock.isDestroyed() && !expanded) dock.setBounds(boundsFor(false))
  }, COLLAPSE_ANIM_MS)
}

/** Mostrar la barra si corresponde (no está oculta por pantalla completa). Idempotente. */
function reveal(): void {
  if (dock && !dock.isDestroyed() && !hiddenForFullscreen && !dock.isVisible()) dock.showInactive()
}

function load(win: BrowserWindow): void {
  const { url, file } = rendererUrl()
  if (url) void win.loadURL(url).catch(() => undefined)
  else void win.loadFile(file!, { hash: 'dock' }).catch(() => undefined)
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
  // `ready-to-show` solo no alcanza: si la primera carga falla (en dev Vite tarda en
  // arrancar) no llega nunca y la barra quedaba invisible. Mostrar al terminar de
  // cargar y reintentar si falla.
  dock.once('ready-to-show', reveal)
  dock.webContents.on('did-finish-load', reveal)
  dock.webContents.on('did-fail-load', (_e, code, desc, _url, isMain) => {
    if (!isMain || code === -3) return   // -3: carga abortada por otra navegación
    logger.warn('dock', `No cargó la barra (${code} ${desc}); reintento`)
    setTimeout(() => { if (dock && !dock.isDestroyed()) load(dock) }, 2000)
  })
  load(dock)
}

/** Sin la ventana principal la barra no debe impedir que la app se cierre. */
export function destroyDock(): void { destroy() }

function destroy(): void {
  if (poller) clearInterval(poller)
  poller = null
  if (shrinkTimer) clearTimeout(shrinkTimer)
  shrinkTimer = null
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
      if (overrideApp && fg.app !== overrideApp && !own) overrideApp = null
      const full = !!fg.full && !own && fg.app !== overrideApp
      if (full === hiddenForFullscreen) { if (!full) reveal(); return }
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
        if (hiddenForFullscreen) {
          // La pediste a mano sobre una app en pantalla completa: se queda hasta que cambies de app.
          hiddenForFullscreen = false
          void foregroundWindow().then((fg) => { if (fg?.full) overrideApp = fg.app }).catch(() => undefined)
        }
        reveal()
        setExpanded(!expanded, true)
      })) { shortcut = accel.replace('CommandOrControl', 'Ctrl'); logger.info('dock', `Atajo global: ${accel}`); return }
    } catch { /* probar el siguiente */ }
  }
}

export function registerDock(ipcMain: IpcMain, settings: SettingsService, icon: NativeImage | string, getMainWindow: () => BrowserWindow | null): void {
  getMain = getMainWindow
  settingsRef = settings
  const savedY = Number(settings.get(Y_SETTING))
  if (Number.isFinite(savedY) && settings.get(Y_SETTING) !== null) yRatio = clamp(savedY, 0, 1)
  registerShortcut(icon, settings)
  // Activada por defecto; Ajustes → Escritorio la apaga. Arranca un poco después
  // para no competir con la ventana principal al abrir.
  if (settings.get(SETTING) !== '0') setTimeout(() => enable(icon), 2500)
  screen.on('display-metrics-changed', () => { if (dock && !dock.isDestroyed()) dock.setBounds(boundsFor(expanded)) })

  ipcMain.on('dock:expand', () => setExpanded(true))
  ipcMain.on('dock:collapse', () => setExpanded(false))
  ipcMain.on('dock:pin', (_e, on: unknown) => { pinned = on === true; if (!pinned) setExpanded(false); send() })
  /** El buscador necesita teclado: sólo entonces la barra toma el foco. */
  /** Arrastrar la pestaña por el borde: `top` es el borde superior deseado (DIP). */
  ipcMain.on('dock:move', (_e, top: unknown) => {
    if (!dock || dock.isDestroyed() || expanded || typeof top !== 'number' || !Number.isFinite(top)) return
    const a = area()
    const y = clamp(Math.round(top), a.y, a.y + a.height - HANDLE.height)
    yRatio = (y - a.y) / Math.max(1, a.height - HANDLE.height)
    dock.setBounds({ x: a.x + a.width - HANDLE.width, y, ...HANDLE })
  })
  ipcMain.on('dock:move-end', () => { settingsRef?.set(Y_SETTING, yRatio.toFixed(4)) })
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

  // Lo nuevo que se copia hace "saltar" la pestaña (el renderer muestra el globito).
  onClipAdded((kind) => {
    if (dock && !dock.isDestroyed() && !expanded && !hiddenForFullscreen) dock.webContents.send('dock:bump', { kind })
  })

  app.on('will-quit', () => {
    if (shortcut) globalShortcut.unregister(shortcut.replace('Ctrl', 'CommandOrControl'))
    destroy()
  })
}
