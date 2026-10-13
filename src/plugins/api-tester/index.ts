import { lazy } from 'react'
import type { PluginManifest } from '../../core/types'

const ApiLab = lazy(() => import('./ApiLab').then((m) => ({ default: m.ApiLab })))

export const apiLabPlugin: PluginManifest = {
  id: 'api-tester',
  name: 'API Lab',
  description: 'Probá APIs HTTP sin salir de la app',
  icon: 'api',
  section: 'dev',
  defaultDisabled: true,
  component: ApiLab,
  keywords: ['api', 'http', 'rest', 'postman', 'request', 'endpoint', 'integration'],
}
