import { lazy } from 'react'
import type { PluginManifest } from '../../core/types'

const NotesPlugin = lazy(() => import('./NotesPlugin').then((m) => ({ default: m.NotesPlugin })))

export const notesPlugin: PluginManifest = {
  id: 'notes',
  name: 'Notas',
  description: 'Bloc de notas en Markdown con autoguardado',
  icon: 'notes',
  section: 'personal',
  defaultDisabled: true,
  component: NotesPlugin,
  keywords: ['notas', 'notes', 'bloc', 'markdown', 'apuntes', 'hoy', 'diario'],
}
