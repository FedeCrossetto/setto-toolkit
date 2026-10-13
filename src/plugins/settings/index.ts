import { lazy } from 'react'
import type { PluginManifest } from '../../core/types'

const SettingsPage = lazy(() => import('./SettingsPage').then((m) => ({ default: m.SettingsPage })))

export const settingsPlugin: PluginManifest = {
  id: 'settings',
  name: 'Ajustes',
  description: 'Apariencia, módulos y preferencias',
  icon: 'settings',
  component: SettingsPage,
  keywords: ['settings', 'config', 'api key', 'openai', 'bitbucket', 'preferences'],
  pinned: true
}
