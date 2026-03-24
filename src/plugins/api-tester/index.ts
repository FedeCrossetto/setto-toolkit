import type { PluginManifest } from '../../core/types'
import { ApiTester } from './ApiTester'

export const apiTesterPlugin: PluginManifest = {
  id: 'api-tester',
  name: 'API Lab',
  description: 'Test HTTP APIs and integrations without leaving the app.',
  icon: 'webhook',
  component: ApiTester,
  keywords: ['api', 'http', 'rest', 'postman', 'request', 'endpoint', 'integration'],
}
