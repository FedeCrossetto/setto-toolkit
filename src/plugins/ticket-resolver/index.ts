import { lazy } from 'react'
import type { PluginManifest } from '../../core/types'

const TicketResolver = lazy(() => import('./TicketResolver').then((m) => ({ default: m.TicketResolver })))

export const ticketResolverPlugin: PluginManifest = {
  id: 'ticket-resolver',
  name: 'Ticket Resolver',
  description: 'Analyze and resolve WinSystems Jira tickets with AI-assisted code search and fix suggestions',
  icon: 'confirmation_number',
  component: TicketResolver,
  keywords: ['ticket', 'jira', 'bug', 'fix', 'winsystems', 'defect', 'resolver', 'issue'],
}
