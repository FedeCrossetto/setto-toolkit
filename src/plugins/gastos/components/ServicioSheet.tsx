import { useEffect, useState } from 'react'
import { Sheet } from '../../../core/components/Modal'
import { Field, Toggle } from '../../../core/components/Form'
import type { Servicio } from '../types'
import { randomId } from '../format'
import { ICON_OPTIONS, ServiceIcon } from './ServiceIcon'

const DEFAULT_CATS = ['Casa', 'Depto', 'Streaming', 'Impuesto', 'Otro']

export function ServicioSheet({ open, initial, categorias, diaVencimiento, onSave, onDelete, onClose }: {
  open: boolean
  initial?: Servicio
  categorias: string[]
  /** Día de vencimiento guardado para `initial` (preferencia local). */
  diaVencimiento?: number
  /** `dia` = día de vencimiento (1..31) o null si no se cargó. */
  onSave: (s: Servicio, dia: number | null) => void
  onDelete?: (s: Servicio) => void
  onClose: () => void
}): JSX.Element {
  const [nombre, setNombre] = useState('')
  const [icon, setIcon] = useState(ICON_OPTIONS[0]!)
  const [cuenta, setCuenta] = useState('')
  const [categoria, setCategoria] = useState('')
  const [catCustom, setCatCustom] = useState('')
  const [activo, setActivo] = useState(true)
  const [dia, setDia] = useState('')

  useEffect(() => {
    if (!open) return
    setNombre(initial?.nombre ?? '')
    setIcon(initial?.emoji || ICON_OPTIONS[0]!)
    setCuenta(initial?.numeroCuenta ?? '')
    setCategoria(initial?.categoria ?? '')
    setCatCustom('')
    setActivo(initial?.activo ?? true)
    setDia(diaVencimiento ? String(diaVencimiento) : '')
  }, [open, initial, diaVencimiento])

  const allCats = Array.from(new Set([...categorias.filter(Boolean), ...DEFAULT_CATS]))

  function submit(e?: React.FormEvent): void {
    e?.preventDefault()
    if (!nombre.trim()) return
    const cat = categoria === '__new__' ? catCustom.trim() : categoria
    const d = Number(dia)
    onSave({
      id: initial?.id ?? randomId(), nombre: nombre.trim(), emoji: icon, numeroCuenta: cuenta.trim() || undefined,
      categoria: cat || 'Otro', activo, orden: initial?.orden ?? 999,
    }, Number.isInteger(d) && d >= 1 && d <= 31 ? d : null)
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={initial ? 'Editar servicio' : 'Nuevo servicio'}
      subtitle="Gasto fijo que se paga todos los meses"
      footer={
        <>
          {initial && onDelete && (
            <button type="button" className="ui-btn ui-btn-ghost text-error mr-auto" onClick={() => onDelete(initial)}>Eliminar</button>
          )}
          <button type="button" className="ui-btn ui-btn-outline" onClick={onClose}>Cancelar</button>
          <button type="submit" form="gastos-servicio-form" className="ui-btn ui-btn-primary" disabled={!nombre.trim()}>Guardar</button>
        </>
      }
    >
      <form id="gastos-servicio-form" onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Nombre">
          <input className="ui-input w-full" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Edesur" autoFocus />
        </Field>
        <Field label="Ícono">
          <div className="grid grid-cols-7 gap-1 p-1.5 rounded-lg bg-on-surface/4 dark:bg-on-surface/6">
            {ICON_OPTIONS.map((key) => (
              <button key={key} type="button" onClick={() => setIcon(key)} aria-label={`Ícono ${key}`} aria-pressed={icon === key}
                className={`flex items-center justify-center h-8 rounded-md transition-colors ${
                  icon === key ? 'bg-surface text-primary shadow-sm' : 'text-on-surface-variant hover:bg-on-surface/6 hover:text-on-surface'
                }`}>
                <ServiceIcon icon={key} size={15} />
              </button>
            ))}
          </div>
        </Field>
        <Field label="Nro. de cuenta / referencia">
          <input className="ui-input w-full tabular-nums" value={cuenta} onChange={(e) => setCuenta(e.target.value)} placeholder="0001625984" />
        </Field>
        <Field label="Categoría">
          <select className="ui-input w-full" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Elegí una categoría</option>
            {allCats.map((c) => <option key={c} value={c}>{c}</option>)}
            <option value="__new__">Nueva categoría…</option>
          </select>
        </Field>
        {categoria === '__new__' && (
          <input className="ui-input w-full" value={catCustom} onChange={(e) => setCatCustom(e.target.value)} placeholder="Nombre de la categoría" autoFocus />
        )}
        <Field label="Vence el día (opcional)" hint="Te avisamos el día anterior y el mismo día si no está pagado.">
          <input className="ui-input w-24 tabular-nums" type="number" min={1} max={31} value={dia}
            onChange={(e) => setDia(e.target.value)} placeholder="15" />
        </Field>
        <div className="flex items-center justify-between rounded-lg bg-on-surface/4 dark:bg-on-surface/6 px-3 py-2.5">
          <span className="t-body font-medium text-on-surface">{activo ? 'Activo' : 'Inactivo'}</span>
          <Toggle checked={activo} onChange={setActivo} label="Servicio activo" />
        </div>
      </form>
    </Sheet>
  )
}
