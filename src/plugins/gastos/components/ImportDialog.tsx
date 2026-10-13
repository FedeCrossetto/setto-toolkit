import { useEffect, useMemo, useState } from 'react'
import { FileUp, Loader2 } from 'lucide-react'
import { Modal } from '../../../core/components/Modal'
import {
  analyzeCsv, buildImportRows, importedGastoId, markDuplicates,
  type ColumnMapping, type CsvAnalysis, type DateFormat, type NumberFormat,
} from '../csv-import'
import { suggestCategory, type Learning } from '../learning'
import { CATEGORIAS_VARIABLES, METODOS_VARIABLES } from '../quick-add-parser'
import { fechaCorta, fmt } from '../format'
import type { Gasto } from '../types'

const FIELDS: Array<{ key: keyof ColumnMapping; label: string }> = [
  { key: 'fecha', label: 'Fecha' },
  { key: 'descripcion', label: 'Descripción' },
  { key: 'monto', label: 'Monto / importe' },
  { key: 'debito', label: 'Débito' },
  { key: 'credito', label: 'Crédito' },
  { key: 'moneda', label: 'Moneda' },
]

const SOURCE_LABEL = { mp: 'Mercado Pago', banco: 'Home banking', generico: 'CSV genérico' } as const
const SOURCE_METODO = { mp: 'MP', banco: 'Débito', generico: 'Transferencia' } as const

/** "Importar movimientos…": elegir CSV → mapear columnas → revisar → importar. */
export function ImportDialog({ open, onClose, existing, learning, onImport }: {
  open: boolean
  onClose: () => void
  existing: Gasto[]
  learning: Learning
  onImport: (gastos: Gasto[]) => void
}): JSX.Element | null {
  const [phase, setPhase] = useState<'picking' | 'review' | 'error'>('picking')
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [analysis, setAnalysis] = useState<CsvAnalysis | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping | null>(null)
  const [dateFormat, setDateFormat] = useState<DateFormat>('dmy')
  const [numberFormat, setNumberFormat] = useState<NumberFormat>('es')
  const [metodo, setMetodo] = useState('Débito')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [catOverride, setCatOverride] = useState<Record<number, string>>({})
  // Foto de lo existente al elegir el archivo: un sync en segundo plano no resetea la selección.
  const [base, setBase] = useState<Gasto[]>([])

  async function pick(): Promise<void> {
    setPhase('picking')
    try {
      const res = await window.api.invoke<{ canceled: boolean; name?: string; text?: string }>('gastos:import-file-open')
      if (res.canceled || !res.text) { onClose(); return }
      const a = analyzeCsv(res.text)
      if (!a.table.rows.length) throw new Error('No se encontraron filas con datos en el archivo.')
      setFileName(res.name ?? 'archivo.csv')
      setAnalysis(a)
      setMapping(a.mapping)
      setDateFormat(a.dateFormat)
      setNumberFormat(a.numberFormat)
      setMetodo(SOURCE_METODO[a.source])
      setCatOverride({})
      setBase(existing)
      setPhase('review')
    } catch (e) {
      setError(String(e).replace(/^Error:\s*(Error invoking remote method '[^']+':\s*)?(Error:\s*)?/i, ''))
      setPhase('error')
    }
  }

  useEffect(() => {
    if (open) void pick()
    else { setAnalysis(null); setMapping(null); setError('') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const rows = useMemo(() => {
    if (!analysis || !mapping) return []
    return markDuplicates(buildImportRows(analysis.table, mapping, { dateFormat, numberFormat }), base)
  }, [analysis, mapping, dateFormat, numberFormat, base])

  const suggested = useMemo(() => rows.map((r) => suggestCategory(learning, r.descripcion) ?? 'Otro'), [rows, learning])

  // Al recalcular filas: se tildan los gastos válidos que no son duplicados.
  useEffect(() => {
    setChecked(new Set(rows.filter((r) => r.kind === 'gasto' && !r.error && !r.duplicateOf).map((r) => r.index)))
  }, [rows])

  const importable = rows.filter((r) => checked.has(r.index) && r.kind === 'gasto' && !r.error)
  const counts = {
    gastos: rows.filter((r) => r.kind === 'gasto' && !r.error).length,
    ingresos: rows.filter((r) => r.kind === 'ingreso' && !r.error).length,
    dup: rows.filter((r) => r.duplicateOf).length,
    err: rows.filter((r) => r.error).length,
  }
  const catOptions = useMemo(() => [...new Set([...CATEGORIAS_VARIABLES, ...existing.map((g) => g.categoria)])], [existing])

  function doImport(): void {
    const now = new Date().toISOString()
    const seen = new Map<string, number>()
    const gastos: Gasto[] = importable.map((r) => {
      const k = `${r.fecha}|${r.monto}|${r.descripcion}`
      const occ = seen.get(k) ?? 0
      seen.set(k, occ + 1)
      return {
        id: importedGastoId(r, occ), fecha: r.fecha!, monto: r.monto!, moneda: r.moneda,
        descripcion: r.descripcion.slice(0, 500), categoria: catOverride[r.index] ?? suggested[r.index] ?? 'Otro',
        metodoPago: metodo, notas: `Importado de ${fileName}`, created_at: now, updated_at: now,
      }
    })
    onImport(gastos)
  }

  function toggleAll(on: boolean): void {
    setChecked(on ? new Set(rows.filter((r) => r.kind === 'gasto' && !r.error).map((r) => r.index)) : new Set())
  }

  if (!open) return null
  const headers = analysis?.table.headers ?? []

  return (
    <Modal open onClose={onClose} width={900} closeOnBackdrop={false}
      title="Importar movimientos"
      subtitle={phase === 'review' && analysis
        ? `${fileName} · ${SOURCE_LABEL[analysis.source]} · ${rows.length} filas`
        : 'Resumen de Mercado Pago, export de home banking o cualquier CSV con fecha, descripción y monto.'}
      footer={phase === 'review' ? (
        <>
          <button type="button" className="ui-btn ui-btn-ghost mr-auto" onClick={() => { void pick() }}><FileUp size={14} /> Otro archivo</button>
          <button type="button" className="ui-btn ui-btn-outline" onClick={onClose}>Cancelar</button>
          <button type="button" className="ui-btn ui-btn-primary" disabled={!importable.length} onClick={doImport}>
            Importar {importable.length} {importable.length === 1 ? 'gasto' : 'gastos'}
          </button>
        </>
      ) : (
        <button type="button" className="ui-btn ui-btn-outline" onClick={onClose}>Cerrar</button>
      )}>
      {phase === 'picking' && (
        <p className="flex items-center gap-2 t-footnote text-on-surface-variant py-6 justify-center"><Loader2 size={14} className="animate-spin" /> Elegí el archivo…</p>
      )}
      {phase === 'error' && (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <p className="t-body text-on-surface">No se pudo leer el archivo</p>
          <p className="t-footnote text-on-surface-variant max-w-md">{error}</p>
          <button type="button" className="ui-btn ui-btn-outline" onClick={() => { void pick() }}><FileUp size={14} /> Elegir otro</button>
        </div>
      )}
      {phase === 'review' && mapping && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-2">
            {FIELDS.map((f) => (
              <label key={f.key} className="flex flex-col gap-1">
                <span className="t-caption text-on-surface-variant">{f.label}</span>
                <select className="ui-input" value={mapping[f.key]}
                  onChange={(e) => setMapping({ ...mapping, [f.key]: Number(e.target.value) })}>
                  <option value={-1}>(ninguna)</option>
                  {headers.map((h, i) => <option key={i} value={i}>{h || `Columna ${i + 1}`}</option>)}
                </select>
              </label>
            ))}
            <label className="flex flex-col gap-1">
              <span className="t-caption text-on-surface-variant">Formato de fecha</span>
              <select className="ui-input" value={dateFormat} onChange={(e) => setDateFormat(e.target.value as DateFormat)}>
                <option value="dmy">dd/mm/aaaa</option>
                <option value="mdy">mm/dd/aaaa</option>
                <option value="ymd">aaaa-mm-dd</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="t-caption text-on-surface-variant">Formato de números</span>
              <select className="ui-input" value={numberFormat} onChange={(e) => setNumberFormat(e.target.value as NumberFormat)}>
                <option value="es">1.234,56</option>
                <option value="en">1,234.56</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="t-caption text-on-surface-variant">Método de pago</span>
              <select className="ui-input" value={metodo} onChange={(e) => setMetodo(e.target.value)}>
                {METODOS_VARIABLES.map((m) => <option key={m}>{m}</option>)}
              </select>
            </label>
          </div>

          <p className="t-footnote text-on-surface-variant">
            {counts.gastos} gastos{counts.ingresos ? ` · ${counts.ingresos} ingresos (no se importan)` : ''}
            {counts.dup ? ` · ${counts.dup} posibles duplicados (destildados)` : ''}
            {counts.err ? ` · ${counts.err} filas con errores` : ''}
          </p>

          <div className="hairline rounded-xl overflow-auto max-h-[46vh]">
            <table className="w-full t-body border-collapse">
              <thead>
                <tr className="text-on-surface-variant [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-surface [&>th]:shadow-[inset_0_-1px_0_var(--hairline)]">
                  <th className="w-9 px-3 py-2">
                    <input type="checkbox" aria-label="Seleccionar todos" checked={importable.length > 0 && importable.length === counts.gastos}
                      onChange={(e) => toggleAll(e.target.checked)} />
                  </th>
                  <th className="t-footnote font-medium text-left px-2 py-2 w-20">Fecha</th>
                  <th className="t-footnote font-medium text-left px-2 py-2">Descripción</th>
                  <th className="t-footnote font-medium text-left px-2 py-2 w-44">Categoría</th>
                  <th className="t-footnote font-medium text-right px-3 py-2 w-32">Monto</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const disabled = r.kind !== 'gasto' || Boolean(r.error)
                  return (
                    <tr key={r.index} className={`border-b border-[var(--hairline)] last:border-0 ${disabled ? 'opacity-50' : ''}`}>
                      <td className="px-3 py-1.5 text-center">
                        <input type="checkbox" disabled={disabled} checked={checked.has(r.index)} aria-label={`Importar ${r.descripcion}`}
                          onChange={(e) => setChecked((prev) => { const n = new Set(prev); if (e.target.checked) n.add(r.index); else n.delete(r.index); return n })} />
                      </td>
                      <td className="px-2 py-1.5 tabular-nums text-on-surface-variant whitespace-nowrap">{r.fecha ? fechaCorta(r.fecha) : '—'}</td>
                      <td className="px-2 py-1.5 text-on-surface">
                        <span className="block truncate max-w-[360px]" title={r.descripcion}>{r.descripcion}</span>
                        {r.duplicateOf && <span className="ui-badge ui-badge-warning mt-0.5">Posible duplicado</span>}
                        {r.kind === 'ingreso' && !r.error && <span className="ui-badge mt-0.5">Ingreso</span>}
                        {r.error && <span className="ui-badge ui-badge-error mt-0.5">{r.error}</span>}
                      </td>
                      <td className="px-2 py-1">
                        {!disabled && (
                          <select className="ui-input py-0.5 h-7 w-full" value={catOverride[r.index] ?? suggested[r.index] ?? 'Otro'}
                            aria-label="Categoría" onChange={(e) => setCatOverride((prev) => ({ ...prev, [r.index]: e.target.value }))}>
                            {[...new Set([catOverride[r.index] ?? suggested[r.index] ?? 'Otro', ...catOptions])].map((c) => <option key={c}>{c}</option>)}
                          </select>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap text-on-surface">
                        {r.monto !== null ? `${r.moneda === 'USD' ? 'US$' : '$'} ${fmt(r.monto)}` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  )
}
