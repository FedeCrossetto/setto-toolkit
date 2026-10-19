import { Pause, Pencil, Play, Plus, Repeat, Trash2 } from 'lucide-react'
import { EmptyState } from '../../../core/components/EmptyState'
import type { ReglaRecurrente } from '../types'
import { fechaCorta, fmt } from '../format'
import { describeRegla, nextOccurrence } from '../recurrence'

/** Lista de gastos recurrentes: pausar / editar / eliminar. */
export function Recurrentes({ reglas, onAdd, onEdit, onToggle, onDelete }: {
  reglas: ReglaRecurrente[]
  onAdd: () => void
  onEdit: (r: ReglaRecurrente) => void
  onToggle: (r: ReglaRecurrente) => void
  onDelete: (r: ReglaRecurrente) => void
}): JSX.Element {
  const sorted = [...reglas].sort((a, b) => Number(Boolean(a.pausada)) - Number(Boolean(b.pausada)) || a.descripcion.localeCompare(b.descripcion))
  const total = reglas.filter((r) => !r.pausada && r.moneda === 'ARS' && r.frecuencia === 'mensual').reduce((s, r) => s + r.monto, 0)

  return (
    <section className="ui-card overflow-hidden min-w-0">
      <header className="flex items-center gap-2.5 px-5 py-3.5 hairline-b">
        <Repeat size={15} className="text-on-surface-variant shrink-0" />
        <h2 className="t-callout font-semibold text-on-surface flex-1 min-w-0 truncate">Recurrentes</h2>
        {total > 0 && <span className="t-footnote text-on-surface-variant tabular-nums">$ {fmt(total)} por mes</span>}
        <button type="button" className="ui-btn ui-btn-outline ui-btn-sm" onClick={onAdd}><Plus size={13} /> Nuevo</button>
      </header>
      {sorted.length === 0 ? (
        <div className="py-6">
          <EmptyState compact icon={Repeat} title="Sin gastos recurrentes"
            description='Se cargan solos en cada fecha. Probá escribir "netflix 5000 todos los meses" en el agregado rápido.' />
        </div>
      ) : (
        <ul className="divide-y divide-(--hairline)">
          {sorted.map((r) => {
            const next = r.pausada ? null : nextOccurrence(r)
            return (
              <li key={r.id} className={`group flex items-center gap-3 px-5 py-2.5 hover:bg-on-surface/3 dark:hover:bg-on-surface/5 transition-colors ${r.pausada ? 'opacity-60' : ''}`}>
                <button type="button" className="flex-1 min-w-0 text-left" onClick={() => onEdit(r)} title="Editar">
                  <span className="block t-body text-on-surface truncate">{r.descripcion}</span>
                  <span className="block t-caption text-on-surface-variant truncate">
                    {describeRegla(r)} · {r.categoria}{r.pausada ? ' · En pausa' : next ? ` · Próximo ${fechaCorta(next)}` : ''}
                  </span>
                </button>
                <span className="t-body font-medium tabular-nums text-on-surface">{r.moneda === 'USD' ? 'US$' : '$'} {fmt(r.monto)}</span>
                <span className="flex items-center gap-0.5">
                  <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon" onClick={() => onToggle(r)}
                    aria-label={r.pausada ? `Reanudar ${r.descripcion}` : `Pausar ${r.descripcion}`} title={r.pausada ? 'Reanudar' : 'Pausar'}>
                    {r.pausada ? <Play size={14} /> : <Pause size={14} />}
                  </button>
                  <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon" onClick={() => onEdit(r)} aria-label={`Editar ${r.descripcion}`} title="Editar">
                    <Pencil size={14} />
                  </button>
                  <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon" onClick={() => onDelete(r)} aria-label={`Eliminar ${r.descripcion}`} title="Eliminar">
                    <Trash2 size={14} />
                  </button>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
