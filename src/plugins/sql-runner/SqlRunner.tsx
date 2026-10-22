import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildXlsxBook } from './export'
import { GridSkeleton } from '../../core/components/Skeleton'
import {
  CheckCircle2, CircleAlert, Clock, Columns2, Copy, FileSpreadsheet, Gauge, History, Info, Layers, Pencil, Star, Trash2, PanelLeft, Plus, RotateCcw, Server, ShieldCheck, ShieldAlert, X,
} from 'lucide-react'
import { useApp, useModuleSubtitle, usePluginIntent } from '../../core/AppContext'
import { useModulePrimaryAction } from '../../core/module-actions'
import { Sheet, useConfirm } from '../../core/components/Modal'
import { EmptyState } from '../../core/components/EmptyState'
import { useToast } from '../../core/components/Toast'
import { CodeEditor } from '../file-editor/components/CodeEditor'
import { useEditorPrefs } from '../file-editor/hooks/useEditorPrefs'
import { migrateColorScheme, resolveEditorTheme, type EditorColorScheme } from '../file-editor/themes/registry'
import { ViewControls } from './ViewControls'
import { ContextMenu, type MenuItem } from '../../core/components/ContextMenu'
import { presetCodeThemes, useAppearance } from '../../core/hooks/useThemePalette'
import type { EditorHandle } from '../file-editor/types'
import type { SqlProfile } from '../connections/sql'
import { findRisks, splitBatches, tabTitle } from './sql-text'
import { RunButton, type RunMode } from './RunButton'
import { formatSql } from './format-sql'
import { applyParams, findParams, parseStats, withStatistics } from './sql-tools'
import { ParamsDialog, type ParamsRequest } from './ParamsDialog'
import { Pop } from '../../core/components/Pop'
import { celebrate } from '../../core/fx'
import { editBlocker, usedDatabase, type EditTarget } from './edit-script'
import { friendlyError } from './sql-meta'
import type { QueryFavorite, QueryHistoryEntry, QueryResult, QuerySet, QueryTab, QueryTabsState } from './types'
import { ResultGrid, type GridEditing } from './ResultGrid'
import { CompareView } from './CompareView'
import { DatabaseSelect, ProfileSelect } from './ProfileSelect'
import { ConnectionFixDialog, type FixRequest } from './ConnectionFixDialog'
import { ObjectExplorer, type OpenScript } from './ObjectExplorer'
import { buildSqlSchema, connectionProblem, missingObject, type SqlSchemaTree } from './sql-meta'
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
/** Tema de color propio de Consultas (independiente del Editor). */
const SCHEME_KEY = 'sql-runner:color-scheme'
const ZOOM_KEY = 'sql-runner:zoom'
const FONT_KEY = 'sql-runner:font-size'

interface RunState {
  runId: string; running: boolean; startedAt: number; result: QueryResult | null; view: ResultView
  /** Lo que se ejecutó (para volver a correrlo después de aplicar cambios de la grilla) */
  text?: string; lineOffset?: number
  /** Edición de resultados: tabla y clave primaria, o por qué no se puede */
  edit?: { target: EditTarget | null; blocker: string | null }
  /** Filas recién guardadas con Commit (destellan al refrescar) */
  flash?: { keys: string[]; until: number }
  /** "Invalid object name": en qué base corrió y en cuáles existe el objeto */
  locate?: { object: string; current: string; found: string[] }
}

/** Qué se ve abajo: un resultado, todos apilados (como SSMS) o los mensajes. */
type ResultView = number | 'all' | 'messages'
const LAYOUT_KEY = 'sql-runner:results-layout'
/** Con varios resultados: apilados (por defecto) o en pestañas. Se recuerda. */
const prefersStack = (): boolean => { try { return localStorage.getItem(LAYOUT_KEY) !== 'tabs' } catch { return true } }
const firstView = (sets: number): ResultView => (!sets ? 'messages' : sets > 1 && prefersStack() ? 'all' : 0)

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
  /** Error ya visto (se editó después): deja de marcar la línea. tabId → runId */
  const [errSeen, setErrSeen] = useState<Record<string, string>>({})
  /** Pedido de valores para los @parámetros (antes de ejecutar) */
  const [paramReq, setParamReq] = useState<ParamsRequest | null>(null)
  const askParams = (names: string[], values: Record<string, string>): Promise<Record<string, string> | null> =>
    new Promise((resolve) => setParamReq({ names, values, resolve: (v) => { setParamReq(null); resolve(v) } }))
  /** Esc al renombrar: no guardar lo escrito (el blur del campo llega igual) */
  const renameCancel = useRef(false)
  /** Menú de clic derecho de una pestaña */
  const [tabMenu, setTabMenu] = useState<{ x: number; y: number; id: string } | null>(null)
  const [now, setNow] = useState(Date.now())
  const [ratio, setRatio] = useState(() => { try { return Number(localStorage.getItem(RATIO_KEY)) || 0.45 } catch { return 0.45 } })
  const editorRef = useRef<EditorHandle | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  /** Conexión que no anda: popup para poner la nueva contraseña o IP */
  const [fix, setFix] = useState<FixRequest | null>(null)
  const [explorerOpen, setExplorerOpen] = useState(() => { try { return localStorage.getItem(EXPLORER_KEY) !== '0' } catch { return true } })
  const [databases, setDatabases] = useState<string[]>([])
  /** Tablas, columnas y procedimientos de la base actual para autocompletar */
  const [schema, setSchema] = useState<SqlSchemaTree>({})
  const [favs, setFavs] = useState<QueryFavorite[]>([])
  /** Hay texto seleccionado en el editor (el botón dice "Ejecutar selección") */
  const [hasSel, setHasSel] = useState(false)
  const syncSel = (): void => setHasSel(!!editorRef.current?.getSelection?.().text.trim())
  /** Pestaña recién abierta desde el explorador que hay que ejecutar ("Seleccionar 100 filas") */
  const pendingRun = useRef<string | null>(null)
  /** Filas del último Commit, para que destellen en el resultado refrescado */
  const commitFlash = useRef<string[] | null>(null)

  // ── Editor: mismo tema y fuente que el Editor de archivos ──
  const { prefs } = useEditorPrefs()
  const appDark = state.theme === 'dark'
  const appearance = useAppearance()
  // Tema propio: la primera vez arranca con el del Editor; después cada módulo tiene el suyo.
  const [ownScheme, setOwnScheme] = useState<EditorColorScheme | null>(() => {
    try { const v = localStorage.getItem(SCHEME_KEY); return v ? migrateColorScheme(v) : null } catch { return null }
  })
  const [previewScheme, setPreviewScheme] = useState<EditorColorScheme | null>(null)
  // Tamaño propio de Consultas: zoom del módulo y letra del editor.
  const [zoom, setZoomState] = useState(() => { try { return Number(localStorage.getItem(ZOOM_KEY)) || 1 } catch { return 1 } })
  const [ownFont, setOwnFont] = useState<number | null>(() => { try { return Number(localStorage.getItem(FONT_KEY)) || null } catch { return null } })
  const fontSize = ownFont ?? prefs.fontSize
  const setZoom = (z: number): void => { setZoomState(z); try { localStorage.setItem(ZOOM_KEY, String(z)) } catch { /* nada */ } }
  const setFont = (n: number): void => { setOwnFont(n); try { localStorage.setItem(FONT_KEY, String(n)) } catch { /* nada */ } }
  const scheme = previewScheme ?? ownScheme ?? prefs.colorScheme
  const presetEditor = scheme === 'setto' ? presetCodeThemes(appearance, appDark)?.editor ?? null : null
  const theme = useMemo(() => resolveEditorTheme(presetEditor ?? scheme, prefs.editorTheme, appDark),
    [presetEditor, scheme, prefs.editorTheme, appDark, appearance])
  const pickScheme = (id: EditorColorScheme): void => {
    setOwnScheme(id); setPreviewScheme(null)
    try { localStorage.setItem(SCHEME_KEY, id) } catch { /* nada */ }
  }

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
  const execute = async (mode: RunMode = 'auto', override?: { text: string; lineOffset: number }): Promise<void> => {
    if (!tab || !profile || run?.running) return
    const sel = override ? null : editorRef.current?.getSelection?.()
    const hasSel = !!sel?.text.trim()
    let text = tab.sql
    let lineOffset = 0
    if ((mode === 'auto' || mode === 'selection') && hasSel) { text = sel!.text; lineOffset = sel!.fromLine - 1 }
    else if (mode === 'batch') {
      // El lote (separado por GO) donde está el cursor.
      const line = sel?.fromLine ?? 1
      const b = [...splitBatches(tab.sql)].reverse().find((x) => x.startLine <= line)
      if (b) { text = b.sql; lineOffset = b.startLine - 1 }
    }
    if (override) { text = override.text; lineOffset = override.lineOffset }
    if (!text.trim()) return
    // @parámetros sin declarar: se piden los valores y se declaran en la misma primera línea.
    if (!override) {
      const names = findParams(text)
      if (names.length) {
        const vals = await askParams(names, tab.params ?? {})
        if (!vals) return
        patchTab(tab.id, { params: { ...(tab.params ?? {}), ...vals } })
        text = applyParams(text, vals)
      }
      if (tab.stats) text = withStatistics(text)
    }
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
    const editPrep = prepareEdit(text)
    editPrep.catch(() => undefined)
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
    setRuns((r) => ({ ...r, [tab.id]: { runId, running: false, startedAt: r[tab.id]?.startedAt ?? Date.now(), result, view: firstView(result.sets.length), text, lineOffset, ...(commitFlash.current && result.ok ? { flash: { keys: commitFlash.current, until: Date.now() + 4000 } } : {}) } }))
    commitFlash.current = null
    if (result.ok && result.sets.length) void finishEdit(tab.id, runId, text, result, editPrep)
    const missing = missingObject(result)
    if (missing && !usedDatabase(text)) void locateObject(tab.id, runId, missing)
    if (!tab.named) { const t = tabTitle(tab.sql, tab.title); if (t !== tab.title) patchTab(tab.id, { title: t }) }
  }
  const cancel = (): void => { if (run?.running) void window.api.invoke('sql:cancel', run.runId) }

  /** La tabla no existe en la base donde corrió: buscar en qué bases está (suele ser que no había base elegida). */
  const locateObject = async (tabId: string, runId: string, object: string): Promise<void> => {
    try {
      const r = await window.api.invoke<QueryResult>('sql:meta', { profileId: profile!.id, database: tab!.database, kind: 'locate', table: object })
      if (!r.ok) return
      const current = String(r.sets[0]?.rows[0]?.[0] ?? '')
      const found = (r.sets[1]?.rows ?? []).map((x) => String(x[0])).filter((d) => d !== current)
      setRuns((m) => (m[tabId]?.runId === runId ? { ...m, [tabId]: { ...m[tabId]!, locate: { object, current, found } } } : m))
    } catch { /* sin datos: queda el error tal cual */ }
  }
  /** Elegir la base en la pestaña y volver a correr lo mismo. */
  const runInDatabase = (db: string): void => {
    if (!tab || !run?.text) return
    patchTab(tab.id, { database: db })
    const again = { text: run.text, lineOffset: run.lineOffset ?? 0 }
    setTimeout(() => void executeRef.current('all', again), 0)
  }

  // ── Edición de resultados (como DataGrip) ──
  /** Busca la clave primaria de la tabla del FROM y decide si el resultado se puede editar. */
  /** Mientras corre la consulta: tabla del FROM, su base (USE) y su clave primaria. */
  type EditPrep = { tableName: string | undefined; database: string; pk: string[] | null; tableColumns?: string[] }
  const prepareEdit = async (text: string): Promise<EditPrep> => {
    const tableName = guessTable(text)
    // Si la consulta empieza con USE, la tabla está en esa base (no en la de la pestaña).
    const database = usedDatabase(text) ?? tab!.database
    let pk: string[] | null = null
    let tableColumns: string[] | undefined
    const pre = editBlocker(text, 1, ['__'], ['__x']) // chequeos que no necesitan el resultado ni el catálogo
    if (tableName && (!pre || pre.startsWith('Incluí'))) {
      try {
        const r = await window.api.invoke<QueryResult>('sql:meta', { profileId: profile!.id, database, kind: 'pk', table: tableName })
        // Sólo tablas de usuario (no vistas ni sys.*); también sus columnas, para descartar las calculadas.
        if (r.ok && r.sets[1]?.rows[0]?.[0] === '1') { pk = (r.sets[0]?.rows ?? []).map((x) => x[0] ?? ''); tableColumns = (r.sets[2]?.rows ?? []).map((x) => x[0] ?? '') }
      } catch { /* sin edición */ }
    }
    return { tableName, database, pk, tableColumns }
  }
  /** Con el resultado en mano: ¿se puede editar? */
  const finishEdit = async (tabId: string, runId: string, text: string, result: QueryResult, prep: Promise<EditPrep>): Promise<void> => {
    const set = result.sets[0]!
    const { tableName, database, pk, tableColumns } = await prep
    const blocker = !tableName ? 'No se reconoce la tabla del FROM.' : pk === null ? 'Sólo se editan tablas (no vistas ni tablas del sistema).' : editBlocker(text, result.sets.length, set.columns, pk, tableColumns)
    const target: EditTarget | null = !blocker && pk ? { table: tableName!, columns: set.columns, types: set.types, pk, keyMode: pk.length ? 'pk' : 'all', database } : null
    setRuns((r) => (r[tabId]?.runId === runId ? { ...r, [tabId]: { ...r[tabId]!, edit: { target, blocker } } } : r))
  }
  const applyGridEdits = async (script: string, count: number, keys: string[]): Promise<boolean> => {
    if (!tab || !profile) return false
    const db = run?.edit?.target?.database || tab.database
    const where = `${profile.name}${db || profile.database ? ` · ${db || profile.database}` : ''}`
    let r: QueryResult
    try {
      r = await window.api.invoke<QueryResult>('sql:query', { runId: crypto.randomUUID(), profileId: profile.id, database: db, sql: script, readOnly: false })
    } catch (e) { r = { ok: false, error: cleanErr(e), sets: [], messages: [], ms: 0 } }
    if (!r.ok) {
      const p = connectionProblem(r)
      toast.show(p ? friendlyError(r.error, p).title : `No se aplicó: ${(r.error ?? '').split(/\r?\n/)[0]}`, 'error', 6000)
      return false
    }
    toast.show(`Commit: ${count} ${count === 1 ? 'cambio aplicado' : 'cambios aplicados'} en ${where}`, 'success')
    // Primer commit del día: festejo chiquito.
    try {
      const today = new Date().toDateString()
      if (localStorage.getItem('sql-runner:last-commit-day') !== today) { localStorage.setItem('sql-runner:last-commit-day', today); celebrate() }
    } catch { /* nada */ }
    commitFlash.current = keys
    if (run?.text) void executeRef.current('all', { text: run.text, lineOffset: run.lineOffset ?? 0 })
    return true
  }

  // F5 ejecuta con el módulo a la vista aunque el foco esté en otro lado (p. ej. la barra lateral).
  const executeRef = useRef(execute)
  const activeTabIdRef = useRef<string | null>(null)
  activeTabIdRef.current = tab?.id ?? null
  executeRef.current = execute
  useEffect(() => {
    if (!active || mode !== 'query') return
    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented) return
      if (e.key === 'F5') { e.preventDefault(); void executeRef.current(); return }
      // F2 renombra la pestaña activa (si no se está escribiendo en otro campo o en la grilla).
      const el = e.target as HTMLElement | null
      if (e.key === 'F2' && !el?.closest?.('input, textarea, table, [data-grid-pending]') && activeTabIdRef.current) {
        e.preventDefault(); setRenaming(activeTabIdRef.current)
      }
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

  const schemaDb = tab ? tab.database.trim() || profile?.database || '' : ''
  useEffect(() => {
    setSchema({})
    if (!profileId) return
    let alive = true
    void window.api.invoke<QueryResult>('sql:meta', { profileId, database: schemaDb, kind: 'completion' })
      .then((r) => { if (alive && r.ok) setSchema(buildSqlSchema(r.sets[0]?.rows ?? [])) })
      .catch(() => undefined)
    return () => { alive = false }
  }, [profileId, schemaDb])

  // ── Favoritas ──
  useEffect(() => { void window.api.invoke<QueryFavorite[]>('sql:favs-get').then(setFavs).catch(() => undefined) }, [])
  const saveFavs = (list: QueryFavorite[]): void => { setFavs(list); void window.api.invoke('sql:favs-save', list).catch(() => toast.show('No se pudo guardar', 'error')) }
  const isFavTab = (t: QueryTab | null | undefined): boolean => !!t && !!t.sql.trim() && favs.some((f) => f.sql.trim() === t.sql.trim())
  const isFav = isFavTab(tab)
  const toggleFav = (t: QueryTab | null | undefined = tab): void => {
    if (!t || !t.sql.trim()) return
    if (isFavTab(t)) { saveFavs(favs.filter((f) => f.sql.trim() !== t.sql.trim())); toast.show('Quitada de favoritas', 'info'); return }
    saveFavs([{ id: crypto.randomUUID(), title: t.title, sql: t.sql, profileId: t.profileId, database: t.database, createdAt: Date.now() }, ...favs])
    toast.show(`"${t.title}" guardada en favoritas`, 'success')
  }
  /** Cierra todas menos `keep` (o sólo las que están a su derecha); las que tienen texto se pueden reabrir. */
  const closeOthers = (keep: string, onlyRight = false): void => update((s) => {
    const idx = s.tabs.findIndex((x) => x.id === keep)
    const gone = s.tabs.filter((x, i) => x.id !== keep && (!onlyRight || i > idx))
    const closed = [...gone.filter((x) => x.sql.trim()), ...s.closed].slice(0, 30)
    return { tabs: s.tabs.filter((x) => !gone.includes(x)), activeId: keep, closed }
  })

  // Ctrl+K → abrir una favorita o una consulta del historial.
  type OpenPayload = { title?: string; sql: string; profileId?: string | null; database?: string }
  const pendingOpen = useRef<OpenPayload | null>(null)
  const openPayload = (p: OpenPayload): void => {
    setMode('query')
    const known = !!p.profileId && profiles?.some((x) => x.id === p.profileId)
    addTab({ sql: p.sql, database: known ? p.database ?? '' : '', ...(p.title ? { title: p.title, named: true } : {}), ...(known ? { profileId: p.profileId! } : {}) })
  }
  usePluginIntent('sql-runner', (i) => {
    if (i.action !== 'open-sql') return
    // Recién abierto el módulo todavía no cargó pestañas ni conexiones: se abre apenas estén.
    if (!tabsState || profiles === null) pendingOpen.current = i.payload as OpenPayload
    else openPayload(i.payload as OpenPayload)
  })
  useEffect(() => {
    if (pendingOpen.current && tabsState && profiles !== null) { const p = pendingOpen.current; pendingOpen.current = null; openPayload(p) }
  }) // eslint-disable-line react-hooks/exhaustive-deps

  const onFixed = (p: SqlProfile, req: FixRequest): void => {
    setFix(null)
    toast.show(req.reason === 'new' ? `${p.name}: conexión agregada` : `${p.name}: conexión actualizada`, 'success')
    void loadProfiles().then(() => {
      if (req.reason === 'new' && tab) patchTab(tab.id, { profileId: p.id, database: '' })
      req.retry?.()
    })
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
  /** Formatear el SQL: la selección o todo (se deshace con Ctrl+Z). */
  const formatEditor = (): void => {
    try { editorRef.current?.transform?.((t) => formatSql(t)) } catch { toast.show('No se pudo formatear', 'error') }
  }

  const onKeyDownCapture = (e: React.KeyboardEvent): void => {
    if (mode !== 'query') return
    const ctrl = e.ctrlKey || e.metaKey
    if (ctrl && e.shiftKey && e.key === 'Enter') { e.preventDefault(); void execute('batch'); return }
    // Ctrl+Enter dentro de la grilla con cambios = Commit (lo maneja la grilla).
    if (ctrl && e.key === 'Enter' && (e.target as HTMLElement).closest?.('[data-grid-pending]')) return
    if (ctrl && e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); formatEditor(); return }
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
    <div className="flex flex-col h-full min-h-0 bg-background" onKeyDownCapture={onKeyDownCapture} style={zoom !== 1 ? { zoom } : undefined}>
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
                  onContextMenu={(e) => { e.preventDefault(); update((s) => ({ ...s, activeId: t.id })); setTabMenu({ x: e.clientX, y: e.clientY, id: t.id }) }}
                  title={`${t.title}\nDoble clic o F2: renombrar · Clic derecho: más · Clic medio: cerrar`}
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
                    <input autoFocus defaultValue={t.title} onClick={(e) => e.stopPropagation()} onFocus={(e) => { renameCancel.current = false; e.currentTarget.select() }}
                      onBlur={(e) => { const v = e.target.value.trim(); if (v && !renameCancel.current && v !== t.title) patchTab(t.id, { title: v, named: true }); setRenaming(null) }}
                      onKeyDown={(e) => {
                        e.stopPropagation()
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                        if (e.key === 'Escape') { renameCancel.current = true; setRenaming(null) }
                      }}
                      className="w-[130px] bg-transparent outline-hidden text-[12.5px] text-on-surface border-b border-primary/50" />
                  ) : <span className="truncate">{t.title}</span>}
                  {renaming !== t.id && isFavTab(t) && <Star size={10} weight="fill" className="text-warning shrink-0" aria-label="En favoritas" />}
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
        {mode === 'query' && (
          <button type="button" className={`ui-btn ui-btn-ghost ui-btn-icon shrink-0 ${isFav ? 'text-warning' : ''}`} onClick={() => toggleFav()} disabled={!tab?.sql.trim()}
            title={isFav ? 'Quitar de favoritas' : 'Guardar esta consulta en favoritas (aparece en Historial y en Ctrl+K)'} aria-pressed={isFav}>
            <Pop active={isFav}><Star size={14} weight={isFav ? 'fill' : 'regular'} /></Pop>
          </button>
        )}
        <ViewControls zoom={zoom} onZoom={setZoom} fontSize={fontSize} defaultFont={prefs.fontSize} onFontSize={setFont}
          scheme={ownScheme ?? prefs.colorScheme} editorTheme={prefs.editorTheme} appDark={appDark}
          onPreviewScheme={setPreviewScheme} onPickScheme={pickScheme} onFormat={mode === 'query' ? formatEditor : undefined} />
        <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm shrink-0" onClick={() => setHistoryOpen(true)} title="Favoritas, historial y pestañas cerradas">
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
            <RunButton running={!!run?.running} elapsed={fmtMs(elapsed)} hasSelection={hasSel}
              disabled={!profile || !tab.sql.trim()} onRun={(m) => void execute(m)} onCancel={cancel} />
            <span className="w-px h-5 bg-(--hairline-strong) mx-0.5" aria-hidden />
            <ProfileSelect profiles={profiles} value={profile?.id ?? null} onChange={(id) => { if (id !== profile?.id) patchTab(tab.id, { profileId: id, database: '' }) }}
              onNew={() => setFix({ reason: 'new' })} />
            <DatabaseSelect value={tab.database} fallback={profile?.database ?? ''} databases={databases} onChange={(db) => patchTab(tab.id, { database: db })} />
            <button type="button" onClick={() => patchTab(tab.id, { readOnly: !tab.readOnly })}
              title={tab.readOnly ? 'Modo lectura: lo que cambies se deshace al final (rollback). Clic para apagarlo.' : 'Modo lectura apagado: los cambios se aplican. Clic para encenderlo.'}
              // Lo normal (solo lectura) va discreto; la escritura, que es lo riesgoso, sí se marca.
              className={`flex items-center gap-1.5 h-[30px] px-2.5 rounded-[8px] border text-[12px] font-medium transition-colors ${
                tab.readOnly ? 'border-transparent text-on-surface-variant hover:text-on-surface hover:bg-on-surface/5' : 'border-warning/45 text-warning bg-warning/10'}`}>
              {tab.readOnly ? <ShieldCheck size={13} className="text-success" /> : <ShieldAlert size={13} weight="fill" />}
              {tab.readOnly ? 'Solo lectura' : 'Escritura'}
            </button>
            <button type="button" onClick={() => patchTab(tab.id, { stats: !tab.stats })} aria-pressed={!!tab.stats}
              title={tab.stats ? 'Estadísticas activas: lecturas y tiempos de cada consulta (SET STATISTICS IO, TIME). Clic para apagarlas.' : 'Mostrar lecturas y tiempos de cada consulta (para ver por qué tarda)'}
              className={`flex items-center gap-1.5 h-[30px] px-2.5 rounded-[8px] border text-[12px] font-medium transition-colors ${
                tab.stats ? 'border-transparent text-on-surface bg-on-surface/[0.07]' : 'border-transparent text-on-surface-variant hover:text-on-surface hover:bg-on-surface/5'}`}>
              <Gauge size={13} weight={tab.stats ? 'fill' : 'regular'} className={tab.stats ? 'text-primary' : ''} /> Estadísticas
            </button>
            <span className="flex-1" />
            {!run?.running && result && (
              <span className="flex items-center gap-1.5 t-footnote text-on-surface-variant tabular-nums" title="Duración de la última ejecución">
                <Clock size={12} /> {fmtMs(elapsed)}
              </span>
            )}
          </div>

          <div ref={bodyRef} className="flex-1 min-h-0 flex flex-col">
            {/* Editor */}
            <div className="min-h-0 overflow-hidden" style={{ flexBasis: `${ratio * 100}%`, flexShrink: 0 }}
              onMouseUp={syncSel} onKeyUp={syncSel}>
              <CodeEditor key={tab.id} content={tab.sql} language="sql" theme={theme} sqlSchema={schema}
                fontSize={fontSize} fontFamily={prefs.fontFamily} wordWrap={false}
                editorRef={editorRef}
                onRenameShortcut={() => setRenaming(tab.id)}
                errorLine={run && !run.running && run.result && !run.result.ok && typeof run.result.line === 'number' && errSeen[tab.id] !== run.runId ? run.result.line : null}
                onChange={(v) => { patchTab(tab.id, { sql: v }); if (run?.result && !run.result.ok && errSeen[tab.id] !== run.runId) setErrSeen((m) => ({ ...m, [tab.id]: run.runId })) }} />
            </div>
            {/* Divisor */}
            <div role="separator" aria-orientation="horizontal" onPointerDown={startDrag}
              className="h-[6px] -my-[3px] relative z-10 cursor-row-resize group shrink-0">
              <div className="absolute inset-x-0 top-[2.5px] h-px bg-(--hairline-strong) group-hover:bg-primary/60 transition-colors" />
            </div>
            {/* Resultados */}
            <div className="flex-1 min-h-0 flex flex-col bg-surface">
              <Results run={run} onGotoLine={(l) => editorRef.current?.focusLine?.(l)} onUseDatabase={runInDatabase}
                onView={(v) => setRuns((r) => (r[tab.id] ? { ...r, [tab.id]: { ...r[tab.id]!, view: v } } : r))}
                name={tab.title} table={guessTable(run?.text ?? tab.sql)}
                editing={run?.result?.ok && run.result.sets.length ? {
                  ...(run.edit ?? { target: null, blocker: null, pending: true }),
                  where: `${profile?.name ?? ''}${(run.edit?.target?.database || tab.database || profile?.database) ? ` · ${run.edit?.target?.database || tab.database || profile?.database}` : ''}`,
                  onApply: applyGridEdits,
                  onOpenScript: (sql) => addTab({ sql, title: `Cambios · ${run.edit?.target?.table ?? ''}`, named: true, readOnly: false }),
                } : undefined} />
            </div>
          </div>
          <StatusBar profile={profile} database={tab.database.trim() || profile?.database || ''} readOnly={tab.readOnly} run={run} elapsed={elapsed} />
          <ParamsDialog request={paramReq} />
          </div>
        </div>
      )}

      {tabMenu && (() => {
        const t = tabsState.tabs.find((x) => x.id === tabMenu.id)
        if (!t) return null
        const idx = tabsState.tabs.indexOf(t)
        const items: MenuItem[] = [
          { label: 'Renombrar', icon: Pencil, shortcut: 'F2', action: () => setRenaming(t.id) },
          { label: 'Duplicar', icon: Copy, action: () => addTab({ sql: t.sql, title: `${t.title} (copia)`, named: true, profileId: t.profileId, database: t.database, readOnly: t.readOnly }) },
          { label: isFavTab(t) ? 'Quitar de favoritas' : 'Guardar en favoritas', icon: Star, action: () => toggleFav(t), disabled: !t.sql.trim() },
          { label: 'Cerrar', icon: X, shortcut: 'Ctrl+W', action: () => closeTab(t.id), divider: true },
          { label: 'Cerrar las demás', action: () => closeOthers(t.id), disabled: tabsState.tabs.length < 2 },
          { label: 'Cerrar las de la derecha', action: () => closeOthers(t.id, true), disabled: idx >= tabsState.tabs.length - 1 },
        ]
        return <ContextMenu x={tabMenu.x} y={tabMenu.y} items={items} onClose={() => setTabMenu(null)} />
      })()}

      <ConnectionFixDialog request={fix} profiles={profiles} onClose={() => setFix(null)} onSaved={onFixed} />

      <HistorySheet open={historyOpen} onClose={() => setHistoryOpen(false)} closed={tabsState.closed}
        favs={favs} onRemoveFav={(id) => saveFavs(favs.filter((f) => f.id !== id))}
        onOpenFav={(f) => { const known = profiles.some((p) => p.id === f.profileId); addTab({ sql: f.sql, title: f.title, named: true, database: known ? f.database : '', ...(known ? { profileId: f.profileId } : {}) }); setMode('query'); setHistoryOpen(false) }}
        onReopen={(id) => { reopen(id); setMode('query'); setHistoryOpen(false) }}
        onOpen={(h) => { addTab({ sql: h.sql, profileId: h.profileId, database: h.database === profiles.find((p) => p.id === h.profileId)?.database ? '' : h.database }); setMode('query'); setHistoryOpen(false) }}
        onCleared={() => toast.show('Historial borrado', 'info')} />
    </div>
  )
}

/** Primera tabla del FROM, para "Copiar como INSERT". */
function guessTable(sql: string): string | undefined {
  return /\bfrom\s+((?:\[[^\]]+\]|[\w#]+)(?:\.(?:\[[^\]]+\]|\w+))*)/i.exec(sql)?.[1]
}

/**
 * Un resultado en la vista apilada: alto según sus filas (barra + encabezado + ~20 px
 * por fila, hasta un tope) y una manija abajo para agrandarlo o achicarlo.
 */
function StackedGrid({ set, name }: { set: QuerySet; name: string }): JSX.Element {
  const auto = Math.max(96, Math.min(420, 72 + 20 * set.rows.length))
  const [height, setHeight] = useState<number | null>(null)
  const startDrag = (e: React.PointerEvent): void => {
    e.preventDefault()
    const y0 = e.clientY
    const h0 = height ?? auto
    const move = (ev: PointerEvent): void => setHeight(Math.max(96, Math.min(1600, Math.round(h0 + ev.clientY - y0))))
    const up = (): void => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  return (
    <div className="relative" style={{ height: height ?? auto }}>
      <ResultGrid set={set} name={name} />
      <div role="separator" aria-orientation="horizontal" title="Arrastrá para cambiar el alto · doble clic: alto automático"
        onPointerDown={startDrag} onDoubleClick={() => setHeight(null)}
        className="absolute inset-x-0 -bottom-[3px] h-[6px] z-20 cursor-row-resize hover:bg-primary/40 transition-colors" />
    </div>
  )
}

function Results({ run, onGotoLine, onUseDatabase, onView, name, table, editing }: {
  run: RunState | undefined
  onGotoLine: (line: number) => void
  onUseDatabase: (db: string) => void
  onView: (v: ResultView) => void
  name: string
  table?: string
  editing?: GridEditing
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
    return <GridSkeleton />
  }
  const r = run.result!
  const view = run.view
  const set = typeof view === 'number' ? r.sets[view] : undefined
  return (
    <>
      <div className="flex items-center gap-1 px-2 h-[36px] hairline-b shrink-0 overflow-x-auto scrollbar-hide">
        {r.sets.length > 1 && (
          <button type="button" onClick={() => { onView('all'); try { localStorage.setItem(LAYOUT_KEY, 'stack') } catch { /* nada */ } }}
            title="Todos los resultados, uno debajo del otro (como SSMS)"
            className={`shrink-0 h-[26px] px-2.5 rounded-[7px] text-[12px] transition-colors flex items-center gap-1.5 ${view === 'all' ? 'nav-active text-on-surface font-medium' : 'border border-transparent text-on-surface-variant hover:text-on-surface'}`}>
            <Layers size={12} /> Todos <span className="tabular-nums opacity-70">{r.sets.length}</span>
          </button>
        )}
        {r.sets.map((s, i) => (
          <button key={i} type="button" onClick={() => { onView(i); if (r.sets.length > 1) try { localStorage.setItem(LAYOUT_KEY, 'tabs') } catch { /* nada */ } }}
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
      {!r.ok && run.locate && (
        <div className="flex items-center flex-wrap gap-x-2 gap-y-1.5 px-3 py-2 bg-primary/[0.06] hairline-b shrink-0 t-footnote text-on-surface">
          <Info size={14} className="text-primary shrink-0" />
          <span>
            Corrió en <b className="font-semibold">{run.locate.current || 'la base por defecto'}</b>
            {run.locate.found.length ? <>, pero <span className="font-mono">{run.locate.object}</span> está en:</> : <> y <span className="font-mono">{run.locate.object}</span> no está en ninguna base a la que tengas acceso.</>}
          </span>
          {run.locate.found.slice(0, 4).map((d) => (
            <button key={d} type="button" onClick={() => onUseDatabase(d)} className="ui-btn ui-btn-primary ui-btn-sm">Ejecutar en {d}</button>
          ))}
        </div>
      )}
      <div className="flex-1 min-h-0">
        {view === 'all' ? (
          <div className="h-full overflow-y-auto">
            <div className="flex items-center justify-end gap-2 px-3 h-[34px] hairline-b">
              <button type="button" className="ui-btn ui-btn-outline ui-btn-sm" title="Un archivo de Excel con una hoja por resultado"
                onClick={() => {
                  const blob = new Blob([buildXlsxBook(r.sets.map((s, i) => ({ name: `Resultado ${i + 1}`, columns: s.columns, rows: s.rows, types: s.types })))],
                    { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
                  const a = document.createElement('a')
                  a.href = URL.createObjectURL(blob)
                  a.download = `${name.replace(/[^\w.-]+/g, '_') || 'resultados'}.xlsx`
                  a.click()
                  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
                }}>
                <FileSpreadsheet size={13} /> Exportar todo a Excel
              </button>
            </div>
            {r.sets.map((s, i) => (
              <section key={i} className="hairline-b">
                <div className="sticky top-0 z-20 flex items-center gap-2 px-3 h-[28px] bg-surface-container-low hairline-b t-caption text-on-surface-variant">
                  <span className="font-semibold text-on-surface">Resultado {i + 1}</span>
                  <span className="tabular-nums">{s.total.toLocaleString('es-AR')} {s.total === 1 ? 'fila' : 'filas'} · {s.columns.length} {s.columns.length === 1 ? 'columna' : 'columnas'}</span>
                  <span className="flex-1" />
                  <button type="button" onClick={() => onView(i)} className="hover:text-on-surface hover:underline underline-offset-2">Ver solo este</button>
                </div>
                <StackedGrid set={s} name={`${name} (${i + 1})`} />
              </section>
            ))}
          </div>
        ) : set ? <ResultGrid key={view} set={set} name={name} table={table} editing={view === 0 ? editing : undefined} flash={view === 0 ? run.flash : undefined} /> : (
          <div className="h-full overflow-auto px-3 py-2 font-mono text-[12px] leading-[19px] text-on-surface">
            {(() => {
              const st = parseStats(r.messages)
              if (!st) return null
              const max = Math.max(1, ...st.tables.map((t) => t.logical))
              return (
                <div className="font-sans mb-3 rounded-[10px] ring-1 ring-primary/20 bg-primary/[0.05] p-3">
                  <p className="t-footnote font-semibold text-on-surface">
                    {st.logicalReads.toLocaleString('es-AR')} lecturas lógicas · {st.physicalReads.toLocaleString('es-AR')} físicas · CPU {fmtMs(st.cpuMs)} · total {fmtMs(st.elapsedMs)}
                  </p>
                  <ul className="mt-2 flex flex-col gap-1">
                    {st.tables.slice(0, 8).map((t) => (
                      <li key={t.table} className="flex items-center gap-2 t-caption">
                        <span className="w-[180px] truncate font-mono text-on-surface">{t.table}</span>
                        <span className="flex-1 h-1.5 rounded-full bg-on-surface/8 overflow-hidden"><span className="block h-full rounded-full bg-primary" style={{ width: `${(t.logical / max) * 100}%` }} /></span>
                        <span className="w-[90px] text-right tabular-nums text-on-surface-variant">{t.logical.toLocaleString('es-AR')}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })()}
            {r.messages.length === 0 && r.ok && <p className="text-on-surface-variant">Listo, sin mensajes.</p>}
            <MessageTimeline messages={r.messages} />
            {r.ok && <p className="text-on-surface-variant mt-1">Terminó en {fmtMs(r.ms)}.</p>}
          </div>
        )}
      </div>
    </>
  )
}

/**
 * Mensajes como línea de tiempo: filas afectadas, PRINT y avisos con su ícono; el
 * detalle técnico de las estadísticas (ya resumido arriba) queda plegado.
 */
const STATS_LINE = /^(\s*SQL Server (Execution Times|parse and compile time)|\s*Tiempos de ejecución|\s*Tiempo de análisis|(Table|Tabla) ')/i
function MessageTimeline({ messages }: { messages: string[] }): JSX.Element {
  const [showTech, setShowTech] = useState(false)
  const tech = messages.filter((m) => STATS_LINE.test(m))
  const rest = messages.filter((m) => !STATS_LINE.test(m))
  return (
    <div className="font-sans flex flex-col">
      {rest.map((m, i) => {
        const rows = /^\((\d+) filas afectadas\)$/.exec(m.trim())
        const ro = /^Modo lectura/.test(m)
        const Icon = rows ? CheckCircle2 : ro ? ShieldCheck : Info
        const tone = rows ? 'text-success' : ro ? 'text-primary' : 'text-on-surface-variant'
        return (
          <div key={i} className="relative flex items-start gap-2.5 pl-1 py-1">
            {i < rest.length - 1 && <span aria-hidden className="absolute left-[11px] top-6 bottom-0 w-px bg-(--hairline-strong)" />}
            <Icon size={15} className={`shrink-0 mt-px ${tone}`} />
            <p className={`t-footnote whitespace-pre-wrap ${rows ? 'text-on-surface' : 'font-mono text-[12px] text-on-surface'}`}>
              {rows ? `${Number(rows[1]).toLocaleString('es-AR')} ${rows[1] === '1' ? 'fila afectada' : 'filas afectadas'}` : m}
            </p>
          </div>
        )
      })}
      {tech.length > 0 && (
        <button type="button" onClick={() => setShowTech((v) => !v)} className="self-start mt-1 ml-1 t-caption text-on-surface-variant hover:text-on-surface hover:underline underline-offset-2">
          {showTech ? 'Ocultar' : 'Ver'} detalle técnico de estadísticas ({tech.length})
        </button>
      )}
      {showTech && tech.map((m, i) => <p key={`t${i}`} className="font-mono text-[11.5px] leading-[17px] text-on-surface-variant whitespace-pre-wrap mt-1 ml-1">{m}</p>)}
    </div>
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
      {!run?.running && r && (() => { const st = parseStats(r.messages); return st && (
        <span className="text-primary" title={st.tables.slice(0, 5).map((t) => `${t.table}: ${t.logical.toLocaleString('es-AR')} lecturas`).join('\n')}>
          {st.logicalReads.toLocaleString('es-AR')} lecturas lógicas · CPU {fmtMs(st.cpuMs)}
        </span>
      ) })()}
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

function HistorySheet({ open, onClose, closed, onReopen, onOpen, onCleared, favs, onOpenFav, onRemoveFav }: {
  open: boolean
  onClose: () => void
  favs: QueryFavorite[]
  onOpenFav: (f: QueryFavorite) => void
  onRemoveFav: (id: string) => void
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
    <Sheet open={open} onClose={onClose} title="Historial" subtitle="Favoritas, todo lo que ejecutaste y las pestañas que cerraste" width={520}>
      <div className="flex flex-col gap-4">
        <section className="flex flex-col gap-1">
          <h3 className="t-section uppercase tracking-[0.08em] px-1 flex items-center gap-1.5"><Star size={11} weight="fill" className="text-warning" /> Favoritas</h3>
          {favs.length === 0 && <p className="t-footnote text-on-surface-variant px-1 py-2">Tocá la ★ de una pestaña para guardar la consulta acá y en Ctrl+K.</p>}
          {favs.map((f) => (
            <div key={f.id} className="group flex items-center gap-1 rounded-[9px] hover:bg-on-surface/5 transition-colors">
              <button type="button" onClick={() => onOpenFav(f)} className="flex-1 min-w-0 flex items-center gap-2.5 px-2.5 py-2 text-left">
                <Star size={13} weight="fill" className="text-warning shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block t-body font-medium text-on-surface truncate">{f.title}</span>
                  <span className="block t-caption font-mono text-on-surface-variant truncate">{f.sql.replace(/\s+/g, ' ').slice(0, 120)}</span>
                </span>
              </button>
              <button type="button" onClick={() => onRemoveFav(f.id)} aria-label={`Quitar ${f.title} de favoritas`}
                className="mr-1.5 grid place-items-center w-7 h-7 rounded-[7px] text-on-surface-variant opacity-0 group-hover:opacity-100 hover:bg-on-surface/8 hover:text-error">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </section>
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
                <span className="font-mono text-[12px] leading-[17px] text-on-surface line-clamp-2 break-all">{h.sql.trim()}</span>
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
