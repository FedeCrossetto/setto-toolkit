import { app, BrowserWindow, clipboard, globalShortcut, Notification, screen } from 'electron'
import type { IpcMain, NativeImage } from 'electron'
import { execFile } from 'child_process'
import { writeFileSync, existsSync } from 'fs'
import path from 'path'
import { logger } from './logger'
import { isPrivateClipboard, writeClipboardSilently } from './clipboard-history'
import { RESTORE_DELAY_MS, restorableText, shouldRestore } from './paste-restore'

/**
 * Snippets desde cualquier app: un atajo global abre una ventanita flotante con
 * el buscador de snippets (el mismo renderer, ruta `#snippet-picker`). Al elegir
 * uno se copia, la ventanita se oculta (el foco vuelve a la app de antes) y, si
 * el usuario lo permite, se simula Ctrl+V / Cmd+V para pegarlo ahí.
 */

const SHORTCUTS = ['CommandOrControl+Alt+V', 'CommandOrControl+Shift+Alt+V', 'CommandOrControl+Alt+S']
const WIDTH = 720
const HEIGHT = 500
/** Oculta y sin usar este rato → se destruye para liberar su memoria (se recrea en ~0,5 s). */
const IDLE_DESTROY_MS = 5 * 60_000

let picker: BrowserWindow | null = null
let activeShortcut: string | null = null
let idleTimer: ReturnType<typeof setTimeout> | null = null

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
      additionalArguments: ['--setto-role=picker'],   // canales del selector (electron/preload.ts)
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.setAlwaysOnTop(true, 'pop-up-menu')
  // Cualquier clic afuera la cierra, como un menú.
  win.on('blur', () => { if (!win.isDestroyed()) win.hide() })
  win.on('show', () => { if (idleTimer) { clearTimeout(idleTimer); idleTimer = null } })
  win.on('hide', () => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      idleTimer = null
      if (!win.isDestroyed() && !win.isVisible()) win.destroy()
    }, IDLE_DESTROY_MS)
  })
  win.on('closed', () => { if (picker === win) picker = null })
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

function run(cmd: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout: 5000 }, (err) => {
      if (err) logger.warn('snippet-picker', `auto-paste (${path.basename(cmd)}) failed`, err.message)
      resolve(!err)
    })
  })
}

const PASTE_KEYS = process.platform === 'darwin' ? 'Cmd+V' : 'Ctrl+V'
const live = new Set<Notification>()

/** No se pudo simular la tecla: el texto ya está en el portapapeles, avisar para pegarlo a mano. */
function notifyManualPaste(): void {
  try {
    if (!Notification.isSupported()) return
    const n = new Notification({ title: `Copiado — pegalo con ${PASTE_KEYS}`, body: 'No se pudo pegar automáticamente en la app de adelante.', silent: true })
    live.add(n)
    n.on('close', () => live.delete(n))
    n.on('click', () => live.delete(n))
    n.show()
  } catch { /* sin notificaciones */ }
}

/**
 * Simula Ctrl+V (Cmd+V) en la app que tiene el foco. En Windows prueba wscript
 * (rápido) y, si falla (WSH deshabilitado por política), PowerShell SendKeys.
 * Si nada funciona avisa con una notificación. Devuelve si se pudo.
 */
export async function simulatePaste(): Promise<boolean> {
  let ok: boolean
  if (process.platform === 'win32') {
    ok = await run('wscript.exe', ['//E:JScript', '//B', '//Nologo', windowsPasteScript()])
    if (!ok) {
      ok = await run('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
        "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')",
      ])
    }
  } else if (process.platform === 'darwin') {
    // Requiere permiso de Accesibilidad para Setto (Ajustes del sistema → Privacidad).
    ok = await run('osascript', ['-e', 'tell application "System Events" to keystroke "v" using command down'])
  } else {
    ok = await run('xdotool', ['key', '--clearmodifiers', 'ctrl+v'])
  }
  if (!ok) notifyManualPaste()
  return ok
}

/** Texto que había en el portapapeles antes de pegar (null = no restaurar: imagen, privado, vacío). */
export function snapshotClipboardText(): string | null {
  try {
    return restorableText(clipboard.availableFormats(), clipboard.readText(), isPrivateClipboard())
  } catch {
    return null
  }
}

/** Después de pegar `pasted`, devolver el texto previo (si el portapapeles no cambió entretanto). */
export function restoreClipboardLater(prev: string | null, pasted: string): void {
  if (prev === null || prev === pasted) return
  setTimeout(() => {
    try { if (shouldRestore(prev, pasted, clipboard.readText())) writeClipboardSilently(prev) } catch { /* nada */ }
  }, RESTORE_DELAY_MS)
}

/** Copiar `text`, simular el pegado y restaurar lo que había. Si no se pudo pegar, el texto queda copiado. */
export async function pasteKeepingClipboard(text: string, delayMs: number): Promise<boolean> {
  const prev = snapshotClipboardText()
  clipboard.writeText(text)
  await new Promise((r) => setTimeout(r, delayMs))
  const ok = await simulatePaste()
  if (ok) restoreClipboardLater(prev, text)
  return ok
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
    if (picker && !picker.isDestroyed()) picker.hide()
    if (autoPaste !== true) {
      clipboard.writeText(text)
      return { ok: true, pasted: false }
    }
    // Esperar a que el SO devuelva el foco a la app anterior; después se restaura lo que había copiado.
    const pasted = await pasteKeepingClipboard(text, 140)
    return { ok: true, pasted }
  })

  /** El renderer ya dejó algo en el portapapeles (imagen, texto sensible): ocultar y pegar. */
  ipcMain.handle('snippet-picker:paste-current', async (_e, autoPaste: unknown) => {
    if (picker && !picker.isDestroyed()) picker.hide()
    if (autoPaste === true) {
      await new Promise((r) => setTimeout(r, 140))
      return { ok: true, pasted: await simulatePaste() }
    }
    return { ok: true, pasted: false }
  })

  ipcMain.on('snippet-picker:close', () => { if (picker && !picker.isDestroyed()) picker.hide() })
}

export function teardownSnippetPicker(): void {
  if (activeShortcut) globalShortcut.unregister(activeShortcut)
  activeShortcut = null
  if (picker && !picker.isDestroyed()) picker.destroy()
  picker = null
}
