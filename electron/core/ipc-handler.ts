import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { logger } from './logger'

type Handler<Args extends unknown[], R> = (event: IpcMainInvokeEvent, ...args: Args) => R | Promise<R>

/**
 * Drop-in replacement for `ipcMain.handle()` that logs every thrown error
 * (via the central logger, keyed by channel name) before it crosses the IPC
 * boundary, and normalizes non-Error throws into an Error so renderer code
 * can always rely on `err.message`.
 *
 * Without this, a handler that does `throw 'oops'` or a caught-and-rethrown
 * provider error silently never reaches app.log — the renderer sees it (if it
 * bothers to catch), but there's no server-side trail to debug a user report.
 */
export function registerHandler<Args extends unknown[], R>(
  ipcMain: IpcMain,
  channel: string,
  handler: Handler<Args, R>,
): void {
  ipcMain.handle(channel, async (event, ...args: Args) => {
    try {
      return await handler(event, ...args)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error(channel, message, err instanceof Error ? err.stack : err)
      throw err instanceof Error ? err : new Error(message)
    }
  })
}
