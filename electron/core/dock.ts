import { app, BrowserWindow, clipboard, globalShortcut, screen, shell } from 'electron'
import type { IpcMain, NativeImage } from 'electron'
import path from 'path'
import type { SettingsService } from './services/settings.service'
import { foregroundWindow } from './win-helper'
import { pasteKeepingClipboard, simulatePaste } from './snippet-picker'
import { clipText, onClipAdded, onVideoCopied } from './clipboard-history'
import { saveCopiedVideo } from '../plugins/captures/videos'
import { onCaptureAdded } from '../plugins/captures/handlers'
import { showWindow } from './notifications'
import { logger } from './logger'

/**
 * Isla flotante arriba al centro de la pantalla ("dock", como la isla dinámica):
 * plegada es una pastilla negra pegada al borde de arriba; al pasar el mouse (o con
 * Ctrl+Alt+D) crece hacia abajo y a los costados con lo último copiado, capturas,
 * snippets, tickets, claves y acciones rápidas.
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
/**
 * Ventana plegada: la pastilla visible (ISLAND_PILL en el renderer) más aire para que
 * se ensanche al pasar el mouse y para la sombra. Chica a propósito: lo transparente
 * de la ventana igual tapa los clics de la app de abajo.
 */
const PILL_WINDOW = { width: 220, height: 46 }
/** Panel visible y el aire transparente alrededor (arriba nada: va pegado al borde). El renderer lo recibe en `dock:state`. */
const PANEL_WIDTH = 760
const PANEL_MAX_HEIGHT = 420
const PAD = { top: 0, bottom: 34, edge: 26, outer: 26 }
/**
 * Al plegar, el renderer anima la salida del panel (300 ms) antes de achicar la ventana.
 * Con margen: si achicamos antes de que termine (cuadros perdidos), el panel se corta de golpe.
 */
const COLLAPSE_ANIM_MS = 380
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
let shrinkTimer: ReturnType<typeof setTimeout> | null = null
let cursorTimer: ReturnType<typeof setInterval> | null = null
/** Abierta con el atajo: se pliega al salir el mouse sólo si antes entró (si no, se usa con teclado). */
let openedByKey = false
/** Pestaña que pidió `dock:open` (p. ej. Ctrl+K → Bloc): viaja una sola vez en `dock:state`. */
let requestedTab: string | null = null

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

/** Arriba al centro del área de trabajo (debajo de la barra de tareas si está arriba). */
function boundsFor(isExpanded: boolean): Electron.Rectangle {
  const a = area()
  const center = (width: number): number => Math.round(a.x + (a.width - width) / 2)
  if (!isExpanded) return { x: center(PILL_WINDOW.width), y: a.y, ...PILL_WINDOW }
  const panelH = Math.min(a.height - PAD.bottom - 40, PANEL_MAX_HEIGHT)
  const width = Math.min(PANEL_WIDTH, a.width - 40) + PAD.edge + PAD.outer
  return { x: center(width), y: a.y, width, height: panelH + PAD.top + PAD.bottom }
}

/**
 * Última app externa en primer plano (la de antes de abrir la barra): el panel
 * sugiere según eso (SSMS → snippets SQL, Jira → el ticket, VS → código).
 */
let lastExternal: { app: string; title: string } | null = null
const isOwnApp = (app: string): boolean => /^(setto|electron)$/i.test(app)

const state = (): Record<string, unknown> => ({ expanded, pinned, shortcut, side: 'top', pad: PAD, context: lastExternal, tab: requestedTab })

function send(): void {
  if (!dock || dock.isDestroyed()) return
  dock.webContents.send('dock:state', state())
  // Si todavía carga, el renderer la va a pedir con `dock:state` (invoke) al montar.
  if (!dock.webContents.isLoading()) requestedTab = null
}

/**
 * Plegar sola al sacar el mouse. Se mira la posición del cursor desde main (los
 * eventos del DOM se pierden si el mouse sale rápido o pasa por otra ventana).
 * La franja entre el panel y el borde de arriba de la pantalla cuenta como "adentro".
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
    // Sin el aire de la sombra de abajo: ahí el mouse ya está "afuera".
    const isIn = p.x >= b.x + PAD.edge - 4 && p.x <= b.x + b.width - PAD.outer + 4 && p.y >= Math.min(a.y, b.y) - 4 && p.y <= b.y + b.height - PAD.bottom + 6
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
  // Si el proceso de la barra se cae, volver a cargarla en vez de dejarla en blanco.
  dock.webContents.on('render-process-gone', (_e, d) => {
    if (d.reason === 'clean-exit') return
    setTimeout(() => { if (dock && !dock.isDestroyed()) load(dock) }, 500)
  })
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
    logger.debug('dock', 'pegar', { from: text !== null ? (payload?.clipId ? 'copiado' : 'texto') : 'actual', chars: text?.length ?? 0 })
    const hadFocus = !!dock?.isFocused()
    if (hadFocus) { pinned = false; setExpanded(false) }
    const delay = hadFocus ? 180 : 60
    if (text !== null) return { ok: true, pasted: await pasteKeepingClipboard(text, delay) }
    await new Promise((r) => setTimeout(r, delay))
    return { ok: true, pasted: await simulatePaste() }
  })

  /** Copiar texto (snippet, transformación) al portapapeles, sin pegar: el clic de la barra copia. */
  ipcMain.handle('dock:copy-text', (_e, text: unknown) => {
    if (typeof text !== 'string' || !text) throw new Error('Nada para copiar')
    clipboard.writeText(text)
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
  // Video copiado (Recortes → Ctrl+C): la barra lo muestra arriba para abrirlo o pegarlo.
  // Si estaba en una carpeta temporal (Recortes sin guardar) se guarda en Videos\Setto antes de avisar.
  onVideoCopied((f) => {
    void saveCopiedVideo(f.path).then((r) => {
      if (dock && !dock.isDestroyed()) dock.webContents.send('dock:video', r ?? { ...f, saved: false })
    })
    if (dock && !dock.isDestroyed() && !expanded && !hiddenForFullscreen) dock.webContents.send('dock:bump', { kind: 'video' })
  })
  onClipAdded((kind) => {
    if (dock && !dock.isDestroyed() && !expanded && !hiddenForFullscreen) dock.webContents.send('dock:bump', { kind })
  })
  onCaptureAdded(() => {
    if (dock && !dock.isDestroyed() && !expanded && !hiddenForFullscreen) dock.webContents.send('dock:bump', { kind: 'image' })
  })

  app.on('will-quit', () => {
    if (shortcut) globalShortcut.unregister(shortcut.replace('Ctrl', 'CommandOrControl'))
    destroy()
  })
}
