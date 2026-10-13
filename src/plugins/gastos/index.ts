import { lazy } from 'react'
import type { PluginManifest } from '../../core/types'

const GastosPlugin = lazy(() => import('./GastosPlugin').then((m) => ({ default: m.GastosPlugin })))

export const gastosPlugin: PluginManifest = {
  id: 'gastos',
  name: 'Gastos',
  description: 'Gastos fijos y variables, presupuesto y resumen mensual',
  icon: 'wallet',
  section: 'personal',
  component: GastosPlugin,
  keywords: ['notes', 'tables', 'gastos', 'expenses', 'impuestos', 'servicios', 'pagos', 'facturas', 'metrogas', 'edesur', 'aysa'],
}
