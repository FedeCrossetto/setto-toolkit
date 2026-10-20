import { useMemo, useState } from 'react'
import { Copy, Download } from 'lucide-react'
import { useToast } from '../../core/components/Toast'
import { toCsv, toTsv } from './sql-text'
import type { QuerySet } from './types'

/**
 * Grilla de resultados: encabezado fijo, número de fila, NULL en gris, clic elige una
 * celda (Ctrl+C la copia), doble clic copia, y "Copiar todo" / "Exportar CSV".
 */
const NUMERIC = /^(int|bigint|smallint|tinyint|decimal|numeric|money|smallmoney|float|real|bit)$/i

export function ResultGrid({ set, name }: { set: QuerySet; name: string }): JSX.Element {
  const toast = useToast()
  const [sel, setSel] = useState<{ r: number; c: number } | null>(null)
  const [filter, setFilter] = useState('')

  const rows = useMemo(() => {
    const f = filter.trim().toLowerCase()
    if (!f) return set.rows.map((row, i) => ({ row, i }))
    return set.rows.map((row, i) => ({ row, i })).filter(({ row }) => row.some((v) => v !== null && v.toLowerCase().includes(f)))
  }, [set.rows, filter])

  const copy = async (text: string, what: string): Promise<void> => {
    try { await navigator.clipboard.writeText(text); toast.show(`${what} copiado`, 'success') } catch { toast.show('No se pudo copiar', 'error') }
  }
  const exportCsv = (): void => {
    const blob = new Blob(['﻿' + toCsv(set.columns, set.rows)], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${name.replace(/[^\w.-]+/g, '_') || 'resultado'}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }

  return (
    <div className="flex flex-col h-full min-h-0"
      tabIndex={0}
      onKeyDown={(e) => {
        if (sel && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
          e.preventDefault()
          const v = set.rows[sel.r]?.[sel.c]
          void copy(v ?? 'NULL', 'Valor')
        }
      }}>
      <div className="flex items-center gap-2 px-3 h-[36px] hairline-b shrink-0">
        <span className="t-footnote text-on-surface-variant tabular-nums">
          {set.total > set.rows.length ? `${set.rows.length.toLocaleString('es-AR')} de ${set.total.toLocaleString('es-AR')} filas` : `${set.total.toLocaleString('es-AR')} ${set.total === 1 ? 'fila' : 'filas'}`}
          {filter && ` · ${rows.length} coinciden`}
        </span>
        <span className="flex-1" />
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrar filas…"
          className="ui-input h-[26px] w-[180px] text-[12px] px-2.5" />
        <button className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => void copy(toTsv(set.columns, set.rows), 'Resultado')} title="Copiar todo (para pegar en Excel)">
          <Copy size={12} /> Copiar
        </button>
        <button className="ui-btn ui-btn-ghost ui-btn-sm" onClick={exportCsv} title="Exportar CSV">
          <Download size={12} /> CSV
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="border-separate border-spacing-0 font-mono text-[12px] leading-[18px]">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-20 bg-surface-container-low px-2 h-[28px] text-right text-on-surface-variant/60 font-normal border-b border-r border-(--hairline) min-w-[44px]">#</th>
              {set.columns.map((c, i) => (
                <th key={i} title={set.types[i] ? `${c} · ${set.types[i]}` : c}
                  className="sticky top-0 z-10 bg-surface-container-low px-2.5 h-[28px] text-left font-sans text-[12px] font-semibold text-on-surface whitespace-nowrap border-b border-r border-(--hairline)">
                  {c || <span className="text-on-surface-variant/60 font-normal">(sin nombre)</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ row, i }) => (
              <tr key={i} className="group">
                <td className="sticky left-0 z-10 bg-surface px-2 text-right text-on-surface-variant/50 border-b border-r border-(--hairline) tabular-nums select-none group-hover:bg-on-surface/4">{i + 1}</td>
                {row.map((v, c) => {
                  const selected = sel?.r === i && sel.c === c
                  return (
                    <td key={c}
                      onClick={() => setSel({ r: i, c })}
                      onDoubleClick={() => void copy(v ?? 'NULL', 'Valor')}
                      title={v !== null && v.length > 60 ? v.slice(0, 2000) : undefined}
                      className={`px-2.5 max-w-[420px] truncate whitespace-nowrap border-b border-r border-(--hairline) cursor-default ${
                        NUMERIC.test(set.types[c] ?? '') ? 'text-right tabular-nums' : ''} ${
                        selected ? 'bg-primary/15 outline outline-1 -outline-offset-1 outline-primary/60' : 'group-hover:bg-on-surface/4'} ${
                        v === null ? 'text-on-surface-variant/45 italic' : 'text-on-surface'}`}>
                      {v === null ? 'NULL' : v}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
