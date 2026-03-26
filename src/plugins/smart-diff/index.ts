import { lazy } from 'react'
import type { PluginManifest } from '../../core/types'

const SmartDiff = lazy(() => import('./SmartDiff').then((m) => ({ default: m.SmartDiff })))

export const smartDiffPlugin: PluginManifest = {
  id: 'smart-diff',
  name: 'Smart Diff',
  description: 'AI-powered code comparison with semantic change detection',
  icon: 'text_compare',
  component: SmartDiff,
  keywords: ['diff', 'compare', 'code', 'semantic', 'ai', 'changes']
}
