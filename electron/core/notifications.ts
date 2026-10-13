import { Notification } from 'electron'
import type { BrowserWindow, IpcMain, NativeImage } from 'electron'
import { logger } from './logger'

/**
 * Notificaciones nativas del sistema. El renderer decide QUÉ avisar (tiene los
 * datos, p. ej. vencimientos de Gastos) y llama a `app:notify`; acá se muestra el
 * toast del SO. Al hacer clic se trae la ventana al frente y se le devuelve al
 * renderer la acción (`app:notification-click`) para abrir el módulo indicado.
 */
export interface NotifyPayload {
  title: string
  body?: string
  /** Qué abrir al hacer clic: módulo + intent opcional. */
  action?: { pluginId: string; action?: string; payload?: unknown }
}

// Las notificaciones de Electron se recolectan si nadie guarda la referencia y
// entonces el clic deja de funcionar: se retienen hasta que se cierran.
const live = new Set<Notification>()

export function showWindow(win: BrowserWindow): void {
  if (win.isMinimized()) win.restore()
  if (!win.isVisible()) win.show()
  win.focus()
}

export function registerNotifications(ipcMain: IpcMain, getWindow: () => BrowserWindow | null, icon: NativeImage | string): void {
  /** Desde otra ventana (selector flotante): traer la principal y abrir un módulo. */
  ipcMain.on('app:open-in-main', (_e, action: NotifyPayload['action']) => {
    const win = getWindow()
    if (!win || win.isDestroyed() || !action || typeof action.pluginId !== 'string') return
    showWindow(win)
    win.webContents.send('app:notification-click', action)
  })

  ipcMain.handle('app:notify', (_e, raw: NotifyPayload) => {
    if (!Notification.isSupported()) return { ok: false, reason: 'unsupported' }
    const title = typeof raw?.title === 'string' ? raw.title.slice(0, 120) : ''
    if (!title) throw new Error('Notification title required')
    const body = typeof raw?.body === 'string' ? raw.body.slice(0, 400) : ''
    const action = raw?.action && typeof raw.action.pluginId === 'string' ? raw.action : undefined

    const n = new Notification({ title, body, icon, silent: false })
    live.add(n)
    const release = (): void => { live.delete(n) }
    n.on('click', () => {
      release()
      const win = getWindow()
      if (!win || win.isDestroyed()) return
      showWindow(win)
      if (action) win.webContents.send('app:notification-click', action)
    })
    n.on('close', release)
    n.on('failed', (_ev, error) => { release(); logger.warn('notifications', 'failed', error) })
    n.show()
    return { ok: true }
  })
}
