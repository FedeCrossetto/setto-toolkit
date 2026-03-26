import { lazy } from 'react'
import type { PluginManifest } from '../../core/types'

const ApiLab = lazy(() => import('./ApiLab').then((m) => ({ default: m.ApiLab })))

export const apiLabPlugin: PluginManifest = {
  id: 'api-tester',
  name: 'API Lab',
  description: 'Test HTTP APIs and integrations without leaving the app.',
  icon: 'rocket_launch',
  component: ApiLab,
  keywords: ['api', 'http', 'rest', 'postman', 'request', 'endpoint', 'integration'],
}
