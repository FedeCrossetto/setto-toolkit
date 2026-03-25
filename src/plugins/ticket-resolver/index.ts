import type { PluginManifest } from '../../core/types'
import { TicketResolver } from './TicketResolver'

export const ticketResolverPlugin: PluginManifest = {
  id: 'ticket-resolver',
  name: 'Ticket Resolver',
  description: 'Analyze and resolve WinSystems Jira tickets with AI-assisted code search and fix suggestions',
  icon: 'confirmation_number',
  component: TicketResolver,
  keywords: ['ticket', 'jira', 'bug', 'fix', 'winsystems', 'defect', 'resolver', 'issue'],
}
