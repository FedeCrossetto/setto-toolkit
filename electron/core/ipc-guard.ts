import type { IpcMain, IpcMainEvent, IpcMainInvokeEvent, WebContents } from 'electron'
import { logger } from './logger'

/**
 * Canales sensibles que sólo puede usar la ventana principal.
 *
 * El preload ya limita qué canales ve cada ventana (`--setto-role`), pero si una
 * ventana chica (barra flotante, selector) quedara comprometida podría hablar con
 * `ipcRenderer` sin pasar por esa lista. Main vuelve a chequear quién llama:
 * terminal, escritura/borrado de archivos, ajustes, revelar/exportar claves y
 * respaldos sólo se aceptan desde `mainWindow.webContents`.
 */
const MAIN_ONLY_PREFIXES = ['terminal:', 'backup:', 'credentials:e2e-']

const MAIN_ONLY_EXACT = new Set([
  'editor:write-file', 'editor:delete', 'editor:delete-permanent', 'editor:rename',
  'editor:create-file', 'editor:create-dir', 'editor:replace-in-files', 'editor:history-restore',
  'editor:authorize-root',
  'settings:set', 'settings:delete', 'settings:import', 'settings:export', 'settings:getAll',
  'credentials:reveal', 'credentials:export-csv', 'credentials:import-commit', 'credentials:pin-set',
  'gastos:supabase-config-save', 'gastos:export-csv',
  'ticket-resolver:apply-changes',
  'sql:copy', 'sql:save', 'sql:delete',
  // Consultas SQL: ejecutar contra una base sólo desde la ventana principal.
  'sql:query', 'sql:cancel', 'sql:tabs-get', 'sql:tabs-save', 'sql:history-get', 'sql:history-clear', 'sql:meta', 'sql:favs-save',
])

export function isMainOnlyChannel(channel: string): boolean {
  return MAIN_ONLY_EXACT.has(channel) || MAIN_ONLY_PREFIXES.some((p) => channel.startsWith(p))
}

type InvokeListener = (event: IpcMainInvokeEvent, ...args: any[]) => unknown // eslint-disable-line @typescript-eslint/no-explicit-any
type OnListener = (event: IpcMainEvent, ...args: any[]) => void // eslint-disable-line @typescript-eslint/no-explicit-any

export class IpcDeniedError extends Error {
  constructor(channel: string) {
    super(`IPC denegado: "${channel}" sólo se acepta desde la ventana principal`)
    this.name = 'IpcDeniedError'
  }
}

/** Envuelve un handler de `ipcMain.handle` para rechazar llamadas de otras ventanas. */
export function guardInvoke(channel: string, listener: InvokeListener, isMain: (wc: WebContents) => boolean): InvokeListener {
  if (!isMainOnlyChannel(channel)) return listener
  return (event, ...args) => {
    if (!isMain(event.sender)) {
      logger.warn('ipc-guard', `rechazado ${channel} desde otra ventana`)
      throw new IpcDeniedError(channel)
    }
    return listener(event, ...args)
  }
}

/** Igual para `ipcMain.on`: los mensajes de otras ventanas se descartan. */
export function guardOn(channel: string, listener: OnListener, isMain: (wc: WebContents) => boolean): OnListener {
  if (!isMainOnlyChannel(channel)) return listener
  return (event, ...args) => {
    if (!isMain(event.sender)) {
      logger.warn('ipc-guard', `descartado ${channel} desde otra ventana`)
      return
    }
    listener(event, ...args)
  }
}

let installed = false

/**
 * Parchea `ipcMain.handle` / `ipcMain.on` para que todo handler registrado DESPUÉS
 * (plugins, backup, terminal…) pase por el chequeo. Llamar antes de `loadPlugins`.
 */
export function installIpcGuard(ipc: IpcMain, isMain: (wc: WebContents) => boolean): void {
  if (installed) return
  installed = true
  const handle = ipc.handle.bind(ipc)
  const on = ipc.on.bind(ipc)
  ipc.handle = ((channel: string, listener: InvokeListener) => handle(channel, guardInvoke(channel, listener, isMain))) as IpcMain['handle']
  ipc.on = ((channel: string, listener: OnListener) => on(channel, guardOn(channel, listener, isMain))) as IpcMain['on']
}
