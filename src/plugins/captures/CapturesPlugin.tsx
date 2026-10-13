import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Camera, Copy, Download, FolderOpen, Monitor, Pencil, Pin, PinOff, Search, Settings, Ticket, Trash2, X,
} from 'lucide-react'
import { useApp, usePluginIntent } from '../../core/AppContext'
import { useToast } from '../../core/components/Toast'
import { useConfirm } from '../../core/components/Modal'
import { EmptyState } from '../../core/components/EmptyState'
import { listItemMotion, shouldAnimateList } from '../../core/motion'
import { Annotator } from './Annotator'
import { CaptureOptions } from './CaptureOptions'
import { TicketPanel } from './TicketPanel'
import { TextClips } from './TextClips'
import { SegmentedControl } from '../../core/components/SegmentedControl'
import type { PluginIntent } from '../../core/types'
import { formatBytes, groupItems } from './logic'
import {
  captureUrl, thumbUrl, type CaptureEntry, type CaptureLite, type CaptureQuery, type CaptureQueryResult, type CaptureSettings, type CaptureSort,
} from './types'

const PAGE = 60

const api = {
  query: (q: CaptureQuery) => window.api.invoke<CaptureQueryResult>('captures:query', q),
  get: (id: string) => window.api.invoke<CaptureEntry>('captures:get', id),
  update: (id: string, patch: Partial<CaptureEntry>) => window.api.invoke<CaptureEntry>('captures:update', id, patch),
  updateMany: (ids: string[], patch: Partial<CaptureEntry> & { addTags?: string[] }) => window.api.invoke('captures:update-many', ids, patch),
  remove: (ids: string[]) => window.api.invoke('captures:delete', ids),
  copy: (id: string) => window.api.invoke('captures:copy', id),
  reveal: (id?: string) => window.api.invoke('captures:reveal', id),
  exportTo: (ids: string[]) => window.api.invoke<{ canceled?: boolean; count?: number; dir?: string }>('captures:export', ids),
  saveAnnotated: (id: string, dataUrl: string, copy: boolean) => window.api.invoke<CaptureEntry>('captures:save-annotated', id, dataUrl, copy),
  settings: (patch: Partial<CaptureSettings>) => window.api.invoke<CaptureSettings>('captures:settings', patch),
}

const SORTS: { value: CaptureSort; label: string }[] = [
  { value: 'new', label: 'Más nuevas' },
  { value: 'old', label: 'Más viejas' },
  { value: 'ticket', label: 'Por ticket' },
  { value: 'app', label: 'Por app' },
  { value: 'size', label: 'Más pesadas' },
]

const SORT_KEY = 'captures:sort'
const readSort = (): CaptureSort => {
  try { const v = localStorage.getItem(SORT_KEY); if (SORTS.some((s) => s.value === v)) return v as CaptureSort } catch { /* nada */ }
  return 'new'
}

type Tab = 'images' | 'text'
const TAB_KEY = 'captures:tab'

/**
 * Módulo "Portapapeles": pestañas Imágenes (capturas) y Texto (historial de lo
 * copiado, separado por tipo). Los intents de capturas abren Imágenes; 'text', Texto.
 */
export function CapturesPlugin(): JSX.Element {
  const [tab, setTab] = useState<Tab>(() => {
    try { return localStorage.getItem(TAB_KEY) === 'text' ? 'text' : 'images' } catch { return 'images' }
  })
  const [pending, setPending] = useState<PluginIntent | null>(null)
  useEffect(() => { try { localStorage.setItem(TAB_KEY, tab) } catch { /* nada */ } }, [tab])
  usePluginIntent('captures', (intent) => {
    if (intent.action === 'text') { setTab('text'); return }
    setTab('images')
    setPending(intent)
  })
  const tabs = (
    <div className="flex items-center gap-3">
      <h1 className="t-title2 text-on-surface">Portapapeles</h1>
      <SegmentedControl<Tab> value={tab} onChange={setTab} options={[{ value: 'images', label: 'Imágenes' }, { value: 'text', label: 'Texto' }]} />
    </div>
  )
  return tab === 'text' ? <TextClips header={tabs} /> : <ImagesView header={tabs} pending={pending} />
}

function ImagesView({ header, pending }: { header: React.ReactNode; pending: PluginIntent | null }): JSX.Element {
  const { dispatch } = useApp()
  const toast = useToast()
  const confirm = useConfirm()
  const [text, setText] = useState('')
  const [debounced, setDebounced] = useState('')
  const [ticket, setTicket] = useState<string | null>(null)
  const [appFilter, setAppFilter] = useState<string | null>(null)
  const [onlyPinned, setOnlyPinned] = useState(false)
  const [sort, setSort] = useState<CaptureSort>(readSort)
  const [res, setRes] = useState<CaptureQueryResult | null>(null)
  const [items, setItems] = useState<CaptureLite[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [annotating, setAnnotating] = useState<CaptureEntry | null>(null)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [bulkTicket, setBulkTicket] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadingMore = useRef(false)

  useEffect(() => { const t = setTimeout(() => setDebounced(text), 160); return () => clearTimeout(t) }, [text])
  useEffect(() => { try { localStorage.setItem(SORT_KEY, sort) } catch { /* nada */ } }, [sort])

  const baseQuery = useMemo<CaptureQuery>(() => ({ text: debounced, ticket, app: appFilter, pinned: onlyPinned, sort }), [debounced, ticket, appFilter, onlyPinned, sort])

  /** Recarga lo que ya está a la vista (mínimo una página) con los filtros actuales. */
  const loadedRef = useRef(PAGE)
  const reload = useCallback(async (keep = true) => {
    const limit = keep ? Math.min(500, Math.max(PAGE, loadedRef.current)) : PAGE
    try {
      const r = await api.query({ ...baseQuery, offset: 0, limit })
      setRes(r)
      setItems(r.items)
      loadedRef.current = r.items.length
    } catch (err) {
      toast.show(`No se pudieron leer las capturas: ${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }, [baseQuery, toast])

  useEffect(() => { void reload(false) }, [reload])
  useEffect(() => window.api.on('captures:changed', () => { void reload(true) }), [reload])

  // Scroll infinito: al asomar el final, traer la página siguiente.
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver(async ([e]) => {
      if (!e?.isIntersecting || loadingMore.current || !res || items.length >= res.total) return
      loadingMore.current = true
      try {
        const r = await api.query({ ...baseQuery, offset: items.length, limit: PAGE })
        setItems((prev) => { const next = [...prev, ...r.items.filter((x) => !prev.some((p) => p.id === x.id))]; loadedRef.current = next.length; return next })
      } finally { loadingMore.current = false }
    }, { rootMargin: '600px' })
    io.observe(el)
    return () => io.disconnect()
  }, [baseQuery, items.length, res])

  // Intents que llegan desde el contenedor (Ctrl+K, notificaciones, otros módulos).
  useEffect(() => {
    if (!pending) return
    if (pending.action === 'open' && typeof pending.payload === 'string') setSelected([pending.payload])
    else if (pending.action === 'ticket' && typeof pending.payload === 'string') { setTicket(pending.payload.toUpperCase()); setSelected([]) }
  }, [pending])

  const groups = useMemo(() => groupItems(items, sort), [items, sort])
  const current = selected.length === 1 ? selected[0]! : null

  const copy = async (id: string): Promise<void> => {
    await api.copy(id)
    toast.show('Imagen copiada: pegala en Jira, Teams o donde quieras', 'success')
  }
  const del = async (ids: string[]): Promise<void> => {
    const ok = await confirm({
      title: ids.length === 1 ? '¿Eliminar la captura?' : `¿Eliminar ${ids.length} capturas?`,
      message: 'Los archivos van a la papelera del sistema.',
      confirmLabel: 'Eliminar', destructive: true,
    })
    if (!ok) return
    await api.remove(ids)
    setSelected([])
  }
  const exportSel = async (ids: string[]): Promise<void> => {
    const r = await api.exportTo(ids)
    if (r.count) toast.show(`Exportadas ${r.count} captura${r.count === 1 ? '' : 's'}`, 'success')
  }
  const openAnnotator = async (id: string): Promise<void> => setAnnotating(await api.get(id))

  const onCardClick = (e: React.MouseEvent, id: string): void => {
    if (e.ctrlKey || e.metaKey) setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
    else if (e.shiftKey && selected.length) {
      const flat = items.map((x) => x.id)
      const a = flat.indexOf(selected[selected.length - 1]!)
      const b = flat.indexOf(id)
      setSelected(flat.slice(Math.min(a, b), Math.max(a, b) + 1))
    } else setSelected([id])
  }

  // Atajos: Ctrl+C copia · Supr borra · Enter anota · Ctrl+A todas · / busca · flechas mueven
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (annotating || optionsOpen) return
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement as HTMLElement | null)?.tagName ?? '')
      if ((e.ctrlKey && e.key.toLowerCase() === 'f') || (e.key === '/' && !typing)) { e.preventDefault(); searchRef.current?.focus(); return }
      if (typing) return
      if (e.ctrlKey && e.key.toLowerCase() === 'a') { e.preventDefault(); setSelected(items.map((x) => x.id)) }
      else if (e.ctrlKey && e.key.toLowerCase() === 'c' && current) { e.preventDefault(); void copy(current) }
      else if (e.key === 'Delete' && selected.length) { e.preventDefault(); void del(selected) }
      else if (e.key === 'Enter' && current) { e.preventDefault(); void openAnnotator(current) }
      else if (e.key === 'Escape' && selected.length) setSelected([])
      else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && items.length) {
        e.preventDefault()
        const i = current ? items.findIndex((x) => x.id === current) : -1
        const next = items[Math.min(items.length - 1, Math.max(0, i + (e.key === 'ArrowRight' ? 1 : -1)))]
        if (next) { setSelected([next.id]); document.querySelector(`[data-capture="${next.id}"]`)?.scrollIntoView({ block: 'nearest' }) }
      }
    }
    const root = document.getElementById('captures-root')
    root?.addEventListener('keydown', onKey)
    return () => root?.removeEventListener('keydown', onKey)
  })

  const facets = res?.facets
  const settings = res?.settings
  const animate = shouldAnimateList(items.length)
  const filtered = !!(debounced || ticket || appFilter || onlyPinned)

  return (
    <div id="captures-root" tabIndex={-1} className="flex h-full w-full overflow-hidden bg-background outline-none">
      <section className="flex-1 min-w-0 flex flex-col">
        {/* ── Barra ── */}
        <div className="px-6 pt-5 pb-3 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            {header}
            {facets && (
              <span className="t-footnote text-on-surface-variant tabular-nums" title="Cantidad y espacio usado">
                {filtered && res ? `${res.total} de ${facets.count}` : facets.count} · {formatBytes(facets.bytes)}
              </span>
            )}
            {settings && !settings.auto && (
              <button type="button" onClick={() => { void api.settings({ auto: true }).then(() => reload()) }}
                className="t-caption font-medium px-2 py-0.5 rounded-full bg-warning/[0.14] text-warning">
                En pausa · reanudar
              </button>
            )}
            <span className="flex-1" />
            <select className="ui-input h-8 w-36" value={sort} onChange={(e) => setSort(e.target.value as CaptureSort)} aria-label="Ordenar">
              {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon" onClick={() => void api.reveal()} title="Abrir la carpeta de capturas"><FolderOpen size={15} /></button>
            <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon" onClick={() => setOptionsOpen(true)} title="Opciones de capturas"><Settings size={15} /></button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative w-80 max-w-full">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant/70 pointer-events-none" />
              <input ref={searchRef} type="search" value={text} onChange={(e) => setText(e.target.value)}
                placeholder="Buscar texto de la imagen, ticket, app…" className="ui-input w-full h-8 pl-8" aria-label="Buscar capturas" />
            </div>
            <FilterChip active={onlyPinned} onClick={() => setOnlyPinned((v) => !v)} icon={<Pin size={11} />}>Fijadas</FilterChip>
            {facets?.tickets.slice(0, 6).map((t) => (
              <FilterChip key={t} active={ticket === t} onClick={() => setTicket(ticket === t ? null : t)} icon={<Ticket size={11} />}>{t}</FilterChip>
            ))}
            {facets && facets.apps.length > 1 && facets.apps.slice(0, 5).map((a) => (
              <FilterChip key={a.name} active={appFilter === a.name} onClick={() => setAppFilter(appFilter === a.name ? null : a.name)} icon={<Monitor size={11} />}>
                {a.name} <span className="opacity-60 tabular-nums">{a.count}</span>
              </FilterChip>
            ))}
          </div>
        </div>

        {ticket && (
          <TicketPanel
            ticket={ticket}
            onClear={() => setTicket(null)}
            onOpenNote={(id) => dispatch({ type: 'OPEN_WITH_INTENT', pluginId: 'notes', action: 'open', payload: id })}
          />
        )}

        {/* ── Selección múltiple ── */}
        <AnimatePresence>
          {selected.length > 1 && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              className="mx-6 mb-2 flex items-center gap-2 rounded-lg bg-selected px-3 py-2 t-footnote text-on-surface flex-wrap">
              <span className="font-medium">{selected.length} seleccionadas</span>
              <span className="t-caption text-on-surface-variant">· arrastralas juntas a otra app</span>
              <span className="flex-1" />
              {bulkTicket === null ? (
                <button type="button" className="ui-btn ui-btn-outline ui-btn-sm" onClick={() => setBulkTicket('')}><Ticket size={12} /> Asignar ticket</button>
              ) : (
                <form className="flex items-center gap-1" onSubmit={(e) => {
                  e.preventDefault()
                  void api.updateMany(selected, { ticket: bulkTicket }).then(() => { setBulkTicket(null); toast.show('Ticket asignado', 'success') })
                }}>
                  <input autoFocus className="ui-input h-7 w-36 font-mono uppercase" placeholder="WIGOS-123456" value={bulkTicket}
                    onChange={(e) => setBulkTicket(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setBulkTicket(null) }} />
                  <button type="submit" className="ui-btn ui-btn-primary ui-btn-sm">Asignar</button>
                </form>
              )}
              <button type="button" className="ui-btn ui-btn-outline ui-btn-sm" onClick={() => { void api.updateMany(selected, { pinned: true }) }}><Pin size={12} /> Fijar</button>
              <button type="button" className="ui-btn ui-btn-outline ui-btn-sm" onClick={() => void exportSel(selected)}><Download size={12} /> Exportar</button>
              <button type="button" className="ui-btn ui-btn-outline ui-btn-sm hover:text-error" onClick={() => void del(selected)}><Trash2 size={12} /> Eliminar</button>
              <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon" onClick={() => setSelected([])} aria-label="Quitar selección"><X size={13} /></button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Galería ── */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {res && facets?.count === 0 ? (
            <div className="h-full flex items-center justify-center">
              <EmptyState
                icon={Camera}
                title="Todavía no hay capturas"
                description={settings?.auto
                  ? 'Recortá algo con Win+Shift+S (o copiá cualquier imagen) y aparece acá sola.\nDespués podés buscarla por el texto que tiene, anotarla y arrastrarla a Jira.'
                  : 'La captura automática está en pausa. Reanudala para que cada recorte quede guardado acá.'}
              />
            </div>
          ) : res && items.length === 0 ? (
            <p className="t-body text-on-surface-variant text-center py-16">Nada coincide con la búsqueda.</p>
          ) : groups.map((g) => (
            <div key={g.key} className="mb-5">
              <div className="t-section mb-2 px-0.5 flex items-center gap-2">
                <span>{g.label}</span>
                <span className="font-normal opacity-60 tabular-nums">{g.items.length}</span>
              </div>
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                <AnimatePresence initial={false} mode="popLayout">
                  {g.items.map((c) => (
                    <CaptureCard
                      key={c.id}
                      c={c}
                      animate={animate}
                      selected={selected.includes(c.id)}
                      dragIds={selected.includes(c.id) && selected.length > 1 ? selected : [c.id]}
                      onClick={(e) => onCardClick(e, c.id)}
                      onCopy={() => void copy(c.id)}
                      onAnnotate={() => void openAnnotator(c.id)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          ))}
          <div ref={sentinelRef} className="h-8" />
          {res && items.length < res.total && <p className="t-caption text-on-surface-variant text-center">Cargando más…</p>}
        </div>
      </section>

      {/* ── Detalle ── */}
      <AnimatePresence>
        {current && (
          <motion.aside
            key="detail"
            initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }}
            transition={{ type: 'spring', stiffness: 420, damping: 38 }}
            className="w-[380px] shrink-0 bg-surface hairline-l flex flex-col overflow-hidden"
          >
            <Detail
              key={current}
              id={current}
              onClose={() => setSelected([])}
              onCopy={() => void copy(current)}
              onAnnotate={(e) => setAnnotating(e)}
              onDelete={() => void del([current])}
              onReveal={() => void api.reveal(current)}
              onExport={() => void exportSel([current])}
            />
          </motion.aside>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {annotating && (
          <Annotator
            key={annotating.id}
            entry={annotating}
            onClose={() => setAnnotating(null)}
            onSave={async (dataUrl, copyIt) => {
              const created = await api.saveAnnotated(annotating.id, dataUrl, copyIt)
              setAnnotating(null)
              setSelected([created.id])
              toast.show(copyIt ? 'Anotada y copiada' : 'Guardada como captura nueva', 'success')
            }}
          />
        )}
      </AnimatePresence>

      {settings && facets && (
        <CaptureOptions
          open={optionsOpen}
          settings={settings}
          facets={facets}
          dir={res?.dir ?? ''}
          onClose={() => setOptionsOpen(false)}
          onChange={async (patch) => { await api.settings(patch); await reload() }}
        />
      )}
    </div>
  )
}

function CaptureCard({ c, animate, selected, dragIds, onClick, onCopy, onAnnotate }: {
  c: CaptureLite
  animate: boolean
  selected: boolean
  dragIds: string[]
  onClick: (e: React.MouseEvent) => void
  onCopy: () => void
  onAnnotate: () => void
}): JSX.Element {
  const time = new Date(c.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  return (
    <motion.button
      {...listItemMotion(animate)}
      type="button"
      data-capture={c.id}
      draggable
      onDragStart={(e) => { e.preventDefault(); window.api.send('captures:start-drag', dragIds) }}
      onClick={onClick}
      onDoubleClick={onAnnotate}
      title="Clic: ver · Ctrl/Shift+clic: varias · Doble clic: anotar · Arrastrar: adjuntar en otra app"
      className={`group text-left rounded-xl bg-surface overflow-hidden transition-shadow ${
        selected ? 'shadow-[0_0_0_2px_rgb(var(--c-primary))]' : 'hairline hover:shadow-md'
      }`}
    >
      <span className="block relative aspect-[16/10] bg-surface-container overflow-hidden">
        <img src={thumbUrl(c.file)} alt="" loading="lazy" decoding="async" draggable={false} className="w-full h-full object-cover object-top" />
        {c.pinned && <Pin size={13} weight="fill" className="absolute top-1.5 left-1.5 text-primary drop-shadow" />}
        {c.annotatedFrom && <span className="absolute bottom-1.5 left-1.5 t-caption font-medium px-1.5 rounded bg-black/55 text-white">anotada</span>}
        <span className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <IconBtn label="Copiar" onClick={onCopy}><Copy size={12} /></IconBtn>
          <IconBtn label="Anotar" onClick={onAnnotate}><Pencil size={12} /></IconBtn>
        </span>
      </span>
      <span className="block px-2.5 py-2">
        <span className="flex items-center gap-1.5">
          <span className="t-footnote font-medium text-on-surface truncate flex-1" title={c.title}>{c.title}</span>
          {c.ticket && <span className="t-caption font-medium text-primary shrink-0">{c.ticket}</span>}
        </span>
        <span className="flex items-center gap-1 t-caption text-on-surface-variant">
          <span className="truncate">{[c.app, time, `${c.width}×${c.height}`].filter(Boolean).join(' · ')}</span>
          {c.ocrState === 'pending' && <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-primary animate-pulse" title="Leyendo el texto…" />}
        </span>
      </span>
    </motion.button>
  )
}

function FilterChip({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon?: React.ReactNode; children: React.ReactNode }): JSX.Element {
  return (
    <button type="button" aria-pressed={active} onClick={onClick}
      className={`inline-flex items-center gap-1 h-[26px] px-2.5 rounded-full text-[12px] font-medium transition-colors ${
        active ? 'bg-primary text-on-primary' : 'bg-on-surface/[0.06] text-on-surface-variant hover:bg-on-surface/[0.1] hover:text-on-surface'
      }`}>
      {icon}{children}
    </button>
  )
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }): JSX.Element {
  return (
    <span role="button" tabIndex={0} aria-label={label} title={label}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onClick() } }}
      className="w-7 h-7 rounded-md flex items-center justify-center bg-surface/95 text-on-surface shadow-md hover:text-primary">
      {children}
    </span>
  )
}

function Detail({ id, onClose, onCopy, onAnnotate, onDelete, onReveal, onExport }: {
  id: string
  onClose: () => void
  onCopy: () => void
  onAnnotate: (e: CaptureEntry) => void
  onDelete: () => void
  onReveal: () => void
  onExport: () => void
}): JSX.Element {
  const toast = useToast()
  const [entry, setEntry] = useState<CaptureEntry | null>(null)
  const [title, setTitle] = useState('')
  const [ticketV, setTicketV] = useState('')
  const [tags, setTags] = useState('')
  const [note, setNote] = useState('')
  const editing = useRef(false)

  const load = useCallback(async (initial: boolean) => {
    try {
      const e = await api.get(id)
      setEntry(e)
      // Al recargar (p. ej. terminó el OCR) no pisar lo que se está escribiendo.
      if (initial || !editing.current) { setTitle(e.title); setTicketV(e.ticket); setTags(e.tags.join(', ')); setNote(e.note) }
    } catch { /* se borró */ }
  }, [id])
  useEffect(() => { void load(true) }, [load])
  useEffect(() => window.api.on('captures:changed', () => { void load(false) }), [load])

  if (!entry) return <div className="p-6 t-footnote text-on-surface-variant">Cargando…</div>

  const save = (patch: Partial<CaptureEntry>): void => {
    editing.current = false
    setEntry((e) => e && { ...e, ...patch })
    void api.update(id, patch)
  }
  const field = { onFocus: () => { editing.current = true } }
  const date = new Date(entry.createdAt).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <>
      <div className="flex items-center gap-1 px-3 h-12 hairline-b shrink-0">
        <span className="t-footnote text-on-surface-variant flex-1 truncate pl-1">{date} · {entry.width}×{entry.height} · {formatBytes(entry.bytes)}</span>
        <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon" onClick={() => save({ pinned: !entry.pinned })} title={entry.pinned ? 'Desfijar' : 'Fijar (nunca se borra sola)'}>
          {entry.pinned ? <PinOff size={14} /> : <Pin size={14} />}
        </button>
        <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon" onClick={onReveal} title="Mostrar en la carpeta"><FolderOpen size={14} /></button>
        <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon hover:text-error" onClick={onDelete} title="Eliminar (Supr)"><Trash2 size={14} /></button>
        <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon" onClick={onClose} aria-label="Cerrar detalle"><X size={14} /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        <button type="button" onClick={() => onAnnotate(entry)} draggable
          onDragStart={(e) => { e.preventDefault(); window.api.send('captures:start-drag', [entry.id]) }}
          className="block rounded-lg overflow-hidden hairline bg-surface-container" title="Clic para anotar · Arrastrá para adjuntar">
          <img src={captureUrl(entry.file)} alt={entry.title} draggable={false} className="w-full max-h-64 object-contain" />
        </button>
        <div className="flex gap-2">
          <button type="button" className="ui-btn ui-btn-primary flex-1" onClick={onCopy}><Copy size={13} /> Copiar</button>
          <button type="button" className="ui-btn ui-btn-outline flex-1" onClick={() => onAnnotate(entry)}><Pencil size={13} /> Anotar</button>
          <button type="button" className="ui-btn ui-btn-outline" onClick={onExport} title="Guardar el PNG en una carpeta con nombre legible"><Download size={13} /></button>
        </div>
        {(entry.app || entry.window) && (
          <div className="flex items-center gap-2 t-footnote text-on-surface-variant" title="Ventana en primer plano al capturar">
            <Monitor size={13} className="shrink-0" />
            <span className="truncate"><span className="font-medium text-on-surface">{entry.app}</span>{entry.window && ` · ${entry.window}`}</span>
          </div>
        )}
        <Field label="Título">
          <input {...field} className="ui-input w-full" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title !== entry.title && save({ title })} />
        </Field>
        <Field label="Ticket" hint={entry.ticket && (entry.ocr ?? '').toUpperCase().replace(/\s/g, '').includes(entry.ticket) ? 'Detectado en la imagen' : undefined}>
          <input {...field} className="ui-input w-full font-mono uppercase" value={ticketV} placeholder="WIGOS-123456"
            onChange={(e) => setTicketV(e.target.value)} onBlur={() => ticketV.trim().toUpperCase() !== entry.ticket && save({ ticket: ticketV.trim().toUpperCase() })} />
        </Field>
        <Field label="Etiquetas" hint="Separadas por coma">
          <input {...field} className="ui-input w-full" value={tags} placeholder="cajero, error, lps"
            onChange={(e) => setTags(e.target.value)}
            onBlur={() => save({ tags: tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean) })} />
        </Field>
        <Field label="Nota">
          <textarea {...field} className="ui-input w-full min-h-[64px] resize-y" value={note} placeholder="Qué muestra, cómo reproducirlo…"
            onChange={(e) => setNote(e.target.value)} onBlur={() => note !== entry.note && save({ note })} />
        </Field>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="t-footnote font-medium text-on-surface-variant flex-1">Texto de la imagen</span>
            {entry.ocr && (
              <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm"
                onClick={() => { void navigator.clipboard.writeText(entry.ocr!).then(() => toast.show('Texto copiado', 'success')) }}>
                <Copy size={11} /> Copiar texto
              </button>
            )}
          </div>
          <pre className="ui-card px-3 py-2 t-caption text-on-surface whitespace-pre-wrap break-words max-h-48 overflow-auto select-text font-sans">
            {entry.ocr === null ? 'Leyendo el texto…' : entry.ocr || 'No se reconoció texto.'}
          </pre>
        </div>
      </div>
    </>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }): JSX.Element {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline gap-2">
        <span className="t-footnote font-medium text-on-surface-variant">{label}</span>
        {hint && <span className="t-caption text-on-surface-variant/70">{hint}</span>}
      </span>
      {children}
    </label>
  )
}
