import { lazy } from 'react'
import type { PluginManifest } from '../../core/types'

const FileEditor = lazy(() => import('./FileEditor').then((m) => ({ default: m.FileEditor })))

export const fileEditorPlugin: PluginManifest = {
  id: 'file-editor',
  name: 'Editor',
  description: 'Abrí, editá y monitoreá archivos',
  icon: 'editor',
  section: 'dev',
  keepAlive: true,   // no se desmonta: perdería el estado de los archivos y watchers
  component: FileEditor,
  keywords: ['editor', 'file', 'log', 'viewer', 'tail', 'text', 'read', 'open'],
}
