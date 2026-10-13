import type { PluginManifest } from './types'

// Import all frontend plugins here.
// To add a new plugin, import its manifest and add it to allPlugins.
import { dashboardPlugin } from '../plugins/dashboard'
import { smartDiffPlugin } from '../plugins/smart-diff'
import { repoSearchPlugin } from '../plugins/repo-search'
import { apiLabPlugin } from '../plugins/api-tester'
import { fileEditorPlugin } from '../plugins/file-editor'
import { settingsPlugin } from '../plugins/settings'
import { aboutPlugin } from '../plugins/about'
import { ticketResolverPlugin } from '../plugins/ticket-resolver'
import { terminalPlugin } from '../plugins/terminal'
import { gastosPlugin } from '../plugins/gastos'
import { snippetsPlugin } from '../plugins/snippets'
import { connectionsPlugin } from '../plugins/connections'
import { notesPlugin } from '../plugins/notes'
import { credentialsPlugin } from '../plugins/credentials'
import { utilitiesPlugin } from '../plugins/utilities'
import { capturesPlugin } from '../plugins/captures'

export const allPlugins: PluginManifest[] = [
  // Personal (uso diario)
  dashboardPlugin,
  notesPlugin,
  snippetsPlugin,
  gastosPlugin,
  credentialsPlugin,
  // Desarrollo
  fileEditorPlugin,
  terminalPlugin,
  apiLabPlugin,
  utilitiesPlugin,
  capturesPlugin,
  repoSearchPlugin,
  smartDiffPlugin,
  ticketResolverPlugin,
  // Sistema (fijados abajo en la barra lateral)
  connectionsPlugin,
  settingsPlugin,
  aboutPlugin,
]

export function getPlugin(id: string): PluginManifest | undefined {
  return allPlugins.find((p) => p.id === id)
}
