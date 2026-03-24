import type { PluginManifest } from '../../core/types'
import { SnippetManager } from './SnippetManager'

export const snippetsPlugin: PluginManifest = {
  id: 'snippets',
  name: 'Snippets',
  description: 'Store and reuse code snippets, commands, and templates',
  icon: 'format_ink_highlighter',
  component: SnippetManager,
  keywords: ['snippet', 'code', 'template', 'clipboard', 'reuse', 'command', 'shortcut'],
}
