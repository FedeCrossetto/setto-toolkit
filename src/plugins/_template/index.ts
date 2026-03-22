/**
 * PLUGIN TEMPLATE
 * ---------------
 * To create a new mini app:
 *
 * 1. Copy this folder to src/plugins/my-plugin/
 * 2. Update the PluginManifest fields below
 * 3. Create your React component in TemplatePlugin.tsx
 * 4. (Optional) Create electron/plugins/my-plugin/handlers.ts for backend IPC
 * 5. Register in src/core/plugin-registry.ts and electron/core/plugin-loader.ts
 *
 * Icon names: https://fonts.google.com/icons (Material Symbols Outlined)
 */
import type { PluginManifest } from '../../core/types'
import { TemplatePlugin } from './TemplatePlugin'

export const templatePlugin: PluginManifest = {
  id: 'template',
  name: 'My Plugin',
  description: 'Describe what this mini app does',
  icon: 'extension',              // Material Symbol icon name
  component: TemplatePlugin,
  keywords: ['my-plugin', 'template']
}
