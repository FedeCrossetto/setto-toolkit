import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Eye, Link, ScrollText, Search, SquareFunction, Star, Table, Zap } from 'lucide-react'
import type { IconComponent } from '../../core/types'
import type { SqlProfile } from '../connections/sql'
import type { QueryResult } from './types'
import { parseObjects, type SqlObject, type SqlObjectType } from './sql-meta'
import { favoritesFor, rankObjects, recentFor } from './object-prefs'

/**
 * Ir a objeto (Ctrl+P): busca tablas, vistas, procedimientos y funciones en todas las bases
 * de la conexión. Lee primero la base actual y después las demás en segundo plano (como el
 * explorador, con `sql:meta objects`); lo leído queda en memoria unos minutos.
 */
export type FoundObject = SqlObject & { db: string }

const TYPE_ICON: Record<SqlObjectType, IconComponent> = {
  U: Table, V: Eye, P: ScrollText, FN: SquareFunction, IF: SquareFunction, TF: SquareFunction, TR: Zap, SN: Link,
}
const TYPE_COLOR: Record<SqlObjectType, string> = {
  U: 'text-sky-500', V: 'text-teal-500', P: 'text-violet-400', FN: 'text-amber-500', IF: 'text-amber-500', TF: 'text-amber-500', TR: 'text-rose-400', SN: 'text-on-surface-variant',
}
const TYPE_LABEL: Record<SqlObjectType, string> = { U: 'tabla', V: 'vista', P: 'procedimiento', FN: 'función', IF: 'función', TF: 'función', TR: 'disparador', SN: 'sinónimo' }
/** Bases que se leen como máximo (las de sistema ya vienen filtradas). */
const MAX_DBS = 30
const TTL_MS = 10 * 60_000
const cache = new Map<string, { at: number; list: SqlObject[] }>()

export function GoToObject({ profile, databases, currentDb, onPick, onClose }: {
  profile: SqlProfile
  databases: string[]
  currentDb: string
  onPick: (o: FoundObject) => void
  onClose: () => void
}): JSX.Element {
  const [q, setQ] = useState('')
  const [found, setFound] = useState<FoundObject[]>([])
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const dbs = useMemo(() => {
    const rest = databases.filter((d) => d.toLowerCase() !== currentDb.toLowerCase())
    return [currentDb, ...rest].filter(Boolean).slice(0, MAX_DBS)
  }, [databases, currentDb])

  useEffect(() => {
    let alive = true
    setProgress({ done: 0, total: dbs.length })
    void (async () => {
      const all: FoundObject[] = []
      for (const [i, db] of dbs.entries()) {
        const key = `${profile.id}|${db.toLowerCase()}`
        let list = cache.get(key)?.at && Date.now() - cache.get(key)!.at < TTL_MS ? cache.get(key)!.list : null
        if (!list) {
          try {
            const r = await window.api.invoke<QueryResult>('sql:meta', { profileId: profile.id, database: db, kind: 'objects' })
            list = r.ok ? parseObjects(r) : []
            if (r.ok) cache.set(key, { at: Date.now(), list })
          } catch { list = [] }
        }
        if (!alive) return
        all.push(...list.map((o) => ({ ...o, db })))
        setFound([...all])
        setProgress({ done: i + 1, total: dbs.length })
      }
    })()
    return () => { alive = false }
  }, [profile.id, dbs])

  // Sin escribir: favoritos y recientes de la base actual.
  const shown = useMemo(() => {
    if (q.trim()) return rankObjects(found, q, currentDb)
    const refs = [...favoritesFor(profile.id, currentDb), ...recentFor(profile.id, currentDb, 10)]
    const out: FoundObject[] = []
    for (const r of refs) {
      const o = found.find((x) => x.db.toLowerCase() === r.db.toLowerCase() && x.schema.toLowerCase() === r.schema.toLowerCase() && x.name.toLowerCase() === r.name.toLowerCase())
      if (o && !out.includes(o)) out.push(o)
    }
    return out
  }, [q, found, currentDb, profile.id])
  const favs = useMemo(() => favoritesFor(profile.id, currentDb), [profile.id, currentDb])
  useEffect(() => { setActive(0) }, [q])
  useEffect(() => { listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' }) }, [active])

  const pick = (o: FoundObject | undefined): void => { if (o) { onPick(o); onClose() } }
  const loading = progress.done < progress.total

  return createPortal(
    <div className="fixed inset-0 z-[700] flex items-start justify-center pt-[12vh] bg-black/20 dark:bg-black/45" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{ animation: 'fadeIn 0.12s ease both' }}>
      <div role="dialog" aria-label="Ir a objeto" className="fl-dialog w-[640px] max-w-[calc(100vw-32px)] flex flex-col overflow-hidden">
        <div className="relative flex items-center gap-2.5 px-4 h-12 hairline-b">
          <Search size={16} className="text-on-surface-variant shrink-0" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} spellCheck={false}
            placeholder={`Tabla, vista o procedimiento en ${profile.name}…`}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose() }
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(shown.length - 1, i + 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)) }
              if (e.key === 'Enter') { e.preventDefault(); pick(shown[active]) }
            }}
            className="flex-1 min-w-0 bg-transparent outline-hidden text-[14px] text-on-surface placeholder:text-on-surface-variant/70" />
          <span className="t-caption text-on-surface-variant tabular-nums shrink-0">
            {loading ? `Leyendo ${progress.done + 1} de ${progress.total} bases…` : `${found.length.toLocaleString('es-AR')} objetos · ${progress.total} ${progress.total === 1 ? 'base' : 'bases'}`}
          </span>
          {loading && <span className="absolute left-0 bottom-0 h-[2px] bg-primary/60 transition-[width]" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />}
        </div>
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-1.5">
          {!q.trim() && shown.length > 0 && <div className="px-2.5 pt-1 pb-1.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-on-surface-variant/80">Favoritos y recientes de {currentDb}</div>}
          {shown.length === 0 ? (
            <p className="px-3 py-8 text-center t-footnote text-on-surface-variant">
              {q.trim() ? (loading ? 'Buscando…' : 'No hay objetos con ese nombre.') : 'Escribí parte del nombre. Podés sumar la base: "accounts lps".'}
            </p>
          ) : shown.map((o, i) => {
            const Icon = TYPE_ICON[o.type]
            const on = i === active
            const fav = favs.some((r) => r.db.toLowerCase() === o.db.toLowerCase() && r.schema === o.schema && r.name === o.name)
            return (
              <button key={`${o.db}|${o.id}`} type="button" data-i={i} onMouseMove={() => setActive(i)} onClick={() => pick(o)}
                className={`w-full flex items-center gap-2.5 px-2.5 h-9 rounded-[8px] text-left ${on ? 'bg-primary/10' : ''}`}>
                <Icon size={15} className={`shrink-0 ${TYPE_COLOR[o.type]}`} />
                <span className="flex-1 min-w-0 truncate t-body text-on-surface">
                  {o.schema !== 'dbo' && <span className="text-on-surface-variant">{o.schema}.</span>}{o.name}
                </span>
                {fav && <Star size={11} weight="fill" className="text-warning shrink-0" />}
                <span className="shrink-0 text-[11px] text-on-surface-variant">{TYPE_LABEL[o.type]}</span>
                <span className={`shrink-0 max-w-[140px] truncate px-1.5 h-[18px] rounded-[5px] font-mono text-[10.5px] leading-[18px] ${o.db.toLowerCase() === currentDb.toLowerCase() ? 'bg-primary/10 text-primary' : 'bg-on-surface/6 text-on-surface-variant'}`}>{o.db}</span>
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-3 px-4 h-9 hairline-t t-caption text-on-surface-variant">
          <span><kbd className="kbd-chip">↑↓</kbd> elegir</span>
          <span><kbd className="kbd-chip">Enter</kbd> abrir (tablas y vistas: 100 filas; el resto: la definición)</span>
          <span className="ml-auto"><kbd className="kbd-chip">Esc</kbd> cerrar</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
