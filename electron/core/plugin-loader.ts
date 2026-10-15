import type { IpcMain } from 'electron'
import type { CoreServices, PluginHandlers } from './types'

// Import all plugin handlers explicitly.
// To add a new plugin with backend, import its handlers here and add to the list.
import { handlers as repoSearchHandlers } from '../plugins/repo-search/handlers'
import { handlers as smartDiffHandlers } from '../plugins/smart-diff/handlers'
import { handlers as settingsHandlers } from '../plugins/settings/handlers'
import { handlers as apiLabHandlers } from '../plugins/api-tester/handlers'
import { handlers as fileEditorHandlers } from '../plugins/file-editor/handlers'
import { handlers as authHandlers } from '../plugins/auth/handlers'
import { handlers as snippetsHandlers } from '../plugins/snippets/handlers'
import { handlers as ticketResolverHandlers } from '../plugins/ticket-resolver/handlers'
import { handlers as terminalHandlers } from '../plugins/terminal/handlers'
import { handlers as gastosHandlers } from '../plugins/gastos/handlers'
import { handlers as notesHandlers } from '../plugins/notes/handlers'
import { handlers as credentialsHandlers } from '../plugins/credentials/handlers'
import { handlers as capturesHandlers } from '../plugins/captures/handlers'
import { handlers as sqlConnectionsHandlers } from '../plugins/sql-connections/handlers'

const allHandlers: PluginHandlers[] = [
  repoSearchHandlers,
  smartDiffHandlers,
  settingsHandlers,
  apiLabHandlers,
  fileEditorHandlers,
  authHandlers,
  snippetsHandlers,
  ticketResolverHandlers,
  terminalHandlers,
  gastosHandlers,
  notesHandlers,
  credentialsHandlers,
  capturesHandlers,
  sqlConnectionsHandlers,
]

export function loadPlugins(ipcMain: IpcMain, services: CoreServices): void {
  for (const handler of allHandlers) {
    handler.register(ipcMain, services)
    console.log(`[plugin-loader] Registered IPC handlers for: ${handler.pluginId}`)
  }
}
