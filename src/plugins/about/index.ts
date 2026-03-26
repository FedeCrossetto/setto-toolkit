import { lazy } from 'react'
import type { PluginManifest } from '../../core/types'

const About = lazy(() => import('./About').then((m) => ({ default: m.About })))

export const aboutPlugin: PluginManifest = {
  id: 'about',
  name: 'About',
  description: 'App version and information',
  icon: 'info',
  component: About,
  keywords: ['about', 'version', 'info'],
  pinned: true,
}
