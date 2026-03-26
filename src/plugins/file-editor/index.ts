import { lazy } from 'react'
import type { PluginManifest } from '../../core/types'

const FileEditor = lazy(() => import('./FileEditor').then((m) => ({ default: m.FileEditor })))

export const fileEditorPlugin: PluginManifest = {
  id: 'file-editor',
  name: 'File Editor',
  description: 'Open, edit and watch files. Live log monitoring with tail mode.',
  icon: 'a_large_small',
  component: FileEditor,
  keywords: ['editor', 'file', 'log', 'viewer', 'tail', 'text', 'read', 'open'],
}
