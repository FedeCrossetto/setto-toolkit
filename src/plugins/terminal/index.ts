import { lazy } from 'react'
import type { PluginManifest } from '../../core/types'

export const terminalPlugin: PluginManifest = {
  id:          'terminal',
  name:        'Terminal',
  description: 'Terminal integrada con sesiones persistentes',
  icon:        'terminal',
  section: 'dev',
  keepAlive: true,   // no se desmonta: perdería las sesiones abiertas
  component:   lazy(() => import('./Terminal').then((m) => ({ default: m.Terminal }))),
  keywords:    ['terminal', 'shell', 'console', 'cmd', 'powershell', 'bash'],
}
