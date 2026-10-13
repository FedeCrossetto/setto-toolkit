import { lazy } from 'react'
import type { PluginManifest } from '../../core/types'

const CapturesPlugin = lazy(() => import('./CapturesPlugin').then((m) => ({ default: m.CapturesPlugin })))

export const capturesPlugin: PluginManifest = {
  id: 'captures',
  name: 'Capturas',
  description: 'Historial de recortes (Win+Shift+S) con búsqueda por texto, anotaciones y tickets',
  icon: 'captures',
  component: CapturesPlugin,
  keywords: ['capturas', 'screenshots', 'recortes', 'imagenes', 'pantalla', 'snip', 'ocr', 'anotar', 'jira'],
}
