/**
 * PLUGIN TEMPLATE
 * Replace this with your plugin's UI.
 *
 * IPC calls pattern:
 *   const result = await window.api.invoke<MyReturnType>('my-plugin:action', payload)
 *
 * Design tokens (Tailwind classes):
 *   - Backgrounds: bg-surface, bg-surface-container-low, bg-surface-container, bg-surface-container-highest
 *   - Text: text-on-surface, text-on-surface-variant
 *   - Accent: text-primary (#ba9eff), text-secondary (#53ddfc)
 *   - Cards: bg-surface-container-low rounded-xl border border-outline-variant/10
 *   - Primary button: gradient from-primary to-secondary, text-on-primary-fixed, rounded-full
 */

import { Puzzle } from 'lucide-react'

export function TemplatePlugin(): JSX.Element {
  return (
    <div className="p-8 max-w-3xl mx-auto w-full">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold tracking-tight text-on-surface">My Plugin</h1>
        <p className="text-on-surface-variant mt-1">Plugin description goes here.</p>
      </div>

      {/* Example card */}
      <div className="bg-surface-container-low rounded-xl p-6 border border-outline-variant/10">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Puzzle size={20} className="text-primary" />
          </div>
          <h2 className="font-bold text-on-surface">Example Card</h2>
        </div>
        <p className="text-sm text-on-surface-variant leading-relaxed">
          Replace this with your plugin content. Use{' '}
          <code className="bg-surface-container-lowest px-1 rounded text-primary">window.api.invoke()</code>{' '}
          to communicate with the Electron main process.
        </p>
      </div>

      {/* Example primary button */}
      <div className="mt-6">
        <button
          className="px-6 py-2.5 rounded-full text-sm font-bold text-on-primary-fixed shadow-neon-btn hover:brightness-110 transition-all"
          style={{ background: 'linear-gradient(to right, #ba9eff, #53ddfc)' }}
        >
          Primary Action
        </button>
      </div>
    </div>
  )
}
