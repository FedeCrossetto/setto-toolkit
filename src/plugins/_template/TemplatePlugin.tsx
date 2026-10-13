/**
 * PLUGIN TEMPLATE
 * Replace this with your plugin's UI. Read docs/DESIGN.md first.
 *
 * IPC calls pattern:
 *   const result = await window.api.invoke<MyReturnType>('my-plugin:action', payload)
 *
 * Design system (tokens only — no hex, no raw Tailwind palette colors, no gradients):
 *   - Surfaces: bg-surface, bg-sidebar/40 (side panes), bg-on-surface/[0.06] (neutral fills)
 *   - Text: text-on-surface, text-on-surface-variant, text-success|warning|error
 *   - Type scale: .t-title1|2|3, .t-headline, .t-body, .t-callout, .t-footnote, .t-caption, .t-section
 *   - Borders: hairline, hairline-b|t|l|r, border-hairline
 *   - Components: ui-card, ui-btn (+ ui-btn-primary|outline|ghost|danger, ui-btn-sm, ui-btn-icon), ui-input
 *   - Shared React: Modal / Sheet / useConfirm (core/components/Modal), PageHeader / SettingsGroup (core/components/Form)
 *   - UI copy in Spanish (rioplatense).
 */

import { Puzzle } from 'lucide-react'
import { PageHeader } from '../../core/components/Form'

export function TemplatePlugin(): JSX.Element {
  return (
    <div className="px-6 py-5 max-w-5xl mx-auto w-full flex flex-col gap-5">
      <PageHeader
        title="Mi módulo"
        subtitle="Descripción breve de lo que hace el módulo."
        actions={<button className="ui-btn ui-btn-primary">Acción principal</button>}
      />

      {/* Example card */}
      <div className="ui-card p-5">
        <div className="flex items-center gap-2.5 mb-2">
          <Puzzle size={16} className="text-on-surface-variant" />
          <h2 className="t-headline text-on-surface">Tarjeta de ejemplo</h2>
        </div>
        <p className="t-body text-on-surface-variant">
          Reemplazá esto con el contenido del módulo. Usá{' '}
          <code className="font-mono t-footnote bg-on-surface/[0.06] px-1 rounded">window.api.invoke()</code>{' '}
          para hablar con el proceso principal de Electron.
        </p>
      </div>
    </div>
  )
}
