import { lazy } from 'react'
import type { PluginManifest } from '../../core/types'

const SettingsPage = lazy(() => import('./SettingsPage').then((m) => ({ default: m.SettingsPage })))

export const settingsPlugin: PluginManifest = {
  id: 'settings',
  name: 'Settings',
  description: 'Configure API keys, workspace settings, and preferences',
  icon: 'tune',
  component: SettingsPage,
  keywords: ['settings', 'config', 'api key', 'openai', 'bitbucket', 'preferences'],
  pinned: true
}
