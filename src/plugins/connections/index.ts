import { lazy } from 'react'
import type { PluginManifest } from '../../core/types'

const ConnectionsPage = lazy(() => import('./ConnectionsPlugin').then((m) => ({ default: m.ConnectionsPlugin })))

export const connectionsPlugin: PluginManifest = {
  id: 'connections',
  name: 'Connections',
  description: 'Manage all app integrations and credentials in one place',
  icon: 'lock',
  component: ConnectionsPage,
  keywords: ['connections', 'integrations', 'credentials', 'api keys', 'auth', 'notion', 'github', 'gitlab', 'bitbucket', 'jira', 'openai', 'anthropic'],
  pinned: true,
}
