import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { CornerDownLeft, SlidersHorizontal, Sparkles, Zap } from 'lucide-react'
import { Modal } from '../../../core/components/Modal'
import type { Gasto } from '../types'
import { parseQuickAdd, isoDate, type QuickAddResult } from '../quick-add-parser'
import { fechaCorta, fmt, randomId } from '../format'
import { readLastMethod, writeLastMethod } from '../local-store'
import { applyLearning, suggestDescriptions, topFavorites, type LearnedEntry, type Learning } from '../learning'

export interface QuickAddHandle {
  focus: (text?: string) => void
}

type Parsed = QuickAddResult & { learned: boolean }

function amountText(n: number): string {
  return String(n).replace('.', ',')
}

function money(moneda: Gasto['moneda'], n: number): string {
  return `${moneda === 'USD' ? 'US$' : '$'} ${fmt(n)}`
}

function toGasto(p: Parsed, metodo: string): Gasto {
  const now = new Date().toISOString()
  return {
    id: randomId(), fecha: p.fecha, monto: p.monto ?? 0, moneda: p.moneda,
    descripcion: p.descripcion || p.categoria, categoria: p.categoria, metodoPago: metodo,
    created_at: now, updated_at: now,
  }
}

function parseWith(text: string, learning: Learning): Parsed {
  return applyLearning(parseQuickAdd(text), learning)
}

/** Reemplaza las palabras de descripción del texto por la sugerencia (el parser no depende del orden). */
function acceptSuggestion(text: string, parsed: Parsed, s: LearnedEntry): string {
  const descTokens = parsed.descripcion ? parsed.descripcion.split(/\s+/) : []
  const rest = text.trim().split(/\s+/).filter(Boolean)
  for (const d of descTokens) {
    const i = rest.indexOf(d)
    if (i >= 0) rest.splice(i, 1)
  }
  if (parsed.monto === null && s.montoTipico > 0) rest.unshift(amountText(s.montoTipico))
  return `${[...rest, s.descripcion].join(' ')} `
}

/**
 * Línea de agregado rápido: "1500 super efectivo" + Enter.
 * Aprende del historial (categoría/método/moneda por descripción), autocompleta descripciones,
 * muestra lo interpretado como chips, acepta varias líneas pegadas y ofrece "rápidos".
 */
export const QuickAdd = forwardRef<QuickAddHandle, {
  learning: Learning
  onSave: (g: Gasto) => void
  onSaveMany: (gs: Gasto[]) => void
  /** Abre el formulario completo con lo que se interpretó */
  onMore: (draft: Partial<Gasto>) => void
}>(function QuickAdd({ learning, onSave, onSaveMany, onMore }, ref) {
  const [text, setText] = useState('')
  const [active, setActive] = useState(-1)
  const [suggestOpen, setSuggestOpen] = useState(true)
  const [batch, setBatch] = useState<Array<{ line: string; parsed: Parsed; checked: boolean }> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const today = isoDate(new Date())

  useImperativeHandle(ref, () => ({
    focus: (prefill?: string) => {
      if (prefill !== undefined) setText(prefill)
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        const len = inputRef.current?.value.length ?? 0
        inputRef.current?.setSelectionRange(len, len)
      })
    },
  }), [])

  const parsed = useMemo(() => (text.trim() ? parseWith(text, learning) : null), [text, learning])
  const metodo = parsed?.metodoPago ?? readLastMethod() ?? 'Efectivo'
  const suggestions = useMemo(
    () => (parsed && suggestOpen && !/\s$/.test(text) ? suggestDescriptions(learning, parsed.descripcion, today, 6) : []),
    [parsed, suggestOpen, text, learning, today],
  )
  const favorites = useMemo(() => topFavorites(learning, today, 6), [learning, today])

  function draft(): Partial<Gasto> {
    if (!parsed) return {}
    return {
      monto: parsed.monto ?? undefined, descripcion: parsed.descripcion, categoria: parsed.categoria,
      metodoPago: metodo, moneda: parsed.moneda, fecha: parsed.fecha,
    }
  }

  function save(): void {
    if (!parsed || parsed.monto === null) return
    writeLastMethod(metodo)
    onSave(toGasto(parsed, metodo))
    setText('')
    setActive(-1)
    setSuggestOpen(true)
    inputRef.current?.focus()
  }

  function accept(s: LearnedEntry): void {
    if (!parsed) return
    setText(acceptSuggestion(text, parsed, s))
    setActive(-1)
    inputRef.current?.focus()
  }

  function favorite(e: LearnedEntry, direct: boolean): void {
    const line = `${amountText(e.montoTipico)} ${e.descripcion}`
    if (direct) {
      const p = parseWith(line, learning)
      const m = e.metodoPago || p.metodoPago || readLastMethod() || 'Efectivo'
      onSave(toGasto({ ...p, descripcion: e.descripcion, categoria: e.categoria, moneda: e.moneda }, m))
      return
    }
    setText(line)
    setSuggestOpen(false)
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      // Selecciona el monto para pisarlo directamente.
      el.setSelectionRange(0, amountText(e.montoTipico).length)
    })
  }

  function onPaste(e: React.ClipboardEvent<HTMLInputElement>): void {
    const raw = e.clipboardData.getData('text')
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    if (lines.length < 2) return
    e.preventDefault()
    setBatch(lines.slice(0, 200).map((line) => {
      const p = parseWith(line, learning)
      return { line, parsed: p, checked: p.monto !== null }
    }))
  }

  function saveBatch(): void {
    if (!batch) return
    const gs = batch.filter((b) => b.checked && b.parsed.monto !== null)
      .map((b) => toGasto(b.parsed, b.parsed.metodoPago ?? readLastMethod() ?? 'Efectivo'))
    setBatch(null)
    if (gs.length) onSaveMany(gs)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const batchCount = batch?.filter((b) => b.checked && b.parsed.monto !== null).length ?? 0

  return (
    <div className="ui-card p-2">
      <div className="relative">
        <div className="flex items-center gap-2 rounded-lg bg-on-surface/4 dark:bg-on-surface/6 focus-within:bg-surface focus-within:ring-2 focus-within:ring-primary/25 transition-colors pl-3 pr-1.5 py-1">
          <Zap size={14} className="text-primary shrink-0" aria-hidden />
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => { setText(e.target.value); setActive(-1); setSuggestOpen(true) }}
            onPaste={onPaste}
            onBlur={() => setActive(-1)}
            onKeyDown={(e) => {
              if (suggestions.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                e.preventDefault()
                const n = suggestions.length
                setActive((i) => (e.key === 'ArrowDown' ? (i + 1) % n : (i <= 0 ? n - 1 : i - 1)))
                return
              }
              if (e.key === 'Tab' && suggestions.length && !e.shiftKey) {
                e.preventDefault()
                accept(suggestions[Math.max(active, 0)]!)
                return
              }
              if (e.key === 'Enter') {
                e.preventDefault()
                if (active >= 0 && suggestions[active]) accept(suggestions[active]!)
                else save()
                return
              }
              if (e.key === 'Escape') {
                e.stopPropagation()
                if (suggestions.length) { setSuggestOpen(false); setActive(-1) } else setText('')
              }
            }}
            placeholder="Agregá un gasto rápido: 1500 super efectivo · ayer 800 café · pegá varias líneas"
            aria-label="Agregar gasto rápido"
            role="combobox"
            aria-expanded={suggestions.length > 0}
            aria-autocomplete="list"
            aria-controls="gastos-quick-suggest"
            aria-activedescendant={active >= 0 ? `gastos-quick-suggest-${active}` : undefined}
            className="flex-1 min-w-0 bg-transparent outline-hidden t-callout text-on-surface placeholder:text-on-surface-variant/60 py-1.5"
          />
          <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon" onClick={() => { onMore(draft()); setText('') }}
            aria-label="Abrir formulario completo" title="Más detalles">
            <SlidersHorizontal size={14} />
          </button>
          <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" disabled={!parsed || parsed.monto === null} onClick={save}>
            <CornerDownLeft size={12} /> Guardar
          </button>
        </div>

        {suggestions.length > 0 && (
          <ul id="gastos-quick-suggest" role="listbox" className="ui-menu mac-pop-in absolute left-0 top-full mt-1 z-40 w-full max-w-md">
            {suggestions.map((s, i) => (
              <li key={s.key} id={`gastos-quick-suggest-${i}`} role="option" aria-selected={i === active}>
                <button type="button" tabIndex={-1}
                  className={`ui-menu-item w-full text-left ${i === active ? 'bg-selected' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); accept(s) }}>
                  <span className="flex-1 min-w-0 truncate text-on-surface">{s.descripcion}</span>
                  <span className="t-caption text-on-surface-variant">{s.categoria}</span>
                  <span className="t-caption text-on-surface-variant tabular-nums">{money(s.moneda, s.montoTipico)}</span>
                </button>
              </li>
            ))}
            <li className="t-caption text-on-surface-variant px-3 pt-1 pb-1.5" aria-hidden>Tab completa · ↑↓ elegir · Esc cierra</li>
          </ul>
        )}
      </div>

      {parsed ? (
        <div className="flex flex-wrap items-center gap-1.5 px-1 pt-2 pb-0.5" aria-live="polite">
          {parsed.monto !== null
            ? <span className="ui-badge ui-badge-primary tabular-nums">{money(parsed.moneda, parsed.monto)}</span>
            : <span className="ui-badge ui-badge-warning">Falta el monto</span>}
          {parsed.descripcion && <span className="ui-badge">{parsed.descripcion}</span>}
          <span className="ui-badge">{parsed.categoria}</span>
          <span className="ui-badge">{metodo}{parsed.metodoPago ? '' : ' (último usado)'}</span>
          <span className="ui-badge">{parsed.fecha === today ? 'Hoy' : fechaCorta(parsed.fecha)}</span>
          {parsed.learned && (
            <span className="t-caption text-on-surface-variant inline-flex items-center gap-1" title="Categoría, método y moneda según lo que cargaste antes con esta descripción">
              <Sparkles size={11} /> según tu historial
            </span>
          )}
          <span className="t-caption text-on-surface-variant ml-auto">Enter guarda · Esc borra</span>
        </div>
      ) : favorites.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-1 pt-2 pb-0.5">
          <span className="t-caption text-on-surface-variant mr-0.5">Rápidos</span>
          {favorites.map((f) => (
            <button key={f.key} type="button"
              className="ui-badge hover:bg-selected hover:text-primary transition-colors cursor-pointer"
              title={`Clic: prellenar · Alt+clic: guardar ${money(f.moneda, f.montoTipico)} con fecha de hoy`}
              onClick={(e) => favorite(f, e.altKey)}>
              {f.descripcion} <span className="tabular-nums opacity-70">· {money(f.moneda, f.montoTipico)}</span>
            </button>
          ))}
        </div>
      )}

      <Modal open={batch !== null} onClose={() => setBatch(null)} width={620}
        title="Agregar varios gastos"
        subtitle="Una línea = un gasto. Revisá lo interpretado y destildá lo que no quieras."
        footer={
          <>
            <button type="button" className="ui-btn ui-btn-outline" onClick={() => setBatch(null)}>Cancelar</button>
            <button type="button" className="ui-btn ui-btn-primary" disabled={!batchCount} onClick={saveBatch}>
              Guardar {batchCount} {batchCount === 1 ? 'gasto' : 'gastos'}
            </button>
          </>
        }>
        <ul className="flex flex-col divide-y divide-(--hairline) -mx-1">
          {batch?.map((b, i) => (
            <li key={i} className="flex items-center gap-2.5 px-1 py-1.5">
              <input type="checkbox" checked={b.checked} disabled={b.parsed.monto === null} aria-label={`Incluir ${b.line}`}
                onChange={(e) => setBatch((prev) => prev && prev.map((x, j) => (j === i ? { ...x, checked: e.target.checked } : x)))} />
              <span className="flex-1 min-w-0">
                <span className="block t-body text-on-surface truncate">{b.parsed.descripcion || b.line}</span>
                <span className="block t-caption text-on-surface-variant truncate">
                  {b.parsed.categoria} · {b.parsed.metodoPago ?? readLastMethod() ?? 'Efectivo'} · {b.parsed.fecha === today ? 'Hoy' : fechaCorta(b.parsed.fecha)}
                </span>
              </span>
              {b.parsed.monto !== null
                ? <span className="t-body tabular-nums text-on-surface">{money(b.parsed.moneda, b.parsed.monto)}</span>
                : <span className="ui-badge ui-badge-warning">Falta el monto</span>}
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  )
})
