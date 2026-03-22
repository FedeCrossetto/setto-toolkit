import type { PluginHandlers, CoreServices } from '../../core/types'
import type { IpcMain } from 'electron'

export const handlers: PluginHandlers = {
  pluginId: 'settings',

  register(ipcMain: IpcMain, { settings }: CoreServices): void {
    ipcMain.handle('settings:get', (_event, key: string) => {
      return settings.get(key)
    })

    ipcMain.handle('settings:set', (_event, key: string, value: string) => {
      settings.set(key, value)
      return { ok: true }
    })

    ipcMain.handle('settings:delete', (_event, key: string) => {
      settings.delete(key)
      return { ok: true }
    })

    ipcMain.handle('settings:getAll', (_event, prefix?: string) => {
      if (!prefix || typeof prefix !== 'string' || prefix.trim() === '') {
        throw new Error('settings:getAll requires a non-empty prefix')
      }
      return settings.getAll(prefix)
    })
  }
}
