import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeftRight, Copy, Play, Square } from 'lucide-react'
import { useToast } from '../../core/components/Toast'
import { compareSets, GP_COMPARE_SQL, toTsv, type CompareResult } from './sql-text'
import type { QueryResult } from './types'
import type { SqlProfile } from '../connections/sql'
import { ProfileSelect } from './ProfileSelect'
import { connectionProblem } from './sql-meta'
import type { FixRequest } from './ConnectionFixDialog'

/**
 * Comparar la misma consulta en dos conexiones (p. ej. los General Params de QA y del
 * cliente) y ver sólo lo distinto. Corre siempre en modo lectura. Las primeras N
 * columnas son la clave de cada fila; el resto se compara.
 */
type Filter = 'all' | 'diff' | 'only-a' | 'only-b'

export function CompareView({ profiles, onFix }: { profiles: SqlProfile[]; onFix: (req: FixRequest) => void }): JSX.Element {
  const toast = useToast()
  const [a, setA] = useState<string | null>(profiles[0]?.id ?? null)
  const [b, setB] = useState<string | null>(profiles[1]?.id ?? null)
  const [sql, setSql] = useState(() => { try { return localStorage.getItem('sql-runner:compare-sql') || GP_COMPARE_SQL } catch { return GP_COMPARE_SQL } })
  const [keyCount, setKeyCount] = useState(2)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [res, setRes] = useState<CompareResult | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const runIds = useRef<string[]>([])
  // Conexiones que aparecen después (se agregaron en Conexiones): completar A y B solas.
  useEffect(() => {
    const ids = profiles.map((p) => p.id)
    const nextA = a && ids.includes(a) ? a : ids[0] ?? null
    const nextB = b && ids.includes(b) && b !== nextA ? b : ids.find((id) => id !== nextA) ?? null
    if (nextA !== a) setA(nextA)
    if (nextB !== b) setB(nextB)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles])

  const nameOf = (id: string | null): string => profiles.find((p) => p.id === id)?.name ?? '—'

  const run = async (): Promise<void> => {
    if (!a || !b) return
    try { localStorage.setItem('sql-runner:compare-sql', sql) } catch { /* nada */ }
    setBusy(true); setError(null); setRes(null)
    const ids = [crypto.randomUUID(), crypto.randomUUID()]
    runIds.current = ids
    const call = (profileId: string, runId: string): Promise<QueryResult> =>
      window.api.invoke<QueryResult>('sql:query', { runId, profileId, sql, readOnly: true, maxRows: 20000 })
    try {
      const [ra, rb] = await Promise.all([call(a, ids[0]!), call(b, ids[1]!)])
      const bad = !ra.ok ? { id: a, r: ra } : !rb.ok ? { id: b, r: rb } : null
      const problem = bad ? connectionProblem(bad.r) : null
      if (bad && problem) onFix({ profileId: bad.id, reason: problem, error: bad.r.error, retry: () => void run() })
      if (!ra.ok || !rb.ok) { setError(!ra.ok ? `${nameOf(a)}: ${ra.error}` : `${nameOf(b)}: ${rb.error}`); return }
      const sa = ra.sets[0]
      const sb = rb.sets[0]
      if (!sa || !sb) { setError('La consulta no devolvió filas para comparar'); return }
      if (sa.columns.join('|').toLowerCase() !== sb.columns.join('|').toLowerCase()) { setError('Las dos conexiones devolvieron columnas distintas'); return }
      setRes(compareSets(sa, sb, keyCount))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const cancel = (): void => { for (const id of runIds.current) void window.api.invoke('sql:cancel', id) }

  const counts = useMemo(() => ({
    diff: res?.rows.filter((r) => r.status === 'diff').length ?? 0,
    'only-a': res?.rows.filter((r) => r.status === 'only-a').length ?? 0,
    'only-b': res?.rows.filter((r) => r.status === 'only-b').length ?? 0,
  }), [res])
  const shown = useMemo(() => {
    if (!res) return []
    const f = q.trim().toLowerCase()
    return res.rows.filter((r) => (filter === 'all' || r.status === filter)
      && (!f || [...r.key, ...(r.a ?? []), ...(r.b ?? [])].some((v) => (v ?? '').toLowerCase().includes(f))))
  }, [res, filter, q])

  const copyDiff = async (): Promise<void> => {
    if (!res) return
    const cols = [...res.columns.slice(0, res.keyCount), 'Estado', ...res.columns.slice(res.keyCount).flatMap((c) => [`${c} (${nameOf(a)})`, `${c} (${nameOf(b)})`])]
    const label = { diff: 'Distinto', 'only-a': `Sólo en ${nameOf(a)}`, 'only-b': `Sólo en ${nameOf(b)}` } as const
    const rows = shown.map((r) => [...r.key, label[r.status], ...res.columns.slice(res.keyCount).flatMap((_, j) => [r.a?.[res.keyCount + j] ?? null, r.b?.[res.keyCount + j] ?? null])])
    try { await navigator.clipboard.writeText(toTsv(cols, rows)); toast.show('Diferencias copiadas (para pegar en Excel)', 'success') } catch { toast.show('No se pudo copiar', 'error') }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 hairline-b shrink-0">
        <ProfileSelect profiles={profiles} value={a} onChange={setA} label="A" />
        <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon" title="Intercambiar" onClick={() => { setA(b); setB(a) }}><ArrowLeftRight size={14} /></button>
        <ProfileSelect profiles={profiles} value={b} onChange={setB} label="B" />
        <label className="flex items-center gap-1.5 t-footnote text-on-surface-variant ml-2" title="Las primeras N columnas identifican cada fila; el resto se compara">
          Columnas clave
          <input type="number" min={1} max={10} value={keyCount} onChange={(e) => setKeyCount(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
            className="ui-input h-[28px] w-[52px] px-2 text-[12px]" />
        </label>
        <span className="flex-1" />
        <button className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => { setSql(GP_COMPARE_SQL); setKeyCount(2) }} title="Volver a la consulta de General Params">General Params</button>
        {busy
          ? <button className="ui-btn ui-btn-outline" onClick={cancel}><Square size={12} /> Cancelar</button>
          : <button className="ui-btn ui-btn-run" disabled={!a || !b || a === b} onClick={() => void run()} title="Comparar (F5)"><Play size={13} /> Comparar</button>}
      </div>

      <textarea value={sql} onChange={(e) => setSql(e.target.value)} spellCheck={false}
        onKeyDown={(e) => { if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key === 'Enter')) { e.preventDefault(); void run() } }}
        className="shrink-0 h-[120px] resize-y px-4 py-3 font-mono text-[12.5px] leading-[19px] bg-surface text-on-surface outline-hidden hairline-b" />

      {error && <p className="px-4 py-3 t-footnote text-error hairline-b">{error}</p>}

      {res ? (
        <>
          <div className="flex items-center gap-1.5 px-4 h-[40px] hairline-b shrink-0">
            {([['all', `Todo ${res.rows.length}`], ['diff', `Distinto ${counts.diff}`], ['only-a', `Sólo en ${nameOf(a)} ${counts['only-a']}`], ['only-b', `Sólo en ${nameOf(b)} ${counts['only-b']}`]] as const).map(([id, label]) => (
              <button key={id} type="button" onClick={() => setFilter(id)} aria-pressed={filter === id}
                className={`h-[26px] px-2.5 rounded-[7px] border text-[12px] transition-colors ${filter === id ? 'border-primary/40 bg-primary/10 text-primary font-medium' : 'border-hairline-strong text-on-surface-variant hover:text-on-surface'}`}>
                {label}
              </button>
            ))}
            <span className="t-footnote text-on-surface-variant ml-2">{res.same.toLocaleString('es-AR')} iguales</span>
            <span className="flex-1" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar…" className="ui-input h-[26px] w-[160px] text-[12px] px-2.5" />
            <button className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => void copyDiff()} disabled={!shown.length}><Copy size={12} /> Copiar</button>
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            {shown.length === 0 ? (
              <p className="px-4 py-10 text-center t-body text-on-surface-variant">{res.rows.length ? 'Nada con este filtro' : 'Las dos conexiones devuelven lo mismo'}</p>
            ) : (
              <table className="border-separate border-spacing-0 text-[12px] leading-[18px]">
                <thead>
                  <tr>
                    {res.columns.slice(0, res.keyCount).map((c) => <th key={c} className="sticky top-0 z-10 bg-surface-container-low px-2.5 h-[28px] text-left font-semibold whitespace-nowrap border-b border-r border-(--hairline)">{c}</th>)}
                    {res.columns.slice(res.keyCount).map((c) => (
                      <th key={c} colSpan={2} className="sticky top-0 z-10 bg-surface-container-low px-2.5 h-[28px] text-left font-semibold whitespace-nowrap border-b border-r border-(--hairline)">
                        {c} <span className="font-normal text-on-surface-variant">· {nameOf(a)} / {nameOf(b)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {shown.map((r, i) => (
                    <tr key={i} className="hover:bg-on-surface/4">
                      {r.key.map((k, j) => (
                        <td key={j} className="px-2.5 whitespace-nowrap border-b border-r border-(--hairline) text-on-surface">
                          {j === 0 && <span className={`inline-block w-1.5 h-1.5 rounded-full mr-2 align-middle ${r.status === 'diff' ? 'bg-warning' : r.status === 'only-a' ? 'bg-error' : 'bg-success'}`} />}
                          {k}
                        </td>
                      ))}
                      {res.columns.slice(res.keyCount).map((_, j) => {
                        const idx = res.keyCount + j
                        const changed = r.changed.includes(idx)
                        const cell = (v: (string | null)[] | undefined, side: 'a' | 'b'): JSX.Element => {
                          const val = v ? v[idx] ?? null : undefined
                          return (
                            <td className={`px-2.5 max-w-[320px] truncate whitespace-nowrap border-b border-(--hairline) ${side === 'b' ? 'border-r' : ''} ${
                              val === undefined ? 'text-on-surface-variant/40' : changed ? (side === 'a' ? 'bg-error/10 text-on-surface' : 'bg-success/10 text-on-surface') : 'text-on-surface-variant'}`}
                              title={val ?? undefined}>
                              {val === undefined ? '—' : val === null ? <span className="italic opacity-60">NULL</span> : val}
                            </td>
                          )
                        }
                        return <FragmentPair key={j} a={cell(r.a, 'a')} b={cell(r.b, 'b')} />
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : !error && (
        <div className="flex-1 grid place-items-center px-6">
          <div className="text-center max-w-[420px]">
            <p className="t-callout font-semibold text-on-surface">Compará dos ambientes</p>
            <p className="t-body text-on-surface-variant mt-1">
              Elegí dos conexiones y ejecutá la misma consulta en las dos: ves sólo lo que difiere.
              Viene lista para los General Params; para otra tabla, cambiá la consulta y cuántas columnas forman la clave.
            </p>
            {profiles.length < 2 && <p className="t-footnote text-warning mt-3">Necesitás al menos dos conexiones en Conexiones → Bases de datos.</p>}
          </div>
        </div>
      )}
    </div>
  )
}

function FragmentPair({ a, b }: { a: JSX.Element; b: JSX.Element }): JSX.Element {
  return <>{a}{b}</>
}
