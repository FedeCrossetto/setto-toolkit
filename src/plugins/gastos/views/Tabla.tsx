import { Fragment, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Copy, Plus } from 'lucide-react'
import { currentMes, monthsOfYear } from '../analytics'
import { fmt, mesShort } from '../format'
import { ServiceIcon } from '../components/ServiceIcon'
import { SparkBars } from '../components/Glow'
import type { PagoMensual, Servicio } from '../types'

/**
 * Grilla servicios × meses del año. Clic en un monto lo edita; en una celda vacía, carga ese pago.
 * Los servicios dados de baja (inactivos) siguen a la vista, tachados y al final de su categoría:
 * muestran lo que se pagó, pero no sus pendientes.
 */
export function Tabla({ servicios, pagos, year, onEditPago, onAddPago, onToggleServicio }: {
  servicios: Servicio[]
  pagos: PagoMensual[]
  year: number
  onEditPago: (p: PagoMensual) => void
  onAddPago: (servicioId: string, mes: string) => void
  /** Dar de baja / reactivar un servicio desde su fila */
  onToggleServicio?: (s: Servicio) => void
}): JSX.Element {
  const months = monthsOfYear(year)
  const activos = servicios.filter((s) => s.activo)
  const visibles = [...servicios].sort((a, b) => Number(b.activo) - Number(a.activo) || a.orden - b.orden)
  const cats = Array.from(new Set(visibles.map((s) => s.categoria)))
  // Por celda: la factura del mes (una) y los planes de pago de ese mes. Un plan va entero en el mes de la
  // factura que financia (el de su primera cuota), aunque las cuotas siguientes se paguen después.
  const idx = new Map<string, PagoMensual>()
  const planes = new Map<string, PagoMensual[]>()
  for (const p of pagos) {
    if (!p.cuota) { idx.set(`${p.servicioId}::${p.mes}`, p); continue }
    const list = planes.get(p.cuota.plan)
    if (list) list.push(p)
    else planes.set(p.cuota.plan, [p])
  }
  const cuotasIdx = new Map<string, PagoMensual[][]>()
  for (const list of planes.values()) {
    list.sort((a, b) => a.cuota!.n - b.cuota!.n || a.mes.localeCompare(b.mes))
    const k = `${list[0]!.servicioId}::${list[0]!.mes}`
    cuotasIdx.set(k, [...(cuotasIdx.get(k) ?? []), list])
  }
  // Sólo lo pagado: un pendiente lleva el último importe conocido, que es una referencia y no lo que se pagó.
  const pagadoDe = (p: PagoMensual | undefined): number => (p?.pagado ? p.monto : 0)
  const cellTotal = (svc: string, mes: string): number =>
    pagadoDe(idx.get(`${svc}::${mes}`)) + (cuotasIdx.get(`${svc}::${mes}`) ?? []).flat().reduce((t, c) => t + pagadoDe(c), 0)

  const totalesMes = Object.fromEntries(
    months.map((mes) => [mes, visibles.reduce((sum, s) => sum + cellTotal(s.id, mes), 0)]),
  )
  const hoy = currentMes()
  const hayCuotas = cuotasIdx.size > 0
  const totalAnual = Object.values(totalesMes).reduce((a, b) => a + b, 0)
  // Mapa de calor: cada monto se tiñe según lo que pesa dentro del máximo de su servicio.
  // Escala de cada servicio entre su mes más barato y el más caro: resalta los picos.
  const rango = new Map(visibles.map((s) => {
    const v = months.map((m) => pagadoDe(idx.get(`${s.id}::${m}`))).filter((x) => x > 0)
    return [s.id, v.length ? [Math.min(...v), Math.max(...v)] as const : [0, 0] as const]
  }))
  const heat = (svc: string, monto: number): string => {
    const [lo, hi] = rango.get(svc) ?? [0, 0]
    const t = hi > lo ? (monto - lo) / (hi - lo) : 0.3
    return `rgb(var(--c-primary) / ${(0.03 + 0.3 * t * t).toFixed(3)})`
  }
  const [copied, setCopied] = useState(false)

  function buildMd(): string {
    const h = `| Servicio | ${months.map(mesShort).join(' | ')} | TOTAL |`
    const sep = `| --- | ${months.map(() => '---').join(' | ')} | --- |`
    const rows: string[] = []
    for (const cat of cats) {
      rows.push(`| **${cat}** | ${months.map(() => '').join(' | ')} | |`)
      for (const s of visibles.filter((sv) => sv.categoria === cat)) {
        let tot = 0
        const cells = months.map((m) => {
          const p = idx.get(`${s.id}::${m}`)
          const cs = cuotasIdx.get(`${s.id}::${m}`) ?? []
          tot += cellTotal(s.id, m)
          const parts = [
            ...(p ? [p.pagado ? `$${fmt(p.monto)}` : 'a pagar'] : []),
            ...cs.map((plan) => `plan $${fmt(plan.reduce((t, c) => t + c.monto, 0))} (${plan.map((c) => `${c.cuota!.n}/${c.cuota!.de} $${fmt(c.monto)}${c.pagado ? '' : ' a pagar'}`).join(', ')})`),
          ]
          return parts.length ? parts.join(' + ') : '-'
        })
        rows.push(`| ${s.activo ? s.nombre : `~~${s.nombre}~~ (de baja)`} | ${cells.join(' | ')} | $${fmt(tot)} |`)
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

  if (visibles.length === 0) {
    return <p className="ui-card t-footnote text-on-surface-variant py-10 text-center">No hay servicios. Creá uno en la vista Servicios.</p>
  }

  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="ui-card flex items-center gap-5 px-5 py-3">
        <div className="min-w-0">
          <div className="t-caption text-on-surface-variant">Servicios {year}</div>
          <div className="text-[22px] leading-[28px] font-semibold tabular-nums text-on-surface">$ {fmt(totalAnual)}</div>
          <div className="t-caption text-on-surface-variant/80">
            {activos.length} servicios activos{visibles.length > activos.length ? ` · ${visibles.length - activos.length} de baja` : ''}
          </div>
        </div>
        <div className="flex-1 min-w-0 flex justify-end">
          <div className="w-full max-w-[420px]">
            <SparkBars values={months.map((m) => totalesMes[m] ?? 0)} color="rgb(var(--c-primary))" labels={months.map(mesShort)}
              active={months.map((m) => (totalesMes[m] ?? 0) > 0).lastIndexOf(true)} />
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="t-footnote text-on-surface-variant">Clic en un monto para editarlo; en una celda vacía para cargar ese pago.</p>
        <button type="button" onClick={copyMd} className="ui-btn ui-btn-ghost ui-btn-sm">
          {copied ? <Check className="fx-pop" size={12} /> : <Copy size={12} />}
          {copied ? 'Copiado' : 'Copiar como Markdown'}
        </button>
      </div>
      <div className="ui-card overflow-auto max-h-[calc(100vh-300px)] min-h-[240px]">
        <table className="w-full t-footnote border-collapse">
          <thead>
            <tr className="[&>th]:sticky [&>th]:top-0 [&>th]:bg-surface [&>th]:z-10 [&>th]:shadow-[inset_0_-1px_0_var(--hairline)]">
              <th className="t-footnote font-medium text-left text-on-surface-variant px-3 py-2.5 left-0! z-20! min-w-[180px]">Servicio</th>
              {months.map((m) => (
                <th key={m} aria-current={m === hoy ? 'date' : undefined}
                  className={`t-footnote font-medium text-right px-2 py-2.5 min-w-[78px] ${m === hoy ? 'text-primary' : m > hoy ? 'text-on-surface-variant/45' : 'text-on-surface-variant'}`}>
                  {m === hoy && <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary mr-1.5 align-middle" aria-hidden />}
                  {mesShort(m)}
                </th>
              ))}
              <th className="t-footnote font-medium text-right text-on-surface-variant px-3 py-2.5 min-w-[96px] right-0! z-20! shadow-[inset_1px_0_0_var(--hairline),inset_0_-1px_0_var(--hairline)]!">Total</th>
            </tr>
          </thead>
          <tbody>
            {cats.map((cat) => (
              <Fragment key={`cat-${cat}`}>
                <tr>
                  <td colSpan={months.length + 2} className="t-footnote font-semibold text-on-surface-variant px-3 pt-4 pb-1.5 sticky left-0">{cat || 'Sin categoría'}</td>
                </tr>
                {visibles.filter((s) => s.categoria === cat).map((svc) => {
                  let totalSvc = 0
                  const baja = !svc.activo
                  return (
                    <tr key={svc.id} className={`group/row border-b border-(--hairline) hover:bg-on-surface/3 dark:hover:bg-on-surface/5 ${baja ? 'opacity-55 hover:opacity-80 transition-opacity' : ''}`}>
                      <td className="px-3 py-1.5 sticky left-0 bg-surface whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <ServiceIcon icon={svc.emoji} size={13} className="text-on-surface-variant" />
                          <span className={`t-body ${baja ? 'text-on-surface-variant line-through decoration-on-surface-variant/70' : 'text-on-surface'}`}>{svc.nombre}</span>
                          {baja && <span className="t-caption px-1.5 rounded-[4px] bg-on-surface/8 text-on-surface-variant">de baja</span>}
                          {onToggleServicio && (
                            <button type="button" onClick={() => onToggleServicio(svc)}
                              className="ml-auto t-caption px-1.5 rounded-[4px] text-on-surface-variant opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 hover:bg-on-surface/8 hover:text-on-surface">
                              {baja ? 'Reactivar' : 'Dar de baja'}
                            </button>
                          )}
                        </div>
                      </td>
                      {months.map((mes) => {
                        const p0 = idx.get(`${svc.id}::${mes}`)
                        // De baja: se ve lo que se pagó; los pendientes que hayan quedado no se muestran.
                        const p = baja && !p0?.pagado ? undefined : p0
                        const cs = cuotasIdx.get(`${svc.id}::${mes}`) ?? []
                        totalSvc += cellTotal(svc.id, mes)
                        return (
                          <td key={mes} className={`px-1 py-0.5 text-right align-top ${mes === hoy ? 'bg-primary/4' : ''} ${mes > hoy ? 'opacity-45 hover:opacity-100 transition-opacity' : ''}`}>
                            {p ? (
                              <button type="button" onClick={() => onEditPago(p)}
                                title={(p.pagado ? ['Pagado', p.fecha, p.metodoPago, p.notas] : ['Por pagar', p.monto > 0 ? `último importe $ ${fmt(p.monto)}` : '', p.notas]).filter(Boolean).join(' · ')}
                                style={p.pagado ? { background: heat(svc.id, p.monto) } : undefined}
                                className={`w-full text-right px-1.5 py-1 rounded-[6px] tabular-nums transition-[filter] hover:brightness-125 ${p.pagado ? 'text-on-surface' : 't-caption text-on-surface-variant/70 border border-dashed border-on-surface/15 hover:border-on-surface/35 hover:text-on-surface-variant'}`}>
                                {p.pagado ? fmt(p.monto) : 'a pagar'}
                              </button>
                            ) : cs.length > 0 ? null : baja ? (
                              <span className="block px-1.5 py-1 text-on-surface-variant/25">—</span>
                            ) : (
                              <button type="button" onClick={() => onAddPago(svc.id, mes)} aria-label={`Cargar ${svc.nombre} ${mesShort(mes)}`}
                                className="group/empty w-full flex justify-end px-1.5 py-1 rounded-md text-on-surface-variant/30 hover:bg-on-surface/6 hover:text-on-surface-variant">
                                <span className="group-hover/empty:hidden">—</span>
                                <Plus size={12} className="hidden group-hover/empty:block my-[3px]" />
                              </button>
                            )}
                            {/* Sin factura aparte, el primer plan ocupa el lugar del monto (misma altura que el resto de la fila). */}
                            {cs.map((plan, i) => <PlanChip key={plan[0]!.cuota!.plan} cuotas={plan} onEdit={onEditPago} enSlot={!p && i === 0} />)}
                          </td>
                        )
                      })}
                      <td className="px-3 py-1.5 text-right tabular-nums font-medium text-on-surface sticky right-0 bg-surface shadow-[inset_1px_0_0_var(--hairline)]">{totalSvc > 0 ? fmt(totalSvc) : '—'}</td>
                    </tr>
                  )
                })}
              </Fragment>
            ))}
            <tr className="hairline-t">
              <td className="px-3 py-2.5 sticky left-0 bg-surface t-body font-semibold text-on-surface">Total</td>
              {months.map((mes) => {
                const total = totalesMes[mes] ?? 0
                return (
                  <td key={mes} className={`px-2.5 py-2 text-right align-top tabular-nums ${mes === hoy ? 'bg-primary/4' : ''} ${mes > hoy ? 'opacity-45' : ''}`}>
                    {total > 0 ? <span className="font-semibold text-on-surface">{fmt(total)}</span> : <span className="text-on-surface-variant/40">—</span>}
                  </td>
                )
              })}
              <td className="px-3 py-2 text-right align-top tabular-nums sticky right-0 bg-surface shadow-[inset_1px_0_0_var(--hairline)]">
                <span className="font-semibold text-on-surface">{fmt(totalAnual)}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="t-caption text-on-surface-variant flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="flex items-center gap-1.5"><span className="w-3.5 h-2.5 rounded-[3px] border border-dashed border-on-surface/30" aria-hidden />A pagar: todavía no lo pagaste (el último importe está en el tooltip).</span>
        {hayCuotas && (
          <span className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold text-success px-1 rounded-[4px] bg-success/10 ring-1 ring-inset ring-success/25" aria-hidden>1/2</span>
            <span className="text-[10px] font-semibold text-error px-1 rounded-[4px] bg-error/10 ring-1 ring-inset ring-error/25" aria-hidden>2/2</span>
            Plan de pago en el mes de la factura: clic para ver sus cuotas (verde pagada, roja por pagar).
          </span>
        )}
      </p>
    </div>
  )
}

/**
 * Plan de pago dentro de la celda del mes que financia: una sola línea (total y cuántas cuotas van pagas)
 * que despliega sus cuotas una debajo de otra. El desplegable va en un portal para no agrandar la fila
 * ni quedar recortado por el scroll de la tabla.
 */
function PlanChip({ cuotas, onEdit, enSlot }: { cuotas: PagoMensual[]; onEdit: (p: PagoMensual) => void; enSlot: boolean }): JSX.Element {
  const [rect, setRect] = useState<DOMRect | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const total = cuotas.reduce((t, c) => t + c.monto, 0)
  const pagas = cuotas.filter((c) => c.pagado).length
  const completo = pagas === cuotas.length

  useEffect(() => {
    if (!rect) return
    const close = (e: Event): void => {
      if (e.target instanceof Node && (pop.current?.contains(e.target) || btn.current?.contains(e.target))) return
      setRect(null)
    }
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setRect(null) }
    document.addEventListener('mousedown', close)
    document.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [rect])

  return (
    <>
      <button ref={btn} type="button" aria-expanded={Boolean(rect)} aria-haspopup="menu"
        onClick={() => setRect(rect ? null : btn.current?.getBoundingClientRect() ?? null)}
        title={`Plan de pago en ${cuotas.length} cuotas · ${pagas} de ${cuotas.length} pagas`}
        className={`w-full flex items-center justify-between gap-1 px-1.5 rounded-[6px] tabular-nums ring-1 ${enSlot ? 'py-1' : 'mt-0.5 py-[2px] text-[11px]'} ring-inset transition-[filter] hover:brightness-125 ${completo ? 'bg-success/10 text-success ring-success/25' : 'bg-error/10 text-error ring-error/25'}`}>
        <span className="flex items-center gap-0.5 text-[10px] font-semibold opacity-85">
          {pagas}/{cuotas.length}
          <ChevronDown size={10} className={`transition-transform ${rect ? 'rotate-180' : ''}`} />
        </span>
        {fmt(total)}
      </button>
      {rect && createPortal(
        <div ref={pop} role="menu"
          style={{ position: 'fixed', top: rect.bottom + 4, left: Math.max(8, rect.right - 232), width: 232 }}
          className="z-50 rounded-[10px] bg-surface shadow-lg ring-1 ring-(--hairline) p-1.5 flex flex-col gap-0.5">
          <div className="flex items-center justify-between px-1.5 pt-0.5 pb-1 t-caption text-on-surface-variant">
            <span>Plan en {cuotas.length} cuotas</span>
            <span className="tabular-nums">$ {fmt(total)}</span>
          </div>
          {cuotas.map((c) => (
            <button key={c.id} type="button" role="menuitem" onClick={() => { setRect(null); onEdit(c) }}
              className={`grid grid-cols-[30px_1fr_auto] items-center gap-2 px-1.5 py-1 rounded-[6px] text-left t-footnote tabular-nums ring-1 ring-inset hover:brightness-125 ${c.pagado ? 'bg-success/10 text-success ring-success/20' : 'bg-error/10 text-error ring-error/20'}`}>
              <span className="text-[10px] font-semibold">{String(c.cuota!.n).padStart(2, '0')}</span>
              <span className="text-[11px] opacity-85 truncate">
                {c.pagado ? `Pagada${c.fecha ? ` el ${c.fecha}` : ''}` : `Vence ${c.cuota!.vence ?? mesShort(c.mes)}`}
              </span>
              <span>{fmt(c.monto)}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}
