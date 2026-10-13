import { app, globalShortcut, Menu, nativeImage, Tray } from 'electron'
import type { BrowserWindow, NativeImage } from 'electron'
import { logger } from './logger'

/**
 * Global quick capture: Ctrl+Shift+Space (Cmd+Shift+Space on macOS) and a tray icon.
 * Both bring the main window to front and tell the renderer to open QuickCapture
 * via `app:quick-capture` (payload `{ action?: 'new-note' }`).
 */
export const QUICK_CAPTURE_SHORTCUT = 'CommandOrControl+Shift+Space'
/** Si el principal lo usa otra app (p. ej. PowerToys), se prueba el siguiente. */
const SHORTCUT_FALLBACKS = [QUICK_CAPTURE_SHORTCUT, 'CommandOrControl+Alt+Space', 'Alt+Shift+Space', 'CommandOrControl+Alt+N']
let activeShortcut: string | null = null

type CaptureAction = 'capture' | 'new-note'

let tray: Tray | null = null
let registered = false

function showWindow(win: BrowserWindow): void {
  if (win.isMinimized()) win.restore()
  if (!win.isVisible()) win.show()
  win.focus()
}

export function setupQuickCapture(getWindow: () => BrowserWindow | null, icon: NativeImage | string): void {
  const trigger = (action: CaptureAction): void => {
    const win = getWindow()
    if (!win || win.isDestroyed()) return
    showWindow(win)
    win.webContents.send('app:quick-capture', { action })
  }

  if (!registered) {
    for (const accel of SHORTCUT_FALLBACKS) {
      try {
        if (globalShortcut.register(accel, () => trigger('capture'))) {
          registered = true
          activeShortcut = accel
          logger.info('quick-capture', `Atajo global: ${accel}`)
          break
        }
        logger.warn('quick-capture', `No se pudo registrar ${accel} (lo usa otra app)`)
      } catch (err) {
        logger.warn('quick-capture', 'globalShortcut.register failed', err instanceof Error ? err.message : String(err))
      }
    }
  }

  if (!tray) {
    try {
      let img = typeof icon === 'string' ? nativeImage.createFromPath(icon) : icon
      if (!img.isEmpty()) img = img.resize({ width: 16, height: 16 })
      tray = new Tray(img)
      tray.setToolTip(activeShortcut ? `Setto — captura rápida: ${activeShortcut.replace('CommandOrControl', 'Ctrl')}` : 'Setto')
      tray.setContextMenu(Menu.buildFromTemplate([
        { label: 'Abrir Setto', click: () => { const w = getWindow(); if (w && !w.isDestroyed()) showWindow(w) } },
        { label: 'Nota rápida', click: () => trigger('new-note') },
        { label: 'Captura rápida…', accelerator: activeShortcut ?? undefined, click: () => trigger('capture') },
        { type: 'separator' },
        { label: 'Salir', click: () => app.quit() },
      ]))
      tray.on('click', () => { const w = getWindow(); if (w && !w.isDestroyed()) showWindow(w) })
    } catch (err) {
      logger.warn('quick-capture', 'Tray init failed', err instanceof Error ? err.message : String(err))
    }
  }
}

export function teardownQuickCapture(): void {
  if (registered && activeShortcut) {
    globalShortcut.unregister(activeShortcut)
    registered = false
    activeShortcut = null
  }
  tray?.destroy()
  tray = null
}
