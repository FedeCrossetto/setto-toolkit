import { app, BrowserWindow, clipboard, globalShortcut, screen } from 'electron'
import type { IpcMain, NativeImage } from 'electron'
import { execFile } from 'child_process'
import { writeFileSync, existsSync } from 'fs'
import path from 'path'
import { logger } from './logger'

/**
 * Snippets desde cualquier app: un atajo global abre una ventanita flotante con
 * el buscador de snippets (el mismo renderer, ruta `#snippet-picker`). Al elegir
 * uno se copia, la ventanita se oculta (el foco vuelve a la app de antes) y, si
 * el usuario lo permite, se simula Ctrl+V / Cmd+V para pegarlo ahí.
 */

const SHORTCUTS = ['CommandOrControl+Alt+V', 'CommandOrControl+Shift+Alt+V', 'CommandOrControl+Alt+S']
const WIDTH = 720
const HEIGHT = 500

let picker: BrowserWindow | null = null
let activeShortcut: string | null = null

function rendererUrl(): { url?: string; file?: string } {
  const dev = process.env['ELECTRON_RENDERER_URL']
  return dev ? { url: `${dev}#snippet-picker` } : { file: path.join(__dirname, '../renderer/index.html') }
}

function createPicker(icon: NativeImage | string): BrowserWindow {
  const win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    // Transparente: la tarjeta redondeada con sombra la dibuja el renderer.
    transparent: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    icon,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.setAlwaysOnTop(true, 'pop-up-menu')
  // Cualquier clic afuera la cierra, como un menú.
  win.on('blur', () => { if (!win.isDestroyed()) win.hide() })
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  const { url, file } = rendererUrl()
  if (url) void win.loadURL(url)
  else void win.loadFile(file!, { hash: 'snippet-picker' })
  return win
}

let pickerReady = false

function showPicker(icon: NativeImage | string): void {
  if (!picker || picker.isDestroyed()) {
    pickerReady = false
    picker = createPicker(icon)
    picker.once('ready-to-show', () => { pickerReady = true; reveal() })
    return
  }
  if (pickerReady) reveal()
}

function reveal(): void {
  if (!picker || picker.isDestroyed()) return
  // En la pantalla donde está el mouse, un poco arriba del centro (como Spotlight).
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const { x, y, width, height } = display.workArea
  picker.setBounds({ x: Math.round(x + (width - WIDTH) / 2), y: Math.round(y + height * 0.2), width: WIDTH, height: HEIGHT })
  picker.show()
  picker.focus()
  picker.webContents.send('snippet-picker:opened')
}

// ── Pegado automático ────────────────────────────────────────────────────────

let winScript: string | null = null
function windowsPasteScript(): string {
  if (winScript && existsSync(winScript)) return winScript
  // JScript vía wscript: arranca mucho más rápido que PowerShell (~100 ms vs ~600 ms).
  winScript = path.join(app.getPath('userData'), 'paste-keystroke.js')
  writeFileSync(winScript, 'new ActiveXObject("WScript.Shell").SendKeys("^v");\r\n', 'utf8')
  return winScript
}

/** Simula Ctrl+V (Cmd+V) en la app que tiene el foco. */
export function simulatePaste(): void {
  const done = (err: Error | null): void => { if (err) logger.warn('snippet-picker', 'auto-paste failed', err.message) }
  if (process.platform === 'win32') {
    execFile('wscript.exe', ['//E:JScript', '//B', '//Nologo', windowsPasteScript()], { windowsHide: true }, done)
  } else if (process.platform === 'darwin') {
    // Requiere permiso de Accesibilidad para Setto (Ajustes del sistema → Privacidad).
    execFile('osascript', ['-e', 'tell application "System Events" to keystroke "v" using command down'], done)
  } else {
    execFile('xdotool', ['key', '--clearmodifiers', 'ctrl+v'], done)
  }
}

export function registerSnippetPicker(ipcMain: IpcMain, icon: NativeImage | string): void {
  for (const accel of SHORTCUTS) {
    try {
      if (globalShortcut.register(accel, () => showPicker(icon))) {
        activeShortcut = accel
        logger.info('snippet-picker', `Atajo global: ${accel}`)
        break
      }
      logger.warn('snippet-picker', `No se pudo registrar ${accel} (lo usa otra app)`)
    } catch (err) {
      logger.warn('snippet-picker', 'globalShortcut.register failed', err instanceof Error ? err.message : String(err))
    }
  }

  ipcMain.handle('snippet-picker:shortcut', () => activeShortcut?.replace('CommandOrControl', process.platform === 'darwin' ? 'Cmd' : 'Ctrl') ?? null)

  ipcMain.handle('snippet-picker:paste', async (_e, text: unknown, autoPaste: unknown) => {
    if (typeof text !== 'string') throw new Error('Texto inválido')
    clipboard.writeText(text)
    if (picker && !picker.isDestroyed()) picker.hide()
    if (autoPaste === true) {
      // Esperar a que el SO devuelva el foco a la app anterior.
      await new Promise((r) => setTimeout(r, 140))
      simulatePaste()
    }
    return { ok: true }
  })

  /** El renderer ya dejó algo en el portapapeles (imagen, texto sensible): ocultar y pegar. */
  ipcMain.handle('snippet-picker:paste-current', async (_e, autoPaste: unknown) => {
    if (picker && !picker.isDestroyed()) picker.hide()
    if (autoPaste === true) {
      await new Promise((r) => setTimeout(r, 140))
      simulatePaste()
    }
    return { ok: true }
  })

  ipcMain.on('snippet-picker:close', () => { if (picker && !picker.isDestroyed()) picker.hide() })
}

export function teardownSnippetPicker(): void {
  if (activeShortcut) globalShortcut.unregister(activeShortcut)
  activeShortcut = null
  if (picker && !picker.isDestroyed()) picker.destroy()
  picker = null
}
