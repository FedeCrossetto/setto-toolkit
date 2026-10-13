import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ClipboardText, Code2, Images, Lock, NotebookPen, Pin, PinOff, ScanText, Search, Settings, Ticket, Toolbox, Wallet, X,
} from 'lucide-react'
import { reloadAppearanceFromStorage } from '../core/hooks/useThemePalette'
import { normalize } from '../core/search'
import { KIND_LABEL } from '../core/clip-actions'
import type { ClipView } from '../core/clip-utils'
import { thumbUrl, type CaptureLite, type CaptureQueryResult } from '../plugins/captures/types'
import { hasVariables, stripDataUrls } from '../plugins/snippets/template'
import { recentSnippets } from '../plugins/snippets/search'
import type { Snippet } from '../plugins/snippets/types'

/**
 * Barra flotante a la derecha (ventana `#dock`, ver electron/core/dock.ts).
 * Plegada es una pestañita; al pasar el mouse se despliega. Un clic pega en la
 * app que estabas usando (la barra no le roba el foco).
 */
interface DockState { expanded: boolean; pinned: boolean; shortcut: string | null }

const HOVER_OPEN_MS = 220
const LEAVE_CLOSE_MS = 650

const oneLine = (s: string, n = 64): string => { const t = s.replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t }
const cleanErr = (e: unknown): string => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

function syncTheme(): void {
  try { document.documentElement.classList.toggle('dark', localStorage.getItem('app-theme') === 'dark') } catch { /* nada */ }
  reloadAppearanceFromStorage()
}

export function Dock(): JSX.Element {
  const [st, setSt] = useState<DockState>({ expanded: false, pinned: false, shortcut: null })
  const [clips, setClips] = useState<ClipView[]>([])
  const [caps, setCaps] = useState<CaptureLite[]>([])
  const [tickets, setTickets] = useState<string[]>([])
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [q, setQ] = useState('')
  const [flash, setFlash] = useState<string | null>(null)
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searching = useRef(false)

  const say = (m: string): void => { setFlash(m); setTimeout(() => setFlash(null), 2200) }

  const load = useCallback(async () => {
    try { setClips(await window.api.invoke<ClipView[]>('clipboard:history')) } catch { setClips([]) }
    try {
      const r = await window.api.invoke<CaptureQueryResult>('captures:query', { limit: 6 })
      setCaps(r.items)
      setTickets(r.facets.tickets.slice(0, 4))
    } catch { setCaps([]) }
    try { setSnippets((await window.api.invoke<{ snippets: Snippet[] }>('snippets:load')).snippets) } catch { setSnippets([]) }
  }, [])

  useEffect(() => {
    void window.api.invoke<DockState>('dock:state').then(setSt)
    return window.api.on('dock:state', (s) => {
      const next = s as DockState
      setSt(next)
      if (next.expanded) { syncTheme(); void load() } else { setQ(''); searching.current = false }
    })
  }, [load])

  // Mientras está abierta, refrescar (lo copiado cambia seguido).
  useEffect(() => {
    if (!st.expanded) return
    const t = setInterval(() => { void load() }, 2500)
    return () => clearInterval(t)
  }, [st.expanded, load])

  const cancelClose = (): void => { if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null } }
  const scheduleClose = (): void => {
    cancelClose()
    if (st.pinned || searching.current) return
    closeTimer.current = setTimeout(() => window.api.send('dock:collapse'), LEAVE_CLOSE_MS)
  }

  const paste = async (payload: { text?: string; clipId?: string; current?: boolean }): Promise<void> => {
    try { await window.api.invoke('dock:paste', payload) } catch (e) { say(cleanErr(e)) }
  }
  const openMain = (a: { pluginId: string; action?: string; payload?: unknown }): void => window.api.send('app:open-in-main', a)

  const words = normalize(q.trim()).split(/\s+/).filter(Boolean)
  const match = (s: string): boolean => !words.length || words.every((w) => normalize(s).includes(w))
  const shownClips = useMemo(() => {
    const list = clips.filter((c) => !c.sensitive || !words.length).filter((c) => match(`${c.sensitive ? '' : c.text} ${c.app ?? ''}`))
    return [...list.filter((c) => c.pinned).slice(0, 4), ...list.filter((c) => !c.pinned).slice(0, words.length ? 10 : 6)]
  }, [clips, q])
  const shownSnippets = useMemo(() => {
    const base = words.length ? snippets.filter((s) => match(`${s.title} ${s.tags.join(' ')} ${stripDataUrls(s.content)}`)) : recentSnippets(snippets, 6)
    return (base.length ? base : snippets).slice(0, 6)
  }, [snippets, q])
  const shownCaps = useMemo(() => caps.filter((c) => match(`${c.title} ${c.ticket} ${c.app ?? ''}`)).slice(0, 6), [caps, q])

  // ── Plegada: la pestañita ──────────────────────────────────────────────────
  if (!st.expanded) {
    return (
      // Windows no deja ventanas de menos de ~32 px: main la ubica asomando sólo 10 px
      // (el resto queda fuera de la pantalla), así que la pestaña va a la izquierda.
      <div className="h-screen w-screen flex items-center justify-start">
        <div
          className="w-[10px] h-full flex items-center justify-end cursor-pointer"
          onMouseEnter={() => { openTimer.current = setTimeout(() => window.api.send('dock:expand'), HOVER_OPEN_MS) }}
          onMouseLeave={() => { if (openTimer.current) clearTimeout(openTimer.current) }}
          onClick={() => window.api.send('dock:expand')}
          title={`Setto${st.shortcut ? ` (${st.shortcut})` : ''}`}
        >
          <span data-dock-handle className="block w-[5px] h-full rounded-l-full bg-primary/70 shadow-[0_0_10px_rgb(var(--c-primary)/0.5)]" />
        </div>
      </div>
    )
  }

  // ── Desplegada ─────────────────────────────────────────────────────────────
  return (
    <div className="h-screen w-screen p-1" onMouseEnter={cancelClose} onMouseLeave={scheduleClose}>
      <div className="h-full flex flex-col bg-surface hairline rounded-2xl shadow-2xl overflow-hidden" style={{ animation: 'sheetIn 0.2s var(--ease-spring) both' }}>
        <div className="flex items-center gap-2 px-3 h-11 hairline-b shrink-0">
          <img src="setto-logo.png" alt="" className="w-5 h-5 rounded-md" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
          <span className="t-footnote font-semibold text-on-surface flex-1">Setto</span>
          <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon" title={st.pinned ? 'Soltar (se esconde sola)' : 'Fijar abierta'}
            onClick={() => window.api.send('dock:pin', !st.pinned)}>
            {st.pinned ? <PinOff size={14} /> : <Pin size={14} />}
          </button>
          <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon" title="Abrir Setto" onClick={() => openMain({ pluginId: 'dashboard' })}>
            <Settings size={14} />
          </button>
          <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon" title="Cerrar" onClick={() => { window.api.send('dock:pin', false); window.api.send('dock:collapse') }}>
            <X size={14} />
          </button>
        </div>

        <div className="px-3 pt-3 shrink-0">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant/70 pointer-events-none" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar copiado, snippets, capturas…"
              onFocus={() => { searching.current = true; window.api.send('dock:want-focus') }}
              onBlur={() => { searching.current = false }}
              onKeyDown={(e) => { if (e.key === 'Escape') { setQ(''); window.api.send('dock:collapse') } }}
              className="ui-input w-full h-8 pl-8 text-[12.5px]" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-4">
          {/* Acciones rápidas */}
          {!words.length && (
            <div className="grid grid-cols-3 gap-1.5">
              <Quick icon={NotebookPen} label="Nota rápida" onClick={() => window.api.send('dock:quick-capture')} />
              <Quick icon={Wallet} label="Gasto" onClick={() => openMain({ pluginId: 'gastos', action: 'quick-add', payload: {} })} />
              <Quick icon={ScanText} label="Texto de imagen" onClick={() => {
                void window.api.invoke<{ ok: boolean; reason?: string }>('clipboard:ocr-image').then((r) => { say(r.ok ? 'Texto copiado: pegalo con Ctrl+V' : r.reason ?? 'No se pudo leer'); void load() })
              }} />
              <Quick icon={ClipboardText} label="Portapapeles" onClick={() => openMain({ pluginId: 'captures', action: 'text' })} />
              <Quick icon={Toolbox} label="Utilidades" onClick={() => openMain({ pluginId: 'utilities' })} />
              <Quick icon={Code2} label="Snippets" onClick={() => openMain({ pluginId: 'snippets' })} />
            </div>
          )}

          {tickets.length > 0 && !words.length && (
            <Section title="Tickets">
              <div className="flex flex-wrap gap-1.5">
                {tickets.map((t) => (
                  <button key={t} type="button" onClick={() => openMain({ pluginId: 'captures', action: 'ticket', payload: t })}
                    className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-primary/10 text-primary text-[11.5px] font-medium hover:bg-primary/[0.16]">
                    <Ticket size={11} /> {t}
                  </button>
                ))}
              </div>
            </Section>
          )}

          <Section title="Copiado" hint="clic pega">
            {shownClips.length === 0 ? <Empty text="Nada copiado todavía" /> : shownClips.map((c) => (
              <Row key={c.id} onClick={() => void paste({ clipId: c.id })}
                icon={c.sensitive ? <Lock size={13} /> : c.pinned ? <Pin size={13} weight="fill" className="text-primary" /> : <ClipboardText size={13} />}
                title={c.sensitive ? c.masked ?? '••••' : oneLine(c.text)}
                sub={[c.sensitive ? 'Oculto' : KIND_LABEL[c.kind], c.app].filter(Boolean).join(' · ')}
                mono={!c.sensitive && (c.kind === 'code' || c.kind === 'sql' || c.kind === 'path' || c.kind === 'json')} />
            ))}
          </Section>

          {shownCaps.length > 0 && (
            <Section title="Capturas" hint="clic pega · arrastrá a Jira">
              <div className="grid grid-cols-3 gap-1.5">
                {shownCaps.map((c) => (
                  <button key={c.id} type="button" title={`${c.title}${c.ticket ? ` · ${c.ticket}` : ''}`} draggable
                    onDragStart={(e) => { e.preventDefault(); window.api.send('captures:start-drag', [c.id]) }}
                    onClick={() => { void window.api.invoke('captures:copy', c.id).then(() => paste({ current: true })) }}
                    className="block rounded-lg overflow-hidden hairline hover:shadow-md transition-shadow aspect-[4/3] bg-surface-container">
                    <img src={thumbUrl(c.file)} alt="" draggable={false} className="w-full h-full object-cover object-top" />
                  </button>
                ))}
              </div>
            </Section>
          )}

          <Section title="Snippets" hint="clic pega">
            {shownSnippets.length === 0 ? <Empty text="Sin snippets" /> : shownSnippets.map((s) => {
              const content = stripDataUrls(s.content)
              const vars = hasVariables(content)
              return (
                <Row key={s.id}
                  onClick={() => { if (vars) openMain({ pluginId: 'snippets', action: 'open', payload: s.id }); else void paste({ text: content }) }}
                  icon={<Code2 size={13} />} title={s.title || 'Sin título'}
                  sub={vars ? 'Tiene variables: se abre para completarlas' : oneLine(content, 48)} mono={!vars} />
              )
            })}
          </Section>
        </div>

        <div className="px-3 h-8 hairline-t flex items-center t-caption text-on-surface-variant shrink-0">
          {flash ? <span className="text-primary font-medium truncate">{flash}</span>
            : <span className="truncate">{st.shortcut ? `${st.shortcut} abre y cierra · ` : ''}se esconde en pantalla completa</span>}
        </div>
      </div>
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2 px-0.5">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-on-surface-variant/80">{title}</span>
        {hint && <span className="t-caption text-on-surface-variant/60">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function Row({ icon, title, sub, mono, onClick }: { icon: React.ReactNode; title: string; sub?: string; mono?: boolean; onClick: () => void }): JSX.Element {
  return (
    <button type="button" onClick={onClick} className="w-full flex items-start gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-selected transition-colors">
      <span className="mt-0.5 text-on-surface-variant shrink-0">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className={`block text-[12.5px] leading-[18px] text-on-surface truncate ${mono ? 'font-mono text-[12px]' : ''}`}>{title}</span>
        {sub && <span className="block t-caption text-on-surface-variant truncate">{sub}</span>}
      </span>
    </button>
  )
}

function Quick({ icon: Icon, label, onClick }: { icon: typeof Images; label: string; onClick: () => void }): JSX.Element {
  return (
    <button type="button" onClick={onClick}
      className="flex flex-col items-center gap-1 py-2 rounded-lg bg-on-surface/[0.04] hover:bg-selected text-on-surface transition-colors">
      <Icon size={16} className="text-primary" />
      <span className="text-[11px] font-medium leading-tight text-center">{label}</span>
    </button>
  )
}

function Empty({ text }: { text: string }): JSX.Element {
  return <p className="t-caption text-on-surface-variant/70 px-2 py-1">{text}</p>
}
