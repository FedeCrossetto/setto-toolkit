import type { IpcMain } from 'electron'
import type { CoreServices, PluginHandlers } from './types'

// Import all plugin handlers explicitly.
// To add a new plugin with backend, import its handlers here and add to the list.
import { handlers as repoSearchHandlers } from '../plugins/repo-search/handlers'
import { handlers as smartDiffHandlers } from '../plugins/smart-diff/handlers'
import { handlers as settingsHandlers } from '../plugins/settings/handlers'
import { handlers as apiTesterHandlers } from '../plugins/api-tester/handlers'
import { handlers as fileEditorHandlers } from '../plugins/file-editor/handlers'
import { handlers as authHandlers } from '../plugins/auth/handlers'

const allHandlers: PluginHandlers[] = [
  repoSearchHandlers,
  smartDiffHandlers,
  settingsHandlers,
  apiTesterHandlers,
  fileEditorHandlers,
  authHandlers,
]

export function loadPlugins(ipcMain: IpcMain, services: CoreServices): void {
  for (const handler of allHandlers) {
    handler.register(ipcMain, services)
    console.log(`[plugin-loader] Registered IPC handlers for: ${handler.pluginId}`)
  }
}
