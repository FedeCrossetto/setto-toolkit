import { lazy } from 'react'
import type { PluginManifest } from '../../core/types'

const Dashboard = lazy(() => import('./Dashboard').then((m) => ({ default: m.Dashboard })))

export const dashboardPlugin: PluginManifest = {
  id: 'dashboard',
  name: 'Inicio',
  description: 'Tu día: notas, scripts y gastos de un vistazo',
  icon: 'home',
  section: 'personal',
  component: Dashboard,
  keywords: ['home', 'overview', 'dashboard', 'tools']
}
