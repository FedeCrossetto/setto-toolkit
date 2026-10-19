import { useEffect, useState } from 'react'
import { Sheet } from '../../../core/components/Modal'
import { Field } from '../../../core/components/Form'
import { SegmentedControl } from '../../../core/components/SegmentedControl'
import type { Frecuencia, Gasto, Moneda } from '../types'
import { randomId } from '../format'
import { CATEGORIAS_VARIABLES, METODOS_VARIABLES, isoDate, parseAmount } from '../quick-add-parser'
import { readLastMethod, writeLastMethod } from '../local-store'
import { ruleIdOf } from '../recurrence'

export function GastoSheet({ open, initial, categoriasUsadas, onSave, onDelete, onClose }: {
  open: boolean
  /** Gasto a editar (con id) o prellenado (sin id) */
  initial?: Partial<Gasto>
  categoriasUsadas: string[]
  /** `repite` ≠ null: además crear un gasto recurrente desde este */
  onSave: (g: Gasto, repite: Frecuencia | null) => void
  onDelete?: (g: Gasto) => void
  onClose: () => void
}): JSX.Element {
  const editing = Boolean(initial?.id)
  const [fecha, setFecha] = useState(isoDate(new Date()))
  const [monto, setMonto] = useState('')
  const [moneda, setMoneda] = useState<Moneda>('ARS')
  const [descripcion, setDescripcion] = useState('')
  const [categoria, setCategoria] = useState('Otro')
  const [catCustom, setCatCustom] = useState('')
  const [metodo, setMetodo] = useState('Efectivo')
  const [notas, setNotas] = useState('')
  const [repite, setRepite] = useState<Frecuencia | ''>('')
  const fromRule = Boolean(initial?.id && ruleIdOf(initial.id))

  useEffect(() => {
    if (!open) return
    setFecha(initial?.fecha ?? isoDate(new Date()))
    setMonto(initial?.monto ? String(initial.monto).replace('.', ',') : '')
    setMoneda(initial?.moneda ?? 'ARS')
    setDescripcion(initial?.descripcion ?? '')
    setCategoria(initial?.categoria ?? 'Otro')
    setCatCustom('')
    setMetodo(initial?.metodoPago ?? readLastMethod() ?? 'Efectivo')
    setNotas(initial?.notas ?? '')
    setRepite('')
  }, [open, initial])

  const cats = Array.from(new Set([...CATEGORIAS_VARIABLES, ...categoriasUsadas.filter(Boolean), categoria].filter((c) => c !== '__new__')))
  const montoNum = parseAmount(monto) ?? 0
  const valid = montoNum > 0 && /^\d{4}-\d{2}-\d{2}$/.test(fecha)

  function submit(e?: React.FormEvent): void {
    e?.preventDefault()
    if (!valid) return
    const now = new Date().toISOString()
    const cat = categoria === '__new__' ? catCustom.trim() || 'Otro' : categoria
    writeLastMethod(metodo)
    onSave({
      id: initial?.id ?? randomId(),
      fecha, monto: montoNum, moneda,
      descripcion: descripcion.trim() || cat,
      categoria: cat, metodoPago: metodo, notas: notas.trim() || undefined,
      created_at: initial?.created_at ?? now, updated_at: now,
    }, fromRule ? null : repite || null)
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? 'Editar gasto' : 'Nuevo gasto'}
      subtitle="Gasto variable (super, nafta, salidas…)"
      footer={
        <>
          {editing && onDelete && (
            <button type="button" className="ui-btn ui-btn-ghost text-error mr-auto" onClick={() => onDelete(initial as Gasto)}>Eliminar</button>
          )}
          <button type="button" className="ui-btn ui-btn-outline" onClick={onClose}>Cancelar</button>
          <button type="submit" form="gastos-gasto-form" className="ui-btn ui-btn-primary" disabled={!valid}>Guardar</button>
        </>
      }
    >
      <form id="gastos-gasto-form" onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <Field label="Monto">
            <input className="ui-input w-full text-right tabular-nums" inputMode="decimal" value={monto}
              onChange={(e) => setMonto(e.target.value)} placeholder="0,00" autoFocus />
          </Field>
          <SegmentedControl<Moneda>
            className="mb-[3px]"
            value={moneda}
            onChange={setMoneda}
            options={[{ value: 'ARS', label: 'ARS' }, { value: 'USD', label: 'USD' }]}
          />
        </div>
        <Field label="Descripción">
          <input className="ui-input w-full" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Super del finde" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha">
            <input type="date" className="ui-input w-full tabular-nums" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
          <Field label="Método">
            <select className="ui-input w-full" value={metodo} onChange={(e) => setMetodo(e.target.value)}>
              {[...new Set<string>([...METODOS_VARIABLES, metodo])].map((m) => <option key={m}>{m}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Categoría">
          <select className="ui-input w-full" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            {cats.map((c) => <option key={c} value={c}>{c}</option>)}
            <option value="__new__">Nueva categoría…</option>
          </select>
        </Field>
        {categoria === '__new__' && (
          <input className="ui-input w-full" value={catCustom} onChange={(e) => setCatCustom(e.target.value)} placeholder="Nombre de la categoría" autoFocus />
        )}
        <Field label="Notas">
          <input className="ui-input w-full" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional" />
        </Field>
        {fromRule ? (
          <p className="t-footnote text-on-surface-variant">Se cargó solo (gasto recurrente). Para cambiar los próximos, editalo en Recurrentes.</p>
        ) : (
          <Field label="Se repite" hint={repite ? 'Se carga solo en cada fecha a partir de la próxima.' : undefined}>
            <select className="ui-input w-full" value={repite} onChange={(e) => setRepite(e.target.value as Frecuencia | '')}>
              <option value="">No</option>
              <option value="mensual">Todos los meses (mismo día)</option>
              <option value="semanal">Todas las semanas (mismo día)</option>
              <option value="anual">Todos los años (misma fecha)</option>
            </select>
          </Field>
        )}
      </form>
    </Sheet>
  )
}
