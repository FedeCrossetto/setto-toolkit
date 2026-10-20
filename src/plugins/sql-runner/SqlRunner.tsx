import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CircleAlert, Clock, Columns2, History, PanelLeft, Play, Plus, RotateCcw, Server, ShieldCheck, ShieldAlert, Square, X,
} from 'lucide-react'
import { useApp, useModuleSubtitle } from '../../core/AppContext'
import { useModulePrimaryAction } from '../../core/module-actions'
import { Sheet, useConfirm } from '../../core/components/Modal'
import { EmptyState } from '../../core/components/EmptyState'
import { useToast } from '../../core/components/Toast'
import { CodeEditor } from '../file-editor/components/CodeEditor'
import { useEditorPrefs } from '../file-editor/hooks/useEditorPrefs'
import { resolveEditorTheme } from '../file-editor/themes/registry'
import { presetCodeThemes, useAppearance } from '../../core/hooks/useThemePalette'
import type { EditorHandle } from '../file-editor/types'
import type { SqlProfile } from '../connections/sql'
import { findRisks, tabTitle } from './sql-text'
import type { QueryHistoryEntry, QueryResult, QueryTab, QueryTabsState } from './types'
import { ResultGrid } from './ResultGrid'
import { CompareView } from './CompareView'
import { DatabaseSelect, ProfileSelect } from './ProfileSelect'
import { ConnectionFixDialog, type FixRequest } from './ConnectionFixDialog'
import { ObjectExplorer, type OpenScript } from './ObjectExplorer'
import { connectionProblem } from './sql-meta'
import { envTone, SqlServerIcon, TONE } from './env'

/**
 * Consultas: SQL contra las conexiones de Conexiones → Bases de datos.
 *
 * Lo que le falta a SSMS: las pestañas se guardan solas mientras escribís (sobreviven a
 * cerrar Setto), cerrar una no la borra (Ctrl+Shift+T la reabre) y todo lo ejecutado
 * queda en el historial. Por defecto corre en modo lectura (transacción con rollback).
 */
const SAVE_DELAY_MS = 400
const RATIO_KEY = 'sql-runner:editor-ratio'
const EXPLORER_KEY = 'sql-runner:explorer'

interface RunState { runId: string; running: boolean; startedAt: number; result: QueryResult | null; view: number | 'messages' }

const newTab = (n: number, profileId: string | null): QueryTab => ({
  id: crypto.randomUUID(), title: `Consulta ${n}`, sql: '', profileId, database: '', readOnly: true, updatedAt: Date.now(),
})
const cleanErr = (e: unknown): string => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`
  return `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`
}

export function SqlRunner(): JSX.Element {
  const { state, dispatch } = useApp()
  const toast = useToast()
  const confirm = useConfirm()
  const [profiles, setProfiles] = useState<SqlProfile[] | null>(null)
  const [tabsState, setTabsState] = useState<QueryTabsState | null>(null)
  const [runs, setRuns] = useState<Record<string, RunState>>({})
  const [mode, setMode] = useState<'query' | 'compare'>('query')
  const [historyOpen, setHistoryOpen] = useState(false)
  /** Pestaña que se está renombrando (doble clic). */
  const [renaming, setRenaming] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const [ratio, setRatio] = useState(() => { try { return Number(localStorage.getItem(RATIO_KEY)) || 0.45 } catch { return 0.45 } })
  const editorRef = useRef<EditorHandle | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  /** Conexión que no anda: popup para poner la nueva contraseña o IP */
  const [fix, setFix] = useState<FixRequest | null>(null)
  const [explorerOpen, setExplorerOpen] = useState(() => { try { return localStorage.getItem(EXPLORER_KEY) !== '0' } catch { return true } })
  const [databases, setDatabases] = useState<string[]>([])
  /** Pestaña recién abierta desde el explorador que hay que ejecutar ("Seleccionar 100 filas") */
  const pendingRun = useRef<string | null>(null)

  // ── Editor: mismo tema y fuente que el Editor de archivos ──
  const { prefs } = useEditorPrefs()
  const appDark = state.theme === 'dark'
  const appearance = useAppearance()
  const presetEditor = prefs.colorScheme === 'setto' ? presetCodeThemes(appearance, appDark)?.editor ?? null : null
  const theme = useMemo(() => resolveEditorTheme(presetEditor ?? prefs.colorScheme, prefs.editorTheme, appDark),
    [presetEditor, prefs.colorScheme, prefs.editorTheme, appDark, appearance])

  // ── Carga ──
  const loadProfiles = useCallback(async () => {
    try { setProfiles(await window.api.invoke<SqlProfile[]>('sql:list')) } catch { setProfiles([]) }
  }, [])
  useEffect(() => {
    void loadProfiles()
    void window.api.invoke<QueryTabsState | null>('sql:tabs-get').then((s) => {
      if (s && s.tabs?.length) setTabsState({ tabs: s.tabs, activeId: s.activeId ?? s.tabs[0]!.id, closed: s.closed ?? [] })
      else { const t = newTab(1, null); setTabsState({ tabs: [t], activeId: t.id, closed: [] }) }
    }).catch(() => { const t = newTab(1, null); setTabsState({ tabs: [t], activeId: t.id, closed: [] }) })
  }, [loadProfiles])
  // Volver al módulo: refrescar conexiones (se pueden haber agregado en Conexiones).
  const active = state.activeTabId === 'sql-runner'
  useEffect(() => { if (active) void loadProfiles() }, [active, loadProfiles])

  // ── Guardado automático (nunca se pierde lo escrito) ──
  const persist = useCallback((s: QueryTabsState) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { void window.api.invoke('sql:tabs-save', s).catch(() => undefined) }, SAVE_DELAY_MS)
  }, [])
  const update = useCallback((fn: (s: QueryTabsState) => QueryTabsState) => {
    setTabsState((prev) => { if (!prev) return prev; const next = fn(prev); persist(next); return next })
  }, [persist])
  // Al salir de la ventana o recargar: guardar ya.
  useEffect(() => {
    const flush = (): void => { if (saveTimer.current && tabsState) { clearTimeout(saveTimer.current); void window.api.invoke('sql:tabs-save', tabsState) } }
    window.addEventListener('beforeunload', flush)
    return () => window.removeEventListener('beforeunload', flush)
  }, [tabsState])

  const tab = tabsState?.tabs.find((t) => t.id === tabsState.activeId) ?? tabsState?.tabs[0] ?? null
  const run = tab ? runs[tab.id] : undefined
  const defaultProfile = profiles?.[0]?.id ?? null
  const profile = profiles?.find((p) => p.id === (tab?.profileId ?? defaultProfile)) ?? null

  const patchTab = (id: string, patch: Partial<QueryTab>): void => update((s) => ({
    ...s, tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: Date.now() } : t)),
  }))
  const addTab = (init?: Partial<QueryTab>): void => update((s) => {
    const t = { ...newTab(s.tabs.length + 1, init?.profileId ?? tab?.profileId ?? defaultProfile), ...init }
    if (init?.sql && !init.title) t.title = tabTitle(init.sql, t.title)
    return { ...s, tabs: [...s.tabs, t], activeId: t.id }
  })
  const closeTab = (id: string): void => update((s) => {
    const t = s.tabs.find((x) => x.id === id)
    const rest = s.tabs.filter((x) => x.id !== id)
    const closed = t && t.sql.trim() ? [t, ...s.closed.filter((x) => x.id !== id)].slice(0, 30) : s.closed
    if (!rest.length) { const n = newTab(1, t?.profileId ?? defaultProfile); return { tabs: [n], activeId: n.id, closed } }
    const idx = s.tabs.findIndex((x) => x.id === id)
    return { tabs: rest, closed, activeId: s.activeId === id ? rest[Math.max(0, idx - 1)]!.id : s.activeId }
  })
  const reopen = (id?: string): void => update((s) => {
    const t = id ? s.closed.find((x) => x.id === id) : s.closed[0]
    if (!t) return s
    return { tabs: [...s.tabs, t], activeId: t.id, closed: s.closed.filter((x) => x.id !== t.id) }
  })

  // ── Ejecutar ──
  const execute = async (): Promise<void> => {
    if (!tab || !profile || run?.running) return
    const sel = editorRef.current?.getSelection?.()
    const text = sel?.text.trim() ? sel.text : tab.sql
    const lineOffset = sel?.text.trim() ? sel.fromLine - 1 : 0
    if (!text.trim()) return
    if (!tab.readOnly) {
      const risks = findRisks(text)
      if (risks.length) {
        const ok = await confirm({
          title: `¿Ejecutar con ${risks.map((r) => r.label).join(', ')}?`,
          message: `Modo lectura apagado: se aplica de verdad en ${profile.name}${tab.database || profile.database ? ` · ${tab.database || profile.database}` : ''}.`,
          confirmLabel: 'Ejecutar', destructive: true,
        })
        if (!ok) return
      }
    }
    const runId = crypto.randomUUID()
    setRuns((r) => ({ ...r, [tab.id]: { runId, running: true, startedAt: Date.now(), result: null, view: 0 } }))
    let result: QueryResult
    try {
      result = await window.api.invoke<QueryResult>('sql:query', { runId, profileId: profile.id, database: tab.database, sql: text, readOnly: tab.readOnly })
    } catch (e) {
      result = { ok: false, error: cleanErr(e), sets: [], messages: [], ms: Date.now() - (runs[tab.id]?.startedAt ?? Date.now()) }
    }
    if (typeof result.line === 'number') result.line += lineOffset
    const problem = connectionProblem(result)
    if (problem) setFix({ profileId: profile.id, reason: problem, error: result.error, retry: () => void executeRef.current() })
    setRuns((r) => ({ ...r, [tab.id]: { runId, running: false, startedAt: r[tab.id]?.startedAt ?? Date.now(), result, view: result.sets.length ? 0 : 'messages' } }))
    if (!tab.named) { const t = tabTitle(tab.sql, tab.title); if (t !== tab.title) patchTab(tab.id, { title: t }) }
  }
  const cancel = (): void => { if (run?.running) void window.api.invoke('sql:cancel', run.runId) }

  // F5 ejecuta con el módulo a la vista aunque el foco esté en otro lado (p. ej. la barra lateral).
  const executeRef = useRef(execute)
  executeRef.current = execute
  useEffect(() => {
    if (!active || mode !== 'query') return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'F5' || e.defaultPrevented) return
      e.preventDefault()
      void executeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, mode])

  // Explorador: abrir un script en una pestaña nueva (y ejecutarlo si corresponde).
  const openScript = (s: OpenScript): void => {
    const id = crypto.randomUUID()
    if (s.run) pendingRun.current = id
    addTab({ id, title: s.title, sql: s.sql, named: true, profileId: profile?.id ?? null, database: tab?.database ?? '' })
  }
  useEffect(() => {
    if (tab && pendingRun.current === tab.id) { pendingRun.current = null; void executeRef.current() }
  }, [tab])
  const toggleExplorer = (): void => setExplorerOpen((v) => { try { localStorage.setItem(EXPLORER_KEY, v ? '0' : '1') } catch { /* nada */ } return !v })

  // Bases del servidor, para elegir sin escribir.
  const profileId = profile?.id
  useEffect(() => {
    setDatabases([])
    if (!profileId) return
    let alive = true
    void window.api.invoke<QueryResult>('sql:meta', { profileId, kind: 'databases' })
      .then((r) => { if (alive && r.ok) setDatabases((r.sets[0]?.rows ?? []).map((x) => x[0] ?? '').filter(Boolean)) })
      .catch(() => undefined)
    return () => { alive = false }
  }, [profileId])

  const onFixed = (p: SqlProfile, retry?: () => void): void => {
    setFix(null)
    toast.show(`${p.name}: conexión actualizada`, 'success')
    void loadProfiles().then(() => retry?.())
  }

  // Reloj mientras corre.
  useEffect(() => {
    if (!run?.running) return
    const t = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(t)
  }, [run?.running])

  // ── Barra superior ──
  useModulePrimaryAction('sql-runner', { label: 'Nueva consulta', title: 'Nueva consulta (Ctrl+T)' }, () => { setMode('query'); addTab() })
  useModuleSubtitle('sql-runner', mode === 'compare' ? 'Comparar entre conexiones' : profile ? `${profile.name}${tab?.database || profile.database ? ` · ${tab?.database || profile.database}` : ''}` : null)

  // ── Teclado ──
  const onKeyDownCapture = (e: React.KeyboardEvent): void => {
    if (mode !== 'query') return
    const ctrl = e.ctrlKey || e.metaKey
    if (e.key === 'F5' || (ctrl && e.key === 'Enter')) { e.preventDefault(); void execute(); return }
    if (e.key === 'Escape' && run?.running) { e.preventDefault(); cancel(); return }
    if (ctrl && e.shiftKey && e.key.toLowerCase() === 't') { e.preventDefault(); reopen(); return }
    if (ctrl && !e.shiftKey && e.key.toLowerCase() === 't') { e.preventDefault(); addTab(); return }
    if (ctrl && e.key.toLowerCase() === 'w' && tab) { e.preventDefault(); closeTab(tab.id) }
  }

  // ── Divisor editor / resultados ──
  const startDrag = (e: React.PointerEvent): void => {
    const box = bodyRef.current?.getBoundingClientRect()
    if (!box) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent): void => setRatio(Math.min(0.85, Math.max(0.15, (ev.clientY - box.top) / box.height)))
    const up = (): void => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      setRatio((r) => { try { localStorage.setItem(RATIO_KEY, String(r)) } catch { /* nada */ } return r })
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  if (!tabsState || profiles === null) return <div className="h-full" />

  if (profiles.length === 0) {
    return (
      <div className="h-full grid place-items-center">
        <EmptyState icon={Server} title="Primero, una conexión"
          description="Guardá tus servidores en Conexiones → Bases de datos (Main, LPS, QA…) y ejecutá consultas acá, sin perder nunca lo que escribiste."
          action={<button className="ui-btn ui-btn-primary" onClick={() => dispatch({ type: 'OPEN_TAB', pluginId: 'connections' })}>Ir a Conexiones</button>} />
      </div>
    )
  }

  const result = run?.result ?? null
  const elapsed = run?.running ? now - run.startedAt : result?.ms ?? 0

  return (
    <div className="flex flex-col h-full min-h-0 bg-background" onKeyDownCapture={onKeyDownCapture}>
      {/* Pestañas + modo */}
      <div className="flex items-center gap-1 px-2 h-[42px] hairline-b bg-surface shrink-0">
        {mode === 'query' ? (
          <div className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto scrollbar-hide">
            {tabsState.tabs.map((t) => {
              const on = t.id === tab?.id
              const r = runs[t.id]
              return (
                <div key={t.id} role="tab" aria-selected={on} onClick={() => update((s) => ({ ...s, activeId: t.id }))}
                  onAuxClick={(e) => { if (e.button === 1) closeTab(t.id) }}
                  onDoubleClick={() => setRenaming(t.id)}
                  title={`${t.title}\nDoble clic: renombrar · Clic medio: cerrar`}
                  className={`group shrink-0 flex items-center gap-1.5 h-[30px] pl-3 pr-1.5 rounded-[9px] text-[12.5px] cursor-pointer transition-colors max-w-[220px] ${
                    on ? 'nav-active text-on-surface font-medium' : 'border border-transparent text-on-surface-variant hover:text-on-surface hover:bg-on-surface/5'}`}>
                  {r?.running && <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0" />}
                  {r?.result && !r.running && !r.result.ok && <span className="w-1.5 h-1.5 rounded-full bg-error shrink-0" />}
                  {!r?.running && !(r?.result && !r.result.ok) && (() => {
                    const tp = profiles.find((p) => p.id === (t.profileId ?? defaultProfile))
                    const tone = envTone(tp?.tag)
                    return !TONE[tone].dot ? null : <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${TONE[tone].dot}`} title={tp?.tag} />
                  })()}
                  {renaming === t.id ? (
                    <input autoFocus defaultValue={t.title} onClick={(e) => e.stopPropagation()}
                      onBlur={(e) => { const v = e.target.value.trim(); if (v) patchTab(t.id, { title: v, named: true }); setRenaming(null) }}
                      onKeyDown={(e) => {
                        e.stopPropagation()
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                        if (e.key === 'Escape') setRenaming(null)
                      }}
                      className="w-[130px] bg-transparent outline-hidden text-[12.5px] text-on-surface border-b border-primary/50" />
                  ) : <span className="truncate">{t.title}</span>}
                  <button type="button" aria-label="Cerrar" title="Cerrar (Ctrl+W) — se puede reabrir"
                    onClick={(e) => { e.stopPropagation(); closeTab(t.id) }}
                    className={`grid place-items-center w-5 h-5 rounded-[5px] hover:bg-on-surface/10 ${on ? '' : 'opacity-0 group-hover:opacity-100'}`}>
                    <X size={11} />
                  </button>
                </div>
              )
            })}
            <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon shrink-0" title="Nueva consulta (Ctrl+T)" onClick={() => addTab()}><Plus size={14} /></button>
          </div>
        ) : <div className="flex-1" />}
        {mode === 'query' && tabsState.closed.length > 0 && (
          <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm shrink-0" title={`Reabrir "${tabsState.closed[0]!.title}" (Ctrl+Shift+T)`} onClick={() => reopen()}>
            <RotateCcw size={12} /> Reabrir
          </button>
        )}
        <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm shrink-0" onClick={() => setHistoryOpen(true)} title="Historial y pestañas cerradas">
          <History size={13} /> Historial
        </button>
        <div className="flex items-center p-[3px] rounded-[9px] bg-on-surface/5 shrink-0">
          {([['query', 'Consultas'], ['compare', 'Comparar']] as const).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setMode(id)} aria-pressed={mode === id}
              className={`h-[24px] px-3 rounded-[7px] text-[12px] font-medium transition-colors ${mode === id ? 'bg-surface text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}>
              {id === 'compare' && <Columns2 size={11} className="inline -mt-px mr-1" />}{label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'compare' ? <CompareView profiles={profiles} onFix={setFix} /> : tab && (
        <div className="flex-1 min-h-0 flex">
          {explorerOpen && profile && (
            <aside className="w-[272px] shrink-0 hairline-r bg-surface min-h-0">
              <ObjectExplorer profile={profile} database={tab.database.trim() || profile.database}
                onOpen={openScript} onInsert={(t) => editorRef.current?.insertText?.(t)}
                onFix={setFix} onTested={() => void loadProfiles()} />
            </aside>
          )}
          <div className="flex-1 min-w-0 flex flex-col">
          {/* Conexión, base, modo lectura y ejecutar */}
          <div className="relative flex items-center gap-2 px-3 h-[46px] hairline-b bg-surface shrink-0">
            {TONE[envTone(profile?.tag)].bar && <span aria-hidden className={`pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-linear-to-r ${TONE[envTone(profile?.tag)].bar} via-transparent to-transparent`} />}
            <button type="button" onClick={toggleExplorer} aria-pressed={explorerOpen} title={explorerOpen ? 'Ocultar el explorador de objetos' : 'Mostrar el explorador de objetos'}
              className={`ui-btn ui-btn-ghost ui-btn-icon ${explorerOpen ? 'text-primary' : ''}`}><PanelLeft size={15} /></button>
            <ProfileSelect profiles={profiles} value={profile?.id ?? null} onChange={(id) => { if (id !== profile?.id) patchTab(tab.id, { profileId: id, database: '' }) }} />
            <DatabaseSelect value={tab.database} fallback={profile?.database ?? ''} databases={databases} onChange={(db) => patchTab(tab.id, { database: db })} />
            <button type="button" onClick={() => patchTab(tab.id, { readOnly: !tab.readOnly })}
              title={tab.readOnly ? 'Modo lectura: lo que cambies se deshace al final (rollback). Clic para apagarlo.' : 'Modo lectura apagado: los cambios se aplican. Clic para encenderlo.'}
              className={`flex items-center gap-1.5 h-[30px] px-3 rounded-[8px] border text-[12px] font-medium transition-colors ${
                tab.readOnly ? 'border-success/35 text-success bg-success/8' : 'border-warning/45 text-warning bg-warning/10'}`}>
              {tab.readOnly ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}
              {tab.readOnly ? 'Solo lectura' : 'Escritura'}
            </button>
            <span className="flex-1" />
            {(run?.running || result) && (
              <span className="flex items-center gap-1.5 t-footnote text-on-surface-variant tabular-nums">
                <Clock size={12} /> {fmtMs(elapsed)}
              </span>
            )}
            {run?.running ? (
              <button type="button" className="ui-btn ui-btn-outline" onClick={cancel} title="Cancelar (Esc)"><Square size={12} /> Cancelar</button>
            ) : (
              <button type="button" className="ui-btn ui-btn-run" onClick={() => void execute()} disabled={!profile || !tab.sql.trim()} title="Ejecutar (F5 o Ctrl+Enter) — si hay texto seleccionado, sólo eso">
                <Play size={13} /> Ejecutar
              </button>
            )}
          </div>

          <div ref={bodyRef} className="flex-1 min-h-0 flex flex-col">
            {/* Editor */}
            <div className="min-h-0 overflow-hidden" style={{ flexBasis: `${ratio * 100}%`, flexShrink: 0 }}>
              <CodeEditor key={tab.id} content={tab.sql} language="sql" theme={theme}
                fontSize={prefs.fontSize} fontFamily={prefs.fontFamily} wordWrap={false}
                editorRef={editorRef}
                onChange={(v) => patchTab(tab.id, { sql: v })} />
            </div>
            {/* Divisor */}
            <div role="separator" aria-orientation="horizontal" onPointerDown={startDrag}
              className="h-[6px] -my-[3px] relative z-10 cursor-row-resize group shrink-0">
              <div className="absolute inset-x-0 top-[2.5px] h-px bg-(--hairline-strong) group-hover:bg-primary/60 transition-colors" />
            </div>
            {/* Resultados */}
            <div className="flex-1 min-h-0 flex flex-col bg-surface">
              <Results run={run} onGotoLine={(l) => editorRef.current?.focusLine?.(l)}
                onView={(v) => setRuns((r) => (r[tab.id] ? { ...r, [tab.id]: { ...r[tab.id]!, view: v } } : r))}
                name={tab.title} />
            </div>
          </div>
          <StatusBar profile={profile} database={tab.database.trim() || profile?.database || ''} readOnly={tab.readOnly} run={run} elapsed={elapsed} />
          </div>
        </div>
      )}

      <ConnectionFixDialog request={fix} profiles={profiles} onClose={() => setFix(null)} onSaved={onFixed} />

      <HistorySheet open={historyOpen} onClose={() => setHistoryOpen(false)} closed={tabsState.closed}
        onReopen={(id) => { reopen(id); setMode('query'); setHistoryOpen(false) }}
        onOpen={(h) => { addTab({ sql: h.sql, profileId: h.profileId, database: h.database === profiles.find((p) => p.id === h.profileId)?.database ? '' : h.database }); setMode('query'); setHistoryOpen(false) }}
        onCleared={() => toast.show('Historial borrado', 'info')} />
    </div>
  )
}

function Results({ run, onGotoLine, onView, name }: {
  run: RunState | undefined
  onGotoLine: (line: number) => void
  onView: (v: number | 'messages') => void
  name: string
}): JSX.Element {
  if (!run) {
    return (
      <div className="flex-1 grid place-items-center px-6 text-center">
        <div className="flex flex-col items-center max-w-[420px]">
          <span className="grid place-items-center w-14 h-14 rounded-[16px] bg-linear-to-b from-on-surface/8 to-on-surface/2 ring-1 ring-on-surface/8 mb-3">
            <SqlServerIcon size={30} />
          </span>
          <p className="t-callout font-semibold text-on-surface">Listo para consultar</p>
          <p className="t-footnote text-on-surface-variant mt-1">Lo que escribís se guarda solo; cerrar una pestaña no la borra.</p>
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 mt-4 text-left t-footnote text-on-surface-variant">
            <span><kbd className="kbd-chip">F5</kbd> <kbd className="kbd-chip">Ctrl Enter</kbd></span><span>Ejecutar (o sólo lo seleccionado)</span>
            <span><kbd className="kbd-chip">Esc</kbd></span><span>Cancelar</span>
            <span><kbd className="kbd-chip">Ctrl T</kbd></span><span>Nueva pestaña</span>
            <span><kbd className="kbd-chip">Ctrl Shift T</kbd></span><span>Reabrir la última cerrada</span>
          </div>
        </div>
      </div>
    )
  }
  if (run.running) {
    return <div className="flex-1 grid place-items-center t-body text-on-surface-variant"><span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-primary animate-pulse" /> Ejecutando…</span></div>
  }
  const r = run.result!
  const view = run.view
  const set = typeof view === 'number' ? r.sets[view] : undefined
  return (
    <>
      <div className="flex items-center gap-1 px-2 h-[36px] hairline-b shrink-0 overflow-x-auto scrollbar-hide">
        {r.sets.map((s, i) => (
          <button key={i} type="button" onClick={() => onView(i)}
            className={`shrink-0 h-[26px] px-2.5 rounded-[7px] text-[12px] transition-colors ${view === i ? 'nav-active text-on-surface font-medium' : 'border border-transparent text-on-surface-variant hover:text-on-surface'}`}>
            {r.sets.length > 1 ? `Resultado ${i + 1}` : 'Resultado'} <span className="tabular-nums opacity-70">{s.total.toLocaleString('es-AR')}</span>
          </button>
        ))}
        <button type="button" onClick={() => onView('messages')}
          className={`shrink-0 h-[26px] px-2.5 rounded-[7px] text-[12px] transition-colors ${view === 'messages' ? 'nav-active text-on-surface font-medium' : 'border border-transparent text-on-surface-variant hover:text-on-surface'}`}>
          Mensajes {r.messages.length > 0 && <span className="tabular-nums opacity-70">{r.messages.length}</span>}
        </button>
      </div>
      {!r.ok && (
        <div className="flex items-start gap-2 px-3 py-2.5 bg-error/8 hairline-b shrink-0">
          <CircleAlert size={14} className="text-error mt-px shrink-0" />
          <p className="flex-1 min-w-0 t-footnote text-on-surface whitespace-pre-wrap">
            {r.cancelled ? 'Consulta cancelada.' : r.error}
            {typeof r.number === 'number' && <span className="text-on-surface-variant"> (Msg {r.number})</span>}
          </p>
          {typeof r.line === 'number' && (
            <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm shrink-0" onClick={() => onGotoLine(r.line!)}>Ir a la línea {r.line}</button>
          )}
        </div>
      )}
      <div className="flex-1 min-h-0">
        {set ? <ResultGrid key={view} set={set} name={name} /> : (
          <div className="h-full overflow-auto px-3 py-2 font-mono text-[12px] leading-[19px] text-on-surface">
            {r.messages.length === 0 && r.ok && <p className="text-on-surface-variant">Listo, sin mensajes.</p>}
            {r.messages.map((m, i) => <p key={i} className="whitespace-pre-wrap">{m}</p>)}
            {r.ok && <p className="text-on-surface-variant mt-1">Terminó en {fmtMs(r.ms)}.</p>}
          </div>
        )}
      </div>
    </>
  )
}

/** Barra de estado al pie, como la de SSMS: conexión, base, modo, filas y tiempo. */
function StatusBar({ profile, database, readOnly, run, elapsed }: {
  profile: SqlProfile | null
  database: string
  readOnly: boolean
  run: RunState | undefined
  elapsed: number
}): JSX.Element {
  const r = run?.result
  const rows = r ? r.sets.reduce((n, s) => n + s.total, 0) : 0
  const tone = envTone(profile?.tag)
  return (
    <div className="flex items-center gap-3 px-3 h-[26px] hairline-t bg-surface-container-low shrink-0 t-caption text-on-surface-variant tabular-nums overflow-hidden">
      <span className="flex items-center gap-1.5 min-w-0">
        <SqlServerIcon size={12} />
        <span className="font-medium text-on-surface truncate">{profile?.name ?? 'Sin conexión'}</span>
        {profile?.tag && <span className={TONE[tone].text}>{profile.tag}</span>}
      </span>
      {profile && <span className="font-mono truncate">{profile.server}</span>}
      <span className="font-mono">{database || 'predeterminada'}</span>
      <span className={readOnly ? 'text-success' : 'text-warning'}>{readOnly ? 'Solo lectura' : 'Escritura'}</span>
      <span className="flex-1" />
      {run?.running && <span className="flex items-center gap-1.5 text-primary"><span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" /> Ejecutando · {fmtMs(elapsed)}</span>}
      {!run?.running && r && (
        <>
          <span className={`flex items-center gap-1.5 ${r.ok ? 'text-success' : 'text-error'}`}><span className={`w-1.5 h-1.5 rounded-full ${r.ok ? 'bg-success' : 'bg-error'}`} />{r.ok ? 'Correcta' : r.cancelled ? 'Cancelada' : 'Con error'}</span>
          <span>{rows.toLocaleString('es-AR')} {rows === 1 ? 'fila' : 'filas'}</span>
          <span>{fmtMs(r.ms)}</span>
        </>
      )}
    </div>
  )
}

function HistorySheet({ open, onClose, closed, onReopen, onOpen, onCleared }: {
  open: boolean
  onClose: () => void
  closed: QueryTab[]
  onReopen: (id: string) => void
  onOpen: (h: QueryHistoryEntry) => void
  onCleared: () => void
}): JSX.Element {
  const confirm = useConfirm()
  const [items, setItems] = useState<QueryHistoryEntry[]>([])
  const [q, setQ] = useState('')
  useEffect(() => {
    if (open) void window.api.invoke<QueryHistoryEntry[]>('sql:history-get').then(setItems).catch(() => setItems([]))
  }, [open])
  const f = q.trim().toLowerCase()
  const shown = f ? items.filter((h) => `${h.sql} ${h.profileName} ${h.database}`.toLowerCase().includes(f)) : items
  const when = (ts: number): string => new Date(ts).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <Sheet open={open} onClose={onClose} title="Historial" subtitle="Todo lo que ejecutaste y las pestañas que cerraste" width={520}>
      <div className="flex flex-col gap-4">
        {closed.length > 0 && (
          <section className="flex flex-col gap-1">
            <h3 className="t-section uppercase tracking-[0.08em] px-1">Pestañas cerradas</h3>
            {closed.slice(0, 8).map((t) => (
              <button key={t.id} type="button" onClick={() => onReopen(t.id)}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-[9px] text-left hover:bg-on-surface/5 transition-colors">
                <RotateCcw size={13} className="text-on-surface-variant shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block t-body font-medium text-on-surface truncate">{t.title}</span>
                  <span className="block t-caption font-mono text-on-surface-variant truncate">{t.sql.replace(/\s+/g, ' ').slice(0, 120)}</span>
                </span>
                <span className="t-caption text-on-surface-variant shrink-0">{when(t.updatedAt)}</span>
              </button>
            ))}
          </section>
        )}
        <section className="flex flex-col gap-1">
          <div className="flex items-center gap-2 px-1">
            <h3 className="t-section uppercase tracking-[0.08em] flex-1">Ejecutadas</h3>
            {items.length > 0 && (
              <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={async () => {
                if (!(await confirm({ title: '¿Borrar el historial?', message: 'Las pestañas no se tocan.', confirmLabel: 'Borrar', destructive: true }))) return
                await window.api.invoke('sql:history-clear'); setItems([]); onCleared()
              }}>Borrar</button>
            )}
          </div>
          {items.length > 0 && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en el historial…" className="ui-input h-[32px] px-3 text-[12.5px]" />}
          {shown.length === 0 && <p className="t-footnote text-on-surface-variant px-1 py-4">{items.length ? 'Nada coincide.' : 'Todavía no ejecutaste consultas.'}</p>}
          {shown.slice(0, 200).map((h) => (
            <button key={h.id} type="button" onClick={() => onOpen(h)} title="Abrir en una pestaña nueva"
              className="flex items-start gap-2.5 px-2.5 py-2 rounded-[9px] text-left hover:bg-on-surface/5 transition-colors">
              <span className={`mt-[6px] w-1.5 h-1.5 rounded-full shrink-0 ${h.ok ? 'bg-success' : 'bg-error'}`} />
              <span className="flex-1 min-w-0">
                <span className="block font-mono text-[12px] leading-[17px] text-on-surface line-clamp-2 break-all">{h.sql.trim()}</span>
                <span className="block t-caption text-on-surface-variant truncate mt-0.5">
                  {h.profileName}{h.database ? ` · ${h.database}` : ''} · {h.ok ? `${h.rows.toLocaleString('es-AR')} filas` : 'error'} · {fmtMs(h.ms)}{h.readOnly ? '' : ' · escritura'}
                </span>
              </span>
              <span className="t-caption text-on-surface-variant shrink-0">{when(h.at)}</span>
            </button>
          ))}
        </section>
      </div>
    </Sheet>
  )
}
