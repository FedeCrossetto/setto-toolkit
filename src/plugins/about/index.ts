import type { PluginManifest } from '../../core/types'
import { About } from './About'

export const aboutPlugin: PluginManifest = {
  id: 'about',
  name: 'About',
  description: 'App version and information',
  icon: 'info',
  component: About,
  keywords: ['about', 'version', 'info'],
  pinned: true,
}
