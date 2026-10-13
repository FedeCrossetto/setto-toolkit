import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Toggle } from '../../../core/components/Form'
import { lastKnownMonto, currentMes } from '../analytics'
import { fmt } from '../format'
import { ServiceTile } from '../components/ServiceIcon'
import type { PagoMensual, Servicio } from '../types'

/** Lista agrupada por categoría (estilo Ajustes del Sistema). */
export function Servicios({ servicios, pagos, onAdd, onEdit, onDelete, onToggle }: {
  servicios: Servicio[]
  pagos: PagoMensual[]
  onAdd: () => void
  onEdit: (s: Servicio) => void
  onDelete: (s: Servicio) => void
  onToggle: (s: Servicio) => void
}): JSX.Element {
  const cats = Array.from(new Set(servicios.map((s) => s.categoria)))
  const mes = currentMes()

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <div className="flex items-center justify-between">
        <p className="t-footnote text-on-surface-variant">
          {servicios.filter((s) => s.activo).length} activos · los inactivos no aparecen en la tabla ni generan pendientes.
        </p>
        <button type="button" className="ui-btn ui-btn-outline" onClick={onAdd}><Plus size={14} /> Nuevo servicio</button>
      </div>
      {servicios.length === 0 && (
        <p className="ui-card t-footnote text-on-surface-variant py-10 text-center">Todavía no cargaste servicios (luz, gas, internet…).</p>
      )}
      {cats.map((cat) => (
        <section key={cat} className="flex flex-col gap-2">
          <h3 className="t-callout font-semibold text-on-surface px-1">{cat || 'Sin categoría'}</h3>
          <div className="ui-card overflow-hidden divide-y divide-[var(--hairline)]">
            {servicios.filter((s) => s.categoria === cat).map((svc) => {
              const ultimo = lastKnownMonto(pagos, svc.id, mes)
              return (
                <div key={svc.id} className={`group flex items-center gap-3 px-4 py-2.5 min-h-[52px] hover:bg-on-surface/[0.03] dark:hover:bg-on-surface/[0.05] transition-colors ${svc.activo ? '' : 'opacity-55'}`}>
                  <ServiceTile icon={svc.emoji} />
                  <button type="button" className="flex-1 min-w-0 text-left" onClick={() => onEdit(svc)}>
                    <div className="t-body font-medium text-on-surface truncate">{svc.nombre}</div>
                    {svc.numeroCuenta && <div className="t-caption text-on-surface-variant tabular-nums truncate">{svc.numeroCuenta}</div>}
                  </button>
                  {ultimo > 0 && <span className="t-footnote text-on-surface-variant tabular-nums" title="Último monto cargado">$ {fmt(ultimo)}</span>}
                  <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon opacity-0 group-hover:opacity-100 focus:opacity-100"
                    onClick={() => onEdit(svc)} aria-label={`Editar ${svc.nombre}`} title="Editar"><Pencil size={13} /></button>
                  <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-error"
                    onClick={() => onDelete(svc)} aria-label={`Eliminar ${svc.nombre}`} title="Eliminar"><Trash2 size={13} /></button>
                  <Toggle checked={svc.activo} onChange={() => onToggle(svc)} label={svc.activo ? 'Desactivar' : 'Activar'} />
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
