import type { PluginManifest } from '../../core/types'
import { SmartDiff } from './SmartDiff'

export const smartDiffPlugin: PluginManifest = {
  id: 'smart-diff',
  name: 'Smart Diff',
  description: 'AI-powered code comparison with semantic change detection',
  icon: 'text_compare',
  component: SmartDiff,
  keywords: ['diff', 'compare', 'code', 'semantic', 'ai', 'changes']
}
