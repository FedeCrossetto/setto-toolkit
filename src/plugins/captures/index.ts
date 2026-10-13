import { lazy } from 'react'
import type { PluginManifest } from '../../core/types'

const CapturesPlugin = lazy(() => import('./CapturesPlugin').then((m) => ({ default: m.CapturesPlugin })))

export const capturesPlugin: PluginManifest = {
  id: 'captures',
  name: 'Portapapeles',
  description: 'Capturas y texto copiado: búsqueda por texto, código, anotaciones y tickets',
  icon: 'captures',
  component: CapturesPlugin,
  keywords: ['portapapeles', 'clipboard', 'copiado', 'texto', 'codigo', 'capturas', 'screenshots', 'recortes', 'imagenes', 'pantalla', 'snip', 'ocr', 'anotar', 'jira'],
}
