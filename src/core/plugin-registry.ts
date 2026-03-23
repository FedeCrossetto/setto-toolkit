import type { PluginManifest } from './types'

// Import all frontend plugins here.
// To add a new plugin, import its manifest and add it to allPlugins.
import { dashboardPlugin } from '../plugins/dashboard'
import { smartDiffPlugin } from '../plugins/smart-diff'
import { repoSearchPlugin } from '../plugins/repo-search'
import { apiTesterPlugin } from '../plugins/api-tester'
import { fileEditorPlugin } from '../plugins/file-editor'
import { settingsPlugin } from '../plugins/settings'
import { aboutPlugin } from '../plugins/about'

export const allPlugins: PluginManifest[] = [
  dashboardPlugin,
  fileEditorPlugin,
  smartDiffPlugin,
  repoSearchPlugin,
  apiTesterPlugin,
  settingsPlugin,
  aboutPlugin,
]

export function getPlugin(id: string): PluginManifest | undefined {
  return allPlugins.find((p) => p.id === id)
}
