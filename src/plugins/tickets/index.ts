import { lazy } from 'react'
import type { PluginManifest } from '../../core/types'

const TicketsPlugin = lazy(() => import('./TicketsPlugin').then((m) => ({ default: m.TicketsPlugin })))

export const ticketsPlugin: PluginManifest = {
  id: 'tickets',
  name: 'Tickets',
  description: 'Todo lo de cada ticket: capturas, notas, snippets, copiados y archivos',
  icon: 'ticket',
  section: 'personal',
  component: TicketsPlugin,
  keywords: ['ticket', 'tickets', 'jira', 'wigos', 'evidencia', 'bug', 'issue', 'incidencia'],
}
