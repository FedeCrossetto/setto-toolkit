import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, MotionConfig, motion, useAnimationControls, type Variants } from 'framer-motion'
import {
  Check, ClipboardText, Code2, Images, Lock, NotebookPen, Pin, PinOff, ScanText, Search, Settings, Ticket, Toolbox, Wallet, X,
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
 * Plegada es una pestaña angosta con el logo: se arrastra arriba/abajo, salta
 * cuando copiás algo y al pasar el mouse (o clic) se despliega. Un clic en el
 * panel pega en la app que estabas usando (la barra no le roba el foco).
 *
 * Animaciones: sólo transform/opacity. Main agranda la ventana antes de avisar
 * que abre, y al plegar espera ~190 ms para que el panel alcance a salir.
 */
interface DockState { expanded: boolean; pinned: boolean; shortcut: string | null }

const HOVER_OPEN_MS = 280
const LEAVE_CLOSE_MS = 650
const DRAG_THRESHOLD = 4
/** La ventana plegada mide 56 px: por encima de esto todavía es la del panel. */
const SMALL_WINDOW = 120

const POP = { type: 'spring', stiffness: 520, damping: 22 } as const
const listVariants: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.035, delayChildren: 0.05 } } }
const itemVariants: Variants = {
  hidden: { opacity: 0, x: 14 },
  show: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 460, damping: 34 } },
}

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
  const [pastedId, setPastedId] = useState<string | null>(null)
  const [unseen, setUnseen] = useState(0)
  const [bumpKey, setBumpKey] = useState(0)
  const [small, setSmall] = useState(() => window.innerWidth < SMALL_WINDOW)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searching = useRef(false)

  const say = (m: string): void => { setFlash(m); setTimeout(() => setFlash(null), 2200) }
  const pasted = (id: string): void => { setPastedId(id); setTimeout(() => setPastedId((v) => (v === id ? null : v)), 900) }

  // La pestaña se dibuja recién cuando main achicó la ventana (si no, aparecería en medio del panel).
  useEffect(() => {
    const onResize = (): void => setSmall(window.innerWidth < SMALL_WINDOW)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Copia nueva con la barra plegada: la pestaña salta y suma al globito.
  useEffect(() => window.api.on('dock:bump', () => { setUnseen((n) => Math.min(n + 1, 99)); setBumpKey((k) => k + 1) }), [])

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
      if (next.expanded) { syncTheme(); setUnseen(0); void load() } else { setQ(''); searching.current = false }
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

  const paste = async (payload: { text?: string; clipId?: string; current?: boolean }, feedbackId?: string): Promise<void> => {
    try {
      await window.api.invoke('dock:paste', payload)
      if (feedbackId) pasted(feedbackId)
    } catch (e) { say(cleanErr(e)) }
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

  // Plegada: la pestaña con el logo. Desplegada: el panel entra desde el borde
  // y sale (exit) antes de que main achique la ventana.
  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {!st.expanded && small && (
          <Handle key="handle" shortcut={st.shortcut} unseen={unseen} bumpKey={bumpKey} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {st.expanded && (
    <motion.div key="panel" className="h-screen w-screen p-1" onMouseEnter={cancelClose} onMouseLeave={scheduleClose}
      initial={{ opacity: 0, x: 56, scale: 0.97 }}
      animate={{ opacity: 1, x: 0, scale: 1, transition: { type: 'spring', stiffness: 430, damping: 32 } }}
      exit={{ opacity: 0, x: 40, scale: 0.98, transition: { duration: 0.16, ease: [0.4, 0, 1, 1] } }}
      style={{ transformOrigin: 'right center' }}>
      <div className="h-full flex flex-col bg-surface hairline rounded-2xl shadow-2xl overflow-hidden">
        <div className="relative flex items-center gap-2 px-3 h-12 hairline-b shrink-0 bg-gradient-to-b from-primary/[0.09] to-transparent">
          <motion.img src="setto-logo.png" alt="" className="w-6 h-6 rounded-[7px] shadow-sm"
            initial={{ rotate: 0, scale: 0.6 }} animate={{ rotate: [0, -16, 12, -6, 0], scale: 1 }}
            transition={{ duration: 0.6, delay: 0.08 }}
            whileHover={{ rotate: [0, -12, 10, 0], transition: { duration: 0.45 } }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
          <span className="t-footnote font-semibold text-on-surface flex-1">Setto</span>
          <IconBtn title={st.pinned ? 'Soltar (se esconde sola)' : 'Fijar abierta'} active={st.pinned}
            onClick={() => window.api.send('dock:pin', !st.pinned)}>
            {st.pinned ? <PinOff size={14} /> : <Pin size={14} />}
          </IconBtn>
          <IconBtn title="Abrir Setto" onClick={() => openMain({ pluginId: 'dashboard' })}><Settings size={14} /></IconBtn>
          <IconBtn title="Cerrar" onClick={() => { window.api.send('dock:pin', false); window.api.send('dock:collapse') }}><X size={14} /></IconBtn>
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

        <motion.div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 flex flex-col gap-4" variants={listVariants} initial="hidden" animate="show">
          {/* Acciones rápidas */}
          {!words.length && (
            <motion.div variants={itemVariants} className="grid grid-cols-3 gap-1.5">
              <Quick icon={NotebookPen} label="Nota rápida" onClick={() => window.api.send('dock:quick-capture')} />
              <Quick icon={Wallet} label="Gasto" onClick={() => openMain({ pluginId: 'gastos', action: 'quick-add', payload: {} })} />
              <Quick icon={ScanText} label="Texto de imagen" onClick={() => {
                void window.api.invoke<{ ok: boolean; reason?: string }>('clipboard:ocr-image').then((r) => { say(r.ok ? 'Texto copiado: pegalo con Ctrl+V' : r.reason ?? 'No se pudo leer'); void load() })
              }} />
              <Quick icon={ClipboardText} label="Portapapeles" onClick={() => openMain({ pluginId: 'captures', action: 'text' })} />
              <Quick icon={Toolbox} label="Utilidades" onClick={() => openMain({ pluginId: 'utilities' })} />
              <Quick icon={Code2} label="Snippets" onClick={() => openMain({ pluginId: 'snippets' })} />
            </motion.div>
          )}

          {tickets.length > 0 && !words.length && (
            <Section title="Tickets">
              <div className="flex flex-wrap gap-1.5">
                {tickets.map((t) => (
                  <motion.button key={t} type="button" onClick={() => openMain({ pluginId: 'captures', action: 'ticket', payload: t })}
                    whileHover={{ y: -1 }} whileTap={{ scale: 0.94 }}
                    className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-primary/10 text-primary text-[11.5px] font-medium hover:bg-primary/[0.16]">
                    <Ticket size={11} /> {t}
                  </motion.button>
                ))}
              </div>
            </Section>
          )}

          <Section title="Copiado" hint="clic pega">
            {shownClips.length === 0 ? <Empty text="Nada copiado todavía" /> : shownClips.map((c) => (
              <Row key={c.id} done={pastedId === c.id} onClick={() => void paste({ clipId: c.id }, c.id)}
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
                  <motion.button key={c.id} type="button" title={`${c.title}${c.ticket ? ` · ${c.ticket}` : ''}`} draggable
                    whileHover={{ scale: 1.04, y: -1 }} whileTap={{ scale: 0.95 }} transition={POP}
                    onDragStart={(e) => { e.preventDefault(); window.api.send('captures:start-drag', [c.id]) }}
                    onClick={() => { void window.api.invoke('captures:copy', c.id).then(() => paste({ current: true }, c.id)) }}
                    className="relative block rounded-lg overflow-hidden hairline hover:shadow-md transition-shadow aspect-[4/3] bg-surface-container">
                    <img src={thumbUrl(c.file)} alt="" draggable={false} className="w-full h-full object-cover object-top" />
                    <AnimatePresence>
                      {pastedId === c.id && (
                        <motion.span className="absolute inset-0 grid place-items-center bg-primary/70 text-on-primary"
                          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                          <motion.span initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={POP}><Check size={18} /></motion.span>
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.button>
                ))}
              </div>
            </Section>
          )}

          <Section title="Snippets" hint="clic pega">
            {shownSnippets.length === 0 ? <Empty text="Sin snippets" /> : shownSnippets.map((s) => {
              const content = stripDataUrls(s.content)
              const vars = hasVariables(content)
              return (
                <Row key={s.id} done={pastedId === s.id}
                  onClick={() => { if (vars) openMain({ pluginId: 'snippets', action: 'open', payload: s.id }); else void paste({ text: content }, s.id) }}
                  icon={<Code2 size={13} />} title={s.title || 'Sin título'}
                  sub={vars ? 'Tiene variables: se abre para completarlas' : oneLine(content, 48)} mono={!vars} />
              )
            })}
          </Section>
        </motion.div>

        <div className="px-3 h-8 hairline-t flex items-center t-caption text-on-surface-variant shrink-0 overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={flash ?? 'hint'} className={`truncate ${flash ? 'text-primary font-medium' : ''}`}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.16 }}>
              {flash ?? `${st.shortcut ? `${st.shortcut} abre y cierra · ` : ''}arrastrá la pestaña para moverla`}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  )
}

/**
 * La pestaña plegada: logo en una pastilla pegada al borde. Arrastrar la mueve
 * por el borde; clic o mouse quieto encima la abre; con copias nuevas salta y
 * muestra cuántas hay sin ver.
 */
function Handle({ shortcut, unseen, bumpKey }: { shortcut: string | null; unseen: number; bumpKey: number }): JSX.Element {
  const logo = useAnimationControls()
  const [hover, setHover] = useState(false)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ sy: number; top: number; moved: boolean; raf: number } | null>(null)
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stopOpen = (): void => { if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null } }

  useEffect(() => stopOpen, [])
  useEffect(() => {
    if (!bumpKey) return
    void logo.start({ scale: [1, 1.32, 0.88, 1.08, 1], rotate: [0, -14, 10, -4, 0], transition: { duration: 0.55 } })
  }, [bumpKey, logo])

  const onPointerDown = (e: React.PointerEvent): void => {
    if (e.button !== 0) return
    stopOpen()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { sy: e.screenY, top: window.screenY, moved: false, raf: 0 }
  }
  const onPointerMove = (e: React.PointerEvent): void => {
    const d = drag.current
    if (!d) return
    const dy = e.screenY - d.sy
    if (!d.moved && Math.abs(dy) < DRAG_THRESHOLD) return
    if (!d.moved) { d.moved = true; setDragging(true) }
    cancelAnimationFrame(d.raf)
    d.raf = requestAnimationFrame(() => window.api.send('dock:move', d.top + dy))
  }
  const onPointerUp = (): void => {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (d.moved) { setDragging(false); window.api.send('dock:move-end') }
    else window.api.send('dock:expand')
  }

  return (
    <div className="h-screen w-screen relative select-none">
      <motion.div
        data-dock-handle
        role="button"
        aria-label="Abrir Setto"
        title={`Setto${shortcut ? ` · ${shortcut}` : ''} · arrastrá para moverla`}
        className={`absolute top-1/2 -right-4 h-16 w-[60px] -mt-8 rounded-l-[20px] bg-surface hairline shadow-lg flex items-center pl-[8px] ${dragging ? 'cursor-grabbing' : 'cursor-pointer'}`}
        initial={{ x: 56, opacity: 0 }}
        animate={{ x: dragging ? -10 : hover ? -8 : 0, opacity: 1, rotate: dragging ? -4 : 0, scale: dragging ? 1.06 : 1 }}
        exit={{ x: 56, opacity: 0, transition: { duration: 0.14 } }}
        transition={{ type: 'spring', stiffness: 420, damping: 24 }}
        onPointerEnter={() => {
          setHover(true)
          void logo.start({ rotate: [0, -14, 10, -6, 0], transition: { duration: 0.5 } })
          if (!drag.current) openTimer.current = setTimeout(() => window.api.send('dock:expand'), HOVER_OPEN_MS)
        }}
        onPointerLeave={() => { setHover(false); stopOpen() }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* Filo de color del tema: así se ve aunque lo de atrás sea del mismo tono. */}
        <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full bg-primary" />
        <span className={unseen || hover ? '' : 'dock-idle'}>
          <motion.img src="setto-logo.png" alt="" draggable={false} animate={logo}
            className="block w-[28px] h-[28px] rounded-[9px] shadow-sm pointer-events-none" />
        </span>
        {/* Onda al copiar algo. */}
        <AnimatePresence>
          {bumpKey > 0 && (
            <motion.span key={bumpKey} className="absolute left-[6px] w-8 h-8 rounded-[11px] border-2 border-primary pointer-events-none"
              initial={{ scale: 0.9, opacity: 0.8 }} animate={{ scale: 1.7, opacity: 0 }} transition={{ duration: 0.7, ease: 'easeOut' }} />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {unseen > 0 && (
            <motion.span key="badge"
              className="absolute -top-1.5 -left-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-on-primary text-[10px] font-bold grid place-items-center shadow"
              initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={POP}>
              <motion.span key={unseen} initial={{ y: 6, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>{unseen}</motion.span>
            </motion.span>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

function IconBtn({ title, active, onClick, children }: { title: string; active?: boolean; onClick: () => void; children: React.ReactNode }): JSX.Element {
  return (
    <motion.button type="button" title={title} onClick={onClick} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.88 }} transition={POP}
      className={`ui-btn ui-btn-ghost ui-btn-icon ${active ? 'text-primary' : ''}`}>
      {children}
    </motion.button>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }): JSX.Element {
  return (
    <motion.div variants={itemVariants} className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2 px-0.5">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-on-surface-variant/80">{title}</span>
        {hint && <span className="t-caption text-on-surface-variant/60">{hint}</span>}
      </div>
      {children}
    </motion.div>
  )
}

function Row({ icon, title, sub, mono, done, onClick }: { icon: React.ReactNode; title: string; sub?: string; mono?: boolean; done?: boolean; onClick: () => void }): JSX.Element {
  return (
    <motion.button type="button" onClick={onClick} layout="position"
      initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} whileHover={{ x: -2 }} whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 460, damping: 34 }}
      className={`w-full flex items-start gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${done ? 'bg-primary/[0.12]' : 'hover:bg-selected'}`}>
      <span className="mt-0.5 text-on-surface-variant shrink-0 relative w-[13px] h-[13px]">
        <AnimatePresence initial={false} mode="wait">
          {done
            ? <motion.span key="ok" className="absolute inset-0 text-primary" initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} transition={POP}><Check size={13} /></motion.span>
            : <motion.span key="ic" className="absolute inset-0" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }}>{icon}</motion.span>}
        </AnimatePresence>
      </span>
      <span className="flex-1 min-w-0">
        <span className={`block text-[12.5px] leading-[18px] text-on-surface truncate ${mono ? 'font-mono text-[12px]' : ''}`}>{title}</span>
        {sub && <span className="block t-caption text-on-surface-variant truncate">{done ? 'Pegado' : sub}</span>}
      </span>
    </motion.button>
  )
}

function Quick({ icon: Icon, label, onClick }: { icon: typeof Images; label: string; onClick: () => void }): JSX.Element {
  return (
    <motion.button type="button" onClick={onClick} whileHover={{ y: -2 }} whileTap={{ scale: 0.92 }} transition={POP}
      className="group flex flex-col items-center gap-1 py-2 rounded-xl bg-on-surface/[0.04] hover:bg-selected hover:shadow-sm text-on-surface transition-[background-color,box-shadow]">
      <span className="grid place-items-center w-7 h-7 rounded-lg bg-primary/10 text-primary transition-transform duration-200 group-hover:scale-110 group-hover:-rotate-6">
        <Icon size={16} />
      </span>
      <span className="text-[11px] font-medium leading-tight text-center">{label}</span>
    </motion.button>
  )
}

function Empty({ text }: { text: string }): JSX.Element {
  return <p className="t-caption text-on-surface-variant/70 px-2 py-1">{text}</p>
}
