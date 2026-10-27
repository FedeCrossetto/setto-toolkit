import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Skeleton } from '../../core/components/Skeleton'
import { Mascot } from '../../core/components/Mascot'
import {
  Activity, AtSign, Check, Clock, Star, ChevronRight, ChevronsUpDown, Plus, Unplug, CircleAlert, Copy, Eye, KeyRound, Pencil, Play, RefreshCw, ScrollText, Search,
  Server, SquareFunction, Table, Link, TextCursorInput, X, Zap, FileCode2, Database,
} from 'lucide-react'
import { ContextMenu, type MenuItem } from '../../core/components/ContextMenu'
import type { IconComponent } from '../../core/types'
import type { SqlProfile, SqlTestResult } from '../connections/sql'
import type { QueryResult } from './types'
import {
  connectionProblem, createToAlter, friendlyError, execScript, fullName, OBJECT_GROUPS, parseChildren, parseObjects, selectTopScript, tableScript,
  type MetaKind, type SqlColumn, type SqlObject, type SqlObjectType, type SqlParam,
} from './sql-meta'
import type { FixRequest } from './ConnectionFixDialog'
import { EnvChip, SqlServerIcon } from './env'
import { CONN_COLORS, connColor, favoritesFor, isFavorite, recentFor, recordRecent, setConnColor, toggleFavorite, useObjectPrefs, type ObjectRef } from './object-prefs'

/**
 * Explorador de objetos (como el de SSMS): datos de la conexión y, de la base elegida,
 * tablas, vistas, procedimientos, funciones, disparadores y sinónimos. Abre la
 * definición en una pestaña, arma SELECT/EXEC y expande columnas y parámetros.
 */
const PER_GROUP = 400

const TYPE_ICON: Record<SqlObjectType, IconComponent> = {
  U: Table, V: Eye, P: ScrollText, FN: SquareFunction, IF: SquareFunction, TF: SquareFunction, TR: Zap, SN: Link,
}

/** Color por tipo de objeto (como en DataGrip / Azure Data Studio). */
const TYPE_COLOR: Record<SqlObjectType, string> = {
  U: 'text-sky-500', V: 'text-teal-500', P: 'text-violet-400', FN: 'text-amber-500', IF: 'text-amber-500', TF: 'text-amber-500', TR: 'text-rose-400', SN: 'text-on-surface-variant',
}

type Children = { columns: SqlColumn[]; params: SqlParam[] } | 'loading' | { error: string }

export interface OpenScript { title: string; sql: string; run?: boolean }

/** Más de esto sin probar la conexión: se vuelve a probar sola. */
const RETEST_MS = 5 * 60_000

/** "hace 2 min" para la última prueba. */
function ago(ts: number): string {
  const s = Math.max(0, (Date.now() - ts) / 1000)
  if (s < 45) return 'recién'
  if (s < 3600) return `hace ${Math.round(s / 60)} min`
  if (s < 86_400) return `hace ${Math.round(s / 3600)} h`
  return new Date(ts).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M`
  if (n >= 10_000) return `${Math.round(n / 1000).toLocaleString('es-AR')} k`
  return n.toLocaleString('es-AR')
}

export function ObjectExplorer({ profile, profiles, database, onOpen, onInsert, onFix, onTested, onSwitch, onNew }: {
  profile: SqlProfile
  /** Todas las conexiones, para cambiar desde la tarjeta */
  profiles: SqlProfile[]
  /** Base efectiva (la de la pestaña o la de la conexión) */
  database: string
  onOpen: (s: OpenScript) => void
  onInsert: (text: string) => void
  onFix: (req: FixRequest) => void
  onTested: () => void
  /** Usar otra conexión en la pestaña actual */
  onSwitch: (profileId: string) => void
  onNew: () => void
}): JSX.Element {
  const cache = useRef(new Map<string, SqlObject[]>())
  const key = `${profile.id}|${database}`
  const [objects, setObjects] = useState<SqlObject[] | null>(() => cache.current.get(key) ?? null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<{ text: string; problem: 'auth' | 'server' | null } | null>(null)
  const [q, setQ] = useState('')
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set())
  const [children, setChildren] = useState<Record<number, Children>>({})
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const [testing, setTesting] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [switcher, setSwitcher] = useState(false)
  const switcherRef = useRef<HTMLDivElement>(null)
  // Cerrar el selector al hacer clic afuera o con Esc.
  useEffect(() => {
    if (!switcher) return
    const onDown = (e: MouseEvent): void => { if (!switcherRef.current?.contains(e.target as Node)) setSwitcher(false) }
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') { e.stopPropagation(); setSwitcher(false) } }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey, true)
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey, true) }
  }, [switcher])
  const [showDetail, setShowDetail] = useState(false)

  const meta = useCallback((kind: MetaKind, objectId?: number): Promise<QueryResult> =>
    window.api.invoke<QueryResult>('sql:meta', { profileId: profile.id, database, kind, objectId }), [profile.id, database])

  const load = useCallback(async (force = false) => {
    const cached = cache.current.get(key)
    if (cached && !force) { setObjects(cached); setError(null); return }
    setLoading(true); setError(null)
    try {
      const r = await meta('objects')
      if (!r.ok) { setError({ text: r.error ?? 'No se pudo leer la base', problem: connectionProblem(r) }); setObjects(null); return }
      const list = parseObjects(r)
      cache.current.set(key, list)
      setObjects(list)
    } catch (e) {
      setError({ text: e instanceof Error ? e.message : String(e), problem: null })
    } finally {
      setLoading(false)
    }
  }, [key, meta])

  useEffect(() => { setChildren({}); void load() }, [load])

  const fix = (reason: 'auth' | 'server' | 'edit', text?: string): void =>
    onFix({ profileId: profile.id, reason, error: text, retry: () => void load(true) })

  const testNow = async (quiet = false): Promise<void> => {
    if (!quiet) setTesting(true)
    try { await window.api.invoke<SqlTestResult>('sql:test', profile.id) } catch { /* se ve en lastTest */ }
    if (!quiet) setTesting(false)
    onTested()
  }
  // Estado en vivo: si la última prueba tiene más de 5 min, se vuelve a probar en segundo plano
  // (sólo con la ventana a la vista); el reloj relativo ("hace 2 min") se refresca solo.
  const [, setTick] = useState(0)
  const lastAt = profile.lastTest?.at ?? 0
  useEffect(() => {
    const check = (): void => {
      setTick((x) => x + 1)
      if (document.visibilityState === 'visible' && Date.now() - lastAt > RETEST_MS) void testNow(true)
    }
    check()
    const t = setInterval(check, 60_000)
    return () => clearInterval(t)
  }, [profile.id, lastAt]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Recientes y favoritos (de esta conexión y base) ──
  useObjectPrefs()
  const refOf = (o: SqlObject): Omit<ObjectRef, 'at'> => ({ profileId: profile.id, db: database, schema: o.schema, name: o.name, type: o.type })
  const resolve = (r: ObjectRef): SqlObject | undefined => objects?.find((o) => o.schema.toLowerCase() === r.schema.toLowerCase() && o.name.toLowerCase() === r.name.toLowerCase())
  const color = connColor(profile.id)

  // ── Filtro y grupos ──
  const f = q.trim().toLowerCase()
  const groups = useMemo(() => {
    const list = objects ?? []
    return OBJECT_GROUPS.map((g) => {
      const all = list.filter((o) => g.types.includes(o.type))
      const shown = f ? all.filter((o) => `${o.schema}.${o.name}`.toLowerCase().includes(f) || (o.parent ?? '').toLowerCase().includes(f)) : all
      return { ...g, total: all.length, shown }
    }).filter((g) => g.total > 0)
  }, [objects, f])
  const isOpen = (id: string, count: number): boolean => (f ? count > 0 && !openGroups.has(`-${id}`) : openGroups.has(id))
  const toggleGroup = (id: string): void => setOpenGroups((s) => {
    const n = new Set(s)
    const k = f ? `-${id}` : id
    if (n.has(k)) n.delete(k); else n.add(k)
    return n
  })

  // ── Objetos ──
  const loadChildren = async (o: SqlObject): Promise<{ columns: SqlColumn[]; params: SqlParam[] } | null> => {
    const c = children[o.id]
    if (c && c !== 'loading' && !('error' in c)) return c
    setChildren((s) => ({ ...s, [o.id]: 'loading' }))
    try {
      const r = await meta('children', o.id)
      if (!r.ok) { setChildren((s) => ({ ...s, [o.id]: { error: r.error ?? 'Error' } })); return null }
      const v = parseChildren(r)
      setChildren((s) => ({ ...s, [o.id]: v }))
      return v
    } catch (e) {
      setChildren((s) => ({ ...s, [o.id]: { error: e instanceof Error ? e.message : String(e) } }))
      return null
    }
  }
  const toggleObject = (o: SqlObject): void => {
    if (children[o.id] && children[o.id] !== 'loading') { setChildren((s) => { const n = { ...s }; delete n[o.id]; return n }); return }
    void loadChildren(o)
  }
  const openDefinition = async (o: SqlObject, alter: boolean): Promise<void> => {
    recordRecent(refOf(o))
    if (o.type === 'U') {
      const c = await loadChildren(o)
      if (c) onOpen({ title: o.name, sql: tableScript(o, c.columns) })
      return
    }
    const r = await meta('definition', o.id)
    if (!r.ok) { setError({ text: r.error ?? 'No se pudo leer la definición', problem: connectionProblem(r) }); return }
    const row = r.sets[0]?.rows[0]
    const def = row?.[0] ?? null
    const syn = row?.[1] ?? null
    if (o.type === 'SN') { onOpen({ title: o.name, sql: `CREATE SYNONYM ${fullName(o)} FOR ${syn ?? '?'}\n` }); return }
    if (def == null) { onOpen({ title: o.name, sql: `-- ${fullName(o)}: la definición está cifrada (WITH ENCRYPTION) o no tenés permiso para verla\n` }); return }
    onOpen({ title: o.name, sql: alter ? createToAlter(def) : def })
  }
  const openExec = async (o: SqlObject): Promise<void> => {
    recordRecent(refOf(o))
    const c = await loadChildren(o)
    if (c) onOpen({ title: o.name, sql: execScript(o, c.params) })
  }
  const primary = (o: SqlObject): void => {
    if (o.type === 'U' || o.type === 'V') { recordRecent(refOf(o)); onOpen({ title: o.name, sql: selectTopScript(o), run: true }) }
    else void openDefinition(o, o.type !== 'SN')
  }
  const copy = (text: string): void => { void navigator.clipboard.writeText(text).catch(() => undefined) }
  const objectMenu = (e: React.MouseEvent, o: SqlObject): void => {
    e.preventDefault()
    const name = fullName(o)
    const items: MenuItem[] = []
    if (o.type === 'U' || o.type === 'V') items.push({ label: 'Seleccionar 100 filas', icon: Play, action: () => onOpen({ title: o.name, sql: selectTopScript(o), run: true }) })
    if (o.type === 'U') items.push({ label: 'Script CREATE', icon: FileCode2, action: () => void openDefinition(o, false) })
    if (o.type !== 'U') items.push({ label: o.type === 'SN' ? 'Ver destino' : 'Ver definición', icon: FileCode2, action: () => void openDefinition(o, false) })
    if (['V', 'P', 'FN', 'IF', 'TF', 'TR'].includes(o.type)) items.push({ label: 'Modificar (ALTER)', icon: Pencil, action: () => void openDefinition(o, true) })
    if (['P', 'FN', 'IF', 'TF'].includes(o.type)) items.push({ label: o.type === 'P' ? 'Plantilla EXEC' : 'Plantilla SELECT', icon: Play, action: () => void openExec(o) })
    items.push(
      { label: isFavorite(refOf(o)) ? 'Quitar de favoritos' : 'Agregar a favoritos', icon: Star, action: () => toggleFavorite(refOf(o)), divider: true },
      { label: 'Insertar nombre en el editor', icon: TextCursorInput, action: () => onInsert(name) },
      { label: 'Copiar nombre', icon: Copy, action: () => copy(name) },
    )
    setMenu({ x: e.clientX, y: e.clientY, items })
  }

  const t = profile.lastTest
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Conexión: la tarjeta abre el selector (como el de espacios de trabajo); "+" agrega una nueva */}
      <div ref={switcherRef} className="relative px-3 pt-3 pb-2.5 hairline-b">
        <div className="flex items-center gap-1">
        <button type="button" onClick={() => setSwitcher((v) => !v)} aria-expanded={switcher} aria-haspopup="listbox" title="Cambiar de conexión"
          className={`flex-1 min-w-0 flex items-center gap-2.5 p-2 -m-1 rounded-(--r-md) text-left transition-colors ${switcher ? 'bg-on-surface/6' : 'hover:bg-on-surface/4'}`}>
          <span className="relative grid place-items-center w-10 h-10 rounded-[11px] bg-linear-to-b from-on-surface/8 to-on-surface/3 ring-1 ring-on-surface/10 shrink-0"
            style={color ? { boxShadow: `0 0 0 2px ${color}` } : undefined}>
            <SqlServerIcon size={24} />
            <span className={`absolute -right-0.5 -bottom-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-surface ${!t ? 'bg-on-surface/30' : t.ok ? 'bg-success' : 'bg-error'}`}
              title={t ? `${t.ok ? 'Última prueba ok' : 'Última prueba falló'} · ${new Date(t.at).toLocaleString('es-AR')}` : 'Sin probar'} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="t-body font-semibold text-on-surface truncate">{profile.name}</span>
              {profile.tag && <EnvChip tag={profile.tag} />}
            </span>
            <span className="block t-caption text-on-surface-variant truncate">
              <span className="font-mono">{profile.server}</span>
              {t && <span className={t.ok ? '' : 'text-error'}> · {t.ok ? (t.ms != null ? `${t.ms} ms` : 'conecta') : 'no conecta'} · {ago(t.at)}</span>}
            </span>
          </span>
          <ChevronsUpDown size={14} className="text-on-surface-variant shrink-0" />
        </button>
        <button type="button" onClick={onNew} title="Nueva conexión" aria-label="Nueva conexión"
          className="ui-btn ui-btn-ghost ui-btn-icon shrink-0 ml-1"><Plus size={15} /></button>
        </div>

        {switcher && (
          <div role="listbox" aria-label="Conexiones" className="absolute left-2 right-2 top-[calc(100%-6px)] z-30 mac-popover hairline p-1.5 flex flex-col gap-px max-h-[360px] overflow-y-auto"
            style={{ animation: 'fadeIn 0.12s ease both' }}>
            <div className="px-2 pt-1 pb-1.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-on-surface-variant/80">Conexiones</div>
            {[...profiles].sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0) || a.name.localeCompare(b.name, 'es')).map((p) => {
              const on = p.id === profile.id
              const pt = p.lastTest
              return (
                <button key={p.id} type="button" role="option" aria-selected={on} onClick={() => { setSwitcher(false); if (!on) onSwitch(p.id) }}
                  className={`flex items-center gap-2.5 px-2 py-1.5 rounded-[8px] text-left transition-colors ${on ? 'bg-on-surface/7' : 'hover:bg-on-surface/5'}`}>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${!pt ? 'bg-on-surface/25' : pt.ok ? 'bg-success' : 'bg-error'}`}
                    title={!pt ? 'Sin probar' : pt.ok ? 'Respondió en la última prueba' : 'Falló en la última prueba'} />
                  <span className="flex-1 min-w-0">
                    <span className="block t-footnote font-medium text-on-surface truncate">{p.name}</span>
                    <span className="block text-[11px] font-mono text-on-surface-variant truncate">{p.server}</span>
                  </span>
                  {p.tag && <EnvChip tag={p.tag} />}
                  {on && <Check size={13} className="text-primary shrink-0" />}
                </button>
              )
            })}
            <div className="h-px bg-(--hairline) my-1" />
            <button type="button" onClick={() => { setSwitcher(false); onNew() }} className="flex items-center gap-2.5 px-2 h-8 rounded-[8px] t-footnote text-on-surface hover:bg-on-surface/5">
              <Plus size={14} className="text-on-surface-variant" /> Nueva conexión
            </button>
            <button type="button" onClick={() => { setSwitcher(false); setInfoOpen((v) => !v) }} className="flex items-center gap-2.5 px-2 h-8 rounded-[8px] t-footnote text-on-surface hover:bg-on-surface/5">
              <ChevronRight size={14} className={`text-on-surface-variant transition-transform ${infoOpen ? 'rotate-90' : ''}`} /> {infoOpen ? 'Ocultar detalles' : 'Detalles, probar y editar'}
            </button>
          </div>
        )}
        {infoOpen && (
          <div className="mt-2.5 flex flex-col gap-1.5">
            <dl className="grid grid-cols-[64px_1fr] gap-x-2 gap-y-1.5 t-caption rounded-[10px] bg-on-surface/3 px-2.5 py-2 mt-1">
              <dt className="text-on-surface-variant">Servidor</dt><dd className="font-mono text-on-surface break-all">{profile.server}</dd>
              <dt className="text-on-surface-variant">Base</dt><dd className="font-mono text-on-surface">{database || profile.database || '(predeterminada)'}</dd>
              <dt className="text-on-surface-variant">Acceso</dt><dd className="text-on-surface">{profile.auth === 'windows' ? 'Windows' : <span className="font-mono">{profile.user}</span>}{profile.auth === 'sql' && !profile.hasPassword && <span className="text-warning"> · sin contraseña</span>}</dd>
              {t?.serverName && <><dt className="text-on-surface-variant">Instancia</dt><dd className="font-mono text-on-surface break-all">{t.serverName}</dd></>}
              {t?.version && <><dt className="text-on-surface-variant">Versión</dt><dd className="font-mono text-on-surface">SQL Server {t.version}</dd></>}
              {t && (
                <><dt className="text-on-surface-variant">Prueba</dt>
                  <dd title={t.ok ? undefined : t.detail}>
                    <span className={`inline-flex items-center gap-1.5 ${t.ok ? 'text-success' : 'text-error'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${t.ok ? 'bg-success' : 'bg-error'}`} />
                      {t.ok ? `Conecta${t.ms != null ? ` · ${t.ms} ms` : ''}` : friendlyError(t.detail, null).title === 'Algo falló' ? 'No conecta' : friendlyError(t.detail, null).title}
                    </span>
                  </dd></>
              )}
            </dl>
            <div className="flex items-center gap-1.5 mt-1 px-0.5" role="radiogroup" aria-label="Color de la conexión">
              <span className="t-caption text-on-surface-variant mr-1">Color</span>
              <button type="button" role="radio" aria-checked={!color} title="Sin color (el del ambiente)" onClick={() => setConnColor(profile.id, null)}
                className={`w-4 h-4 rounded-full ring-1 ring-on-surface/25 bg-[linear-gradient(135deg,transparent_45%,rgb(var(--c-on-surface)/0.4)_47%,rgb(var(--c-on-surface)/0.4)_53%,transparent_55%)] ${!color ? 'outline-2 outline-offset-1 outline-primary' : ''}`} />
              {CONN_COLORS.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={color === c} title="Usar este color para la conexión" onClick={() => setConnColor(profile.id, c)}
                  className={`w-4 h-4 rounded-full transition-transform hover:scale-110 ${color === c ? 'outline-2 outline-offset-1 outline-primary' : ''}`} style={{ background: c }} />
              ))}
            </div>
            <div className="flex gap-1.5 mt-1">
              <button type="button" className="ui-btn ui-btn-outline ui-btn-sm flex-1" onClick={() => void testNow()} disabled={testing}>
                <Activity size={12} className={testing ? 'animate-pulse' : ''} /> {testing ? 'Probando…' : 'Probar conexión'}
              </button>
              <button type="button" className="ui-btn ui-btn-outline ui-btn-sm flex-1" onClick={() => fix('edit')}><Pencil size={12} /> Editar</button>
            </div>
          </div>
        )}
      </div>

      {/* Buscar */}
      <div className="flex items-center gap-1 px-2 py-2 hairline-b">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar objeto…" spellCheck={false}
            onKeyDown={(e) => { if (e.key === 'Escape' && q) { e.stopPropagation(); setQ('') } }}
            className="ui-input w-full h-[28px] pl-8 pr-7 text-[12px]" />
          {q && (
            <button type="button" onClick={() => setQ('')} aria-label="Limpiar"
              className="absolute right-1 top-1/2 -translate-y-1/2 grid place-items-center w-5 h-5 rounded-[5px] text-on-surface-variant hover:bg-on-surface/8"><X size={11} /></button>
          )}
        </div>
        <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon" title="Recargar objetos" onClick={() => void load(true)} disabled={loading}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Árbol */}
      <div className="flex-1 min-h-0 overflow-y-auto py-1 text-[12.5px]">
        {error && (() => {
          const fe = friendlyError(error.text, error.problem)
          const Icon = error.problem === 'auth' ? KeyRound : error.problem ? Unplug : CircleAlert
          return (
            <div className="mx-3 my-3 rounded-(--r-lg) ring-1 ring-error/20 bg-error/[0.05] px-4 pt-4 pb-3 flex flex-col items-center text-center">
              <Mascot pose="atencion" size={72} once className="mb-1.5" fallback={
                <span className="grid place-items-center w-10 h-10 rounded-[12px] bg-error/12 text-error mb-2.5"><Icon size={18} /></span>
              } />
              <p className="t-body font-semibold text-on-surface">{fe.title}</p>
              <p className="t-caption text-on-surface-variant mt-0.5">{fe.hint}</p>
              <div className="flex flex-col gap-1.5 w-full mt-3">
                {error.problem && (
                  <button type="button" className="ui-btn ui-btn-primary ui-btn-sm w-full" onClick={() => fix(error.problem!, error.text)}>
                    {error.problem === 'auth' ? <><KeyRound size={12} /> Poner la nueva contraseña</> : <><Server size={12} /> Corregir la conexión</>}
                  </button>
                )}
                <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm w-full" onClick={() => void load(true)} disabled={loading}>
                  <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Reintentar
                </button>
              </div>
              <button type="button" onClick={() => setShowDetail((v) => !v)} className="mt-1.5 t-caption text-on-surface-variant/80 hover:text-on-surface underline-offset-2 hover:underline">
                {showDetail ? 'Ocultar detalle' : 'Ver detalle'}
              </button>
              {showDetail && <p className="mt-1.5 w-full rounded-[8px] bg-on-surface/5 px-2.5 py-2 text-left font-mono text-[11px] leading-[16px] text-on-surface-variant break-words">{error.text}</p>}
            </div>
          )
        })()}
        {loading && !objects && (
          <div className="px-3 py-2 flex flex-col gap-2.5" aria-busy="true" aria-label="Leyendo objetos…">
            {[62, 48, 70, 55, 40, 66, 52, 44, 58].map((w, i) => (
              <div key={i} className="flex items-center gap-2" style={{ paddingLeft: i % 4 === 0 ? 0 : 14, opacity: 1 - i * 0.07 }}>
                <Skeleton className="w-3.5 h-3.5 rounded-[4px] shrink-0" />
                <Skeleton className="h-2.5" style={{ width: `${w}%` }} />
              </div>
            ))}
          </div>
        )}
        {objects && groups.length === 0 && (
          <div className="px-4 py-6 text-center">
            <Database size={22} className="mx-auto text-on-surface-variant/50" />
            <p className="t-footnote text-on-surface mt-2">{database ? `${database} no tiene objetos propios` : 'Estás en la base predeterminada'}</p>
            <p className="t-caption text-on-surface-variant mt-0.5">Elegí una base arriba, junto a la conexión.</p>
          </div>
        )}
        {objects && !f && (() => {
          const favs = favoritesFor(profile.id, database)
          const recents = recentFor(profile.id, database).filter((r) => !favs.some((x) => x.schema === r.schema && x.name === r.name))
          if (!favs.length && !recents.length) return null
          const row = (r: ObjectRef, kind: 'fav' | 'recent'): JSX.Element | null => {
            const o = resolve(r)
            if (!o) return null
            const Icon = TYPE_ICON[o.type]
            return (
              <div key={`${kind}-${o.id}`} role="treeitem" tabIndex={0} onClick={() => primary(o)} onContextMenu={(e) => objectMenu(e, o)}
                onKeyDown={(e) => { if (e.key === 'Enter') primary(o) }}
                title={`${o.schema}.${o.name}\nClic: ${o.type === 'U' || o.type === 'V' ? 'ver 100 filas' : 'abrir definición'}`}
                className="group flex items-center gap-1.5 h-[26px] pl-5 pr-2 cursor-pointer hover:bg-on-surface/5 focus-visible:bg-primary/10 outline-hidden">
                <Icon size={13} className={`shrink-0 ${TYPE_COLOR[o.type]}`} />
                <span className="flex-1 min-w-0 truncate text-on-surface">{o.schema !== 'dbo' && <span className="text-on-surface-variant">{o.schema}.</span>}{o.name}</span>
                {kind === 'fav' && (
                  <button type="button" aria-label="Quitar de favoritos" title="Quitar de favoritos" onClick={(e) => { e.stopPropagation(); toggleFavorite(refOf(o)) }}
                    className="grid place-items-center w-5 h-5 rounded-[5px] text-warning hover:bg-on-surface/8"><Star size={11} weight="fill" /></button>
                )}
              </div>
            )
          }
          return (
            <div className="pb-1 mb-1 hairline-b">
              {favs.length > 0 && <div className="flex items-center gap-1.5 h-[26px] px-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-on-surface-variant"><Star size={11} weight="fill" className="text-warning" /> Favoritos</div>}
              {favs.map((r) => row(r, 'fav'))}
              {recents.length > 0 && <div className="flex items-center gap-1.5 h-[26px] px-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-on-surface-variant"><Clock size={11} /> Recientes</div>}
              {recents.map((r) => row(r, 'recent'))}
            </div>
          )
        })()}
        {groups.map((g) => {
          const open = isOpen(g.id, g.shown.length)
          return (
            <div key={g.id}>
              <button type="button" onClick={() => toggleGroup(g.id)} aria-expanded={open}
                className="sticky top-0 z-10 w-full flex items-center gap-1.5 h-[28px] px-2 text-left bg-surface hover:bg-surface-container-low">
                <ChevronRight size={12} className={`text-on-surface-variant transition-transform ${open ? 'rotate-90' : ''}`} />
                {(() => { const GI = TYPE_ICON[g.types[0]!]; return <GI size={14} className={`shrink-0 ${TYPE_COLOR[g.types[0]!]}`} /> })()}
                <span className="flex-1 font-semibold text-on-surface">{g.label}</span>
                <span className="t-caption tabular-nums text-on-surface-variant px-1.5 rounded-[5px] bg-on-surface/5">{f ? `${g.shown.length}/${g.total}` : g.total.toLocaleString('es-AR')}</span>
              </button>
              {open && g.shown.slice(0, PER_GROUP).map((o, idx) => {
                const Icon = TYPE_ICON[o.type]
                const c = children[o.id]
                return (
                  <div key={o.id} className="stagger-in" style={{ '--i': idx } as React.CSSProperties}>
                    <div role="treeitem" aria-expanded={!!c} tabIndex={0}
                      onClick={() => toggleObject(o)} onDoubleClick={() => primary(o)} onContextMenu={(e) => objectMenu(e, o)}
                      onKeyDown={(e) => { if (e.key === 'Enter') primary(o); if (e.key === ' ') { e.preventDefault(); toggleObject(o) } }}
                      title={`${o.schema}.${o.name}${o.parent ? `\nEn ${o.parent}` : ''}\nModificado ${o.modified}\nDoble clic: ${o.type === 'U' || o.type === 'V' ? 'ver 100 filas' : 'abrir definición'} · Clic derecho: más`}
                      className="group flex items-center gap-1.5 h-[26px] pl-5 pr-2 cursor-pointer hover:bg-on-surface/5 focus-visible:bg-primary/10 outline-hidden">
                      <ChevronRight size={10} className={`shrink-0 text-on-surface-variant/70 transition-transform ${c ? 'rotate-90' : ''} ${o.type === 'SN' || o.type === 'TR' ? 'invisible' : ''}`} />
                      <Icon size={13} className={`shrink-0 ${TYPE_COLOR[o.type]}`} />
                      <span className="flex-1 min-w-0 truncate text-on-surface">
                        {o.schema !== 'dbo' && <span className="text-on-surface-variant">{o.schema}.</span>}{o.name}
                      </span>
                      {o.rows != null && <span className="t-caption tabular-nums text-on-surface-variant/70 shrink-0">{compact(o.rows)}</span>}
                      {(() => {
                        const fav = isFavorite(refOf(o))
                        return (
                          <button type="button" aria-label={fav ? 'Quitar de favoritos' : 'Agregar a favoritos'} title={fav ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                            onClick={(e) => { e.stopPropagation(); toggleFavorite(refOf(o)) }}
                            className={`grid place-items-center w-5 h-5 rounded-[5px] shrink-0 hover:bg-on-surface/8 ${fav ? 'text-warning' : 'text-on-surface-variant opacity-0 group-hover:opacity-100'}`}>
                            <Star size={11} weight={fav ? 'fill' : 'regular'} />
                          </button>
                        )
                      })()}
                    </div>
                    {c === 'loading' && <div className="pl-12 pr-4 py-1.5 flex flex-col gap-1.5" aria-busy="true">{[70, 55, 62].map((w) => <Skeleton key={w} className="h-2.5" style={{ width: `${w}%` }} />)}</div>}
                    {c && c !== 'loading' && 'error' in c && <p className="pl-12 pr-2 py-1 t-caption text-error">{c.error}</p>}
                    {c && c !== 'loading' && !('error' in c) && (
                      <>
                        {c.params.map((p) => (
                          <button key={`p-${p.name}`} type="button" onClick={() => onInsert(p.name)} title="Insertar en el editor"
                            className="w-full flex items-center gap-1.5 h-[24px] pl-12 pr-2 text-left hover:bg-on-surface/5">
                            <AtSign size={11} className="shrink-0 text-on-surface-variant/70" />
                            <span className="min-w-0 truncate font-mono text-[11.5px] text-on-surface">{p.name.replace(/^@/, '')}</span>
                            <span className="ml-auto pl-2 shrink-0 font-mono text-[11px] text-on-surface-variant">{p.type}{p.output ? ' out' : ''}</span>
                          </button>
                        ))}
                        {(o.type !== 'P' && o.type !== 'FN') && c.columns.map((col) => (
                          <button key={`c-${col.name}`} type="button" onClick={() => onInsert(col.name)}
                            title={`${col.name} ${col.type}${col.identity ? ' IDENTITY' : ''}${col.nullable ? ' NULL' : ' NOT NULL'}${col.default ? `\nDefault ${col.default}` : ''}\nClic: insertar en el editor`}
                            className="w-full flex items-center gap-1.5 h-[24px] pl-12 pr-2 text-left hover:bg-on-surface/5">
                            {col.pk ? <KeyRound size={11} className="shrink-0 text-warning" /> : <span className="w-[11px] grid place-items-center shrink-0"><span className="w-1 h-1 rounded-full bg-on-surface-variant/50" /></span>}
                            <span className="min-w-0 truncate font-mono text-[11.5px] text-on-surface">{col.name}</span>
                            <span className="ml-auto pl-2 shrink-0 font-mono text-[11px] text-on-surface-variant">{col.type}{col.nullable ? '' : ' ·nn'}</span>
                          </button>
                        ))}
                        {c.params.length === 0 && (o.type === 'P' || o.type === 'FN') && <p className="pl-12 h-[24px] t-caption text-on-surface-variant">Sin parámetros</p>}
                      </>
                    )}
                  </div>
                )
              })}
              {open && g.shown.length > PER_GROUP && (
                <p className="pl-9 pr-2 py-1.5 t-caption text-on-surface-variant">y {(g.shown.length - PER_GROUP).toLocaleString('es-AR')} más: escribí para filtrar</p>
              )}
            </div>
          )
        })}
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  )
}
