import { lazy } from 'react'
import type { PluginManifest } from '../../core/types'

export const terminalPlugin: PluginManifest = {
  id:          'terminal',
  name:        'Terminal',
  description: 'Integrated terminal with session history and custom themes',
  icon:        'square_terminal',
  component:   lazy(() => import('./Terminal').then((m) => ({ default: m.Terminal }))),
  keywords:    ['terminal', 'shell', 'console', 'cmd', 'powershell', 'bash'],
}
