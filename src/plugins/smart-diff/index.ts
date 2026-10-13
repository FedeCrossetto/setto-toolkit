import { lazy } from 'react'
import type { PluginManifest } from '../../core/types'

const SmartDiff = lazy(() => import('./SmartDiff').then((m) => ({ default: m.SmartDiff })))

export const smartDiffPlugin: PluginManifest = {
  id: 'smart-diff',
  name: 'Comparar',
  description: 'Compará archivos y textos lado a lado',
  icon: 'diff',
  section: 'dev',
  defaultDisabled: true,
  component: SmartDiff,
  keywords: ['diff', 'compare', 'code', 'semantic', 'ai', 'changes']
}
