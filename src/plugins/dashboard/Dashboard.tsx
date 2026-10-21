import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ArrowRight, CalendarDays, ClipboardText, Code2, Copy, CornerDownLeft, FileCode2, KeyRound, Lock, NotebookPen, Pin, Plus, Search, Sparkles,
  Ticket, Wallet,
} from 'lucide-react'
import { useApp } from '../../core/AppContext'
import { EmptyState } from '../../core/components/EmptyState'
import { Skeleton } from '../../core/components/Skeleton'
import { SegmentedControl } from '../../core/components/SegmentedControl'
import { useToast } from '../../core/components/Toast'
import { OPEN_PALETTE_EVENT } from '../../core/components/CommandPalette'
import { detectLanguage, languageIcon } from '../file-editor/hooks/useEditorTabs'
import { getMonthSummaryState } from '../gastos/summary'
import { GASTOS_CHANGED_EVENT } from '../gastos/direct-write'
import { useQuickGasto } from '../gastos/useQuickGasto'
import { VariablesModal } from '../snippets/VariablesModal'
import { hasVariables, stripDataUrls } from '../snippets/template'
import type { IconComponent } from '../../core/types'
import type { Snippet } from '../snippets/types'
import { KIND_LABEL } from '../../core/clip-actions'
import { findTicket, type ClipView } from '../../core/clip-utils'
import type { CaptureQueryResult } from '../captures/types'
import type { Credential, CopyResult } from '../credentials/types'
import { usageHint } from '../credentials/usage'
import { AjustesCard, ConexionesCard, ConsultasCard, GastosCard, HeroCard, useBentoData } from './Bento'

// ── Contracts consumed (owned by other modules) ──────────────────────────────
interface NoteMeta { id: string; title: string; preview: string; updatedAt: number; pinned: boolean }
interface RecentEntry { path: string; name: string; openedAt: string; line?: number }

/** IPC that never throws synchronously (the preload throws on unknown channels). */
async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  return window.api.invoke<T>(channel, ...args)
}

type Loadable<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error' }

function useLoad<T>(loader: () => Promise<T>, deps: unknown[]): [Loadable<T>, () => void] {
  const [state, setState] = useState<Loadable<T>>({ status: 'loading' })
  const [tick, setTick] = useState(0)
  const loaderRef = useRef(loader)
  loaderRef.current = loader
  useEffect(() => {
    let alive = true
    loaderRef.current()
      .then((data) => { if (alive) setState({ status: 'ready', data }) })
      .catch(() => { if (alive) setState({ status: 'error' }) })
    return () => { alive = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps])
  return [state, useCallback(() => setTick((t) => t + 1), [])]
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function relTime(ms: number): string {
  const mins = Math.max(0, Math.round((Date.now() - ms) / 60000))
  if (mins < 1) return 'ahora'
  if (mins < 60) return `hace ${mins} min`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `hace ${hrs} h`
  const days = Math.round(hrs / 24)
  if (days < 7) return `hace ${days} d`
  return new Date(ms).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

const looksLikeExpense = (text: string): boolean => /^\s*(\$|\d)/.test(text)

// ── Widget shell ─────────────────────────────────────────────────────────────
function Widget({ title, icon: Icon, action, children, className = '' }: {
  title: string
  icon: IconComponent
  action?: ReactNode
  children: ReactNode
  className?: string
}): JSX.Element {
  return (
    <section className={`bento spotlight flex flex-col min-h-[220px] ${className}`}>
      <header className="flex items-center gap-2 pl-5 pr-3 h-12 mt-2 mb-0.5">
        <Icon size={15} className="text-on-surface-variant shrink-0" />
        <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-on-surface flex-1 min-w-0 truncate">{title}</h2>
        {action}
      </header>
      <div className="flex-1 flex flex-col px-3 pb-3">{children}</div>
    </section>
  )
}

/** Error de carga de un widget: nunca se muestra como lista vacía. */
function LoadError({ icon, what, onRetry }: { icon: IconComponent; what: string; onRetry: () => void }): JSX.Element {
  return (
    <EmptyState compact icon={icon} title={`No pudimos cargar ${what}`}
      action={<button className="ui-btn ui-btn-outline ui-btn-sm" onClick={onRetry}>Reintentar</button>} />
  )
}

function ListSkeleton({ rows = 4 }: { rows?: number }): JSX.Element {
  return (
    <div className="flex flex-col gap-3 px-2 py-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <Skeleton className="h-3.5" style={{ width: `${70 - i * 8}%` }} />
          <Skeleton className="h-2.5" style={{ width: `${45 - i * 4}%` }} />
        </div>
      ))}
    </div>
  )
}

function Row({ title, subtitle, meta, icon, onClick, trailing }: {
  title: string
  subtitle?: string
  meta?: string
  icon?: ReactNode
  onClick: () => void
  trailing?: ReactNode
}): JSX.Element {
  return (
    <div className="group flex items-center rounded-lg hover:bg-on-surface/3 dark:hover:bg-on-surface/5 transition-colors">
      <button onClick={onClick} className="flex-1 min-w-0 flex items-center gap-3 px-2 py-2 text-left">
        {icon}
        <span className="flex-1 min-w-0">
          <span className="block t-body font-medium text-on-surface truncate">{title}</span>
          {subtitle && <span className="block t-footnote text-on-surface-variant truncate">{subtitle}</span>}
        </span>
        {meta && <span className="t-caption text-on-surface-variant/80 shrink-0 tabular-nums">{meta}</span>}
      </button>
      {trailing}
    </div>
  )
}

// ── Quick capture ────────────────────────────────────────────────────────────
type CaptureMode = 'note' | 'expense' | 'snippet'

function QuickCapture({ enabled, onNoteCreated }: {
  enabled: Record<CaptureMode, boolean>
  onNoteCreated: () => void
}): JSX.Element {
  const { dispatch } = useApp()
  const toast = useToast()
  const quickGasto = useQuickGasto()
  const [text, setText] = useState('')
  const [mode, setMode] = useState<CaptureMode>(enabled.note ? 'note' : enabled.expense ? 'expense' : 'snippet')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const options = ([
    { value: 'note', label: 'Nota' },
    { value: 'expense', label: 'Gasto' },
    { value: 'snippet', label: 'Snippet' },
  ] as const).filter((o) => enabled[o.value])

  const trimmed = text.trim()
  const suggestExpense = mode === 'note' && enabled.expense && looksLikeExpense(trimmed)

  /** Se guarda directo (con "Deshacer") y se queda en Inicio; sin monto claro abre Gastos. */
  const saveExpense = async (): Promise<void> => {
    if (!trimmed || busy) return
    setBusy(true)
    try {
      if ((await quickGasto(trimmed)) !== 'failed') setText('')
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  const submit = async (as: CaptureMode = mode): Promise<void> => {
    if (!trimmed || busy) return
    if (as === 'expense') { await saveExpense(); return }
    if (as === 'snippet') {
      dispatch({ type: 'OPEN_WITH_INTENT', pluginId: 'snippets', action: 'new', payload: { content: trimmed } })
      setText('')
      return
    }
    setBusy(true)
    try {
      await invoke('notes:write', null, trimmed)
      toast.show('Nota guardada', 'success')
      setText('')
      onNoteCreated()
    } catch {
      toast.show('No se pudo guardar la nota', 'error')
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  const search = (): void => {
    window.dispatchEvent(new CustomEvent(OPEN_PALETTE_EVENT, { detail: { query: trimmed } }))
  }

  const placeholder = mode === 'expense'
    ? 'Ej.: 4500 súper, ayer'
    : mode === 'snippet'
      ? 'Pegá un comando o un fragmento de código…'
      : 'Escribí una nota, un gasto o buscá…'

  return (
    <div className="ui-card p-2 flex flex-col gap-2">
      <div className="flex items-center gap-2 rounded-[10px] border border-transparent bg-on-surface/[0.035] dark:bg-on-surface/6 focus-within:bg-surface focus-within:border-hairline-strong transition-colors pl-3 pr-1.5 py-1">
        <Sparkles size={16} className="text-on-surface-variant shrink-0" />
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); search(); return }
            if (e.key === 'Enter') { e.preventDefault(); void submit() }
          }}
          placeholder={placeholder}
          aria-label="Captura rápida"
          className="flex-1 min-w-0 bg-transparent outline-hidden text-on-surface px-1 py-2"
          style={{ fontSize: 14 }}
        />
        {options.length > 1 && (
          <SegmentedControl<CaptureMode> value={mode} onChange={setMode} options={[...options]} />
        )}
      </div>
      {(trimmed || suggestExpense) && (
        <div className="flex flex-wrap items-center gap-2 px-1 pb-0.5" style={{ animation: 'fadeIn 0.12s ease both' }}>
          <button onClick={() => void submit()} disabled={busy} className="ui-btn ui-btn-primary ui-btn-sm">
            <CornerDownLeft size={12} />
            {mode === 'note' ? 'Guardar nota' : mode === 'expense' ? 'Guardar gasto' : 'Crear snippet'}
          </button>
          {suggestExpense && (
            <button onClick={() => void saveExpense()} disabled={busy} className="ui-btn ui-btn-outline ui-btn-sm">
              <Wallet size={12} />
              Guardar como gasto
            </button>
          )}
          <button onClick={search} className="ui-btn ui-btn-ghost ui-btn-sm ml-auto">
            <Search size={12} />
            Buscar «{trimmed.length > 24 ? `${trimmed.slice(0, 24)}…` : trimmed}»
            <span className="text-on-surface-variant/70">Ctrl+Enter</span>
          </button>
        </div>
      )}
    </div>
  )
}

// ── Widgets ──────────────────────────────────────────────────────────────────
function NotesWidget({ notes, onRetry }: { notes: Loadable<NoteMeta[]>; onRetry: () => void }): JSX.Element {
  const { dispatch } = useApp()
  const openToday = (): void => dispatch({ type: 'OPEN_WITH_INTENT', pluginId: 'notes', action: 'today' })
  return (
    <Widget
      title="Notas recientes"
      icon={NotebookPen}
      action={
        <button onClick={openToday} className="ui-btn ui-btn-ghost ui-btn-sm">
          <CalendarDays size={12} /> Nota de hoy
        </button>
      }
    >
      {notes.status === 'loading' && <ListSkeleton />}
      {notes.status === 'error' && (
        <EmptyState compact icon={NotebookPen} title="No pudimos leer tus notas" action={<button className="ui-btn ui-btn-outline ui-btn-sm" onClick={onRetry}>Reintentar</button>} />
      )}
      {notes.status === 'ready' && (notes.data.length === 0 ? (
        <EmptyState
          compact
          icon={NotebookPen}
          title="Todavía no hay notas"
          description="Escribí arriba y apretá Enter."
          action={<button className="ui-btn ui-btn-outline ui-btn-sm" onClick={() => dispatch({ type: 'OPEN_WITH_INTENT', pluginId: 'notes', action: 'new', payload: {} })}><Plus size={12} /> Nueva nota</button>}
        />
      ) : (
        notes.data.slice(0, 5).map((n) => (
          <Row
            key={n.id}
            title={n.title || 'Sin título'}
            subtitle={n.preview || undefined}
            meta={relTime(n.updatedAt)}
            icon={n.pinned ? <Pin size={12} className="text-on-surface-variant shrink-0" /> : undefined}
            onClick={() => dispatch({ type: 'OPEN_WITH_INTENT', pluginId: 'notes', action: 'open', payload: n.id })}
          />
        ))
      ))}
    </Widget>
  )
}

function pickSnippets(all: Snippet[]): Snippet[] {
  const pinned = all.filter((s) => s.pinned)
  const recent = all
    .filter((s) => !s.pinned && s.lastUsedAt)
    .sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0))
  const rest = all
    .filter((s) => !s.pinned && !s.lastUsedAt)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return [...pinned, ...recent, ...rest].slice(0, 6)
}

function SnippetsWidget({ snippets, onUsed, onRetry }: { snippets: Loadable<Snippet[]>; onUsed: () => void; onRetry: () => void }): JSX.Element {
  const { dispatch } = useApp()
  const toast = useToast()
  // Snippet con {{variables}}: se completan acá mismo, sin abrir el módulo.
  const [fill, setFill] = useState<Snippet | null>(null)

  const copyText = async (s: Snippet, text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      toast.show(`Copiado: ${s.title}`, 'success', 2200)
      invoke('snippets:mark-used', s.id).then(onUsed).catch(() => { /* optional */ })
    } catch {
      toast.show('No se pudo copiar al portapapeles', 'error')
    }
  }

  const use = async (s: Snippet): Promise<void> => {
    if (hasVariables(stripDataUrls(s.content))) { setFill(s); return }
    await copyText(s, s.content)
  }

  return (
    <Widget
      title="Snippets"
      icon={Code2}
      action={
        <button onClick={() => dispatch({ type: 'OPEN_TAB', pluginId: 'snippets' })} className="ui-btn ui-btn-ghost ui-btn-sm">
          Ver todos <ArrowRight size={12} />
        </button>
      }
    >
      {snippets.status === 'loading' && <ListSkeleton />}
      {snippets.status === 'error' && <LoadError icon={Code2} what="los snippets" onRetry={onRetry} />}
      {snippets.status === 'ready' && (snippets.data.length === 0 ? (
        <EmptyState
          compact
          icon={Code2}
          title="Sin snippets todavía"
          description="Guardá los comandos que usás seguido."
          action={<button className="ui-btn ui-btn-outline ui-btn-sm" onClick={() => dispatch({ type: 'OPEN_WITH_INTENT', pluginId: 'snippets', action: 'new', payload: {} })}><Plus size={12} /> Nuevo snippet</button>}
        />
      ) : (
        pickSnippets(snippets.data).map((s) => {
          const hasVars = s.content.includes('{{')
          return (
            <Row
              key={s.id}
              title={s.title}
              subtitle={s.description || s.content.split('\n')[0]}
              icon={s.pinned ? <Pin size={12} className="text-on-surface-variant shrink-0" /> : undefined}
              meta={hasVars ? 'Completar' : undefined}
              onClick={() => void use(s)}
              trailing={
                !hasVars ? (
                  <span className="pr-2 text-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden>
                    <Copy size={13} />
                  </span>
                ) : undefined
              }
            />
          )
        })
      ))}
      <VariablesModal snippet={fill} content={fill ? stripDataUrls(fill.content).trim() : ''} mode="copy" onClose={() => setFill(null)}
        onSubmit={(rendered) => { const s = fill; setFill(null); if (s) void copyText(s, rendered) }} />
    </Widget>
  )
}

function RecentFilesWidget({ recents, onRetry }: { recents: Loadable<RecentEntry[]>; onRetry: () => void }): JSX.Element {
  const { dispatch } = useApp()
  return (
    <Widget title="Archivos recientes" icon={FileCode2}>
      {recents.status === 'loading' && <ListSkeleton rows={3} />}
      {recents.status === 'error' && <LoadError icon={FileCode2} what="los archivos recientes" onRetry={onRetry} />}
      {recents.status === 'ready' && recents.data.length === 0 && (
        <EmptyState compact icon={FileCode2} title="Sin archivos recientes" description="Los archivos que abras en el editor aparecen acá." />
      )}
      {recents.status === 'ready' && recents.data.slice(0, 6).map((r) => {
        const LangIcon = languageIcon(detectLanguage(r.name))
        const dir = r.path.slice(0, Math.max(0, r.path.length - r.name.length - 1))
        return (
          <Row
            key={r.path}
            title={r.name}
            subtitle={dir}
            meta={`${r.line ? `línea ${r.line} · ` : ''}${relTime(new Date(r.openedAt).getTime())}`}
            icon={<span className="w-4 flex justify-center text-on-surface-variant shrink-0"><LangIcon size={14} /></span>}
            onClick={() => dispatch({ type: 'OPEN_IN_EDITOR', path: r.path, line: r.line })}
          />
        )
      })}
    </Widget>
  )
}

/** Tickets recientes: los de las capturas y los copiados (solos o dentro de un link). */
interface TicketRow { ticket: string; captures: number; copied: boolean; at: number }

async function loadTickets(): Promise<TicketRow[]> {
  const rows = new Map<string, TicketRow>()
  const bump = (t: string, at: number, patch: Partial<TicketRow>): void => {
    const r = rows.get(t) ?? { ticket: t, captures: 0, copied: false, at: 0 }
    rows.set(t, { ...r, ...patch, at: Math.max(r.at, at), captures: r.captures + (patch.captures ?? 0) })
  }
  try {
    const r = await invoke<CaptureQueryResult>('captures:query', { limit: 300 })
    for (const c of r.items) if (c.ticket) bump(c.ticket, c.createdAt, { captures: 1 })
  } catch { /* sin capturas */ }
  try {
    const clips = await invoke<ClipView[]>('clipboard:history')
    for (const c of clips) {
      if (c.sensitive) continue
      const t = c.kind === 'ticket' ? c.text.trim() : findTicket(c.text)
      if (t) bump(t, c.at, { copied: true })
    }
  } catch { /* sin historial */ }
  return [...rows.values()].sort((a, b) => b.at - a.at)
}

function TicketsWidget({ tickets, onRetry }: { tickets: Loadable<TicketRow[]>; onRetry: () => void }): JSX.Element {
  const { dispatch } = useApp()
  return (
    <Widget title="Tickets recientes" icon={Ticket}>
      {tickets.status === 'loading' && <ListSkeleton rows={3} />}
      {tickets.status === 'error' && <LoadError icon={Ticket} what="los tickets" onRetry={onRetry} />}
      {tickets.status === 'ready' && tickets.data.length === 0 && (
        <EmptyState compact icon={Ticket} title="Sin tickets todavía"
          description="Copiá un WIGOS-123 o ponele ticket a una captura y aparece acá con todo lo suyo." />
      )}
      {tickets.status === 'ready' && tickets.data.slice(0, 6).map((t) => (
        <Row
          key={t.ticket}
          title={t.ticket}
          subtitle={[t.captures ? `${t.captures} captura${t.captures === 1 ? '' : 's'}` : null, t.copied ? 'copiado' : null].filter(Boolean).join(' · ')}
          meta={relTime(t.at)}
          icon={<span className="icon-tile w-7 h-7"><Ticket size={14} /></span>}
          onClick={() => dispatch({ type: 'OPEN_WITH_INTENT', pluginId: 'captures', action: 'ticket', payload: t.ticket })}
        />
      ))}
    </Widget>
  )
}

function KeysWidget({ keys, onRetry }: { keys: Loadable<Credential[]>; onRetry: () => void }): JSX.Element {
  const { dispatch } = useApp()
  const toast = useToast()
  const open = (id?: string): void => dispatch(id
    ? { type: 'OPEN_WITH_INTENT', pluginId: 'credentials', action: 'open', payload: id }
    : { type: 'OPEN_TAB', pluginId: 'credentials' })
  const copy = async (c: Credential): Promise<void> => {
    let r: CopyResult
    try { r = await invoke<CopyResult>('credentials:copy-password', c.id) } catch { toast.show('No se pudo copiar', 'error'); return }
    if (r.ok) toast.show(`Contraseña de ${c.nombre} copiada (se borra en 30 s)`, 'success')
    else if (r.locked) { toast.show('Claves está bloqueada: ingresá el PIN', 'info'); open(c.id) }
    else toast.show(r.error || 'No se pudo copiar', 'error')
  }
  return (
    <Widget title="Claves" icon={KeyRound}
      action={<button onClick={() => open()} className="ui-btn ui-btn-ghost ui-btn-sm">Ver todas <ArrowRight size={12} /></button>}>
      {keys.status === 'loading' && <ListSkeleton rows={3} />}
      {keys.status === 'error' && <LoadError icon={KeyRound} what="las claves" onRetry={onRetry} />}
      {keys.status === 'ready' && keys.data.length === 0 && (
        <EmptyState compact icon={KeyRound} title="Sin claves todavía" description="Las que más copies van a quedar acá, a un clic." />
      )}
      {keys.status === 'ready' && keys.data.slice(0, 5).map((c) => (
        <Row
          key={c.id}
          title={c.nombre}
          subtitle={[c.usuario, usageHint(c.useCount, c.lastUsedAt ? relTime(c.lastUsedAt) : '')].filter(Boolean).join(' · ')}
          icon={<span className="icon-tile w-7 h-7">{c.favorite ? <Pin size={13} /> : <KeyRound size={13} />}</span>}
          onClick={() => open(c.id)}
          trailing={c.hasPassword ? (
            <button onClick={() => void copy(c)} title="Copiar contraseña"
              className="mr-1.5 ui-btn ui-btn-ghost ui-btn-sm opacity-60 group-hover:opacity-100 focus-visible:opacity-100">
              <Lock size={12} /> Copiar
            </button>
          ) : undefined}
        />
      ))}
    </Widget>
  )
}

function ClipboardWidget({ clips, onRetry }: { clips: Loadable<ClipView[]>; onRetry: () => void }): JSX.Element {
  const { dispatch } = useApp()
  const toast = useToast()
  const copy = async (c: ClipView): Promise<void> => {
    try { await invoke('clipboard:copy', c.id); toast.show('Copiado de nuevo: pegalo con Ctrl+V', 'success') } catch { toast.show('Ya no está en el historial', 'error') }
  }
  return (
    <Widget title="Portapapeles" icon={ClipboardText}
      action={<button onClick={() => dispatch({ type: 'OPEN_WITH_INTENT', pluginId: 'captures', action: 'text' })} className="ui-btn ui-btn-ghost ui-btn-sm">Ver todo <ArrowRight size={12} /></button>}>
      {clips.status === 'loading' && <ListSkeleton rows={3} />}
      {clips.status === 'error' && <LoadError icon={ClipboardText} what="el portapapeles" onRetry={onRetry} />}
      {clips.status === 'ready' && clips.data.length === 0 && (
        <EmptyState compact icon={ClipboardText} title="Nada copiado todavía" description="Lo que copies con Ctrl+C queda acá para volver a usarlo." />
      )}
      {clips.status === 'ready' && clips.data.slice(0, 6).map((c) => (
        <Row
          key={c.id}
          title={c.sensitive ? (c.masked ?? '••••••') : c.text.replace(/\s+/g, ' ').trim().slice(0, 140)}
          subtitle={[c.sensitive ? 'Oculto' : KIND_LABEL[c.kind], c.app].filter(Boolean).join(' · ')}
          meta={relTime(c.at)}
          icon={<span className="icon-tile w-7 h-7">{c.sensitive ? <Lock size={13} /> : <Copy size={13} />}</span>}
          onClick={() => void copy(c)}
        />
      ))}
    </Widget>
  )
}

// ── Dashboard ────────────────────────────────────────────────────────────────
export function Dashboard(): JSX.Element {
  const { state } = useApp()
  const active = state.activeTabId === 'dashboard'
  const isOn = (id: string): boolean => !state.disabledPlugins.includes(id)
  const [userName, setUserName] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())
  const [stamp, setStamp] = useState(0)

  useEffect(() => {
    invoke<{ name?: string } | null>('auth:google-user')
      .then((u) => { if (u?.name) setUserName(u.name.split(' ')[0] ?? null) })
      .catch(() => { /* not signed in */ })
  }, [])

  // Refresh widgets each time Inicio comes back to the front (tabs stay mounted).
  const firstRun = useRef(true)
  useEffect(() => {
    if (!active) return
    setNow(new Date())
    if (firstRun.current) { firstRun.current = false; return }
    setStamp((n) => n + 1)
  }, [active])

  const [notes, reloadNotes] = useLoad(async () => {
    const list = await invoke<NoteMeta[]>('notes:list')
    return [...list].sort((a, b) => b.updatedAt - a.updatedAt)
  }, [stamp])
  const [snippets, reloadSnippets] = useLoad(async () => {
    const res = await invoke<{ snippets: Snippet[] }>('snippets:load')
    return res?.snippets ?? []
  }, [stamp])
  const [summary, reloadSummary] = useLoad(() => getMonthSummaryState(), [stamp])
  // Un gasto guardado desde la captura rápida (o en Gastos) actualiza el widget al instante.
  useEffect(() => {
    window.addEventListener(GASTOS_CHANGED_EVENT, reloadSummary)
    return () => window.removeEventListener(GASTOS_CHANGED_EVENT, reloadSummary)
  }, [reloadSummary])
  const [recents, reloadRecents] = useLoad(async () => (await invoke<RecentEntry[]>('editor:recent-get')) ?? [], [stamp])
  const [tickets, reloadTickets] = useLoad(loadTickets, [stamp])
  const [keys, reloadKeys] = useLoad(async () => {
    const r = await invoke<Credential[] | { items: Credential[] }>('credentials:top', 5)
    return Array.isArray(r) ? r : r.items
  }, [stamp])
  const [clips, reloadClips] = useLoad(async () => (await invoke<ClipView[]>('clipboard:history')) ?? [], [stamp])

  const capture = useMemo(() => ({
    note: isOn('notes'), expense: isOn('gastos'), snippet: isOn('snippets'),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [state.disabledPlugins])

  const show = { gastos: isOn('gastos'), sql: isOn('sql-runner'), credentials: isOn('credentials'), tickets: isOn('tickets') || isOn('captures') }
  const [bento, reloadBento] = useBentoData(stamp, { sql: show.sql, credentials: show.credentials })
  const gastosResult = summary.status === 'ready' ? summary.data : null
  const bentoData = { ...bento, gastos: gastosResult, ticketsAt: tickets.status === 'ready' ? tickets.data.map((t) => t.at) : [] }

  const lower = [
    isOn('captures') && <TicketsWidget key="tickets" tickets={tickets} onRetry={reloadTickets} />,
    isOn('credentials') && <KeysWidget key="keys" keys={keys} onRetry={reloadKeys} />,
    <AjustesCard key="ajustes" />,
  ].filter(Boolean)
  const widgets = [
    isOn('snippets') && <SnippetsWidget key="snippets" snippets={snippets} onUsed={reloadSnippets} onRetry={reloadSnippets} />,
    isOn('file-editor') && <RecentFilesWidget key="files" recents={recents} onRetry={reloadRecents} />,
    isOn('captures') && <ClipboardWidget key="clips" clips={clips} onRetry={reloadClips} />,
    isOn('notes') && <NotesWidget key="notes" notes={notes} onRetry={reloadNotes} />,
  ].filter(Boolean)
  // El bento se acomoda según los módulos activos.
  const right = [show.gastos, show.sql].filter(Boolean).length

  return (
    <div className="min-h-full">
      <div className="px-4 py-4 w-full flex flex-col gap-3">
        <div className="grid grid-cols-12 gap-3">
          <HeroCard name={userName} now={now} data={bentoData} show={show}
            className={`col-span-12 ${right ? 'lg:col-span-5 lg:row-span-2' : ''}`} />
          {show.gastos && <GastosCard result={gastosResult} className={`col-span-12 sm:col-span-6 ${show.sql ? 'lg:col-span-4' : 'lg:col-span-7'}`} />}
          {show.sql && <ConexionesCard profiles={bento.profiles} onTested={reloadBento} className={`col-span-12 sm:col-span-6 ${show.gastos ? 'lg:col-span-3' : 'lg:col-span-7'}`} />}
          {show.sql && <ConsultasCard history={bento.history} className="col-span-12 lg:col-span-7" />}
        </div>

        {(capture.note || capture.expense || capture.snippet) && (
          <QuickCapture enabled={capture} onNoteCreated={reloadNotes} />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-stretch">{lower}</div>
        {widgets.length > 0 && <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-4 gap-3 items-start">{widgets}</div>}
      </div>
    </div>
  )
}
