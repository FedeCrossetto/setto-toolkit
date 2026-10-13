import { useEffect, useState } from 'react'
import { Sheet } from '../../../core/components/Modal'
import { Field, Toggle } from '../../../core/components/Form'
import type { PagoMensual, Servicio } from '../types'
import { currentMes, lastKnownMonto, pagoId } from '../analytics'
import { hoyDDMM } from '../format'
import { parseAmount } from '../quick-add-parser'

export const METODOS_PAGO = ['MP', 'HB', 'Deb. aut', 'Suc. virtual', 'Efectivo', 'Otro']

export interface PagoSheetProps {
  open: boolean
  /** Pago a editar, o datos para prellenar uno nuevo */
  initial?: Partial<PagoMensual>
  servicios: Servicio[]
  pagos: PagoMensual[]
  onSave: (p: PagoMensual) => void
  onDelete?: (p: PagoMensual) => void
  onClose: () => void
}

export function PagoSheet({ open, initial, servicios, pagos, onSave, onDelete, onClose }: PagoSheetProps): JSX.Element {
  const editing = Boolean(initial?.id)
  const activos = servicios.filter((s) => s.activo || s.id === initial?.servicioId)
  const [servicioId, setServicioId] = useState('')
  const [mes, setMes] = useState(currentMes())
  const [monto, setMonto] = useState('')
  const [fecha, setFecha] = useState('')
  const [metodo, setMetodo] = useState('MP')
  const [pagado, setPagado] = useState(true)
  const [notas, setNotas] = useState('')

  useEffect(() => {
    if (!open) return
    const sid = initial?.servicioId ?? activos[0]?.id ?? ''
    const m = initial?.mes ?? currentMes()
    setServicioId(sid)
    setMes(m)
    const known = initial?.monto ?? (sid ? lastKnownMonto(pagos, sid, m) : 0)
    setMonto(known ? String(known) : '')
    setFecha(initial?.fecha ?? (editing ? '' : hoyDDMM()))
    setMetodo(initial?.metodoPago ?? 'MP')
    setPagado(initial?.pagado ?? true)
    setNotas(initial?.notas ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial])

  function handleFecha(v: string): void {
    const digits = v.replace(/\D/g, '').slice(0, 4)
    setFecha(digits.length <= 2 ? digits : `${digits.slice(0, 2)}/${digits.slice(2)}`)
  }

  const montoNum = parseAmount(monto) ?? 0
  const valid = Boolean(servicioId) && montoNum > 0
  // Un pago por servicio y mes: si ya existe uno para ese slot (aunque tenga un id viejo) se actualiza ese.
  const slot = pagos.find((p) => p.servicioId === servicioId && p.mes === mes && p.id !== initial?.id)

  function submit(e?: React.FormEvent): void {
    e?.preventDefault()
    if (!valid) return
    const id = initial?.id && !slot ? initial.id : slot?.id ?? pagoId(servicioId, mes)
    onSave({
      id, servicioId, mes, monto: Math.round(montoNum * 100) / 100,
      fecha: fecha || undefined, metodoPago: metodo || undefined, pagado, notas: notas.trim() || undefined,
    })
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? 'Editar pago' : 'Cargar pago'}
      subtitle="Gasto fijo de un servicio"
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
          <Field label="Monto">
            <input className="ui-input w-full text-right tabular-nums" inputMode="decimal" value={monto}
              onChange={(e) => setMonto(e.target.value)} placeholder="0,00" autoFocus={editing} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha de pago">
            <input className="ui-input w-full tabular-nums" value={fecha} onChange={(e) => handleFecha(e.target.value)} placeholder="DD/MM" maxLength={5} />
          </Field>
          <Field label="Método">
            <select className="ui-input w-full" value={metodo} onChange={(e) => setMetodo(e.target.value)}>
              {[...new Set([...METODOS_PAGO, metodo])].map((m) => <option key={m}>{m}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Notas">
          <input className="ui-input w-full" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional" />
        </Field>
        <div className="flex items-center justify-between rounded-lg bg-on-surface/[0.04] dark:bg-on-surface/[0.06] px-3 py-2.5">
          <span className="t-body font-medium text-on-surface">{pagado ? 'Pagado' : 'Pendiente'}</span>
          <Toggle checked={pagado} onChange={setPagado} label="Pagado" />
        </div>
        {slot && (
          <p className="t-caption text-on-surface-variant">Ya hay un pago de este servicio en ese mes: se va a actualizar.</p>
        )}
      </form>
    </Sheet>
  )
}
