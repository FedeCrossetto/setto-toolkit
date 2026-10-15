import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { BarChart2, CalendarClock, Check, Circle, LayoutGrid, ListPlus, PiggyBank, Receipt, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import type { IconComponent } from '../../../core/types'
import { KpiCard } from '../../../core/components/Form'
import { CountUp } from '../../../core/components/CountUp'
import {
  buildMovimientos, buildPendientes, prevMes, categoryBreakdown, computeMonthSummary, pctChange, pendientesDelMes,
  variablesUsdDelMes, yearSeries, type GastosData, type Movimiento,
} from '../analytics'
import { fmt, fmtMoney, mesLong, mesShort, fechaCorta } from '../format'
import { Donut, YearChart } from '../components/Charts'
import { ServiceTile } from '../components/ServiceIcon'
import type { PagoMensual, Servicio } from '../types'
import { parseAmount } from '../quick-add-parser'
import { montoSugerido } from '../recurring'

export function Resumen({ data, mes, presupuesto, onSelectMes, onEditPresupuesto, onPagar, onEditPago, onGenerarPendientes, onOpenMovimiento, onShowMovimientos }: {
  data: GastosData
  mes: string
  presupuesto: number | null
  onSelectMes: (mes: string) => void
  onEditPresupuesto: () => void
  /** Marca pagados con el monto indicado (fecha de hoy) */
  onPagar: (items: Array<{ pago: PagoMensual; monto: number }>) => void
  onEditPago: (p: PagoMensual) => void
  onGenerarPendientes: () => void
  onOpenMovimiento: (m: Movimiento) => void
  onShowMovimientos: () => void
}): JSX.Element {
  const year = Number(mes.slice(0, 4))
  const s = useMemo(() => computeMonthSummary(data, mes, presupuesto), [data, mes, presupuesto])
  const series = useMemo(() => yearSeries(data, year), [data, year])
  const prevSeries = useMemo(() => yearSeries(data, year - 1), [data, year])
  const cats = useMemo(() => categoryBreakdown(data, mes), [data, mes])
  const pendientes = useMemo(() => pendientesDelMes(data, mes), [data, mes])
  const faltantes = useMemo(() => buildPendientes(data, mes).length, [data, mes])
  const top = useMemo(() => buildMovimientos(data, { mes }).filter((m) => m.moneda === 'ARS').sort((a, b) => b.monto - a.monto).slice(0, 6), [data, mes])
  const usd = variablesUsdDelMes(data, mes)
  const svc = new Map(data.servicios.map((x) => [x.id, x]))

  const delta = pctChange(s.total, s.previousTotal)
  const usado = s.presupuesto ? s.total / s.presupuesto : 0
  const restante = s.presupuesto ? s.presupuesto - s.total : 0

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={Wallet} label="Este mes" value={<CountUp value={s.total} format={fmtMoney} />}
          sub={`Fijos ${fmtMoney(s.fijos)} · Variables ${fmtMoney(s.variables)}${usd ? ` · US$ ${fmt(usd)}` : ''}`} />
        <KpiCard icon={delta !== null && delta > 0 ? TrendingUp : TrendingDown} tone="neutral" label="Vs. mes anterior"
          value={<CountUp value={s.previousTotal} format={fmtMoney} />}
          delta={delta === null ? undefined : `${delta > 0 ? '+' : ''}${delta.toFixed(0)}%`}
          deltaTone={delta === null ? 'neutral' : delta > 0 ? 'warning' : 'success'}
          sub={delta === null ? `Sin datos de ${mesShort(prevMes(mes))}` : `este mes vs. ${mesShort(prevMes(mes))}`} />
        <KpiCard icon={CalendarClock} tone={s.pendientesCount ? 'warning' : faltantes ? 'neutral' : 'success'} label="Pendientes"
          value={s.pendientesCount ? <CountUp value={s.pendientes} format={fmtMoney} /> : faltantes ? `${faltantes} sin cargar` : 'Al día'}
          sub={s.pendientesCount ? `${s.pendientesCount} sin pagar` : faltantes ? 'Servicios sin pago este mes' : 'Nada por pagar'} />
        <KpiCard icon={PiggyBank} tone={!s.presupuesto ? 'neutral' : usado > 1 ? 'error' : usado > 0.9 ? 'warning' : 'success'}
          label="Presupuesto restante" onClick={onEditPresupuesto}
          value={s.presupuesto ? <CountUp value={restante} format={fmtMoney} /> : 'Sin definir'}
          delta={s.presupuesto ? `${Math.round(usado * 100)}%` : undefined}
          deltaTone={usado > 1 ? 'error' : usado > 0.9 ? 'warning' : 'primary'}
          sub={s.presupuesto ? `usado de ${fmtMoney(s.presupuesto)}` : 'Clic para definir un tope mensual'} />
      </div>

      {s.presupuesto && (
        <div className="h-1.5 rounded-full bg-on-surface/[0.07] overflow-hidden" aria-hidden>
          <div className={`h-full rounded-full ${usado > 1 ? 'bg-error' : usado > 0.9 ? 'bg-warning' : 'bg-primary'}`}
            style={{ width: `${Math.min(usado, 1) * 100}%`, transition: 'width 300ms var(--ease-mac)' }} />
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <section className="ui-card px-5 pt-4 pb-4 xl:col-span-2 flex flex-col gap-3 min-w-0">
          <CardHeader icon={BarChart2} title={`Año ${year}`}
            right={<span className="t-footnote text-on-surface-variant tabular-nums">Total {fmtMoney(series.totals.reduce((a, b) => a + b, 0))}</span>} />
          <YearChart months={series.months} fijos={series.fijos} variables={series.variables}
            previous={prevSeries.totals} prevLabel={String(year - 1)} selectedMes={mes} onSelectMes={onSelectMes} />
        </section>

        <section className="ui-card px-5 pt-4 pb-4 flex flex-col justify-start self-stretch gap-3 min-w-0">
          <CardHeader icon={LayoutGrid} title="Por categoría" />
          {cats.length
            ? <Donut slices={cats} total={s.total} />
            : <p className="flex-1 flex items-center justify-center t-footnote text-on-surface-variant py-8 text-center">Sin gastos en {mesLong(mes).toLowerCase()}.</p>}
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <PorPagar pendientes={pendientes} pagos={data.pagos} svc={svc} faltantes={faltantes}
          onPagar={onPagar} onEditPago={onEditPago} onGenerarPendientes={onGenerarPendientes} />

        <section className="ui-card overflow-hidden min-w-0">
          <header className="flex items-center gap-2.5 px-4 py-3 hairline-b">
            <CardHeader icon={Receipt} title="Movimientos más grandes" />
            <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={onShowMovimientos}>Ver todos</button>
          </header>
          {top.length === 0 ? (
            <p className="t-footnote text-on-surface-variant px-4 py-6 text-center">Todavía no hay movimientos este mes.</p>
          ) : (
            <ul className="divide-y divide-(--hairline)">
              {top.map((m) => (
                <li key={m.id}>
                  <button type="button" onClick={() => onOpenMovimiento(m)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-on-surface/3 dark:hover:bg-on-surface/5 transition-colors">
                    <span className="t-caption text-on-surface-variant w-12 tabular-nums">{fechaCorta(m.fecha)}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block t-body text-on-surface truncate">{m.descripcion}</span>
                      <span className="block t-caption text-on-surface-variant">{m.categoria} · {m.kind === 'fijo' ? 'Fijo' : 'Variable'}</span>
                    </span>
                    <span className="t-body font-medium tabular-nums text-on-surface">$ {fmt(m.monto)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}


/** Encabezado de tarjeta: tile de ícono + título + acción a la derecha. */
function CardHeader({ icon: Icon, title, right }: { icon: IconComponent; title: string; right?: ReactNode }): JSX.Element {
  return (
    <div className="flex items-center gap-2.5 w-full min-w-0">
      <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-selected text-primary shrink-0">
        <Icon size={15} />
      </span>
      <h2 className="t-headline text-on-surface flex-1 min-w-0 truncate">{title}</h2>
      {right}
    </div>
  )
}

function amountText(n: number): string {
  return n ? fmt(n) : ''
}

/** Checklist "Por pagar": monto editable en la fila, Pagar con Enter o clic, y pago en lote. */
function PorPagar({ pendientes, pagos, svc, faltantes, onPagar, onEditPago, onGenerarPendientes }: {
  pendientes: PagoMensual[]
  pagos: PagoMensual[]
  svc: Map<string, Servicio>
  faltantes: number
  onPagar: (items: Array<{ pago: PagoMensual; monto: number }>) => void
  onEditPago: (p: PagoMensual) => void
  onGenerarPendientes: () => void
}): JSX.Element {
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const amountOf = (p: PagoMensual): number | null => {
    const raw = amounts[p.id]
    return raw === undefined ? (montoSugerido(pagos, p) || null) : parseAmount(raw)
  }
  const sel = pendientes.filter((p) => selected.has(p.id))
  const selValid = sel.filter((p) => amountOf(p) !== null)

  function pagar(list: PagoMensual[]): void {
    const items = list.map((pago) => ({ pago, monto: amountOf(pago) })).filter((x): x is { pago: PagoMensual; monto: number } => x.monto !== null)
    if (!items.length) return
    onPagar(items)
    setSelected((prev) => { const n = new Set(prev); for (const x of items) n.delete(x.pago.id); return n })
  }

  function toggle(id: string, on: boolean): void {
    setSelected((prev) => { const n = new Set(prev); if (on) n.add(id); else n.delete(id); return n })
  }

  const allOn = pendientes.length > 0 && sel.length === pendientes.length

  return (
    <section className="ui-card overflow-hidden min-w-0">
      <header className="flex items-center gap-2.5 px-4 py-3 hairline-b">
        <CardHeader icon={CalendarClock} title="Por pagar" />
        {sel.length > 0 ? (
          <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" disabled={!selValid.length} onClick={() => pagar(sel)}
            title={selValid.length < sel.length ? 'Los que no tienen monto se saltean' : undefined}>
            <Check size={13} /> Marcar {selValid.length} como pagado{selValid.length === 1 ? '' : 's'}
          </button>
        ) : faltantes > 0 && (
          <button type="button" className="ui-btn ui-btn-outline ui-btn-sm" onClick={onGenerarPendientes}
            title="Crea un pago pendiente para cada servicio activo que todavía no tiene uno este mes">
            <ListPlus size={13} /> Generar pendientes ({faltantes})
          </button>
        )}
      </header>
      {pendientes.length === 0 ? (
        <p className="t-footnote text-on-surface-variant px-4 py-6 text-center">
          {faltantes ? 'Generá los pendientes para tener el checklist del mes.' : 'Todo pagado este mes.'}
        </p>
      ) : (
        <ul className="divide-y divide-(--hairline)">
          {pendientes.length > 1 && (
            <li className="flex items-center gap-3 px-4 py-1.5 t-caption text-on-surface-variant">
              <input type="checkbox" checked={allOn} aria-label="Seleccionar todos"
                onChange={(e) => setSelected(e.target.checked ? new Set(pendientes.map((p) => p.id)) : new Set())} />
              <span>Seleccionar todos · Enter en el monto paga esa fila</span>
            </li>
          )}
          {pendientes.map((p) => {
            const sv = svc.get(p.servicioId)
            const value = amounts[p.id] ?? amountText(montoSugerido(pagos, p))
            const valid = amountOf(p) !== null
            return (
              <li key={p.id} className={`flex items-center gap-3 px-4 py-2 transition-colors ${selected.has(p.id) ? 'bg-selected' : 'hover:bg-on-surface/3 dark:hover:bg-on-surface/5'}`}>
                <input type="checkbox" checked={selected.has(p.id)} aria-label={`Seleccionar ${sv?.nombre ?? ''}`}
                  onChange={(e) => toggle(p.id, e.target.checked)} />
                <ServiceTile icon={sv?.emoji ?? 'receipt'} />
                <button type="button" className="flex-1 min-w-0 text-left" onClick={() => onEditPago(p)} title="Editar pago">
                  <div className="t-body text-on-surface truncate">{sv?.nombre ?? p.servicioId}</div>
                  <div className="t-caption text-on-surface-variant">{p.monto ? sv?.categoria : 'Último monto conocido'}</div>
                </button>
                <span className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 t-footnote text-on-surface-variant pointer-events-none">$</span>
                  <input className="ui-input w-28 pl-5 text-right tabular-nums" inputMode="decimal" value={value}
                    aria-label={`Monto de ${sv?.nombre ?? ''}`} placeholder="Monto"
                    onChange={(e) => setAmounts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    onFocus={(e) => e.currentTarget.select()}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); pagar([p]) } }} />
                </span>
                <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" disabled={!valid} onClick={() => pagar([p])}
                  aria-label={`Marcar ${sv?.nombre ?? ''} como pagado`} title="Marcar pagado hoy con este monto">
                  <Circle size={13} /> Pagar
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
