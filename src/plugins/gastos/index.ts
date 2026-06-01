import { lazy } from 'react'
import type { PluginManifest } from '../../core/types'

const GastosPlugin = lazy(() => import('./GastosPlugin').then((m) => ({ default: m.GastosPlugin })))

export const gastosPlugin: PluginManifest = {
  id: 'gastos',
  name: 'Gastos',
  description: 'Gastos mensuales, servicios, credenciales y queries (Supabase)',
  icon: 'chart_no_axes_column_increasing',
  component: GastosPlugin,
  keywords: ['notes', 'tables', 'gastos', 'expenses', 'impuestos', 'servicios', 'pagos', 'facturas', 'metrogas', 'edesur', 'aysa'],
  section: 'personal',
}
