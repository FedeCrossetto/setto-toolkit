import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ClipboardText, Code2, Copy, Download, ExternalLink, FileCode2, FileText, FolderOpen, Images, NotebookPen, Pin, PinOff, Plus, Search, Ticket, Trash2, X,
} from 'lucide-react'
import { useApp, usePluginIntent, useModuleSubtitle } from '../../core/AppContext'
import { useToast } from '../../core/components/Toast'
import { Modal } from '../../core/components/Modal'
import { SegmentedControl } from '../../core/components/SegmentedControl'
import { Toggle } from '../../core/components/Form'
import { EmptyState } from '../../core/components/EmptyState'
import type { IconComponent } from '../../core/types'
import { buildTicketComment, type CommentFormat } from '../captures/ticket-comment'
import { thumbUrl, type CaptureEntry } from '../captures/types'
import type { NoteContent } from '../notes/types'
import {
  exportMarkdown, filterSummaries, jiraUrl, normalizeKey, noteIdFor, noteTemplate, SOURCE_LABEL,
  type TicketDetail, type TicketRef, type TicketSource, type TicketSummary,
} from './logic'

const invoke = window.api.invoke
const errMsg = (e: unknown): string =>
  (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

const SOURCE_ICON: Record<TicketSource, IconComponent> = {
  capture: Images, note: NotebookPen, snippet: Code2, clip: ClipboardText, file: FileCode2,
}

function ago(t: number): string {
  if (!t) return ''
  const s = Math.max(0, (Date.now() - t) / 1000)
  if (s < 60) return 'recién'
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`
  if (s < 86400 * 7) return `hace ${Math.floor(s / 86400)} d`
  return new Date(t).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

/**
 * Tickets: una página por ticket (WIGOS-132764) con todo lo que lo menciona.
 * El índice lo arma main (`tickets:list` / `tickets:get`); acá sólo se muestra.
 */
export function TicketsPlugin(): JSX.Element {
  const toast = useToast()
  const [list, setList] = useState<TicketSummary[]>([])
  const [loaded, setLoaded] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [rev, setRev] = useState(0)

  const reload = useCallback(async () => {
    try {
      const l = await invoke<TicketSummary[]>('tickets:list')
      setList(l)
      setSelected((cur) => cur ?? l[0]?.key ?? null)
    } catch (e) { toast.show(`No se pudieron leer los tickets: ${errMsg(e)}`, 'error') }
    setLoaded(true)
    setRev((r) => r + 1)
  }, [toast])

  useEffect(() => { void reload() }, [reload])
  useEffect(() => window.api.on('captures:changed', () => { void reload() }), [reload])
  useEffect(() => {
    const onFocus = (): void => { void reload() }
    window.addEventListener('focus', onFocus)
    const t = setInterval(() => { if (document.visibilityState === 'visible') void reload() }, 20_000)
    return () => { window.removeEventListener('focus', onFocus); clearInterval(t) }
  }, [reload])

  const addKey = useCallback(async (raw: string): Promise<boolean> => {
    const k = normalizeKey(raw)
    if (!k) { toast.show('Escribí una clave como WIGOS-132764', 'error'); return false }
    try { await invoke('tickets:add', k) } catch (e) { toast.show(errMsg(e), 'error'); return false }
    setSelected(k)
    await reload()
    return true
  }, [reload, toast])

  usePluginIntent('tickets', (intent) => {
    if (intent.action !== 'open' || typeof intent.payload !== 'string') return
    const k = normalizeKey(intent.payload)
    if (!k) return
    setQuery('')
    if (list.some((t) => t.key === k)) setSelected(k)
    else void addKey(k)
  })

  useModuleSubtitle('tickets', selected)
  const shown = useMemo(() => filterSummaries(list, query), [list, query])

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-64 shrink-0 flex flex-col fl-pane hairline-r overflow-hidden">
        <div className="px-3 pt-4 pb-2 shrink-0 space-y-3">
          <div className="flex items-center gap-2 pl-1.5">
            <h2 className="t-headline text-on-surface">Tickets</h2>
            <span className="t-caption font-medium tabular-nums text-on-surface-variant/70">{list.length}</span>
            <span className="flex-1" />
            <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon" title="Agregar un ticket" aria-label="Agregar un ticket" onClick={() => setAdding((v) => !v)}>
              <Plus size={14} />
            </button>
          </div>
          {adding && (
            <form className="fl-search" onSubmit={(e) => { e.preventDefault(); void addKey(newKey).then((ok) => { if (ok) { setNewKey(''); setAdding(false) } }) }}>
              <Ticket size={14} className="text-on-surface-variant/70 shrink-0" />
              <input autoFocus value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="WIGOS-132764 y Enter"
                aria-label="Clave del ticket" className="flex-1 min-w-0 bg-transparent t-body text-on-surface outline-hidden font-mono"
                onKeyDown={(e) => { if (e.key === 'Escape') { setAdding(false); setNewKey('') } }} />
            </form>
          )}
          <div className="fl-search">
            <Search size={14} className="text-on-surface-variant/70 shrink-0" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar tickets" aria-label="Buscar tickets"
              className="flex-1 min-w-0 bg-transparent t-body text-on-surface outline-hidden" />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Limpiar búsqueda" className="text-on-surface-variant hover:text-on-surface"><X size={13} /></button>
            )}
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-2.5 pb-3 pt-1 flex flex-col gap-px">
          {shown.map((t) => (
            <button key={t.key} type="button" onClick={() => setSelected(t.key)}
              className={`fl-row py-1.5 items-start! ${selected === t.key ? 'nav-active' : ''}`}>
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-1.5">
                  <span className="t-body font-medium font-mono text-on-surface truncate">{t.key}</span>
                  {t.pinned && <Pin size={11} className="text-on-surface-variant shrink-0" />}
                  <span className="flex-1" />
                  <span className="t-caption text-on-surface-variant/70 shrink-0">{ago(t.lastAt)}</span>
                </span>
                {t.title && <span className="block t-footnote text-on-surface-variant truncate">{t.title}</span>}
                <span className="flex items-center gap-2 t-caption text-on-surface-variant/80 mt-0.5">
                  {(Object.keys(SOURCE_ICON) as TicketSource[]).filter((s) => t.counts[s]).map((s) => {
                    const Icon = SOURCE_ICON[s]
                    return <span key={s} className="flex items-center gap-0.5 tabular-nums" title={SOURCE_LABEL[s]}><Icon size={11} />{t.counts[s]}</span>
                  })}
                  {!t.total && <span>Sin referencias todavía</span>}
                </span>
              </span>
            </button>
          ))}
          {loaded && !shown.length && (
            <p className="t-footnote text-on-surface-variant px-2 py-3">
              {query ? 'Ningún ticket coincide.' : 'Cuando copies, captures o anotes una clave como WIGOS-132764 aparece acá.'}
            </p>
          )}
        </nav>
      </aside>

      <main className="flex-1 min-w-0 overflow-y-auto">
        {selected
          ? <TicketPage key={selected} ticketKey={selected} rev={rev} onChanged={() => void reload()} onForget={() => setSelected(null)} />
          : <div className="h-full grid place-items-center"><EmptyState icon={Ticket} title="Elegí un ticket" description="O agregá uno con +. También podés escribir la clave en Ctrl+K." /></div>}
      </main>
    </div>
  )
}

function TicketPage({ ticketKey, rev, onChanged, onForget }: { ticketKey: string; rev: number; onChanged: () => void; onForget: () => void }): JSX.Element {
  const { dispatch } = useApp()
  const toast = useToast()
  const [d, setD] = useState<TicketDetail | null>(null)
  const [title, setTitle] = useState('')
  const titleLoaded = useRef(false)
  const [comment, setComment] = useState<{ caps: CaptureEntry[] } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    invoke<TicketDetail>('tickets:get', ticketKey).then((r) => {
      if (!alive) return
      setD(r)
      // El título se toma sólo la primera vez: después manda lo que se está escribiendo.
      if (!titleLoaded.current) { titleLoaded.current = true; setTitle(r.title ?? '') }
    }, (e) => toast.show(errMsg(e), 'error'))
    return () => { alive = false }
  }, [ticketKey, rev, toast])

  if (!d) return <div className="p-6 t-footnote text-on-surface-variant">Cargando…</div>

  const open = (pluginId: string, action: string, payload: unknown): void => dispatch({ type: 'OPEN_WITH_INTENT', pluginId, action, payload })
  const url = jiraUrl(d.jiraBase, d.key)
  const noteId = noteIdFor(d.key)
  const hasOwnNote = d.refs.note.some((n) => n.id.toLowerCase() === noteId.toLowerCase())

  const saveTitle = async (): Promise<void> => {
    if (title.trim() === (d.title ?? '')) return
    try { await invoke('tickets:set-title', d.key, title); onChanged() } catch (e) { toast.show(errMsg(e), 'error') }
  }

  const newNote = async (): Promise<void> => {
    try {
      if (!hasOwnNote) {
        const exists = await invoke<NoteContent>('notes:read', noteId).then(() => true, () => false)
        if (!exists) await invoke('notes:write', noteId, noteTemplate(d.key, title || d.title))
      }
      open('notes', 'open', noteId)
    } catch (e) { toast.show(`No se pudo crear la nota: ${errMsg(e)}`, 'error') }
  }

  const loadCaptures = async (): Promise<CaptureEntry[]> =>
    (await Promise.all(d.refs.capture.slice(0, 60).map((r) => invoke<CaptureEntry>('captures:get', r.id).catch(() => null))))
      .filter((c): c is CaptureEntry => !!c)
      // El nombre de la imagen lleva la clave aunque la captura la tenga sólo en el texto (igual que al exportar).
      .map((c) => ({ ...c, ticket: d.key }))

  const clipsText = d.refs.clip.map((c) => String(c.extra?.full ?? c.title))

  const openComment = async (): Promise<void> => {
    setBusy(true)
    try { setComment({ caps: await loadCaptures() }) } finally { setBusy(false) }
  }

  const exportAll = async (): Promise<void> => {
    setBusy(true)
    try {
      const caps = await loadCaptures()
      const evidence = buildTicketComment({ ticket: d.key, captures: caps, notes: d.refs.note.map((n) => n.title), clips: clipsText }, 'md', true)
      const notes = (await Promise.all(d.refs.note.map((n) => invoke<NoteContent>('notes:read', n.id).catch(() => null))))
        .filter((n): n is NoteContent => !!n).map((n) => ({ title: n.meta.title, content: n.content }))
      const md = exportMarkdown(d.key, title || d.title, evidence, notes, d.refs.file.map((f) => String(f.extra?.path ?? f.id)))
      const r = await invoke<{ canceled?: boolean; dir?: string; images?: number }>('tickets:export', d.key, md)
      if (!r.canceled) toast.show(`Exportado: ${r.images ?? 0} imagen${r.images === 1 ? '' : 'es'} + ${d.key}.md`, 'success')
    } catch (e) { toast.show(`No se pudo exportar: ${errMsg(e)}`, 'error') } finally { setBusy(false) }
  }

  const togglePin = async (): Promise<void> => {
    try { await invoke('tickets:pin', d.key, !d.pinned); onChanged() } catch (e) { toast.show(errMsg(e), 'error') }
  }

  const forget = async (): Promise<void> => {
    try { await invoke('tickets:forget', d.key); onForget(); onChanged() } catch (e) { toast.show(errMsg(e), 'error') }
  }

  const copyKey = (): void => { void navigator.clipboard.writeText(d.key).then(() => toast.show(`${d.key} copiado`, 'success')) }

  return (
    <div className="px-6 py-5 max-w-5xl mx-auto w-full flex flex-col gap-5">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="icon-tile w-8 h-8"><Ticket size={16} /></span>
          <h1 className="t-title2 text-on-surface font-mono">{d.key}</h1>
          <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon" title="Copiar la clave" aria-label="Copiar la clave" onClick={copyKey}><Copy size={14} /></button>
          <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon" title={d.pinned ? 'Desfijar' : 'Fijar arriba'} aria-label={d.pinned ? 'Desfijar' : 'Fijar'} onClick={() => void togglePin()}>
            {d.pinned ? <PinOff size={14} /> : <Pin size={14} />}
          </button>
          {(d.manual || d.pinned || d.title) && (
            <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon" title="Quitar de la lista (fijado, agregado a mano y título)" aria-label="Quitar de la lista" onClick={() => void forget()}><Trash2 size={14} /></button>
          )}
          <span className="flex-1" />
          <button type="button" className="ui-btn ui-btn-outline ui-btn-sm" disabled={!url} title={url ? url : 'Configurá la URL de Jira en Conexiones'}
            onClick={() => { if (url) window.open(url, '_blank', 'noopener') }}>
            <ExternalLink size={13} /> Abrir en Jira
          </button>
        </div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => void saveTitle()}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          placeholder="Título del ticket (opcional)" aria-label="Título del ticket" className="ui-input t-body w-full" />
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" disabled={busy || (!d.refs.capture.length && !d.refs.clip.length)} onClick={() => void openComment()}>
            <FileText size={13} /> Comentario de evidencia
          </button>
          <button type="button" className="ui-btn ui-btn-outline ui-btn-sm" onClick={() => void newNote()}>
            <NotebookPen size={13} /> {hasOwnNote ? 'Abrir nota del ticket' : 'Nueva nota del ticket'}
          </button>
          <button type="button" className="ui-btn ui-btn-outline ui-btn-sm" disabled={busy || !d.total} onClick={() => void exportAll()}>
            <Download size={13} /> Exportar todo
          </button>
        </div>
      </header>

      {!d.total && (
        <div className="ui-card p-5 t-body text-on-surface-variant">
          Todavía no hay nada que mencione {d.key}. Copiá textos, sacá capturas o escribí notas con la clave y van a aparecer acá.
        </div>
      )}

      <Section source="capture" count={d.refs.capture.length} action={d.refs.capture.length ? <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => open('captures', 'ticket', d.key)}>Ver en Portapapeles</button> : null}>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
          {d.refs.capture.map((c) => (
            <button key={c.id} type="button" draggable
              onDragStart={(e) => { e.preventDefault(); window.api.send('captures:start-drag', [c.id]) }}
              onClick={() => open('captures', 'open', c.id)}
              title={`${c.title}${c.detail ? ` · ${c.detail}` : ''}\nClic: abrir · Arrastrar: adjuntar en otra app`}
              className="group text-left rounded-lg hairline bg-surface overflow-hidden hover:border-on-surface/20">
              <div className="aspect-video bg-on-surface/[0.03] grid place-items-center overflow-hidden">
                <img src={thumbUrl(String(c.extra?.file ?? ''))} alt={c.title} draggable={false} loading="lazy" className="w-full h-full object-cover" />
              </div>
              <div className="px-2 py-1.5">
                <div className="t-footnote text-on-surface truncate">{c.title}</div>
                <div className="t-caption text-on-surface-variant truncate">{ago(c.at)}{c.detail ? ` · ${c.detail}` : ''}</div>
              </div>
            </button>
          ))}
        </div>
      </Section>

      <Section source="note" count={d.refs.note.length}>
        <RefList refs={d.refs.note} onOpen={(r) => open('notes', 'open', r.id)} />
      </Section>

      <Section source="snippet" count={d.refs.snippet.length}>
        <RefList refs={d.refs.snippet} onOpen={(r) => open('snippets', 'open', r.id)} />
      </Section>

      <Section source="clip" count={d.refs.clip.length}>
        <div className="flex flex-col gap-1.5">
          {d.refs.clip.slice(0, 30).map((c) => (
            <div key={c.id} className="group flex items-start gap-2 rounded-lg hairline bg-surface px-3 py-2">
              <pre className="flex-1 min-w-0 t-footnote font-mono text-on-surface whitespace-pre-wrap break-words max-h-24 overflow-hidden">{String(c.extra?.full ?? c.title)}</pre>
              <span className="t-caption text-on-surface-variant shrink-0">{ago(c.at)}</span>
              <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon shrink-0" title="Copiar" aria-label="Copiar"
                onClick={() => {
                  void invoke('clipboard:copy', c.id)
                    .catch(() => navigator.clipboard.writeText(String(c.extra?.full ?? '')))
                    .then(() => toast.show('Copiado', 'success'))
                }}>
                <Copy size={13} />
              </button>
            </div>
          ))}
        </div>
      </Section>

      <Section source="file" count={d.refs.file.length}>
        <div className="flex flex-col gap-px">
          {d.refs.file.map((f) => {
            const p = String(f.extra?.path ?? f.id)
            return (
              <div key={f.id} className="fl-row group">
                <FileCode2 size={14} className="text-on-surface-variant shrink-0" />
                <button type="button" className="flex-1 min-w-0 text-left" onClick={() => dispatch({ type: 'OPEN_IN_EDITOR', path: p })} title={`Abrir en el editor\n${p}`}>
                  <span className="t-body text-on-surface">{f.title}</span>
                  <span className="t-caption text-on-surface-variant ml-2 truncate">{f.detail}</span>
                </button>
                <span className="t-caption text-on-surface-variant shrink-0">{ago(f.at)}</span>
                <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon shrink-0" title="Mostrar en el Explorador" aria-label="Mostrar en el Explorador"
                  onClick={() => { void invoke('clipboard:open-path', p).catch((e) => toast.show(errMsg(e), 'error')) }}>
                  <FolderOpen size={13} />
                </button>
              </div>
            )
          })}
        </div>
      </Section>

      {comment && (
        <EvidenceModal ticket={d.key} caps={comment.caps} notes={d.refs.note.map((n) => n.title)} clips={clipsText} onClose={() => setComment(null)} />
      )}
    </div>
  )
}

function Section({ source, count, action, children }: { source: TicketSource; count: number; action?: React.ReactNode; children: React.ReactNode }): JSX.Element | null {
  if (!count) return null
  const Icon = SOURCE_ICON[source]
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="fl-section px-0!"><Icon size={12} /> {SOURCE_LABEL[source]}</span>
        <span className="t-caption tabular-nums text-on-surface-variant/70">{count}</span>
        <span className="flex-1" />
        {action}
      </div>
      {children}
    </section>
  )
}

function RefList({ refs, onOpen }: { refs: TicketRef[]; onOpen: (r: TicketRef) => void }): JSX.Element {
  return (
    <div className="flex flex-col gap-px">
      {refs.map((r) => (
        <button key={r.id} type="button" className="fl-row py-1.5" onClick={() => onOpen(r)}>
          <span className="flex-1 min-w-0">
            <span className="block t-body text-on-surface truncate">{r.title}</span>
            {r.detail && <span className="block t-caption text-on-surface-variant truncate">{r.detail}</span>}
          </span>
          <span className="t-caption text-on-surface-variant shrink-0">{ago(r.at)}</span>
        </button>
      ))}
    </div>
  )
}

function EvidenceModal({ ticket, caps, notes, clips, onClose }: { ticket: string; caps: CaptureEntry[]; notes: string[]; clips: string[]; onClose: () => void }): JSX.Element {
  const toast = useToast()
  const [format, setFormat] = useState<CommentFormat>('jira')
  const [withOcr, setWithOcr] = useState(true)
  const text = useMemo(() => buildTicketComment({ ticket, captures: caps, notes, clips }, format, withOcr), [ticket, caps, notes, clips, format, withOcr])
  return (
    <Modal
      open
      onClose={onClose}
      title={`Comentario de evidencia — ${ticket}`}
      subtitle="Pegalo en Jira y adjuntá las imágenes de “Exportar todo”: los nombres coinciden."
      width={720}
      footer={
        <>
          <button type="button" className="ui-btn ui-btn-outline" onClick={onClose}>Cerrar</button>
          <button type="button" className="ui-btn ui-btn-primary"
            onClick={() => { void navigator.clipboard.writeText(text).then(() => toast.show('Comentario copiado', 'success')) }}>
            <Copy size={13} /> Copiar comentario
          </button>
        </>
      }
    >
      <div className="flex items-center gap-4 mb-3">
        <SegmentedControl<CommentFormat> value={format} onChange={setFormat}
          options={[{ value: 'jira', label: 'Jira (wiki)' }, { value: 'md', label: 'Markdown' }]} />
        <label className="flex items-center gap-2 t-footnote text-on-surface-variant">
          Incluir texto de las imágenes
          <Toggle checked={withOcr} onChange={setWithOcr} label="Incluir texto de las imágenes" />
        </label>
      </div>
      <textarea readOnly value={text} className="ui-input w-full h-[46vh] font-mono text-[12px] leading-5 resize-none" />
    </Modal>
  )
}
