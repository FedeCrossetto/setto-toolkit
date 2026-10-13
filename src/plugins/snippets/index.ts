import { lazy } from 'react'
import type { PluginManifest } from '../../core/types'

const SnippetManager = lazy(() => import('./SnippetManager').then((m) => ({ default: m.SnippetManager })))

export const snippetsPlugin: PluginManifest = {
  id: 'snippets',
  name: 'Snippets',
  description: 'Biblioteca de scripts, comandos y queries reutilizables',
  icon: 'snippets',
  section: 'personal',
  component: SnippetManager,
  keywords: ['snippet', 'script', 'código', 'comando', 'query', 'sql', 'powershell', 'plantilla', 'portapapeles'],
}
