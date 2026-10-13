import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Fuse from 'fuse.js'
import { AnimatePresence, motion } from 'framer-motion'
import {
  BookMarked, Check, ChevronDown, Clock, Copy, CopyPlus, Download, Flame, Folder, FolderPlus, LayoutGrid,
  Pencil, Pin, Plus, Search, SquareTerminal, Trash2, Upload, X,
} from 'lucide-react'
import type { Snippet, SnippetCollection, SnippetLanguage, SnippetsMeta } from './types'
import { useApp, usePluginIntent } from '../../core/AppContext'
import { useToast } from '../../core/components/Toast'
import { useConfirm } from '../../core/components/Modal'
import { EmptyState } from '../../core/components/EmptyState'
import { listItemMotion, shouldAnimateList } from '../../core/motion'
import { LANGUAGES, SHELL_LANGUAGES, langLabel } from './langs'
import { hasVariables, stripDataUrls } from './template'
import { CodeViewer, MixedContentViewer, hasImages } from './SnippetViewer'
import { SnippetEditor, collapseImages, emptyForm, expandImages, type SnippetFormState } from './SnippetEditor'
import { VariablesModal, type VariablesMode } from './VariablesModal'

type SmartFilter = 'all' | 'pinned' | 'recent' | 'popular'
type Source = { kind: 'smart'; id: SmartFilter } | { kind: 'collection'; id: string }

interface LoadResult { snippets: Snippet[]; collections: SnippetCollection[] }

function randomId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms
  const min = Math.round(diff / 60_000)
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.round(h / 24)
  if (d < 30) return `hace ${d} d`
  return new Date(ms).toLocaleDateString('es-AR')
}

function LangBadge({ lang }: { lang: SnippetLanguage }): JSX.Element {
  return (
    <span className="inline-flex items-center h-[20px] px-2 rounded-full text-[11px] font-medium leading-none bg-on-surface/[0.06] text-on-surface-variant whitespace-nowrap">
      {langLabel(lang)}
    </span>
  )
}

/** Encabezado de sección (11px, mayúsculas) con caret opcional para colapsar. */
function SectionHeader({ label, collapsed, onToggle, action }: {
  label: string
  collapsed?: boolean
  onToggle?: () => void
  action?: React.ReactNode
}): JSX.Element {
  const cls = 'flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-on-surface-variant/70'
  return (
    <div className="flex items-center justify-between mt-5 mb-1 pl-2.5 pr-1 h-6">
      {onToggle ? (
        <button type="button" onClick={onToggle} aria-expanded={!collapsed} className={`${cls} hover:text-on-surface-variant transition-colors`}>
          <ChevronDown size={11} weight="bold" className={`transition-transform duration-150 ${collapsed ? '-rotate-90' : ''}`} />
          {label}
        </button>
      ) : (
        <span className={cls}>{label}</span>
      )}
      {action}
    </div>
  )
}

/** Fila de la barra de fuentes, mismo lenguaje que la barra lateral de la app. */
function NavRow({
  active, icon: Icon, label, count, onClick, onDelete,
}: {
  active: boolean
  icon: typeof Folder
  label: string
  count?: number
  onClick: () => void
  onDelete?: () => void
}): JSX.Element {
  return (
    <div className="group relative">
      <button
        onClick={onClick}
        aria-current={active ? 'true' : undefined}
        className={`w-full flex items-center gap-2.5 h-[32px] px-2.5 rounded-lg text-[13px] transition-colors duration-100 ${
          active ? 'bg-selected text-on-surface font-semibold' : 'text-on-surface/75 font-medium hover:bg-on-surface/[0.04] dark:hover:bg-white/[0.05] hover:text-on-surface'
        }`}
      >
        <Icon size={16} weight={active ? 'fill' : 'regular'} className={active ? 'text-primary' : 'text-on-surface-variant'} />
        <span className="flex-1 text-left truncate">{label}</span>
        {count !== undefined && (
          <span className={`t-caption font-medium tabular-nums ${active ? 'text-primary' : 'text-on-surface-variant/70'} ${onDelete ? 'group-hover:opacity-0' : ''}`}>{count}</span>
        )}
      </button>
      {onDelete && (
        <button
          onClick={onDelete}
          title="Eliminar colección"
          aria-label={`Eliminar colección ${label}`}
          className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 ui-btn ui-btn-ghost ui-btn-icon rounded-md text-on-surface-variant hover:text-error"
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  )
}

function Chip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }): JSX.Element {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`h-[22px] px-2 rounded-full text-[11px] font-medium transition-colors ${
        active ? 'bg-primary/10 text-primary ring-1 ring-inset ring-primary/25' : 'bg-on-surface/[0.06] text-on-surface-variant hover:bg-on-surface/[0.1] hover:text-on-surface'
      }`}
    >
      {label}
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function SnippetManager(): JSX.Element {
  const { state, dispatch } = useApp()
  const { show: showToast } = useToast()
  const confirm = useConfirm()
  const dark = state.theme === 'dark'
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const [snippets, setSnippets]       = useState<Snippet[]>([])
  const [collections, setCollections] = useState<SnippetCollection[]>([])
  const [loaded, setLoaded]           = useState(false)
  const [selectedId, setSelectedId]   = useState<string | null>(null)
  const [search, setSearch]           = useState('')
  const [source, setSource]           = useState<Source>({ kind: 'smart', id: 'all' })
  const [tagFilter, setTagFilter]     = useState<string | null>(null)
  const [langFilter, setLangFilter]   = useState<SnippetLanguage | null>(null)
  const [editing, setEditing]         = useState<'new' | 'edit' | null>(null)
  const [form, setForm]               = useState<SnippetFormState>(emptyForm())
  const [copiedId, setCopiedId]       = useState<string | null>(null)
  const [newColName, setNewColName]   = useState<string | null>(null)
  const [varsTarget, setVarsTarget]   = useState<{ snippet: Snippet; mode: VariablesMode } | null>(null)
  const [pendingOpen, setPendingOpen] = useState<string | null>(null)
  const [folded, setFolded]           = useState<{ tags: boolean; langs: boolean }>({ tags: false, langs: false })

  const selected = snippets.find((s) => s.id === selectedId) ?? null

  // ── Load + one-time Queries migration ─────────────────────────────────────
  const reload = useCallback(async (): Promise<LoadResult> => {
    const data = await window.api.invoke<LoadResult>('snippets:load')
    setSnippets(data.snippets)
    setCollections(data.collections)
    setLoaded(true)
    return data
  }, [])

  // Otra máquina cambió snippets (Ajustes → Sincronización): recargar la lista.
  useEffect(() => window.api.on('sync:changed', (p) => {
    if ((p as { snippets?: boolean } | undefined)?.snippets) void reload()
  }), [reload])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      await reload()
      try {
        const meta = await window.api.invoke<SnippetsMeta>('snippets:meta-get')
        if (meta.queriesImportedAt) return
        const queries = await window.api.invoke<unknown[]>('queries:load')
        if (!Array.isArray(queries) || cancelled) return
        const res = await window.api.invoke<{ ok: boolean; added: number }>('snippets:migrate-queries', queries)
        if (res.added > 0 && !cancelled) {
          await reload()
          showToast(`Se importaron ${res.added} queries de Gastos a la colección «Queries»`, 'success', 4000)
        }
      } catch {
        // Gastos sin configurar o sin conexión: se reintenta la próxima vez.
      }
    })()
    return () => { cancelled = true }
  }, [reload, showToast])

  // ── Intents (Ctrl+K y otros módulos) ──────────────────────────────────────
  usePluginIntent('snippets', (intent) => {
    if (intent.action === 'new') {
      const p = (intent.payload ?? {}) as { content?: string; language?: string }
      const lang = LANGUAGES.includes(p.language as SnippetLanguage) ? (p.language as SnippetLanguage) : 'plaintext'
      startNew({ content: p.content ?? '', language: lang })
    } else if (intent.action === 'open' && typeof intent.payload === 'string') {
      setPendingOpen(intent.payload)
    }
  })

  useEffect(() => {
    if (!pendingOpen || !loaded) return
    if (snippets.some((s) => s.id === pendingOpen)) {
      setSource({ kind: 'smart', id: 'all' })
      setTagFilter(null)
      setLangFilter(null)
      setSearch('')
      setEditing(null)
      setSelectedId(pendingOpen)
      requestAnimationFrame(() => {
        listRef.current?.querySelector(`[data-id="${CSS.escape(pendingOpen)}"]`)?.scrollIntoView({ block: 'nearest' })
      })
    }
    setPendingOpen(null)
  }, [pendingOpen, loaded, snippets])

  // ── Keyboard: Ctrl+N (only when this tab is visible) ──────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (!rootRef.current || rootRef.current.offsetParent === null) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        startNew()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived data ──────────────────────────────────────────────────────────
  const fuse = useMemo(() => new Fuse(
    snippets.map((s) => ({ id: s.id, title: s.title, tags: s.tags, description: s.description, body: stripDataUrls(s.content) })),
    {
      keys: [{ name: 'title', weight: 3 }, { name: 'tags', weight: 2 }, { name: 'description', weight: 1 }, { name: 'body', weight: 1 }],
      threshold: 0.35,
      ignoreLocation: true,
    },
  ), [snippets])

  const allTags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const s of snippets) for (const t of s.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t)
  }, [snippets])

  const usedLangs = useMemo(() => LANGUAGES.filter((l) => snippets.some((s) => s.language === l)), [snippets])

  const visible = useMemo(() => {
    let base: Snippet[]
    if (search.trim()) {
      const byId = new Map(snippets.map((s) => [s.id, s]))
      base = fuse.search(search.trim()).map((r) => byId.get(r.item.id)!).filter(Boolean)
    } else {
      base = [...snippets].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      })
    }
    if (source.kind === 'collection') base = base.filter((s) => s.collectionId === source.id)
    else if (source.id === 'pinned') base = base.filter((s) => s.pinned)
    else if (source.id === 'recent') {
      base = base.filter((s) => s.lastUsedAt)
      if (!search.trim()) base.sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0))
    } else if (source.id === 'popular') {
      base = base.filter((s) => (s.useCount ?? 0) > 0)
      if (!search.trim()) base.sort((a, b) => (b.useCount ?? 0) - (a.useCount ?? 0))
    }
    if (tagFilter) base = base.filter((s) => s.tags.includes(tagFilter))
    if (langFilter) base = base.filter((s) => s.language === langFilter)
    return base
  }, [snippets, search, source, tagFilter, langFilter, fuse])

  const sourceTitle = source.kind === 'collection'
    ? collections.find((c) => c.id === source.id)?.name ?? 'Colección'
    : { all: 'Todos', pinned: 'Fijados', recent: 'Recientes', popular: 'Más usados' }[source.id]

  // ── Actions ───────────────────────────────────────────────────────────────
  const markUsed = async (id: string): Promise<void> => {
    try {
      const res = await window.api.invoke<{ ok: boolean; lastUsedAt?: number; useCount?: number }>('snippets:mark-used', id)
      if (res.ok) {
        setSnippets((prev) => prev.map((s) => (s.id === id ? { ...s, lastUsedAt: res.lastUsedAt, useCount: res.useCount } : s)))
      }
    } catch { /* no crítico */ }
  }

  const perform = async (s: Snippet, mode: VariablesMode, text: string): Promise<void> => {
    if (mode === 'run') {
      dispatch({ type: 'RUN_IN_TERMINAL', content: text })
    } else {
      try {
        await navigator.clipboard.writeText(text)
        setCopiedId(s.id)
        setTimeout(() => setCopiedId((cur) => (cur === s.id ? null : cur)), 1800)
        showToast('Copiado', 'success', 1800)
      } catch {
        showToast('No se pudo copiar al portapapeles', 'error')
        return
      }
    }
    void markUsed(s.id)
  }

  /** Text that gets copied/run: content without embedded images. */
  const plainText = (s: Snippet): string => (hasImages(s.content) ? stripDataUrls(s.content).trim() : s.content)

  const applySnippet = (s: Snippet, mode: VariablesMode): void => {
    const text = plainText(s)
    if (hasVariables(text)) setVarsTarget({ snippet: s, mode })
    else void perform(s, mode, text)
  }

  const startNew = (partial: Partial<SnippetFormState> = {}): void => {
    setForm(emptyForm({ collectionId: source.kind === 'collection' ? source.id : null, ...partial }))
    setEditing('new')
  }

  const startEdit = (s: Snippet): void => {
    const { content, images } = collapseImages(s.content)
    setForm({ title: s.title, language: s.language, content, images, tags: [...s.tags], description: s.description, pinned: s.pinned, collectionId: s.collectionId })
    setEditing('edit')
  }

  const saveSnippet = async (): Promise<void> => {
    const now = new Date().toISOString()
    const isNew = editing === 'new' || !selected
    const id = isNew ? randomId() : selected!.id
    const { images, ...rest } = form
    const snippet: Snippet = {
      ...(isNew ? {} : selected!),
      id,
      ...rest,
      title: rest.title.trim(),
      content: expandImages(rest.content, images),
      createdAt: isNew ? now : selected!.createdAt,
      updatedAt: now,
    }
    try {
      await window.api.invoke('snippets:save', snippet)
      await reload()
      setSelectedId(id)
      setEditing(null)
      showToast(isNew ? 'Snippet creado' : 'Cambios guardados', 'success', 2000)
    } catch (err) {
      showToast(`No se pudo guardar: ${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }

  const duplicateSnippet = async (s: Snippet): Promise<void> => {
    const now = new Date().toISOString()
    const copy: Snippet = {
      ...s, id: randomId(), title: `${s.title} (copia)`, pinned: false,
      createdAt: now, updatedAt: now, lastUsedAt: undefined, useCount: undefined,
    }
    await window.api.invoke('snippets:save', copy)
    await reload()
    setSelectedId(copy.id)
    showToast('Snippet duplicado', 'success', 2000)
  }

  const deleteSnippet = async (s: Snippet): Promise<void> => {
    const ok = await confirm({
      title: `¿Eliminar «${s.title || 'Sin título'}»?`,
      message: 'Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar',
      destructive: true,
    })
    if (!ok) return
    await window.api.invoke('snippets:delete', s.id)
    setSelectedId(null)
    await reload()
  }

  const togglePin = async (s: Snippet): Promise<void> => {
    await window.api.invoke('snippets:save', { ...s, pinned: !s.pinned })
    await reload()
  }

  const createCollection = async (): Promise<void> => {
    const name = newColName?.trim()
    if (!name) { setNewColName(null); return }
    const col: SnippetCollection = { id: randomId(), name, createdAt: new Date().toISOString() }
    const updated = [...collections, col]
    await window.api.invoke('snippets:collections-save', updated)
    setCollections(updated)
    setNewColName(null)
    setSource({ kind: 'collection', id: col.id })
  }

  const deleteCollection = async (col: SnippetCollection): Promise<void> => {
    const count = snippets.filter((s) => s.collectionId === col.id).length
    const ok = await confirm({
      title: `¿Eliminar la colección «${col.name}»?`,
      message: count ? `Los ${count} snippets que contiene quedan sin colección; no se borran.` : undefined,
      confirmLabel: 'Eliminar',
      destructive: true,
    })
    if (!ok) return
    const updated = collections.filter((c) => c.id !== col.id)
    await window.api.invoke('snippets:collections-save', updated)
    for (const s of snippets.filter((x) => x.collectionId === col.id)) {
      await window.api.invoke('snippets:save', { ...s, collectionId: null })
    }
    if (source.kind === 'collection' && source.id === col.id) setSource({ kind: 'smart', id: 'all' })
    await reload()
  }

  const exportAll = async (): Promise<void> => {
    try {
      const res = await window.api.invoke<{ ok: boolean; filePath?: string }>('snippets:export')
      if (res.ok) showToast('Snippets exportados', 'success')
    } catch (err) {
      showToast(`No se pudo exportar: ${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }

  const importAll = async (): Promise<void> => {
    try {
      const res = await window.api.invoke<{ ok: boolean; count?: number }>('snippets:import')
      if (res.ok) {
        await reload()
        showToast(`Se importaron ${res.count ?? 0} snippets`, 'success')
      }
    } catch (err) {
      showToast(`No se pudo importar: ${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }

  const isSmart = (id: SmartFilter): boolean => source.kind === 'smart' && source.id === id

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div ref={rootRef} className="flex h-full overflow-hidden bg-background">
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="w-56 flex-shrink-0 flex flex-col bg-surface hairline-r overflow-hidden">
        <div className="px-3 pt-4 pb-2 flex-shrink-0 space-y-3">
          <div className="flex items-center gap-2 pl-1.5">
            <h2 className="t-headline text-on-surface">Snippets</h2>
            <span className="t-caption font-medium tabular-nums text-on-surface-variant/70">{snippets.length}</span>
          </div>
          <div className="ui-input flex items-center gap-2 h-8 pl-2.5">
            <Search size={14} className="text-on-surface-variant/70 flex-shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar snippets"
              aria-label="Buscar snippets"
              className="flex-1 min-w-0 bg-transparent t-body text-on-surface outline-none"
            />
            {search && (
              <button onClick={() => setSearch('')} aria-label="Limpiar búsqueda" className="text-on-surface-variant hover:text-on-surface">
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 pb-3 pt-1">
          <div className="flex flex-col gap-0.5">
            <NavRow active={isSmart('all')} icon={LayoutGrid} label="Todos" count={snippets.length} onClick={() => setSource({ kind: 'smart', id: 'all' })} />
            <NavRow active={isSmart('pinned')} icon={Pin} label="Fijados" count={snippets.filter((s) => s.pinned).length} onClick={() => setSource({ kind: 'smart', id: 'pinned' })} />
            <NavRow active={isSmart('recent')} icon={Clock} label="Recientes" onClick={() => setSource({ kind: 'smart', id: 'recent' })} />
            <NavRow active={isSmart('popular')} icon={Flame} label="Más usados" onClick={() => setSource({ kind: 'smart', id: 'popular' })} />
          </div>

          <SectionHeader
            label="Colecciones"
            action={
              <button
                onClick={() => setNewColName('')}
                title="Nueva colección"
                aria-label="Nueva colección"
                className="ui-btn ui-btn-ghost ui-btn-icon rounded-md p-1 text-on-surface-variant"
              >
                <FolderPlus size={14} />
              </button>
            }
          />
          <div className="flex flex-col gap-0.5">
            {collections.map((col) => (
              <NavRow
                key={col.id}
                active={source.kind === 'collection' && source.id === col.id}
                icon={Folder}
                label={col.name}
                count={snippets.filter((s) => s.collectionId === col.id).length}
                onClick={() => setSource({ kind: 'collection', id: col.id })}
                onDelete={() => void deleteCollection(col)}
              />
            ))}
            {newColName !== null && (
              <form onSubmit={(e) => { e.preventDefault(); void createCollection() }} className="flex items-center gap-1 px-1 py-0.5">
                <input
                  autoFocus
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  onBlur={() => void createCollection()}
                  onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setNewColName(null) } }}
                  placeholder="Nombre de la colección"
                  className="ui-input flex-1 h-8"
                />
              </form>
            )}
            {collections.length === 0 && newColName === null && (
              <p className="t-footnote text-on-surface-variant/70 px-2.5 py-1">Todavía no hay colecciones.</p>
            )}
          </div>

          {allTags.length > 0 && (
            <>
              <SectionHeader label="Etiquetas" collapsed={folded.tags} onToggle={() => setFolded((f) => ({ ...f, tags: !f.tags }))} />
              {!folded.tags && (
                <div className="flex flex-wrap gap-1 px-2 pt-0.5">
                  {allTags.slice(0, 30).map((t) => (
                    <Chip key={t} label={`#${t}`} active={tagFilter === t} onClick={() => setTagFilter(tagFilter === t ? null : t)} />
                  ))}
                </div>
              )}
            </>
          )}

          {usedLangs.length > 1 && (
            <>
              <SectionHeader label="Lenguajes" collapsed={folded.langs} onToggle={() => setFolded((f) => ({ ...f, langs: !f.langs }))} />
              {!folded.langs && (
                <div className="flex flex-wrap gap-1 px-2 pt-0.5">
                  {usedLangs.map((l) => (
                    <Chip key={l} label={langLabel(l)} active={langFilter === l} onClick={() => setLangFilter(langFilter === l ? null : l)} />
                  ))}
                </div>
              )}
            </>
          )}
        </nav>

        <div className="flex items-center gap-1 px-2.5 h-11 hairline-t flex-shrink-0">
          <button onClick={() => void importAll()} className="ui-btn ui-btn-ghost ui-btn-sm flex-1 justify-center" title="Importar snippets desde un JSON">
            <Upload size={13} /> Importar
          </button>
          <button onClick={() => void exportAll()} className="ui-btn ui-btn-ghost ui-btn-sm flex-1 justify-center" title="Exportar todos los snippets a un JSON">
            <Download size={13} /> Exportar
          </button>
        </div>
      </aside>

      {/* ── List ────────────────────────────────────────────────────────── */}
      <section className="w-72 flex-shrink-0 flex flex-col bg-surface hairline-r overflow-hidden">
        <div className="h-14 pl-4 pr-3 flex items-center gap-2 hairline-b flex-shrink-0">
          <div className="flex-1 min-w-0">
            <div className="t-headline text-on-surface truncate">{sourceTitle}</div>
            <div className="t-caption text-on-surface-variant/80 mt-0.5">
              {visible.length} {visible.length === 1 ? 'snippet' : 'snippets'}
              {(tagFilter || langFilter) && (
                <button
                  onClick={() => { setTagFilter(null); setLangFilter(null) }}
                  className="ml-1.5 text-primary hover:underline"
                >
                  Quitar filtros
                </button>
              )}
            </div>
          </div>
          <button onClick={() => startNew()} className="ui-btn ui-btn-primary ui-btn-icon rounded-lg" title="Nuevo snippet (Ctrl+N)" aria-label="Nuevo snippet">
            <Plus size={15} weight="bold" />
          </button>
        </div>

        <motion.div layoutScroll ref={listRef} className="relative flex-1 overflow-y-auto p-2 space-y-0.5">
          {loaded && visible.length === 0 ? (
            <EmptyState
              compact
              icon={search || tagFilter || langFilter ? Search : BookMarked}
              title={search || tagFilter || langFilter ? 'Sin resultados' : 'No hay snippets acá'}
              description={search || tagFilter || langFilter ? 'Probá con otra búsqueda o quitá los filtros.' : 'Creá uno con Ctrl+N o el botón +.'}
            />
          ) : (
            <AnimatePresence initial={false} mode="popLayout">
            {visible.map((s) => {
              const active = s.id === selectedId
              return (
                <motion.button
                  {...listItemMotion(shouldAnimateList(visible.length))}
                  key={s.id}
                  data-id={s.id}
                  onClick={() => { setSelectedId(s.id); setEditing(null) }}
                  onDoubleClick={() => applySnippet(s, 'copy')}
                  className={`w-full text-left px-2.5 py-2 rounded-lg transition-colors duration-100 ${
                    active ? 'bg-selected' : 'hover:bg-on-surface/[0.03] dark:hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    {s.pinned && <Pin size={12} weight="fill" className={`flex-shrink-0 ${active ? 'text-primary' : 'text-on-surface-variant/70'}`} />}
                    <span className={`text-[13px] truncate flex-1 ${active ? 'font-semibold text-on-surface' : 'font-medium text-on-surface/90'}`}>{s.title || 'Sin título'}</span>
                    {s.lastUsedAt && (
                      <span className="t-caption text-on-surface-variant/70 whitespace-nowrap">{relativeTime(s.lastUsedAt)}</span>
                    )}
                  </div>
                  <div className="text-[12px] leading-4 text-on-surface-variant/80 truncate mt-0.5 font-mono">
                    {stripDataUrls(s.content).trim().split('\n')[0] || ' '}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5 min-w-0">
                    <LangBadge lang={s.language} />
                    {s.tags.slice(0, 2).map((t) => (
                      <span key={t} className="t-caption text-on-surface-variant/80 truncate">#{t}</span>
                    ))}
                  </div>
                </motion.button>
              )
            })}
            </AnimatePresence>
          )}
        </motion.div>
      </section>

      {/* ── Detail / editor ─────────────────────────────────────────────── */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {editing ? (
          <SnippetEditor
            form={form}
            setForm={setForm}
            collections={collections}
            isNew={editing === 'new'}
            onSave={() => void saveSnippet()}
            onCancel={() => setEditing(null)}
          />
        ) : selected ? (
          <SnippetDetail
            snippet={selected}
            dark={dark}
            copied={copiedId === selected.id}
            collectionName={collections.find((c) => c.id === selected.collectionId)?.name}
            onCopy={() => applySnippet(selected, 'copy')}
            onRun={() => applySnippet(selected, 'run')}
            onEdit={() => startEdit(selected)}
            onDuplicate={() => void duplicateSnippet(selected)}
            onDelete={() => void deleteSnippet(selected)}
            onTogglePin={() => void togglePin(selected)}
            onTag={(t) => setTagFilter(t)}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              icon={BookMarked}
              title="Elegí un snippet para verlo"
              description="O creá uno nuevo con Ctrl+N."
              action={<button className="ui-btn ui-btn-primary" onClick={() => startNew()}><Plus size={14} /> Nuevo snippet</button>}
            />
          </div>
        )}
      </main>

      <VariablesModal
        snippet={varsTarget?.snippet ?? null}
        content={varsTarget ? plainText(varsTarget.snippet) : ''}
        mode={varsTarget?.mode ?? 'copy'}
        onClose={() => setVarsTarget(null)}
        onSubmit={(text) => {
          const t = varsTarget
          setVarsTarget(null)
          if (t) void perform(t.snippet, t.mode, text)
        }}
      />
    </div>
  )
}

// ── Detail ────────────────────────────────────────────────────────────────────

function SnippetDetail({
  snippet, dark, copied, collectionName,
  onCopy, onRun, onEdit, onDuplicate, onDelete, onTogglePin, onTag,
}: {
  snippet: Snippet
  dark: boolean
  copied: boolean
  collectionName?: string
  onCopy: () => void
  onRun: () => void
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
  onTogglePin: () => void
  onTag: (tag: string) => void
}): JSX.Element {
  const mixed = hasImages(snippet.content)
  const canRun = SHELL_LANGUAGES.has(snippet.language) && !!snippet.content.trim()
  const withVars = hasVariables(snippet.content)

  return (
    <div className="h-full overflow-y-auto px-6 py-6 flex flex-col">
      <article className="w-full max-w-[920px] mx-auto flex-1 min-h-[420px] flex flex-col bg-surface hairline rounded-2xl shadow-sm overflow-hidden">
        <header className="pl-6 pr-4 pt-5 pb-4 flex items-start gap-3 hairline-b flex-shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="t-title3 text-on-surface truncate">{snippet.title || 'Sin título'}</h1>
              <span className="inline-flex items-center h-[20px] px-2 rounded-full bg-primary/10 text-primary text-[11px] font-medium leading-none whitespace-nowrap flex-shrink-0">
                {langLabel(snippet.language)}
              </span>
            </div>
            {snippet.description && <p className="t-body text-on-surface-variant mt-1">{snippet.description}</p>}
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button onClick={onTogglePin} className={`ui-btn ui-btn-ghost ui-btn-icon rounded-lg ${snippet.pinned ? 'text-primary' : ''}`}
              title={snippet.pinned ? 'Desfijar' : 'Fijar'} aria-label={snippet.pinned ? 'Desfijar' : 'Fijar'} aria-pressed={snippet.pinned}>
              <Pin size={16} weight={snippet.pinned ? 'fill' : 'regular'} />
            </button>
            <button onClick={onEdit} className="ui-btn ui-btn-ghost ui-btn-icon rounded-lg" title="Editar" aria-label="Editar"><Pencil size={16} /></button>
            <button onClick={onDuplicate} className="ui-btn ui-btn-ghost ui-btn-icon rounded-lg" title="Duplicar" aria-label="Duplicar"><CopyPlus size={16} /></button>
            <button onClick={onDelete} className="ui-btn ui-btn-ghost ui-btn-icon rounded-lg hover:text-error" title="Eliminar" aria-label="Eliminar"><Trash2 size={16} /></button>
            <span className="w-px h-5 bg-[var(--hairline-strong)] mx-1.5" aria-hidden />
            {canRun && (
              <button onClick={onRun} className="ui-btn ui-btn-outline mr-1.5" title="Ejecutar en la terminal">
                <SquareTerminal size={14} /> Ejecutar
              </button>
            )}
            <button onClick={onCopy} className="ui-btn ui-btn-primary" disabled={!snippet.content.trim()}>
              {copied ? <Check size={14} weight="bold" /> : <Copy size={14} />}
              {copied ? 'Copiado' : mixed ? 'Copiar texto' : 'Copiar'}
            </button>
          </div>
        </header>

        <div className="px-6 py-2.5 flex items-center gap-2 flex-wrap hairline-b flex-shrink-0">
          {collectionName && (
            <span className="inline-flex items-center gap-1 h-[20px] px-2 rounded-full bg-on-surface/[0.06] text-[11px] font-medium text-on-surface-variant">
              <Folder size={11} /> {collectionName}
            </span>
          )}
          {snippet.tags.map((t) => (
            <button
              key={t}
              onClick={() => onTag(t)}
              className="inline-flex items-center h-[20px] px-2 rounded-full bg-on-surface/[0.06] text-[11px] font-medium text-on-surface-variant hover:bg-primary/10 hover:text-primary transition-colors"
            >
              #{t}
            </button>
          ))}
          {withVars && (
            <span className="t-caption text-on-surface-variant">Tiene variables: al copiar o ejecutar te pide los valores.</span>
          )}
          <span className="ml-auto t-caption text-on-surface-variant/80">
            {snippet.useCount ? `Usado ${snippet.useCount} ${snippet.useCount === 1 ? 'vez' : 'veces'}` : 'Sin usar'}
            {snippet.lastUsedAt ? ` · último uso ${relativeTime(snippet.lastUsedAt)}` : ''}
          </span>
        </div>

        <div className="flex-1 min-h-[220px] overflow-hidden">
          {!snippet.content ? (
            <div className="h-full flex items-center justify-center t-footnote text-on-surface-variant">Sin contenido</div>
          ) : mixed ? (
            <MixedContentViewer content={snippet.content} />
          ) : (
            <CodeViewer content={snippet.content} language={snippet.language} dark={dark} />
          )}
        </div>
      </article>
    </div>

  )
}
