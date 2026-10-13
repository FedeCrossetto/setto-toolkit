import { Fragment, useState } from 'react'
import { Check, Copy, Plus } from 'lucide-react'
import { monthsOfYear } from '../analytics'
import { fmt, mesShort } from '../format'
import { ServiceIcon } from '../components/ServiceIcon'
import type { PagoMensual, Servicio } from '../types'

/** Grilla servicios × meses del año. Clic en un monto lo edita; en una celda vacía, carga ese pago. */
export function Tabla({ servicios, pagos, year, onEditPago, onAddPago }: {
  servicios: Servicio[]
  pagos: PagoMensual[]
  year: number
  onEditPago: (p: PagoMensual) => void
  onAddPago: (servicioId: string, mes: string) => void
}): JSX.Element {
  const months = monthsOfYear(year)
  const activos = servicios.filter((s) => s.activo).sort((a, b) => a.orden - b.orden)
  const cats = Array.from(new Set(activos.map((s) => s.categoria)))
  const idx = new Map<string, PagoMensual>()
  for (const p of pagos) idx.set(`${p.servicioId}::${p.mes}`, p)

  const totalesMes = Object.fromEntries(
    months.map((mes) => [mes, activos.reduce((sum, s) => sum + (idx.get(`${s.id}::${mes}`)?.monto ?? 0), 0)]),
  )
  const totalAnual = Object.values(totalesMes).reduce((a, b) => a + b, 0)
  const [copied, setCopied] = useState(false)

  function buildMd(): string {
    const h = `| Servicio | ${months.map(mesShort).join(' | ')} | TOTAL |`
    const sep = `| --- | ${months.map(() => '---').join(' | ')} | --- |`
    const rows: string[] = []
    for (const cat of cats) {
      rows.push(`| **${cat}** | ${months.map(() => '').join(' | ')} | |`)
      for (const s of activos.filter((sv) => sv.categoria === cat)) {
        let tot = 0
        const cells = months.map((m) => { const p = idx.get(`${s.id}::${m}`); if (p) tot += p.monto; return p ? `$${fmt(p.monto)}` : '-' })
        rows.push(`| ${s.nombre} | ${cells.join(' | ')} | $${fmt(tot)} |`)
      }
    }
    const tc = months.map((m) => ((totalesMes[m] ?? 0) > 0 ? `**$${fmt(totalesMes[m]!)}**` : '-'))
    rows.push(`| **TOTAL** | ${tc.join(' | ')} | **$${fmt(totalAnual)}** |`)
    return `## Gastos ${year}\n\n${h}\n${sep}\n${rows.join('\n')}`
  }

  function copyMd(): void {
    void navigator.clipboard.writeText(buildMd())
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (activos.length === 0) {
    return <p className="ui-card t-footnote text-on-surface-variant py-10 text-center">No hay servicios activos. Creá uno en la vista Servicios.</p>
  }

  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="flex items-center justify-between gap-3">
        <p className="t-footnote text-on-surface-variant">Clic en un monto para editarlo; en una celda vacía para cargar ese pago.</p>
        <button type="button" onClick={copyMd} className="ui-btn ui-btn-ghost ui-btn-sm">
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copiado' : 'Copiar como Markdown'}
        </button>
      </div>
      <div className="ui-card overflow-auto max-h-[calc(100vh-300px)] min-h-[240px]">
        <table className="w-full t-footnote border-collapse">
          <thead>
            <tr className="[&>th]:sticky [&>th]:top-0 [&>th]:bg-surface [&>th]:z-10 [&>th]:shadow-[inset_0_-1px_0_var(--hairline)]">
              <th className="t-footnote font-medium text-left text-on-surface-variant px-3 py-2.5 !left-0 !z-20 min-w-[180px]">Servicio</th>
              {months.map((m) => (
                <th key={m} className="t-footnote font-medium text-right text-on-surface-variant px-2 py-2.5 min-w-[78px]">{mesShort(m)}</th>
              ))}
              <th className="t-footnote font-medium text-right text-on-surface-variant px-3 py-2.5 min-w-[96px]">Total</th>
            </tr>
          </thead>
          <tbody>
            {cats.map((cat) => (
              <Fragment key={`cat-${cat}`}>
                <tr>
                  <td colSpan={months.length + 2} className="t-footnote font-semibold text-on-surface-variant px-3 pt-4 pb-1.5 sticky left-0">{cat || 'Sin categoría'}</td>
                </tr>
                {activos.filter((s) => s.categoria === cat).map((svc) => {
                  let totalSvc = 0
                  return (
                    <tr key={svc.id} className="group/row border-b border-[var(--hairline)] hover:bg-on-surface/[0.03] dark:hover:bg-on-surface/[0.05]">
                      <td className="px-3 py-1.5 sticky left-0 bg-surface whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <ServiceIcon icon={svc.emoji} size={13} className="text-on-surface-variant" />
                          <span className="t-body text-on-surface">{svc.nombre}</span>
                        </div>
                      </td>
                      {months.map((mes) => {
                        const p = idx.get(`${svc.id}::${mes}`)
                        if (p) totalSvc += p.monto
                        return (
                          <td key={mes} className="px-1 py-0.5 text-right">
                            {p ? (
                              <button type="button" onClick={() => onEditPago(p)}
                                title={[p.pagado ? 'Pagado' : 'Pendiente', p.fecha, p.metodoPago, p.notas].filter(Boolean).join(' · ')}
                                className={`w-full text-right px-1.5 py-1 rounded-md tabular-nums hover:bg-on-surface/[0.06] ${p.pagado ? 'text-on-surface' : 'text-warning'}`}>
                                {fmt(p.monto)}
                              </button>
                            ) : (
                              <button type="button" onClick={() => onAddPago(svc.id, mes)} aria-label={`Cargar ${svc.nombre} ${mesShort(mes)}`}
                                className="group/empty w-full flex justify-end px-1.5 py-1 rounded-md text-on-surface-variant/30 hover:bg-on-surface/[0.06] hover:text-on-surface-variant">
                                <span className="group-hover/empty:hidden">—</span>
                                <Plus size={12} className="hidden group-hover/empty:block my-[3px]" />
                              </button>
                            )}
                          </td>
                        )
                      })}
                      <td className="px-3 py-1.5 text-right tabular-nums font-medium text-on-surface">{totalSvc > 0 ? fmt(totalSvc) : '—'}</td>
                    </tr>
                  )
                })}
              </Fragment>
            ))}
            <tr className="hairline-t bg-on-surface/[0.02]">
              <td className="px-3 py-2.5 sticky left-0 bg-surface t-body font-semibold text-on-surface">Total</td>
              {months.map((mes) => (
                <td key={mes} className="px-2.5 py-2 text-right tabular-nums font-semibold text-on-surface">
                  {(totalesMes[mes] ?? 0) > 0 ? fmt(totalesMes[mes]!) : <span className="text-on-surface-variant/40">—</span>}
                </td>
              ))}
              <td className="px-3 py-2 text-right tabular-nums font-semibold text-on-surface">{fmt(totalAnual)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="t-caption text-on-surface-variant flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-warning" aria-hidden />Los montos resaltados están pendientes de pago.</p>
    </div>
  )
}
