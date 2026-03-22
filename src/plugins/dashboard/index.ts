import type { PluginManifest } from '../../core/types'
import { Dashboard } from './Dashboard'

export const dashboardPlugin: PluginManifest = {
  id: 'dashboard',
  name: 'Dashboard',
  description: 'Home — overview of all available tools',
  icon: 'space_dashboard',
  component: Dashboard,
  keywords: ['home', 'overview', 'dashboard', 'tools']
}
