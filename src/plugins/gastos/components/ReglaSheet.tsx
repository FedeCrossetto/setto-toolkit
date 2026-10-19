import { useEffect, useState } from 'react'
import { Sheet } from '../../../core/components/Modal'
import { Field } from '../../../core/components/Form'
import { SegmentedControl } from '../../../core/components/SegmentedControl'
import type { Frecuencia, Moneda, ReglaRecurrente } from '../types'
import { randomId } from '../format'
import { CATEGORIAS_VARIABLES, METODOS_VARIABLES, isoDate, parseAmount } from '../quick-add-parser'
import { describeRegla } from '../recurrence'

const FRECUENCIAS: { value: Frecuencia; label: string }[] = [
  { value: 'mensual', label: 'Mensual' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'anual', label: 'Anual' },
]
const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

/** Alta / edición de un gasto recurrente. Una regla nueva arranca hoy (no genera hacia atrás). */
export function ReglaSheet({ open, initial, categoriasUsadas, onSave, onDelete, onClose }: {
  open: boolean
  initial?: ReglaRecurrente
  categoriasUsadas: string[]
  onSave: (r: ReglaRecurrente) => void
  onDelete?: (r: ReglaRecurrente) => void
  onClose: () => void
}): JSX.Element {
  const today = new Date()
  const [descripcion, setDescripcion] = useState('')
  const [monto, setMonto] = useState('')
  const [moneda, setMoneda] = useState<Moneda>('ARS')
  const [categoria, setCategoria] = useState('Otro')
  const [metodo, setMetodo] = useState('Crédito')
  const [frecuencia, setFrecuencia] = useState<Frecuencia>('mensual')
  const [dia, setDia] = useState(today.getDate())
  const [mesAnual, setMesAnual] = useState(today.getMonth() + 1)

  useEffect(() => {
    if (!open) return
    const d = new Date()
    setDescripcion(initial?.descripcion ?? '')
    setMonto(initial?.monto ? String(initial.monto).replace('.', ',') : '')
    setMoneda(initial?.moneda ?? 'ARS')
    setCategoria(initial?.categoria ?? 'Otro')
    setMetodo(initial?.metodoPago ?? 'Crédito')
    setFrecuencia(initial?.frecuencia ?? 'mensual')
    setDia(initial?.dia ?? d.getDate())
    setMesAnual(initial?.mesAnual ?? d.getMonth() + 1)
  }, [open, initial])

  function changeFrecuencia(f: Frecuencia): void {
    setFrecuencia(f)
    setDia(f === 'semanal' ? new Date().getDay() : Math.max(1, Math.min(31, dia || new Date().getDate())))
  }

  const montoNum = parseAmount(monto) ?? 0
  const valid = montoNum > 0 && descripcion.trim().length > 0
  const cats = [...new Set([...CATEGORIAS_VARIABLES, ...categoriasUsadas.filter(Boolean), categoria])]

  function submit(e?: React.FormEvent): void {
    e?.preventDefault()
    if (!valid) return
    const hoy = isoDate(new Date())
    onSave({
      id: initial?.id ?? randomId(),
      descripcion: descripcion.trim(), monto: montoNum, moneda, categoria, metodoPago: metodo,
      frecuencia, dia, mesAnual: frecuencia === 'anual' ? mesAnual : undefined,
      desde: initial?.desde ?? hoy,
      // Nueva: lo de hoy hacia atrás no se carga solo (si hoy toca, se carga mañana en adelante).
      hasta: initial ? initial.hasta ?? null : hoy,
      pausada: initial?.pausada ?? false,
      created_at: initial?.created_at ?? new Date().toISOString(),
    })
  }

  return (
    <Sheet open={open} onClose={onClose}
      title={initial ? 'Editar gasto recurrente' : 'Nuevo gasto recurrente'}
      subtitle="Se carga solo en cada fecha (Netflix, gimnasio, alquiler…)"
      footer={
        <>
          {initial && onDelete && (
            <button type="button" className="ui-btn ui-btn-ghost text-error mr-auto" onClick={() => onDelete(initial)}>Eliminar</button>
          )}
          <button type="button" className="ui-btn ui-btn-outline" onClick={onClose}>Cancelar</button>
          <button type="submit" form="gastos-regla-form" className="ui-btn ui-btn-primary" disabled={!valid}>Guardar</button>
        </>
      }>
      <form id="gastos-regla-form" onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Descripción">
          <input className="ui-input w-full" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Netflix" autoFocus />
        </Field>
        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <Field label="Monto">
            <input className="ui-input w-full text-right tabular-nums" inputMode="decimal" value={monto}
              onChange={(e) => setMonto(e.target.value)} placeholder="0,00" />
          </Field>
          <SegmentedControl<Moneda> className="mb-[3px]" value={moneda} onChange={setMoneda}
            options={[{ value: 'ARS', label: 'ARS' }, { value: 'USD', label: 'USD' }]} />
        </div>
        <Field label="Se repite">
          <SegmentedControl<Frecuencia> value={frecuencia} onChange={changeFrecuencia} options={FRECUENCIAS} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          {frecuencia === 'semanal' ? (
            <Field label="Día">
              <select className="ui-input w-full" value={dia} onChange={(e) => setDia(Number(e.target.value))}>
                {DIAS_SEMANA.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            </Field>
          ) : (
            <Field label="Día del mes">
              <select className="ui-input w-full" value={dia} onChange={(e) => setDia(Number(e.target.value))}>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </Field>
          )}
          {frecuencia === 'anual' && (
            <Field label="Mes">
              <select className="ui-input w-full" value={mesAnual} onChange={(e) => setMesAnual(Number(e.target.value))}>
                {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </Field>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Categoría">
            <select className="ui-input w-full" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              {cats.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Método">
            <select className="ui-input w-full" value={metodo} onChange={(e) => setMetodo(e.target.value)}>
              {[...new Set<string>([...METODOS_VARIABLES, metodo])].map((m) => <option key={m}>{m}</option>)}
            </select>
          </Field>
        </div>
        <p className="t-footnote text-on-surface-variant">{describeRegla({ frecuencia, dia, mesAnual })}. Si un mes no tiene ese día, se carga el último.</p>
      </form>
    </Sheet>
  )
}
