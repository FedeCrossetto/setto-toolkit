import type { PluginHandlers, CoreServices } from '../../core/types'
import type { IpcMain } from 'electron'

export const handlers: PluginHandlers = {
  pluginId: 'smart-diff',

  register(_ipcMain: IpcMain, _services: CoreServices): void {
    // Compare UI is renderer-only; no main-process IPC for this plugin.
  },
}
