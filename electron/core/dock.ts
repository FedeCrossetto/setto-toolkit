import { app, BrowserWindow, globalShortcut, screen, shell } from 'electron'
import type { IpcMain, NativeImage } from 'electron'
import path from 'path'
import type { SettingsService } from './services/settings.service'
import { foregroundWindow } from './win-helper'
import { pasteKeepingClipboard, simulatePaste } from './snippet-picker'
import { clipText, onClipAdded } from './clipboard-history'
import { showWindow } from './notifications'
import { logger } from './logger'

/**
 * Barra flotante al borde de la pantalla ("dock", derecha o izquierda según
 * `app.dock_side`): una pestaña angosta con el logo pegada al borde que al pasar
 * el mouse (o con Ctrl+Alt+D) se despliega con lo último copiado, capturas,
 * snippets, tickets, claves y acciones rápidas. La pestaña se arrastra
 * arriba/abajo por el borde (la altura se recuerda; doble clic la vuelve al medio).
 *
 * La ventana es transparente y más grande que lo visible: el aire alrededor deja
 * que la sombra se dibuje entera (una sombra cortada por el borde de la ventana
 * se ve como un rectángulo gris sobre fondos claros).
 *
 * - No roba el foco (ventana no "focusable"): un clic pega directo en la app que
 *   estabas usando. Sólo al escribir en su buscador se vuelve focusable.
 * - Se oculta sola si la app de adelante está en pantalla completa (juegos, videos).
 * - Mismo renderer, ruta `#dock` (ver src/main.tsx y src/dock/Dock.tsx).
 */

const SETTING = 'app.dock'
const SHORTCUTS = ['CommandOrControl+Alt+D', 'CommandOrControl+Alt+J']
/** Ventana plegada: la pestaña visible mide 46x56; el resto es aire para la sombra, el rebote y el globito. */
const HANDLE = { width: 72, height: 120 }
/** Panel visible y el aire transparente que lo rodea (la sombra cae hacia abajo). El renderer lo recibe en `dock:state`. */
const PANEL_WIDTH = 372
const PANEL_MAX_HEIGHT = 640
const PAD = { top: 14, bottom: 30, edge: 10, outer: 22 }
/** Al arrastrar, a menos de esto del centro la pestaña se imanta al medio. */
const SNAP_PX = 14
const SIDE_SETTING = 'app.dock_side'
type Side = 'right' | 'left'
/** Al plegar, el renderer anima la salida del panel antes de achicar la ventana. */
const COLLAPSE_ANIM_MS = 240
const Y_SETTING = 'app.dock_y'
/** Con el mouse afuera este tiempo, el panel se pliega solo. */
const LEAVE_COLLAPSE_MS = 450
const CURSOR_POLL_MS = 120
// Sin acrylic de Windows: se pinta como rectángulo (recortarlo con setShape deja
// esquinas en punta) y al apagarlo la ventana pierde la transparencia. El panel
// redondeado y su "vidrio" los dibuja el renderer.
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
let cursorTimer: ReturnType<typeof setInterval> | null = null
/** Abierta con el atajo: se pliega al salir el mouse sólo si antes entró (si no, se usa con teclado). */
let openedByKey = false
let side: Side = 'right'
/** Pestaña que pidió `dock:open` (p. ej. Ctrl+K → Bloc): viaja una sola vez en `dock:state`. */
let requestedTab: string | null = null
let moveAnim: ReturnType<typeof setInterval> | null = null

/** Pantalla donde vive la barra: la del cursor al abrirla/mostrarla (si desaparece, la principal). */
let displayId: number | null = null

const area = (): Electron.Rectangle => {
  if (displayId !== null) {
    const d = screen.getAllDisplays().find((x) => x.id === displayId)
    if (d) return d.workArea
    displayId = null
  }
  return screen.getPrimaryDisplay().workArea
}

/** Mover la barra a la pantalla donde está el cursor. Devuelve true si cambió. */
function followCursorDisplay(): boolean {
  try {
    const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    if (d.id === displayId) return false
    const changed = displayId !== null || d.id !== screen.getPrimaryDisplay().id
    displayId = d.id
    return changed
  } catch {
    return false
  }
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

function handleTop(): number {
  const a = area()
  return Math.round(a.y + clamp(yRatio, 0, 1) * (a.height - HANDLE.height))
}

/** x de una ventana de este ancho pegada al borde elegido. */
const edgeX = (width: number): number => { const a = area(); return side === 'left' ? a.x : a.x + a.width - width }

function boundsFor(isExpanded: boolean, top = handleTop()): Electron.Rectangle {
  const a = area()
  if (!isExpanded) return { x: edgeX(HANDLE.width), y: top, ...HANDLE }
  // El panel se abre a la altura de la pestaña (centrado en ella, sin salirse de la pantalla).
  const panelH = Math.min(a.height - PAD.top - PAD.bottom, PANEL_MAX_HEIGHT)
  const height = panelH + PAD.top + PAD.bottom
  const center = top + HANDLE.height / 2
  const y = clamp(Math.round(center - PAD.top - panelH / 2), a.y, a.y + a.height - height)
  const width = PANEL_WIDTH + PAD.edge + PAD.outer
  return { x: edgeX(width), y, width, height }
}

/**
 * Última app externa en primer plano (la de antes de abrir la barra): el panel
 * sugiere según eso (SSMS → snippets SQL, Jira → el ticket, VS → código).
 */
let lastExternal: { app: string; title: string } | null = null
const isOwnApp = (app: string): boolean => /^(setto|electron)$/i.test(app)

const state = (): Record<string, unknown> => ({ expanded, pinned, shortcut, side, pad: PAD, context: lastExternal, tab: requestedTab })

function send(): void {
  if (!dock || dock.isDestroyed()) return
  dock.webContents.send('dock:state', state())
  // Si todavía carga, el renderer la va a pedir con `dock:state` (invoke) al montar.
  if (!dock.webContents.isLoading()) requestedTab = null
}

function stopMoveAnim(): void {
  if (moveAnim) clearInterval(moveAnim)
  moveAnim = null
}

/** Llevar la pestaña plegada a `ratio` (0 arriba, 1 abajo) con un deslizamiento corto. */
function glideTo(ratio: number): void {
  if (!dock || dock.isDestroyed() || expanded) return
  stopMoveAnim()
  const from = dock.getBounds().y
  yRatio = clamp(ratio, 0, 1)
  const to = handleTop()
  const t0 = Date.now()
  const DURATION = 220
  moveAnim = setInterval(() => {
    if (!dock || dock.isDestroyed() || expanded) { stopMoveAnim(); return }
    const t = Math.min(1, (Date.now() - t0) / DURATION)
    const k = 1 - Math.pow(1 - t, 3)
    dock.setBounds(boundsFor(false, Math.round(from + (to - from) * k)))
    if (t >= 1) stopMoveAnim()
  }, 16)
  settingsRef?.set(Y_SETTING, yRatio.toFixed(4))
}

/**
 * Plegar sola al sacar el mouse. Se mira la posición del cursor desde main (los
 * eventos del DOM se pierden si el mouse sale rápido o pasa por otra ventana).
 * La franja entre el panel y el borde de la pantalla cuenta como "adentro".
 */
function watchCursor(): void {
  stopCursorWatch()
  let inside = false
  let outSince = 0
  cursorTimer = setInterval(() => {
    if (!dock || dock.isDestroyed() || !expanded) { stopCursorWatch(); return }
    if (pinned) { outSince = 0; return }
    const p = screen.getCursorScreenPoint()
    const b = dock.getBounds()
    const a = area()
    const inX = side === 'left' ? p.x >= a.x && p.x <= b.x + b.width + 2 : p.x >= b.x - 2 && p.x <= a.x + a.width
    const isIn = inX && p.y >= b.y - 2 && p.y <= b.y + b.height + 2
    if (isIn) { inside = true; outSince = 0; return }
    if (openedByKey && !inside) return
    if (!outSince) outSince = Date.now()
    else if (Date.now() - outSince >= LEAVE_COLLAPSE_MS) setExpanded(false)
  }, CURSOR_POLL_MS)
}

function stopCursorWatch(): void {
  if (cursorTimer) clearInterval(cursorTimer)
  cursorTimer = null
}

function setExpanded(next: boolean, focus = false): void {
  if (!dock || dock.isDestroyed() || hiddenForFullscreen) return
  if (!next && pinned) return
  if (shrinkTimer) { clearTimeout(shrinkTimer); shrinkTimer = null }
  stopMoveAnim()
  const was = expanded
  expanded = next
  if (next) {
    // Abrir en la pantalla del cursor (con el atajo puede estar en otro monitor).
    if (!was) followCursorDisplay()
    // Primero agrandar la ventana (transparente) y después avisar: el panel entra animado.
    dock.setBounds(boundsFor(true))
    if (focus) { dock.setFocusable(true); dock.focus() }
    if (!was) openedByKey = focus
    send()
    watchCursor()
    // Abierta con el mouse la barra no toma el foco: la app de adelante es la que el usuario estaba usando.
    if (!was && !focus) {
      void foregroundWindow().then((fg) => {
        if (fg && !isOwnApp(fg.app) && expanded) { lastExternal = { app: fg.app, title: fg.title }; send() }
      }).catch(() => undefined)
    }
    return
  }
  stopCursorWatch()
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
  if (dock && !dock.isDestroyed() && !hiddenForFullscreen && !dock.isVisible()) {
    if (followCursorDisplay()) dock.setBounds(boundsFor(expanded))
    dock.showInactive()
  }
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
      additionalArguments: ['--setto-role=dock'],   // canales de la barra (DOCK_CHANNELS en electron/preload.ts)
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  dock.setAlwaysOnTop(true, 'floating')
  dock.webContents.on('will-navigate', (e) => e.preventDefault())
  // Links (Jira, URLs copiadas): al navegador, sólo http/https.
  dock.webContents.setWindowOpenHandler(({ url }) => {
    try { if (/^https?:$/.test(new URL(url).protocol)) void shell.openExternal(url) } catch { /* inválida */ }
    return { action: 'deny' }
  })
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
  stopMoveAnim()
  stopCursorWatch()
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
      const own = isOwnApp(fg.app)
      if (!own && fg.app) lastExternal = { app: fg.app, title: fg.title }
      if (overrideApp && fg.app !== overrideApp && !own) overrideApp = null
      const full = !!fg.full && !own && fg.app !== overrideApp
      if (full === hiddenForFullscreen) { if (!full) reveal(); return }
      hiddenForFullscreen = full
      if (full) { expanded = false; dock.hide() }
      else { followCursorDisplay(); dock.setBounds(boundsFor(false)); dock.showInactive() }
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
  side = settings.get(SIDE_SETTING) === 'left' ? 'left' : 'right'
  registerShortcut(icon, settings)
  // Activada por defecto; Ajustes → Escritorio la apaga. Arranca un poco después
  // para no competir con la ventana principal al abrir.
  if (settings.get(SETTING) !== '0') setTimeout(() => enable(icon), 2500)
  screen.on('display-metrics-changed', () => {
    if (!dock || dock.isDestroyed()) return
    dock.setBounds(boundsFor(expanded))
  })

  ipcMain.on('dock:expand', () => setExpanded(true))
  ipcMain.on('dock:collapse', () => setExpanded(false))
  ipcMain.on('dock:pin', (_e, on: unknown) => { pinned = on === true; if (!pinned) setExpanded(false); send() })
  /**
   * Arrastrar la pestaña por el borde: `top` es el borde superior deseado (DIP).
   * Queda dentro del área de trabajo (no tapa la barra de tareas) y cerca del
   * centro se imanta al medio; el renderer recibe `dock:drag` para dibujar la guía.
   */
  ipcMain.on('dock:move', (_e, top: unknown) => {
    if (!dock || dock.isDestroyed() || expanded || typeof top !== 'number' || !Number.isFinite(top)) return
    stopMoveAnim()
    const a = area()
    const range = Math.max(1, a.height - HANDLE.height)
    const mid = a.y + range / 2
    let y = clamp(Math.round(top), a.y, a.y + range)
    const snapped = Math.abs(y - mid) <= SNAP_PX
    if (snapped) y = Math.round(mid)
    yRatio = (y - a.y) / range
    dock.setBounds(boundsFor(false, y))
    dock.webContents.send('dock:drag', { ratio: yRatio, snapped })
  })
  ipcMain.on('dock:move-end', () => { settingsRef?.set(Y_SETTING, yRatio.toFixed(4)) })
  /** Doble clic en la pestaña: volver al medio. */
  ipcMain.on('dock:move-reset', () => glideTo(0.5))
  /** Pasar la barra al otro borde (se recuerda en `app.dock_side`). */
  ipcMain.on('dock:set-side', (_e, next: unknown) => {
    if (next !== 'left' && next !== 'right') return
    side = next
    settings.set(SIDE_SETTING, next)
    if (dock && !dock.isDestroyed()) dock.setBounds(boundsFor(expanded))
    send()
  })
  /** El buscador necesita teclado: sólo entonces la barra toma el foco. */
  ipcMain.on('dock:want-focus', () => { if (dock && !dock.isDestroyed()) { dock.setFocusable(true); dock.focus() } })
  ipcMain.handle('dock:state', () => { const s = state(); requestedTab = null; return s })
  /** Abrir la barra con el teclado en una pestaña (Ctrl+K → "Bloc" desde la ventana principal). */
  ipcMain.on('dock:open', (_e, tab: unknown) => {
    if (settings.get(SETTING) === '0') return
    if (!dock) enable(icon)
    hiddenForFullscreen = false
    requestedTab = typeof tab === 'string' && /^[a-z]{2,16}$/.test(tab) ? tab : null
    reveal()
    setExpanded(true, true)
  })
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
  // Texto (snippet o copiado): después de pegar se restaura lo que el usuario tenía en el portapapeles.
  ipcMain.handle('dock:paste', async (_e, payload: { text?: string; clipId?: string; current?: boolean }) => {
    let text: string | null = null
    if (typeof payload?.text === 'string') text = payload.text
    else if (typeof payload?.clipId === 'string') {
      text = clipText(payload.clipId)
      if (text === null) throw new Error('Ya no está en el historial')
    } else if (payload?.current !== true) throw new Error('Nada para pegar')
    const hadFocus = !!dock?.isFocused()
    if (hadFocus) { pinned = false; setExpanded(false) }
    const delay = hadFocus ? 180 : 60
    if (text !== null) return { ok: true, pasted: await pasteKeepingClipboard(text, delay) }
    await new Promise((r) => setTimeout(r, delay))
    return { ok: true, pasted: await simulatePaste() }
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
