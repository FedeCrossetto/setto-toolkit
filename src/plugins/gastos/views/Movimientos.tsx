import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Download, Search, Trash2 } from 'lucide-react'
import { SegmentedControl } from '../../../core/components/SegmentedControl'
import { buildMovimientos, type GastosData, type Movimiento } from '../analytics'
import { fechaCorta, fmt, mesLong } from '../format'
import { normalize } from '../../../core/search'
import { shouldAnimateList, tableRowMotion } from '../../../core/motion'
import { CATEGORIAS_VARIABLES, METODOS_VARIABLES, parseAmount } from '../quick-add-parser'
import type { Gasto, PagoMensual } from '../types'

type Rango = 'mes' | 'anio'
type Field = 'monto' | 'categoria' | 'metodoPago' | 'fecha'

function isTyping(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable
}

/** Celda editable en el lugar: clic edita, Enter guarda, Esc cancela (blur también guarda). */
function EditableCell({ display, initial, kind, options, onCommit, label, className }: {
  display: React.ReactNode
  initial: string
  kind: 'text' | 'date' | 'select'
  options?: string[]
  onCommit: (value: string) => void
  label: string
  className?: string
}): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(initial)
  const done = useRef(false)

  function start(e: React.MouseEvent | React.KeyboardEvent): void {
    e.stopPropagation()
    done.current = false
    setValue(initial)
    setEditing(true)
  }
  function commit(): void {
    if (done.current) return
    done.current = true
    setEditing(false)
    if (value !== initial) onCommit(value)
  }
  function cancel(): void {
    done.current = true
    setEditing(false)
  }
  const keys = (e: React.KeyboardEvent): void => {
    e.stopPropagation()
    if (e.key === 'Enter') { e.preventDefault(); commit() }
    if (e.key === 'Escape') { e.preventDefault(); cancel() }
  }

  if (!editing) {
    return (
      <button type="button" className={`text-inherit rounded-md px-1.5 -mx-1.5 py-0.5 hover:bg-on-surface/6 focus-visible:bg-on-surface/6 cursor-text ${className ?? ''}`}
        onClick={start} onKeyDown={(e) => { if (e.key === 'Enter') start(e) }} aria-label={`Editar ${label}`} title="Clic para editar">
        {display}
      </button>
    )
  }
  if (kind === 'select') {
    return (
      <select autoFocus className="ui-input py-0.5 h-7 w-full max-w-[180px]" value={value} aria-label={label}
        onClick={(e) => e.stopPropagation()} onChange={(e) => setValue(e.target.value)} onBlur={commit} onKeyDown={keys}>
        {[...new Set([value, ...(options ?? [])])].filter(Boolean).map((o) => <option key={o}>{o}</option>)}
      </select>
    )
  }
  return (
    <input autoFocus type={kind === 'date' ? 'date' : 'text'} inputMode={kind === 'text' ? 'decimal' : undefined}
      className={`ui-input py-0.5 h-7 ${kind === 'date' ? 'w-[140px]' : 'w-28 text-right tabular-nums'}`} value={value} aria-label={label}
      onFocus={(e) => { if (kind === 'text') e.currentTarget.select() }}
      onClick={(e) => e.stopPropagation()} onChange={(e) => setValue(e.target.value)} onBlur={commit} onKeyDown={keys} />
  )
}

export function Movimientos({ data, mes, onOpen, onDelete, onExport, onUpdateGasto, onUpdatePago, onNew }: {
  data: GastosData
  mes: string
  onOpen: (m: Movimiento) => void
  /** Borra sin confirmar (el padre ofrece Deshacer) */
  onDelete: (m: Movimiento) => void
  onExport: (movs: Movimiento[], label: string) => void
  onUpdateGasto: (g: Gasto) => void
  onUpdatePago: (p: PagoMensual) => void
  /** Tecla N */
  onNew: () => void
}): JSX.Element {
  const year = Number(mes.slice(0, 4))
  const [rango, setRango] = useState<Rango>('mes')
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [metodo, setMetodo] = useState('')
  const [tipo, setTipo] = useState<'' | 'variable' | 'fijo'>('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const all = useMemo(() => buildMovimientos(data, rango === 'mes' ? { mes } : { year }), [data, mes, year, rango])
  const categorias = useMemo(() => [...new Set(all.map((m) => m.categoria))].sort(), [all])
  const metodos = useMemo(() => [...new Set(all.map((m) => m.metodoPago).filter(Boolean))].sort(), [all])
  const catOptions = useMemo(() => [...new Set([...CATEGORIAS_VARIABLES, ...data.gastos.map((g) => g.categoria)])], [data.gastos])
  const metodoOptions = useMemo(() => [...new Set([...METODOS_VARIABLES, ...data.gastos.map((g) => g.metodoPago).filter(Boolean)])], [data.gastos])

  const list = useMemo(() => {
    const words = normalize(q).split(/\s+/).filter(Boolean)
    return all.filter((m) => {
      if (cat && m.categoria !== cat) return false
      if (metodo && m.metodoPago !== metodo) return false
      if (tipo && m.kind !== tipo) return false
      if (!words.length) return true
      const hay = normalize(`${m.descripcion} ${m.categoria} ${m.metodoPago} ${'notas' in m.ref ? m.ref.notas ?? '' : ''} ${fmt(m.monto)}`)
      return words.every((w) => hay.includes(w))
    })
  }, [all, q, cat, metodo, tipo])
  // Sólo fundido de entrada (un movimiento nuevo se nota sin mover la tabla).
  const rowMotion = tableRowMotion(shouldAnimateList(list.length))

  // Atajos: N nuevo · / buscar · ↑↓ mover · Enter abrir · Supr borrar
  const listRef = useRef(list)
  listRef.current = list
  const selRef = useRef(selectedId)
  selRef.current = selectedId
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const root = rootRef.current
      if (!root || root.offsetParent === null) return // pestaña oculta
      if (document.querySelector('[role="dialog"]')) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const typing = isTyping(document.activeElement)
      if (e.key === '/' && !typing) { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); return }
      if (typing) {
        if (e.key === 'Escape' && document.activeElement === searchRef.current) searchRef.current?.blur()
        return
      }
      const items = listRef.current
      const idx = items.findIndex((m) => m.id === selRef.current)
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); onNew(); return }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!items.length) return
        e.preventDefault()
        const next = e.key === 'ArrowDown' ? Math.min(items.length - 1, idx + 1) : Math.max(0, idx - 1)
        setSelectedId(items[next]!.id)
        root.querySelector(`[data-mov="${CSS.escape(items[next]!.id)}"]`)?.scrollIntoView({ block: 'nearest' })
        return
      }
      const sel = idx >= 0 ? items[idx]! : null
      if (!sel) return
      if (e.key === 'Enter') { e.preventDefault(); onOpen(sel); return }
      if (e.key === 'Delete') {
        e.preventDefault()
        const after = items[idx + 1] ?? items[idx - 1]
        setSelectedId(after?.id ?? null)
        onDelete(sel)
      }
      if (e.key === 'Escape') setSelectedId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onNew, onOpen, onDelete])

  const totalArs = list.filter((m) => m.moneda === 'ARS').reduce((s, m) => s + m.monto, 0)
  const totalUsd = list.filter((m) => m.moneda === 'USD').reduce((s, m) => s + m.monto, 0)
  const label = rango === 'mes' ? mesLong(mes) : String(year)

  function update(m: Movimiento, field: Field, raw: string): void {
    const now = new Date().toISOString()
    if (m.kind === 'variable') {
      const g = m.ref as Gasto
      if (field === 'monto') { const n = parseAmount(raw); if (n === null) return; onUpdateGasto({ ...g, monto: n, updated_at: now }) }
      if (field === 'categoria' && raw) onUpdateGasto({ ...g, categoria: raw, updated_at: now })
      if (field === 'metodoPago') onUpdateGasto({ ...g, metodoPago: raw, updated_at: now })
      if (field === 'fecha' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) onUpdateGasto({ ...g, fecha: raw, updated_at: now })
      return
    }
    const p = m.ref as PagoMensual
    if (field === 'monto') { const n = parseAmount(raw); if (n === null) return; onUpdatePago({ ...p, monto: n }) }
    if (field === 'metodoPago') onUpdatePago({ ...p, metodoPago: raw || undefined })
    if (field === 'fecha' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) onUpdatePago({ ...p, fecha: `${raw.slice(8, 10)}/${raw.slice(5, 7)}` })
  }

  return (
    <div ref={rootRef} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
          <input ref={searchRef} className="ui-input w-full h-8 pl-8" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar descripción, categoría, monto…  ( / )" aria-label="Buscar movimientos" />
        </div>
        <select className="ui-input w-auto h-8 py-0 t-footnote" value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} aria-label="Tipo">
          <option value="">Fijos y variables</option>
          <option value="variable">Sólo variables</option>
          <option value="fijo">Sólo fijos</option>
        </select>
        <select className="ui-input w-auto h-8 py-0 t-footnote" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoría">
          <option value="">Todas las categorías</option>
          {categorias.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className="ui-input w-auto h-8 py-0 t-footnote" value={metodo} onChange={(e) => setMetodo(e.target.value)} aria-label="Método de pago">
          <option value="">Todos los métodos</option>
          {metodos.map((m) => <option key={m}>{m}</option>)}
        </select>
        <SegmentedControl<Rango> value={rango} onChange={setRango}
          options={[{ value: 'mes', label: 'Mes' }, { value: 'anio', label: String(year) }]} />
        <button type="button" className="ui-btn ui-btn-outline ui-btn-icon h-8 w-8" onClick={() => onExport(list, label)} disabled={!list.length}
          title={`Exportar a CSV lo que se ve (${label})`} aria-label="Exportar CSV">
          <Download size={13} />
        </button>
      </div>

      <div className="ui-card">
        {list.length === 0 ? (
          <p className="t-footnote text-on-surface-variant px-4 py-10 text-center">
            {all.length ? 'Ningún movimiento coincide con los filtros.' : `Sin movimientos en ${label.toLowerCase()}. Usá el agregado rápido de arriba (o tocá N).`}
          </p>
        ) : (
          <table className="w-full t-body border-collapse">
            <thead>
              <tr className="text-on-surface-variant [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-surface [&>th]:shadow-[inset_0_-1px_0_var(--hairline)]">
                <th className="t-footnote font-medium text-left px-4 py-2.5 w-28 rounded-tl-xl">Fecha</th>
                <th className="t-footnote font-medium text-left px-2 py-2.5">Descripción</th>
                <th className="t-footnote font-medium text-left px-2 py-2.5">Categoría</th>
                <th className="t-footnote font-medium text-left px-2 py-2.5">Método</th>
                <th className="t-footnote font-medium text-right px-4 py-2.5">Monto</th>
                <th className="w-10 rounded-tr-xl" />
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
              {list.map((m) => {
                const sel = m.id === selectedId
                return (
                  <motion.tr {...rowMotion} key={m.id} data-mov={m.id} aria-selected={sel}
                    className={`group border-b border-(--hairline) last:border-0 transition-colors cursor-default ${sel ? 'bg-selected' : 'hover:bg-on-surface/3 dark:hover:bg-on-surface/5'}`}
                    onClick={() => setSelectedId(m.id)} onDoubleClick={() => onOpen(m)}>
                    <td className="px-4 py-2 tabular-nums text-on-surface-variant whitespace-nowrap">
                      <EditableCell kind="date" label="fecha" initial={m.fecha} display={fechaCorta(m.fecha)} onCommit={(v) => update(m, 'fecha', v)} />
                    </td>
                    <td className="px-2 py-2 text-on-surface font-medium">
                      <button type="button" className="truncate text-left hover:underline underline-offset-2" onClick={(e) => { e.stopPropagation(); onOpen(m) }} title="Abrir detalle">
                        {m.descripcion}
                      </button>
                      {m.kind === 'fijo' && <span className="ui-badge ml-2 font-medium">Fijo</span>}
                    </td>
                    <td className="px-2 py-2 text-on-surface-variant">
                      {m.kind === 'variable'
                        ? <EditableCell kind="select" label="categoría" options={catOptions} initial={m.categoria} display={m.categoria} onCommit={(v) => update(m, 'categoria', v)} />
                        : m.categoria}
                    </td>
                    <td className="px-2 py-2 text-on-surface-variant">
                      <EditableCell kind="select" label="método" options={['', ...metodoOptions]} initial={m.metodoPago} display={m.metodoPago || '—'} onCommit={(v) => update(m, 'metodoPago', v)} />
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-on-surface whitespace-nowrap">
                      <EditableCell kind="text" label="monto" initial={fmt(m.monto)} onCommit={(v) => update(m, 'monto', v)}
                        display={<>{m.moneda === 'USD' ? 'US$' : '$'} {fmt(m.monto)}</>} />
                    </td>
                    <td className="pr-2 text-right">
                      <button type="button" aria-label="Eliminar movimiento" title="Eliminar (Supr)"
                        className="ui-btn ui-btn-ghost ui-btn-icon opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-error"
                        onClick={(e) => { e.stopPropagation(); onDelete(m) }}>
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </motion.tr>
                )
              })}
              </AnimatePresence>
            </tbody>
            <tfoot>
              <tr className="hairline-t">
                <td colSpan={4} className="px-4 py-2.5 t-footnote text-on-surface-variant">
                  {list.length} movimientos <span className="opacity-70">· clic en fecha, categoría, método o monto para editar · N nuevo · / buscar · Supr borra</span>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-on-surface whitespace-nowrap">
                  $ {fmt(totalArs)}
                  {totalUsd > 0 && <div className="t-caption font-normal text-on-surface-variant">US$ {fmt(totalUsd)}</div>}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}
