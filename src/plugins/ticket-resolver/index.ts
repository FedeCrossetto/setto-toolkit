import { lazy } from 'react'
import type { PluginManifest } from '../../core/types'

const TicketResolver = lazy(() => import('./TicketResolver').then((m) => ({ default: m.TicketResolver })))

export const ticketResolverPlugin: PluginManifest = {
  id: 'ticket-resolver',
  name: 'Tickets',
  description: 'Analizá tickets de Jira con ayuda de IA',
  icon: 'ticket',
  section: 'dev',
  defaultDisabled: true,
  component: TicketResolver,
  keywords: ['ticket', 'jira', 'bug', 'fix', 'winsystems', 'defect', 'resolver', 'issue'],
}
