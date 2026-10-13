import { lazy } from 'react'
import type { PluginManifest } from '../../core/types'

const UtilitiesPlugin = lazy(() => import('./UtilitiesPlugin').then((m) => ({ default: m.UtilitiesPlugin })))

export const utilitiesPlugin: PluginManifest = {
  id: 'utilities',
  name: 'Utilidades',
  description: 'JSON, Base64, JWT, UUID, timestamps, regex y hash',
  icon: 'utilities',
  component: UtilitiesPlugin,
  keywords: ['utilidades', 'json', 'base64', 'jwt', 'uuid', 'guid', 'timestamp', 'regex', 'hash', 'md5', 'sha', 'url', 'encode'],
}
