import { useEffect, useRef, useState } from 'react'
import { Sheet } from '../../../core/components/Modal'
import { Field, Toggle } from '../../../core/components/Form'
import type { PagoMensual, Servicio } from '../types'
import { currentMes, lastKnownMonto, pagoId, planDeCuotas, prevMes } from '../analytics'
import { fmt, hoyDDMM, mesShort } from '../format'
import { parseAmount } from '../quick-add-parser'

/** Una cuota del plan en el formulario: con `fecha` (día en que se pagó) queda pagada. */
interface PlanRow { monto: string; vence: string; fecha: string }

/** Máscara "DD/MM" */
const ddmm = (v: string): string => {
  const digits = v.replace(/\D/g, '').slice(0, 4)
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}/${digits.slice(2)}`
}

export const METODOS_PAGO = ['MP', 'HB', 'Deb. aut', 'Suc. virtual', 'Efectivo', 'Otro']

export interface PagoSheetProps {
  open: boolean
  /** Pago a editar, o datos para prellenar uno nuevo */
  initial?: Partial<PagoMensual>
  servicios: Servicio[]
  pagos: PagoMensual[]
  onSave: (p: PagoMensual) => void
  /** Plan de pago: todas las cuotas juntas (la primera reemplaza al pago que se estaba editando). */
  onSavePlan: (cuotas: PagoMensual[], reemplaza?: PagoMensual) => void
  onDelete?: (p: PagoMensual) => void
  onClose: () => void
}

export function PagoSheet({ open, initial, servicios, pagos, onSave, onSavePlan, onDelete, onClose }: PagoSheetProps): JSX.Element {
  const editing = Boolean(initial?.id)
  /** Editando una cuota de un plan ya armado: se edita esa cuota sola. */
  const cuota = initial?.cuota
  const activos = servicios.filter((s) => s.activo || s.id === initial?.servicioId)
  const [servicioId, setServicioId] = useState('')
  const [mes, setMes] = useState(currentMes())
  const [monto, setMonto] = useState('')
  const [fecha, setFecha] = useState('')
  const [metodo, setMetodo] = useState('MP')
  const [pagado, setPagado] = useState(true)
  /** El usuario movió el toggle a mano: la fecha ya no lo cambia. */
  const pagadoTocado = useRef(false)
  const [notas, setNotas] = useState('')
  /** 1 = pago común; 2 o 3 = plan de pago desde este mes */
  const [cuotas, setCuotas] = useState(1)
  /** Importe y vencimiento de cada cuota del plan (se pueden corregir a mano, como vienen en el plan real). */
  const [rows, setRows] = useState<PlanRow[]>([])
  const planId = useRef('')
  /** Vencimiento de la cuota que se está editando */
  const [vence, setVence] = useState('')

  useEffect(() => {
    if (!open) return
    const sid = initial?.servicioId ?? activos[0]?.id ?? ''
    const m = initial?.mes ?? currentMes()
    setServicioId(sid)
    setMes(m)
    // Un pendiente sin tocar (sin fecha) guarda el importe del día en que se creó: se propone el último pagado.
    const pendienteSinTocar = initial?.id && initial.pagado === false && !initial.fecha && !initial.cuota
    const ultimoPagado = sid ? lastKnownMonto(pagos.filter((p) => p.pagado), sid, m) : 0
    const known = pendienteSinTocar ? ultimoPagado || initial?.monto : initial?.monto ?? (sid ? lastKnownMonto(pagos, sid, m) : 0)
    setMonto(known ? String(known) : '')
    setFecha(initial?.fecha ?? (editing ? '' : hoyDDMM()))
    setMetodo(initial?.metodoPago ?? 'MP')
    // Un pendiente que ya tiene fecha de pago se pagó: abre como pagado (al guardar queda así).
    setPagado((initial?.pagado ?? true) || Boolean(initial?.fecha))
    pagadoTocado.current = false
    setNotas(initial?.notas ?? '')
    setCuotas(1)
    setRows([])
    planId.current = `plan-${crypto.randomUUID().slice(0, 8)}`
    setVence(initial?.cuota?.vence ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial])

  function handleFecha(v: string): void {
    const digits = v.replace(/\D/g, '').slice(0, 4)
    setFecha(digits.length <= 2 ? digits : `${digits.slice(0, 2)}/${digits.slice(2)}`)
    // Cargar la fecha de pago en un pendiente es haberlo pagado (los pendientes del mes se crean sin fecha).
    if (digits.length === 4 && !pagadoTocado.current) setPagado(true)
  }

  /** Reparte `total` en partes iguales, conservando vencimientos y fechas de pago ya cargados. */
  function repartir(total: number, n: number, prev: PlanRow[]): PlanRow[] {
    if (n < 2) return []
    const montos = planDeCuotas({ plan: '', servicioId: '', desde: mes, total: Math.round(total * 100) / 100, cuotas: n, primera: { pagado: false } }).map((c) => c.monto)
    return montos.map((m, i) => ({
      monto: m > 0 ? fmt(m) : '',
      vence: prev[i]?.vence ?? '',
      // La primera cuota arranca con la fecha de pago que ya tenía el pago (si estaba pagado).
      fecha: prev[i]?.fecha ?? (i === 0 && pagado ? fecha : ''),
    }))
  }

  function elegirCuotas(n: number): void {
    setCuotas(n)
    setRows(repartir(parseAmount(monto) ?? 0, n, rows))
  }

  function handleMonto(v: string): void {
    setMonto(v)
    if (cuotas > 1) setRows(repartir(parseAmount(v) ?? 0, cuotas, rows))
  }

  /** Editar el importe de una cuota recalcula el total (el plan real no siempre tiene cuotas iguales). */
  function handleRowMonto(i: number, v: string): void {
    const next = rows.map((r, j) => (j === i ? { ...r, monto: v } : r))
    setRows(next)
    const total = next.reduce((t, r) => t + (parseAmount(r.monto) ?? 0), 0)
    setMonto(total > 0 ? String(Math.round(total * 100) / 100) : '')
  }

  function handleRowFecha(i: number, v: string): void {
    setRows(rows.map((r, j) => (j === i ? { ...r, fecha: ddmm(v) } : r)))
  }

  /** Vencimiento de la primera cuota: las demás que estén vacías toman el mismo día. */
  function handleRowVence(i: number, v: string): void {
    const d = ddmm(v)
    setRows(rows.map((r, j) => {
      if (j === i) return { ...r, vence: d }
      if (i === 0 && j > 0 && d.length === 5 && !r.vence) return { ...r, vence: `${d.slice(0, 2)}/${prevMes(mes, -j).slice(5)}` }
      return r
    }))
  }

  const montoNum = parseAmount(monto) ?? 0
  const rowsOk = rows.length === cuotas && rows.every((r) => (parseAmount(r.monto) ?? 0) > 0)
  const valid = Boolean(servicioId) && montoNum > 0 && (cuotas < 2 || rowsOk)
  // Un pago por servicio y mes: si ya existe uno para ese slot (aunque tenga un id viejo) se actualiza ese.
  // Las cuotas no ocupan el slot: conviven con la factura del mes.
  const slot = cuota || cuotas > 1 ? undefined : pagos.find((p) => p.servicioId === servicioId && p.mes === mes && p.id !== initial?.id && !p.cuota)
  const plan = cuotas > 1 && valid
    ? planDeCuotas({
        plan: planId.current, servicioId, desde: mes, total: Math.round(montoNum * 100) / 100, cuotas,
        primera: { ...(editing && initial?.id ? { id: initial.id } : {}), notas: notas.trim() || undefined, pagado: false },
      }).map((c, i) => ({
        ...c,
        monto: Math.round((parseAmount(rows[i]!.monto) ?? 0) * 100) / 100,
        // Cada cuota está pagada si tiene el día en que se pagó.
        fecha: rows[i]!.fecha || undefined,
        pagado: rows[i]!.fecha.length === 5,
        metodoPago: metodo || undefined,
        cuota: { ...c.cuota!, ...(rows[i]!.vence.length === 5 ? { vence: rows[i]!.vence } : {}) },
      }))
    : null

  function submit(e?: React.FormEvent): void {
    e?.preventDefault()
    if (!valid) return
    if (plan) { onSavePlan(plan, editing ? initial as PagoMensual : undefined); return }
    const id = initial?.id && !slot ? initial.id : slot?.id ?? pagoId(servicioId, mes)
    onSave({
      id, servicioId, mes, monto: Math.round(montoNum * 100) / 100,
      fecha: fecha || undefined, metodoPago: metodo || undefined, pagado, notas: notas.trim() || undefined,
      ...(cuota ? { cuota: { plan: cuota.plan, n: cuota.n, de: cuota.de, ...(vence.length === 5 ? { vence } : {}) } } : {}),
    })
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={cuota ? `Cuota ${cuota.n} de ${cuota.de}` : editing ? 'Editar pago' : 'Cargar pago'}
      subtitle={cuota ? 'Cuota de un plan de pago' : 'Gasto fijo de un servicio'}
      footer={
        <>
          {editing && onDelete && initial?.id && (
            <button type="button" className="ui-btn ui-btn-ghost text-error mr-auto" onClick={() => onDelete(initial as PagoMensual)}>
              Eliminar
            </button>
          )}
          <button type="button" className="ui-btn ui-btn-outline" onClick={onClose}>Cancelar</button>
          <button type="submit" form="gastos-pago-form" className="ui-btn ui-btn-primary" disabled={!valid}>Guardar</button>
        </>
      }
    >
      <form id="gastos-pago-form" onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Servicio">
          <select className="ui-input w-full" value={servicioId} onChange={(e) => setServicioId(e.target.value)} autoFocus={!editing}>
            {activos.length === 0 && <option value="">Primero creá un servicio</option>}
            {activos.map((s) => <option key={s.id} value={s.id}>{s.nombre}{s.categoria ? ` · ${s.categoria}` : ''}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mes">
            <input type="month" className="ui-input w-full" value={mes} onChange={(e) => setMes(e.target.value)} required />
          </Field>
          <Field label={cuotas > 1 ? 'Total del plan' : 'Monto'}>
            <input className="ui-input w-full text-right tabular-nums" inputMode="decimal" value={monto}
              onChange={(e) => handleMonto(e.target.value)} placeholder="0,00" autoFocus={editing} />
          </Field>
        </div>
        <div className={`grid gap-3 ${cuotas > 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {cuotas < 2 && (
            <Field label="Fecha de pago">
              <input className="ui-input w-full tabular-nums" value={fecha} onChange={(e) => handleFecha(e.target.value)} placeholder="DD/MM" maxLength={5} />
            </Field>
          )}
          <Field label="Método">
            <select className="ui-input w-full" value={metodo} onChange={(e) => setMetodo(e.target.value)}>
              {[...new Set([...METODOS_PAGO, metodo])].map((m) => <option key={m}>{m}</option>)}
            </select>
          </Field>
        </div>
        {cuota && (
          <Field label="Vencimiento de la cuota">
            <input className="ui-input w-full tabular-nums" value={vence} onChange={(e) => setVence(ddmm(e.target.value))} placeholder="DD/MM" maxLength={5} />
          </Field>
        )}
        <Field label="Notas">
          <input className="ui-input w-full" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional" />
        </Field>
        {cuotas < 2 && (
          <div className="flex items-center justify-between rounded-lg bg-on-surface/4 dark:bg-on-surface/6 px-3 py-2.5">
            <span className="t-body font-medium text-on-surface">{pagado ? 'Pagado' : 'Pendiente'}</span>
            <Toggle checked={pagado} onChange={(v) => { pagadoTocado.current = true; setPagado(v) }} label="Pagado" />
          </div>
        )}
        {!cuota && (
          <Field label="Plan de pago">
            <div className="flex items-center p-[3px] rounded-[9px] bg-on-surface/5 w-fit" role="radiogroup" aria-label="Plan de pago">
              {[1, 2, 3].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={cuotas === n} onClick={() => elegirCuotas(n)}
                  className={`h-[26px] px-3 rounded-[7px] text-[12px] font-medium transition-colors ${cuotas === n ? 'bg-surface text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}>
                  {n === 1 ? 'Sin plan' : `${n} cuotas`}
                </button>
              ))}
            </div>
          </Field>
        )}
        {cuotas > 1 && rows.length === cuotas && (
          <div className="rounded-lg bg-on-surface/4 dark:bg-on-surface/6 px-3 py-2.5 flex flex-col gap-1.5">
            <div className="grid grid-cols-[28px_32px_62px_62px_minmax(0,1fr)] gap-2 t-caption text-on-surface-variant">
              <span>Cuota</span><span>Mes</span><span>Vence</span><span>Pagó el</span><span className="text-right">Importe</span>
            </div>
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-[28px_32px_62px_62px_minmax(0,1fr)] gap-2 items-center t-footnote">
                <span className="text-on-surface-variant tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                <span className="text-on-surface">{mesShort(prevMes(mes, -i))}</span>
                <input className="ui-input h-7 px-2 w-full min-w-0 tabular-nums" value={r.vence} onChange={(e) => handleRowVence(i, e.target.value)}
                  placeholder="DD/MM" maxLength={5} aria-label={`Vencimiento cuota ${i + 1}`} />
                <input className={`ui-input h-7 px-2 w-full min-w-0 tabular-nums ${r.fecha.length === 5 ? 'text-success' : ''}`} value={r.fecha}
                  onChange={(e) => handleRowFecha(i, e.target.value)} placeholder="—" maxLength={5}
                  title={r.fecha.length === 5 ? 'Pagada' : 'A pagar: cargá el día en que la pagaste'} aria-label={`Fecha de pago cuota ${i + 1}`} />
                <input className="ui-input h-7 px-2 w-full min-w-0 text-right tabular-nums" inputMode="decimal" value={r.monto}
                  onChange={(e) => handleRowMonto(i, e.target.value)} placeholder="0,00" aria-label={`Importe cuota ${i + 1}`} />
              </div>
            ))}
            <p className="t-caption text-on-surface-variant mt-1">
              Copiá importes y vencimientos del plan; el total se recalcula ({montoNum > 0 ? `$ ${fmt(montoNum)}` : '—'}). Con el día en que la pagaste, la cuota queda pagada.
            </p>
          </div>
        )}
        {slot && (
          <p className="t-caption text-on-surface-variant">Ya hay un pago de este servicio en ese mes: se va a actualizar.</p>
        )}
      </form>
    </Sheet>
  )
}
