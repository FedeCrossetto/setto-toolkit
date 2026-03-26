import { lazy } from 'react'
import type { PluginManifest } from '../../core/types'

const Dashboard = lazy(() => import('./Dashboard').then((m) => ({ default: m.Dashboard })))

export const dashboardPlugin: PluginManifest = {
  id: 'dashboard',
  name: 'Dashboard',
  description: 'Home — overview of all available tools',
  icon: 'space_dashboard',
  component: Dashboard,
  keywords: ['home', 'overview', 'dashboard', 'tools']
}
