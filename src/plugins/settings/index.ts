import type { PluginManifest } from '../../core/types'
import { SettingsPage } from './SettingsPage'

export const settingsPlugin: PluginManifest = {
  id: 'settings',
  name: 'Settings',
  description: 'Configure API keys, workspace settings, and preferences',
  icon: 'tune',
  component: SettingsPage,
  keywords: ['settings', 'config', 'api key', 'openai', 'bitbucket', 'preferences'],
  pinned: true
}
