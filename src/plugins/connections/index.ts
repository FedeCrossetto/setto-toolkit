import { lazy } from 'react'
import type { PluginManifest } from '../../core/types'

const ConnectionsPage = lazy(() => import('./ConnectionsPlugin').then((m) => ({ default: m.ConnectionsPlugin })))

export const connectionsPlugin: PluginManifest = {
  id: 'connections',
  name: 'Conexiones',
  description: 'Integraciones y API keys (IA, Git, Jira, Supabase)',
  icon: 'plug',
  component: ConnectionsPage,
  keywords: ['connections', 'integrations', 'credentials', 'api keys', 'auth', 'notion', 'github', 'gitlab', 'bitbucket', 'jira', 'openai', 'anthropic', 'ollama', 'supabase', 'conexiones', 'probar conexión'],
  pinned: true,
}
