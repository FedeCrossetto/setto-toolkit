import { useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Sheet } from '../../../core/components/Modal'
import { Field } from '../../../core/components/Form'
import { fmt, fmtMoney } from '../format'
import { parseAmount } from '../quick-add-parser'

function text(n: number | undefined | null): string {
  return n ? fmt(n) : ''
}

/** Presupuesto mensual: total opcional + un monto por categoría (vacío = sin tope). */
export function PresupuestosSheet({ open, total, budgets, categorias, gastadoPorCategoria, onSave, onClose }: {
  open: boolean
  total: number | null
  budgets: Record<string, number>
  categorias: string[]
  /** Gastado este mes por categoría (minúsculas → monto), como referencia */
  gastadoPorCategoria: Map<string, number>
  onSave: (total: number | null, budgets: Record<string, number>) => void
  onClose: () => void
}): JSX.Element {
  const [totalDraft, setTotalDraft] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [extra, setExtra] = useState<string[]>([])
  const [nueva, setNueva] = useState('')

  useEffect(() => {
    if (!open) return
    setTotalDraft(text(total))
    setDrafts(Object.fromEntries(Object.entries(budgets).map(([k, v]) => [k, text(v)])))
    setExtra([])
    setNueva('')
  }, [open, total, budgets])

  const cats = useMemo(() => [...new Set([...categorias, ...extra])], [categorias, extra])
  const parsed = useMemo(() => {
    const out: Record<string, number> = {}
    for (const c of cats) {
      const v = drafts[c]?.trim() ? parseAmount(drafts[c]!) : null
      if (v && v > 0) out[c] = v
    }
    return out
  }, [cats, drafts])
  const suma = Object.values(parsed).reduce((a, b) => a + b, 0)
  const totalNum = totalDraft.trim() ? parseAmount(totalDraft) : null

  function addCategoria(): void {
    const n = nueva.trim()
    if (!n) return
    if (!cats.some((c) => c.toLowerCase() === n.toLowerCase())) setExtra((e) => [...e, n])
    setNueva('')
  }

  function submit(e?: React.FormEvent): void {
    e?.preventDefault()
    onSave(totalNum && totalNum > 0 ? totalNum : null, parsed)
  }

  return (
    <Sheet open={open} onClose={onClose} title="Presupuestos" width={440}
      subtitle="Tope mensual por categoría (fijos + variables en pesos). Avisamos al 80 % y al pasarte."
      footer={
        <>
          <button type="button" className="ui-btn ui-btn-outline" onClick={onClose}>Cancelar</button>
          <button type="submit" form="gastos-presupuestos-form" className="ui-btn ui-btn-primary">Guardar</button>
        </>
      }>
      <form id="gastos-presupuestos-form" onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Total del mes (opcional)" hint={suma > 0 ? `Suma de categorías: ${fmtMoney(suma)}` : 'Tope general, aparte de las categorías.'}>
          <input className="ui-input w-full text-right tabular-nums" inputMode="decimal" value={totalDraft}
            onChange={(e) => setTotalDraft(e.target.value)} placeholder={suma > 0 ? fmt(suma) : '800.000'} />
        </Field>
        <div className="flex flex-col">
          <div className="fl-section">Por categoría</div>
          <ul className="flex flex-col divide-y divide-(--hairline)">
            {cats.map((c) => {
              const gastado = gastadoPorCategoria.get(c.toLowerCase()) ?? 0
              return (
                <li key={c} className="flex items-center gap-3 py-1.5">
                  <span className="flex-1 min-w-0">
                    <span className="block t-body text-on-surface truncate">{c}</span>
                    {gastado > 0 && <span className="block t-caption text-on-surface-variant tabular-nums">Este mes {fmtMoney(gastado)}</span>}
                  </span>
                  <span className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 t-footnote text-on-surface-variant pointer-events-none">$</span>
                    <input className="ui-input w-36 pl-5 text-right tabular-nums" inputMode="decimal" value={drafts[c] ?? ''}
                      aria-label={`Presupuesto de ${c}`} placeholder="Sin tope"
                      onChange={(e) => setDrafts((d) => ({ ...d, [c]: e.target.value }))}
                      onFocus={(e) => e.currentTarget.select()} />
                  </span>
                </li>
              )
            })}
          </ul>
          <div className="flex items-center gap-2 pt-2">
            <input className="ui-input flex-1" value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder="Otra categoría"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategoria() } }} />
            <button type="button" className="ui-btn ui-btn-outline ui-btn-sm" disabled={!nueva.trim()} onClick={addCategoria}><Plus size={13} /> Agregar</button>
          </div>
        </div>
      </form>
    </Sheet>
  )
}
