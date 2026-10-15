import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, MotionConfig, motion, useAnimationControls, type Variants } from 'framer-motion'
import {
  ArrowLeftRight, ArrowUpRight, AtSign, Braces, Check, ChevronDown, ChevronUp, Clock, ClipboardText, Code2, Columns2, ExternalLink,
  Fingerprint, FolderOpen, Grid3x3, Images, KeyRound, Link, ListOrdered, Lock, LockOpen, NotebookPen, Pin, PinOff, ScanText, Search,
  Ticket, Toolbox, Trash2, TriangleAlert, Type, User, Wallet, Wand2, X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { reloadAppearanceFromStorage } from '../core/hooks/useThemePalette'
import { normalize } from '../core/search'
import { KIND_LABEL, actionsFor } from '../core/clip-actions'
import { findTicket, transformsFor, type ClipKind, type ClipView } from '../core/clip-utils'
import { thumbUrl, type CaptureLite, type CaptureQueryResult } from '../plugins/captures/types'
import { hasVariables, stripDataUrls } from '../plugins/snippets/template'
import { recentSnippets } from '../plugins/snippets/search'
import type { Snippet } from '../plugins/snippets/types'
import type { Credential, CredentialsListResult } from '../plugins/credentials/types'
import { getMonthSummary } from '../plugins/gastos/summary'
import { classifyContext, isSqlSnippet } from './context'

/**
 * Barra flotante al borde (ventana `#dock`, ver electron/core/dock.ts).
 * Plegada es una pestaña con el logo: se arrastra arriba/abajo (con guía e imán
 * al medio; doble clic la vuelve al medio), salta cuando copiás algo y al dejar
 * el mouse quieto encima (o con un clic) se despliega. Un clic en el panel pega
 * en la app que estabas usando (la barra no le roba el foco).
 *
 * La ventana es transparente y más grande que lo visible (`pad` en `dock:state`):
 * la sombra tiene que caber entera adentro, si no se ve un rectángulo gris.
 *
 * Panel: pestañas (Copiado · Capturas · Snippets · Tickets · Claves), tarjetas con
 * el tipo en color, vista previa abajo (al pasar el mouse o con las flechas) y
 * teclado completo cuando se abre con el atajo: ↑↓ elegir, Enter pega, 1–9 pega
 * directo, Tab cambia de pestaña, escribir busca, Esc cierra. En Claves, Enter
 * copia la contraseña (main la borra del portapapeles a los 30 s) y Shift+Enter
 * el usuario; las contraseñas nunca llegan al renderer.
 *
 * Animaciones: sólo transform/opacity. Main agranda la ventana antes de avisar
 * que abre, y al plegar espera ~240 ms para que el panel alcance a salir.
 */
type Side = 'right' | 'left'
interface Pad { top: number; bottom: number; edge: number; outer: number }
interface DockState {
  expanded: boolean; pinned: boolean; shortcut: string | null; side: Side; pad: Pad
  /** App externa que estaba adelante al abrir (para sugerir). */
  context?: { app: string; title: string } | null
}
const DEFAULT_PAD: Pad = { top: 14, bottom: 30, edge: 10, outer: 22 }

type TabId = 'clips' | 'caps' | 'snippets' | 'tickets' | 'keys'
const TABS: { id: TabId; label: string }[] = [
  { id: 'clips', label: 'Copiado' },
  { id: 'caps', label: 'Capturas' },
  { id: 'snippets', label: 'Snippets' },
  { id: 'tickets', label: 'Tickets' },
  { id: 'keys', label: 'Claves' },
]
const TAB_KEY = 'dock:tab'

const HOVER_OPEN_MS = 280
const PREVIEW_HOVER_MS = 450
const DRAG_THRESHOLD = 4
const DOUBLE_CLICK_MS = 300
/** La ventana plegada mide 72 px: por encima de esto todavía es la del panel. */
const SMALL_WINDOW = 120
const TOP_CREDENTIALS = 8

const POP = { type: 'spring', stiffness: 520, damping: 22 } as const
/** Desaceleración larga y suave (tipo iOS): entra rápido y se asienta sin rebotar. */
const EASE_OUT = [0.22, 1, 0.36, 1] as const
const EASE_IN = [0.4, 0, 0.7, 0.2] as const
const listVariants: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.022, delayChildren: 0.08 } } }
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: EASE_OUT } },
}

/** Sombras que caben en el aire transparente de la ventana (ver PAD / HANDLE en main). */
// Sobre fondos blancos el panel no puede ser blanco: en claro usa el gris lavanda de la app
// (lo de adentro queda blanco y se despega solo), anillo fino y sombra en capas.
const PANEL_SURFACE = 'bg-background dark:bg-surface border border-black/13 dark:border-hairline-strong'
const PANEL_SHADOW = 'shadow-[0_1px_2px_rgb(0_0_0/0.08),0_4px_10px_-2px_rgb(0_0_0/0.08),0_18px_36px_-14px_rgb(0_0_0/0.32)] dark:shadow-[0_1px_2px_rgb(0_0_0/0.4),0_12px_28px_-14px_rgb(0_0_0/0.6)]'
const TAB_SURFACE = 'bg-background dark:bg-surface border border-black/[0.14] dark:border-hairline-strong'
const TAB_SHADOW = 'shadow-[0_1px_2px_rgb(0_0_0/0.10),0_6px_16px_-6px_rgb(0_0_0/0.32)] dark:shadow-[0_1px_2px_rgb(0_0_0/0.45),0_6px_16px_-6px_rgb(0_0_0/0.7)]'

/** Ícono y color de cada tipo de copiado (colores de datos del tema: chart-N). */
const KIND_STYLE: Record<ClipKind, { icon: LucideIcon; cls: string; bar: string }> = {
  ticket: { icon: Ticket, cls: 'bg-primary/15 text-primary', bar: 'bg-primary' },
  url: { icon: Link, cls: 'bg-chart-3/15 text-chart-3', bar: 'bg-chart-3' },
  path: { icon: FolderOpen, cls: 'bg-chart-4/15 text-chart-4', bar: 'bg-chart-4' },
  json: { icon: Braces, cls: 'bg-chart-6/15 text-chart-6', bar: 'bg-chart-6' },
  jwt: { icon: KeyRound, cls: 'bg-warning/15 text-warning', bar: 'bg-warning' },
  stacktrace: { icon: TriangleAlert, cls: 'bg-error/15 text-error', bar: 'bg-error' },
  guid: { icon: Fingerprint, cls: 'bg-chart-7/15 text-chart-7', bar: 'bg-chart-7' },
  timestamp: { icon: Clock, cls: 'bg-chart-7/15 text-chart-7', bar: 'bg-chart-7' },
  sql: { icon: Grid3x3, cls: 'bg-chart-2/15 text-chart-2', bar: 'bg-chart-2' },
  email: { icon: AtSign, cls: 'bg-chart-3/15 text-chart-3', bar: 'bg-chart-3' },
  table: { icon: Columns2, cls: 'bg-chart-8/15 text-chart-8', bar: 'bg-chart-8' },
  list: { icon: ListOrdered, cls: 'bg-chart-8/15 text-chart-8', bar: 'bg-chart-8' },
  code: { icon: Code2, cls: 'bg-chart-5/15 text-chart-5', bar: 'bg-chart-5' },
  text: { icon: Type, cls: 'bg-on-surface/[0.07] text-on-surface-variant', bar: 'bg-primary' },
}
/** Iniciales de las claves: un color de datos por nombre (estable). */
const AVATAR_CLS = [
  'bg-chart-1/15 text-chart-1', 'bg-chart-2/15 text-chart-2', 'bg-chart-3/15 text-chart-3', 'bg-chart-4/15 text-chart-4',
  'bg-chart-5/15 text-chart-5', 'bg-chart-6/15 text-chart-6', 'bg-chart-7/15 text-chart-7', 'bg-chart-8/15 text-chart-8',
]
const MULTILINE_KINDS: ClipKind[] = ['code', 'sql', 'json', 'stacktrace', 'table', 'list']
/** Valores que se pegan tal cual: sin transformaciones genéricas (mayúsculas, string de C#…). */
const ID_KINDS: ClipKind[] = ['ticket', 'url', 'email', 'guid', 'timestamp', 'jwt']

const oneLine = (s: string, n = 90): string => { const t = s.replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t }
const cleanErr = (e: unknown): string => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

function relTime(ts: number): string {
  const s = Math.max(0, (Date.now() - ts) / 1000)
  if (s < 45) return 'ahora'
  if (s < 3600) return `${Math.round(s / 60)} min`
  if (s < 86_400) return `${Math.round(s / 3600)} h`
  if (s < 172_800) return 'ayer'
  return new Date(ts).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

function syncTheme(): void {
  try { document.documentElement.classList.toggle('dark', localStorage.getItem('app-theme') === 'dark') } catch { /* nada */ }
  reloadAppearanceFromStorage()
}

function readTab(): TabId {
  try { const v = localStorage.getItem(TAB_KEY); if (TABS.some((t) => t.id === v)) return v as TabId } catch { /* nada */ }
  return 'clips'
}

// ── Claves ───────────────────────────────────────────────────────────────────

/** Lo que la barra recibe de una clave (nunca la contraseña). */
type CredItem = Credential & { useCount?: number; lastUsedAt?: number }
type CopyResult = { ok: true; usedAt?: number } | { ok: false; error?: string; locked?: boolean }

const initials = (name: string): string => {
  const parts = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? parts[0]?.[1] ?? '')).toUpperCase()
}
const avatarCls = (key: string): string => {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0
  return AVATAR_CLS[Math.abs(h) % AVATAR_CLS.length]!
}

/** Respaldo si `credentials:top` todavía no existe: favoritas primero, después las últimas usadas. */
function fallbackTop(r: CredentialsListResult): CredItem[] {
  const fav = new Set(r.favorites ?? [])
  const score = (c: Credential): number => (fav.has(c.id) ? 1e15 : 0) + (r.usedAt?.[c.id] ?? 0)
  return [...r.items].sort((a, b) => score(b) - score(a)).slice(0, TOP_CREDENTIALS)
    .map((c) => ({ ...c, lastUsedAt: r.usedAt?.[c.id] }))
}

/** Atajo de la franja "Para <app>": un clic pega o abre. */
interface Suggestion { key: string; label: string; icon: LucideIcon; hint?: string; run: () => void }

/** Un ítem navegable de la pestaña actual (lo que pega Enter / el número). */
type Item =
  | { type: 'clip'; key: string; clip: ClipView }
  | { type: 'cap'; key: string; cap: CaptureLite }
  | { type: 'snippet'; key: string; snippet: Snippet; content: string; vars: boolean }
  | { type: 'ticket'; key: string; ticket: string; caps: number; copied: boolean }
  | { type: 'cred'; key: string; cred: CredItem }

export function Dock(): JSX.Element {
  const [st, setSt] = useState<DockState>({ expanded: false, pinned: false, shortcut: null, side: 'right', pad: DEFAULT_PAD })
  const [clips, setClips] = useState<ClipView[]>([])
  const [caps, setCaps] = useState<CaptureLite[]>([])
  const [capTickets, setCapTickets] = useState<string[]>([])
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [topCreds, setTopCreds] = useState<CredItem[]>([])
  const [allCreds, setAllCreds] = useState<CredItem[]>([])
  const [locked, setLocked] = useState(false)
  const [q, setQ] = useState('')
  const [tab, setTabState] = useState<TabId>(readTab)
  const [tabDir, setTabDir] = useState(1)
  const [active, setActive] = useState(0)
  const [previewKey, setPreviewKey] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [pastedKey, setPastedKey] = useState<string | null>(null)
  const [unseen, setUnseen] = useState(0)
  const [bumpKey, setBumpKey] = useState(0)
  const [lastKind, setLastKind] = useState<ClipKind | null>(null)
  /** Pagos del mes sin marcar (Gastos), para el aviso de arriba. */
  const [pending, setPending] = useState(0)
  const [small, setSmall] = useState(() => window.innerWidth < SMALL_WINDOW)
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const say = (m: string, ms = 2200): void => {
    setFlash(m)
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(null), ms)
  }
  const markPasted = (key: string): void => { setPastedKey(key); setTimeout(() => setPastedKey((v) => (v === key ? null : v)), 900) }

  // La pestaña se dibuja recién cuando main achicó la ventana (si no, aparecería en medio del panel).
  useEffect(() => {
    const onResize = (): void => setSmall(window.innerWidth < SMALL_WINDOW)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Cambio de tema en la ventana principal (comparten localStorage): seguirlo también plegada.
  useEffect(() => {
    const onStorage = (e: StorageEvent): void => { if (!e.key || e.key.startsWith('app-')) syncTheme() }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Copia nueva con la barra plegada: la pestaña salta, suma al globito y toma el color del tipo.
  useEffect(() => window.api.on('dock:bump', (p) => {
    setUnseen((n) => Math.min(n + 1, 99))
    setBumpKey((k) => k + 1)
    const kind = (p as { kind?: ClipKind } | undefined)?.kind
    if (kind && kind in KIND_STYLE) setLastKind(kind)
  }), [])

  const loadCreds = useCallback(async () => {
    // Los canales nuevos pueden no estar todavía en el preload (tira sincrónico): todo en try.
    let list: CredentialsListResult | null = null
    try { list = await window.api.invoke<CredentialsListResult>('credentials:list', { localOnly: true }) } catch { list = null }
    if (list) setAllCreds(list.items.map((c) => ({ ...c, lastUsedAt: (c as CredItem).lastUsedAt ?? list!.usedAt?.[c.id] })))
    try {
      const r = await window.api.invoke<CredItem[] | { items: CredItem[] }>('credentials:top', TOP_CREDENTIALS)
      setTopCreds(Array.isArray(r) ? r : r.items)
    } catch { setTopCreds(list ? fallbackTop(list) : []) }
    try {
      const s = await window.api.invoke<{ pinEnabled: boolean; unlocked: boolean }>('credentials:lock-status')
      setLocked(s.pinEnabled && !s.unlocked)
    } catch { /* sin PIN */ }
  }, [])

  const load = useCallback(async () => {
    try { setClips(await window.api.invoke<ClipView[]>('clipboard:history')) } catch { setClips([]) }
    try {
      const r = await window.api.invoke<CaptureQueryResult>('captures:query', { limit: 12 })
      setCaps(r.items)
      setCapTickets(r.facets.tickets.slice(0, 12))
    } catch { setCaps([]) }
    try { setSnippets((await window.api.invoke<{ snippets: Snippet[] }>('snippets:load')).snippets) } catch { setSnippets([]) }
    try { setPending((await getMonthSummary())?.pendientesCount ?? 0) } catch { setPending(0) }
    await loadCreds()
  }, [loadCreds])

  useEffect(() => {
    const apply = (s: Partial<DockState>): void => setSt((prev) => ({ ...prev, ...s, pad: s.pad ?? prev.pad, side: s.side ?? prev.side }))
    void window.api.invoke<DockState>('dock:state').then(apply).catch(() => undefined)
    return window.api.on('dock:state', (s) => {
      const next = s as DockState
      apply(next)
      if (next.expanded) { syncTheme(); setUnseen(0); setActive(0); void load() } else {
        setQ(''); setPreviewKey(null)
      }
    })
  }, [load])

  // Mientras está abierta, refrescar (lo copiado cambia seguido).
  useEffect(() => {
    if (!st.expanded) return
    const t = setInterval(() => { void load() }, 2500)
    return () => clearInterval(t)
  }, [st.expanded, load])

  const setTab = (next: TabId): void => {
    const from = TABS.findIndex((t) => t.id === tab)
    const to = TABS.findIndex((t) => t.id === next)
    setTabDir(to >= from ? 1 : -1)
    setTabState(next)
    setActive(0)
    setPreviewKey(null)
    try { localStorage.setItem(TAB_KEY, next) } catch { /* nada */ }
  }

  const paste = async (payload: { text?: string; clipId?: string; current?: boolean }, key?: string): Promise<void> => {
    try {
      await window.api.invoke('dock:paste', payload)
      if (key) markPasted(key)
    } catch (e) { say(cleanErr(e)) }
  }
  const openMain = (a: { pluginId: string; action?: string; payload?: unknown }): void => window.api.send('app:open-in-main', a)
  const collapse = (): void => { window.api.send('dock:pin', false); window.api.send('dock:collapse') }

  // ── Claves: copiar sin que la contraseña pase por acá ──────────────────────
  const openCredential = (c: CredItem): void => openMain({ pluginId: 'credentials', action: 'open', payload: c.id })
  const copyUser = async (c: CredItem, key: string): Promise<void> => {
    if (!c.usuario) { say('Esta clave no tiene usuario'); return }
    try {
      let r: CopyResult
      try { r = await window.api.invoke<CopyResult>('credentials:copy-username', c.id) } catch (e) {
        if (!/unknown channel|No handler/i.test(cleanErr(e))) throw e
        r = await window.api.invoke<CopyResult>('credentials:copy-secret', c.usuario, 0)
      }
      if (r.ok) { markPasted(key); say('Usuario copiado') } else say(r.error ?? 'No se pudo copiar')
      void loadCreds()
    } catch (e) { say(cleanErr(e)) }
  }
  const copyPassword = async (c: CredItem, key: string): Promise<void> => {
    if (locked) { openCredential(c); return }
    if (!c.hasPassword) { await copyUser(c, key); return }
    try {
      const r = await window.api.invoke<CopyResult>('credentials:copy-password', c.id)
      if (r.ok) { markPasted(key); say('Contraseña copiada · se borra en 30 s', 3200) } else if (r.locked) { setLocked(true); say('Claves bloqueadas: abrí Setto para desbloquear', 3200) } else say(r.error ?? 'No se pudo copiar')
      void loadCreds()
    } catch (e) { say(cleanErr(e)) }
  }

  // ── Búsqueda y listas por pestaña ──────────────────────────────────────────
  const words = normalize(q.trim()).split(/\s+/).filter(Boolean)
  const match = (s: string): boolean => !words.length || words.every((w) => normalize(s).includes(w))

  const lists = useMemo(() => {
    const clipList = clips.filter((c) => !c.sensitive || !words.length).filter((c) => match(`${c.sensitive ? '' : c.text} ${c.app ?? ''} ${KIND_LABEL[c.kind]}`))
    const clipItems: Item[] = [...clipList.filter((c) => c.pinned), ...clipList.filter((c) => !c.pinned)].slice(0, 30)
      .map((c) => ({ type: 'clip', key: `c:${c.id}`, clip: c }))
    const capItems: Item[] = caps.filter((c) => match(`${c.title} ${c.ticket} ${c.app ?? ''}`))
      .map((c) => ({ type: 'cap', key: `i:${c.id}`, cap: c }))
    const snipBase = words.length ? snippets.filter((s) => match(`${s.title} ${s.tags.join(' ')} ${stripDataUrls(s.content)}`)) : recentSnippets(snippets, 20)
    const snipItems: Item[] = (snipBase.length || words.length ? snipBase : snippets).slice(0, 20).map((s) => {
      const content = stripDataUrls(s.content)
      return { type: 'snippet', key: `s:${s.id}`, snippet: s, content, vars: hasVariables(content) }
    })
    // Tickets: los que copiaste (solos o dentro de un link/texto) más los de las capturas.
    const copied = new Set(clips.filter((c) => !c.sensitive).map((c) => (c.kind === 'ticket' ? c.text.trim() : findTicket(c.text))).filter((t): t is string => !!t))
    const all = [...new Set([...copied, ...capTickets])]
    const ticketItems: Item[] = all.filter((t) => match(t)).slice(0, 20).map((t) => ({
      type: 'ticket', key: `t:${t}`, ticket: t, caps: caps.filter((c) => c.ticket === t).length, copied: copied.has(t),
    }))
    // Claves: sin buscar, las más usadas; buscando, todas (nombre, usuario, sitio, categoría).
    const credBase = words.length ? allCreds.filter((c) => match(`${c.nombre} ${c.usuario} ${c.url ?? ''} ${c.categoria ?? ''}`)).slice(0, 20) : topCreds
    const credItems: Item[] = credBase.map((c) => ({ type: 'cred', key: `k:${c.id}`, cred: c }))
    return { clips: clipItems, caps: capItems, snippets: snipItems, tickets: ticketItems, keys: credItems } satisfies Record<TabId, Item[]>
  }, [clips, caps, capTickets, snippets, topCreds, allCreds, q])

  // ── Sugerencias según la app de adelante ─────────────────────────────────
  const ctx = useMemo(() => classifyContext(st.context?.app, st.context?.title), [st.context])
  const suggestions = useMemo((): Suggestion[] => {
    if (!ctx) return []
    const out: Suggestion[] = []
    const bySnippet = (pred: (sn: Snippet) => boolean): void => {
      for (const sn of [...snippets].filter(pred).sort((a, b) => (b.useCount ?? 0) - (a.useCount ?? 0) || (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0)).slice(0, 3)) {
        const content = stripDataUrls(sn.content)
        out.push({
          key: `sg:s:${sn.id}`, label: sn.title || 'Snippet', icon: Code2,
          hint: hasVariables(content) ? 'tiene variables' : 'clic pega',
          run: () => (hasVariables(content) ? openMain({ pluginId: 'snippets', action: 'open', payload: sn.id }) : void paste({ text: content }, `sg:s:${sn.id}`)),
        })
      }
    }
    const byClip = (kinds: ClipKind[]): void => {
      for (const c of clips.filter((x) => !x.sensitive && kinds.includes(x.kind)).slice(0, 2)) {
        out.push({ key: `sg:c:${c.id}`, label: oneLine(c.text, 40), icon: KIND_STYLE[c.kind].icon, hint: 'copiado', run: () => void paste({ clipId: c.id }, `sg:c:${c.id}`) })
      }
    }
    switch (ctx.kind) {
      case 'sql': bySnippet(isSqlSnippet); byClip(['sql']); break
      case 'code': bySnippet((sn) => !isSqlSnippet(sn)); byClip(['code', 'path']); break
      case 'ticket': {
        const t = ctx.ticket!
        const n = caps.filter((c) => c.ticket === t).length
        out.push({ key: 'sg:t:all', label: `Todo lo de ${t}`, icon: Ticket, hint: n ? `${n} captura${n === 1 ? '' : 's'}` : 'capturas y comentario', run: () => openMain({ pluginId: 'captures', action: 'ticket', payload: t }) })
        for (const c of caps.filter((x) => x.ticket === t).slice(0, 2)) {
          out.push({ key: `sg:i:${c.id}`, label: c.title || 'Captura', icon: Images, hint: 'clic pega', run: () => { void window.api.invoke('captures:copy', c.id).then(() => paste({ current: true }, `sg:i:${c.id}`)) } })
        }
        break
      }
      case 'chat':
        for (const c of caps.slice(0, 3)) {
          out.push({ key: `sg:i:${c.id}`, label: c.title || 'Captura', icon: Images, hint: 'clic pega', run: () => { void window.api.invoke('captures:copy', c.id).then(() => paste({ current: true }, `sg:i:${c.id}`)) } })
        }
        break
    }
    return out.slice(0, 4)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, snippets, clips, caps])

  const items = lists[tab]
  const safeActive = Math.min(active, Math.max(0, items.length - 1))
  const preview = previewKey ? items.find((i) => i.key === previewKey) ?? null : null

  // Buscando: si la pestaña actual no tiene resultados y otra sí, saltar a esa.
  useEffect(() => {
    if (!words.length || items.length) return
    const other = TABS.find((t) => lists[t.id].length)
    if (other) setTab(other.id)
  }, [q])

  const activate = (item: Item | undefined, alt = false): void => {
    if (!item) return
    switch (item.type) {
      case 'clip': void paste({ clipId: item.clip.id }, item.key); break
      case 'cap': void window.api.invoke('captures:copy', item.cap.id).then(() => paste({ current: true }, item.key)); break
      case 'snippet':
        if (item.vars) openMain({ pluginId: 'snippets', action: 'open', payload: item.snippet.id })
        else void paste({ text: item.content }, item.key)
        break
      case 'ticket': openMain({ pluginId: 'captures', action: 'ticket', payload: item.ticket }); break
      case 'cred': void (alt ? copyUser(item.cred, item.key) : copyPassword(item.cred, item.key)); break
    }
  }

  const togglePin = async (c: ClipView): Promise<void> => {
    try { await window.api.invoke('clipboard:pin', c.id, !c.pinned); await load() } catch (e) { say(cleanErr(e)) }
  }
  const removeClip = async (c: ClipView): Promise<void> => {
    try { await window.api.invoke('clipboard:remove', c.id); if (previewKey === `c:${c.id}`) setPreviewKey(null); await load() } catch (e) { say(cleanErr(e)) }
  }

  const hoverItem = (i: number, item: Item): void => {
    setActive(i)
    if (previewTimer.current) clearTimeout(previewTimer.current)
    if (item.type === 'cred') return
    previewTimer.current = setTimeout(() => setPreviewKey(item.key), PREVIEW_HOVER_MS)
  }
  const leaveList = (): void => {
    if (previewTimer.current) clearTimeout(previewTimer.current)
    if (!document.hasFocus()) setPreviewKey(null)
  }

  // Mantener el elegido a la vista al moverse con el teclado.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${safeActive}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [safeActive, tab])

  // ── Teclado (cuando se abrió con el atajo, la barra tiene el foco) ─────────
  useEffect(() => {
    if (!st.expanded) return
    const onKey = (e: KeyboardEvent): void => {
      const inInput = document.activeElement === inputRef.current
      const plain = !e.ctrlKey && !e.altKey && !e.metaKey
      if (e.key === 'Escape') {
        e.preventDefault()
        if (previewKey) setPreviewKey(null)
        else if (q) setQ('')
        else collapse()
        return
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        const i = TABS.findIndex((t) => t.id === tab)
        setTab(TABS[(i + (e.shiftKey ? TABS.length - 1 : 1)) % TABS.length]!.id)
        return
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const next = Math.max(0, Math.min(items.length - 1, safeActive + (e.key === 'ArrowDown' ? 1 : -1)))
        setActive(next)
        const it = items[next]
        setPreviewKey(it && it.type !== 'cred' ? it.key : null)
        return
      }
      if (e.key === 'Enter') { e.preventDefault(); activate(items[safeActive], e.shiftKey); return }
      if (!inInput && plain && /^[1-9]$/.test(e.key)) { e.preventDefault(); activate(items[Number(e.key) - 1]); return }
      const cur = items[safeActive]
      if (cur?.type === 'clip' && e.ctrlKey && e.key.toLowerCase() === 'p') { e.preventDefault(); void togglePin(cur.clip); return }
      if (cur?.type === 'clip' && !inInput && e.key === 'Delete') { e.preventDefault(); void removeClip(cur.clip); return }
      // Escribir en cualquier lado busca.
      if (!inInput && plain && e.key.length === 1) {
        e.preventDefault()
        setQ((v) => v + e.key)
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const { side, pad } = st
  const left = side === 'left'
  const hint = tab === 'keys'
    ? <><Kbd>Enter</Kbd> copia la contraseña · <Kbd>⇧ Enter</Kbd> el usuario</>
    : tab === 'tickets'
      ? <><Kbd>↑↓</Kbd> elegir · <Kbd>Enter</Kbd> ver capturas · <Kbd>Tab</Kbd> pestaña</>
      : <><Kbd>↑↓</Kbd> elegir · <Kbd>Enter</Kbd> pega · <Kbd>1–9</Kbd> directo · <Kbd>Tab</Kbd> pestaña</>

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {!st.expanded && small && (
          <Handle key="handle" side={side} shortcut={st.shortcut} unseen={unseen} bumpKey={bumpKey} kind={lastKind} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {st.expanded && (
          <motion.div key="panel" className="h-screen w-screen"
            style={{
              paddingTop: pad.top, paddingBottom: pad.bottom,
              paddingLeft: left ? pad.edge : pad.outer, paddingRight: left ? pad.outer : pad.edge,
              transformOrigin: left ? '0% 50%' : '100% 50%',
            }}
            initial={{ opacity: 0, x: left ? -22 : 22, scale: 0.985 }}
            animate={{ opacity: 1, x: 0, scale: 1, transition: { duration: 0.34, ease: EASE_OUT } }}
            exit={{ opacity: 0, x: left ? -18 : 18, scale: 0.985, transition: { duration: 0.2, ease: EASE_IN } }}>
            <div className={`relative h-full flex flex-col rounded-[18px] overflow-hidden text-on-surface ${PANEL_SURFACE} ${PANEL_SHADOW}`}>

              {/* Encabezado */}
              <div className="flex items-center gap-2.5 px-3.5 pt-3 pb-2.5 shrink-0">
                <motion.img src="setto-logo.png" alt="" className="w-7 h-7 rounded-[8px]"
                  initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.4, delay: 0.06, ease: EASE_OUT }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                <span className="flex-1 min-w-0 leading-tight">
                  <span className="block text-[13px] font-semibold tracking-[-0.01em]">Setto</span>
                  <span className="block text-[11px] text-on-surface-variant truncate">
                    {st.shortcut ? `${st.shortcut} abre y cierra` : 'Barra rápida'}
                  </span>
                </span>
                <IconBtn title={left ? 'Pasar al borde derecho' : 'Pasar al borde izquierdo'} onClick={() => window.api.send('dock:set-side', left ? 'right' : 'left')}>
                  <ArrowLeftRight size={14} />
                </IconBtn>
                <IconBtn title={st.pinned ? 'Soltar (se esconde sola)' : 'Fijar abierta'} active={st.pinned} onClick={() => window.api.send('dock:pin', !st.pinned)}>
                  {st.pinned ? <PinOff size={14} weight="fill" /> : <Pin size={14} />}
                </IconBtn>
                <IconBtn title="Abrir Setto" onClick={() => openMain({ pluginId: 'dashboard' })}><ArrowUpRight size={14} /></IconBtn>
                <IconBtn title="Cerrar (Esc)" onClick={collapse}><X size={14} /></IconBtn>
              </div>

              {/* Buscador */}
              <div className="relative px-3.5 shrink-0">
                <Search size={14} className="absolute left-6 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
                <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setActive(0) }} placeholder="Buscar en todo…"
                  onFocus={() => window.api.send('dock:want-focus')}
                  className="w-full h-9 pl-8 pr-8 rounded-[10px] bg-on-surface/5 border border-transparent focus:bg-surface focus:border-primary/40 focus:shadow-[0_0_0_3px_rgb(var(--c-primary)/0.12)] outline-hidden text-[13px] text-on-surface placeholder:text-on-surface-variant/70 transition-[background-color,border-color,box-shadow] duration-200" />
                {q && (
                  <button type="button" title="Limpiar" onClick={() => { setQ(''); inputRef.current?.focus() }}
                    className="absolute right-5 top-1/2 -translate-y-1/2 grid place-items-center w-5 h-5 rounded-full text-on-surface-variant hover:bg-on-surface/8">
                    <X size={11} />
                  </button>
                )}
              </div>

              {/* Acciones rápidas */}
              <div className="flex items-center gap-1 px-3.5 pt-2.5 shrink-0">
                <Quick icon={NotebookPen} label="Nota rápida" onClick={() => window.api.send('dock:quick-capture')} />
                <Quick icon={Wallet} label="Nuevo gasto" onClick={() => openMain({ pluginId: 'gastos', action: 'quick-add', payload: {} })} />
                <Quick icon={ScanText} label="Texto de imagen (OCR del portapapeles)" onClick={() => {
                  void window.api.invoke<{ ok: boolean; reason?: string }>('clipboard:ocr-image').then((r) => { say(r.ok ? 'Texto copiado: pegalo con Ctrl+V' : r.reason ?? 'No se pudo leer'); void load() })
                }} />
                <Quick icon={ClipboardText} label="Abrir Portapapeles" onClick={() => openMain({ pluginId: 'captures', action: 'text' })} />
                <Quick icon={KeyRound} label="Abrir Credenciales" onClick={() => openMain({ pluginId: 'credentials' })} />
                <Quick icon={Code2} label="Abrir Snippets" onClick={() => openMain({ pluginId: 'snippets' })} />
                <Quick icon={Toolbox} label="Abrir Utilidades" onClick={() => openMain({ pluginId: 'utilities' })} />
              </div>

              {/* Para lo que estás usando (SSMS → SQL, Jira → el ticket…) y pagos pendientes */}
              <AnimatePresence initial={false}>
                {!words.length && (suggestions.length > 0 || pending > 0) && (
                  <motion.div key="ctx" className="px-3.5 pt-2.5 shrink-0 overflow-hidden"
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.24, ease: EASE_OUT }}>
                    {suggestions.length > 0 && ctx && (
                      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-on-surface-variant/70 mb-1.5">Para {ctx.label}</div>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {pending > 0 && (
                        <button type="button" onClick={() => openMain({ pluginId: 'gastos' })}
                          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-warning/12 text-warning text-[12px] font-medium hover:bg-warning/20 transition-colors">
                          <Wallet size={12} /> {pending} pago{pending === 1 ? '' : 's'} pendiente{pending === 1 ? '' : 's'}
                        </button>
                      )}
                      {suggestions.map((sg) => (
                        <button key={sg.key} type="button" onClick={sg.run} title={sg.hint}
                          className={`inline-flex items-center gap-1.5 h-7 max-w-full px-2.5 rounded-full text-[12px] transition-colors ${
                            pastedKey === sg.key ? 'bg-primary/15 text-primary' : 'bg-on-surface/5 text-on-surface hover:bg-on-surface/9'}`}>
                          {pastedKey === sg.key ? <Check size={12} /> : <sg.icon size={12} className="text-on-surface-variant shrink-0" />}
                          <span className="truncate">{sg.label}</span>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Pestañas */}
              <div className="mx-3.5 mt-2.5 p-[3px] rounded-[10px] bg-on-surface/5 grid grid-cols-5 shrink-0">
                {TABS.map((t) => {
                  const n = lists[t.id].length
                  const on = tab === t.id
                  return (
                    <button key={t.id} type="button" onClick={() => setTab(t.id)} title={`${t.label} (${n})`}
                      className={`relative h-7 rounded-[8px] text-[12px] font-medium transition-colors duration-200 ${on ? 'text-on-surface' : 'text-on-surface-variant hover:text-on-surface'}`}>
                      {on && <motion.span layoutId="dock-tab" className="absolute inset-0 z-0 rounded-[8px] bg-surface shadow-sm" transition={{ duration: 0.32, ease: EASE_OUT }} />}
                      <span className="relative z-10 inline-flex items-center gap-1">
                        {t.label}
                        {n > 0 && (
                          <span className={`text-[10px] tabular-nums ${words.length ? 'text-primary font-semibold' : 'text-on-surface-variant/60'}`}>{n}</span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* Lista + vista previa */}
              <div className="relative flex-1 min-h-0 flex flex-col" onMouseLeave={leaveList}>
                <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-2 pt-2 pb-2">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div key={tab}
                      initial={{ opacity: 0, x: tabDir * 12 }} animate={{ opacity: 1, x: 0, transition: { duration: 0.24, ease: EASE_OUT } }}
                      exit={{ opacity: 0, x: tabDir * -12, transition: { duration: 0.12, ease: EASE_IN } }}>
                      {tab === 'keys' && locked && (
                        <button type="button" onClick={() => openMain({ pluginId: 'credentials' })}
                          className="w-[calc(100%-8px)] mx-1 mb-1.5 flex items-center gap-2.5 px-3 py-2.5 rounded-[12px] bg-warning/10 text-left hover:bg-warning/15 transition-colors">
                          <Lock size={15} className="text-warning shrink-0" />
                          <span className="flex-1 min-w-0">
                            <span className="block text-[12px] font-medium text-on-surface">Claves bloqueadas con PIN</span>
                            <span className="block text-[11px] text-on-surface-variant">Abrir Setto para desbloquear</span>
                          </span>
                          <ArrowUpRight size={14} className="text-on-surface-variant" />
                        </button>
                      )}
                      {items.length === 0 ? <Empty tab={tab} searching={words.length > 0} /> : (
                        <motion.div variants={listVariants} initial="hidden" animate="show"
                          className={tab === 'caps' ? 'grid grid-cols-2 gap-2 px-1' : 'flex flex-col gap-px'}>
                          {items.map((item, i) => (
                            <motion.div key={item.key} variants={itemVariants} data-idx={i} onMouseEnter={() => hoverItem(i, item)}>
                              {item.type === 'cred' ? (
                                <CredRow cred={item.cred} index={i} active={i === safeActive} done={pastedKey === item.key} locked={locked}
                                  onCopyPassword={() => activate(item)} onCopyUser={() => activate(item, true)} onOpen={() => openCredential(item.cred)} />
                              ) : (
                                <ItemView item={item} index={i} active={i === safeActive} done={pastedKey === item.key}
                                  onActivate={() => activate(item)}
                                  onPin={item.type === 'clip' ? () => void togglePin(item.clip) : undefined}
                                  onRemove={item.type === 'clip' ? () => void removeClip(item.clip) : undefined} />
                              )}
                            </motion.div>
                          ))}
                        </motion.div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>

                <AnimatePresence>
                  {preview && (
                    <Preview key="preview" item={preview}
                      onPaste={(text) => (text === undefined ? activate(preview) : void paste({ text }, preview.key))}
                      onOpen={openMain} onError={say}
                      onClose={() => setPreviewKey(null)} />
                  )}
                </AnimatePresence>
              </div>

              {/* Pie: avisos o ayuda de teclado */}
              <div className="px-3.5 h-9 flex items-center text-[11px] text-on-surface-variant shrink-0 hairline-t overflow-hidden">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span key={flash ?? `hint-${tab}`} className={`truncate inline-flex items-center gap-1.5 ${flash ? 'text-on-surface font-medium' : ''}`}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.16 }}>
                    {flash ? <><Check size={12} className="text-primary shrink-0" />{flash}</> : <span className="truncate">{hint}</span>}
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

// ── Tarjetas ─────────────────────────────────────────────────────────────────

interface ItemViewProps {
  item: Exclude<Item, { type: 'cred' }>
  index: number
  active: boolean
  done: boolean
  onActivate: () => void
  onPin?: () => void
  onRemove?: () => void
}

function rowCls(active: boolean, done: boolean): string {
  return `group relative flex items-center gap-2.5 px-2 py-[7px] rounded-[12px] cursor-pointer transition-colors duration-150 ${
    done ? 'bg-primary/12' : active ? 'bg-on-surface/6' : 'hover:bg-on-surface/4'}`
}

function ItemView({ item, index, active, done, onActivate, onPin, onRemove }: ItemViewProps): JSX.Element {
  if (item.type === 'cap') {
    const c = item.cap
    return (
      <motion.button type="button" title={`${c.title}${c.ticket ? ` · ${c.ticket}` : ''}`} draggable
        whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }} transition={POP}
        onDragStart={(e) => { e.preventDefault(); window.api.send('captures:start-drag', [c.id]) }}
        onClick={onActivate}
        className={`group relative w-full text-left rounded-[12px] overflow-hidden bg-on-surface/4 hairline transition-shadow ${active ? 'ring-2 ring-primary/60 shadow-md' : 'hover:shadow-md'}`}>
        <div className="aspect-16/10 bg-surface-container overflow-hidden">
          <img src={thumbUrl(c.file)} alt="" draggable={false} className="w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.04]" />
        </div>
        <div className="px-2 py-1.5">
          <div className="text-[12px] font-medium text-on-surface truncate">{c.title || 'Captura'}</div>
          <div className="text-[11px] text-on-surface-variant truncate">{[c.ticket, c.app, relTime(c.createdAt)].filter(Boolean).join(' · ')}</div>
        </div>
        {index < 9 && <IndexBadge n={index + 1} className="absolute top-1.5 left-1.5 bg-surface/90" />}
        <DoneOverlay show={done} />
      </motion.button>
    )
  }

  let icon: React.ReactNode
  let iconCls = ''
  let title: React.ReactNode
  let meta: string
  let time: string | null = null
  let mono = false
  let extra: React.ReactNode = null

  switch (item.type) {
    case 'clip': {
      const c = item.clip
      const style = KIND_STYLE[c.kind]
      const Icon = c.sensitive ? Lock : style.icon
      icon = <Icon size={14} />
      iconCls = c.sensitive ? 'bg-warning/15 text-warning' : style.cls
      mono = !c.sensitive && (MULTILINE_KINDS.includes(c.kind) || c.kind === 'path' || c.kind === 'guid')
      title = c.sensitive ? (c.masked ?? '••••••') : MULTILINE_KINDS.includes(c.kind) ? c.text.trim() : oneLine(c.text, 160)
      meta = [c.sensitive ? 'Oculto' : KIND_LABEL[c.kind], c.app].filter(Boolean).join(' · ')
      time = relTime(c.at)
      if (c.pinned) extra = <Pin size={11} weight="fill" className="text-primary shrink-0" />
      break
    }
    case 'snippet': {
      icon = <Code2 size={14} />
      iconCls = KIND_STYLE.code.cls
      title = item.snippet.title || 'Sin título'
      meta = item.vars ? 'Tiene variables: se abre para completarlas' : oneLine(item.content, 70)
      break
    }
    case 'ticket': {
      icon = <Ticket size={14} />
      iconCls = KIND_STYLE.ticket.cls
      title = item.ticket
      meta = [item.caps ? `${item.caps} captura${item.caps === 1 ? '' : 's'}` : null, item.copied ? 'copiado' : null].filter(Boolean).join(' · ') || 'Ver capturas'
      break
    }
  }

  // Copiados y snippets se pueden arrastrar como texto a Jira, Teams, un mail… (nunca un secreto).
  const dragText = item.type === 'clip' ? (item.clip.sensitive ? null : item.clip.text) : item.type === 'snippet' && !item.vars ? item.content : null

  return (
    <div role="button" tabIndex={-1} onClick={onActivate} className={rowCls(active, done)}
      draggable={dragText !== null}
      onDragStart={dragText !== null ? (e) => { e.dataTransfer.setData('text/plain', dragText); e.dataTransfer.effectAllowed = 'copy' } : undefined}
      title={dragText !== null ? 'Clic pega · arrastrá para soltarlo en otra app' : undefined}>
      <span className={`relative grid place-items-center w-8 h-8 rounded-[9px] shrink-0 self-start mt-px ${iconCls}`}>
        <AnimatePresence initial={false} mode="wait">
          {done
            ? <motion.span key="ok" initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} transition={POP}><Check size={14} /></motion.span>
            : <motion.span key="ic" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }}>{icon}</motion.span>}
        </AnimatePresence>
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex items-start gap-1">
          <span className={`flex-1 min-w-0 text-on-surface line-clamp-2 wrap-break-word ${mono ? 'font-mono text-[12px] leading-[16px] whitespace-pre-wrap break-all' : 'text-[13px] leading-[18px]'}`}>{title}</span>
          {extra}
        </span>
        <span className="flex items-center gap-2 mt-0.5 text-[11px] leading-[14px] text-on-surface-variant">
          <span className="truncate">{done ? 'Pegado' : meta}</span>
          {time && !done && <span className="ml-auto shrink-0 tabular-nums text-on-surface-variant/70">{time}</span>}
        </span>
      </span>

      {/* Derecha: número para el teclado; al pasar el mouse, acciones. */}
      <span className="shrink-0 flex items-center gap-0.5 min-w-[22px] justify-end">
        {(onPin || onRemove) && (
          <span className="hidden group-hover:flex items-center gap-0.5">
            {onPin && item.type === 'clip' && !item.clip.sensitive && (
              <MiniBtn title={item.clip.pinned ? 'Soltar' : 'Fijar (Ctrl+P)'} onClick={onPin}>{item.clip.pinned ? <PinOff size={13} /> : <Pin size={13} />}</MiniBtn>
            )}
            {onRemove && <MiniBtn title="Quitar del historial (Supr)" onClick={onRemove}><Trash2 size={13} /></MiniBtn>}
          </span>
        )}
        {index < 9 && <IndexBadge n={index + 1} className={onPin || onRemove ? 'group-hover:hidden' : ''} />}
      </span>
    </div>
  )
}

/** Fila de una clave: clic copia la contraseña (o abre Setto si está bloqueada); la contraseña nunca se muestra. */
function CredRow({ cred, index, active, done, locked, onCopyPassword, onCopyUser, onOpen }: {
  cred: CredItem; index: number; active: boolean; done: boolean; locked: boolean
  onCopyPassword: () => void; onCopyUser: () => void; onOpen: () => void
}): JSX.Element {
  const used = cred.lastUsedAt ? relTime(cred.lastUsedAt) : null
  const title = locked ? 'Abrir Setto para desbloquear' : cred.hasPassword ? 'Copiar contraseña (Enter)' : 'Sin contraseña en esta compu: copia el usuario'
  return (
    <div role="button" tabIndex={-1} onClick={onCopyPassword} title={title} className={rowCls(active, done)}>
      <span className={`relative grid place-items-center w-8 h-8 rounded-full shrink-0 text-[11px] font-semibold ${avatarCls(cred.nombre || cred.id)}`}>
        <AnimatePresence initial={false} mode="wait">
          {done
            ? <motion.span key="ok" initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} transition={POP}><Check size={14} /></motion.span>
            : <motion.span key="ic" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }}>{initials(cred.nombre || '?')}</motion.span>}
        </AnimatePresence>
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[13px] leading-[18px] font-medium text-on-surface">{cred.nombre || 'Sin nombre'}</span>
          {locked && <Lock size={11} className="text-warning shrink-0" />}
        </span>
        <span className="flex items-center gap-2 mt-0.5 text-[11px] leading-[14px] text-on-surface-variant">
          <span className="truncate">{done ? 'Copiado' : cred.usuario || 'Sin usuario'}</span>
          {used && !done && <span className="ml-auto shrink-0 tabular-nums text-on-surface-variant/70">{used}</span>}
        </span>
      </span>
      <span className="shrink-0 flex items-center gap-0.5 min-w-[22px] justify-end">
        <span className="hidden group-hover:flex items-center gap-0.5">
          {locked ? (
            <MiniBtn title="Abrir Setto para desbloquear" onClick={onOpen}><LockOpen size={13} /></MiniBtn>
          ) : (
            <>
              {cred.usuario && <MiniBtn title="Copiar usuario (Shift+Enter)" onClick={onCopyUser}><User size={13} /></MiniBtn>}
              {cred.hasPassword && <MiniBtn title="Copiar contraseña (Enter)" onClick={onCopyPassword}><KeyRound size={13} /></MiniBtn>}
              <MiniBtn title="Ver en Setto" onClick={onOpen}><ArrowUpRight size={13} /></MiniBtn>
            </>
          )}
        </span>
        {index < 9 && <IndexBadge n={index + 1} className="group-hover:hidden" />}
      </span>
    </div>
  )
}

// ── Vista previa ─────────────────────────────────────────────────────────────

function Preview({ item, onPaste, onOpen, onError, onClose }: {
  item: Item
  /** Sin texto: pegar el ítem tal cual; con texto: pegar ese texto (transformado). */
  onPaste: (text?: string) => void
  onOpen: (a: { pluginId: string; action?: string; payload?: unknown }) => void
  onError: (m: string) => void
  onClose: () => void
}): JSX.Element | null {
  if (item.type === 'cred') return null
  const clip = item.type === 'clip' && !item.clip.sensitive ? item.clip : null
  // Primero las propias del tipo; después las genéricas (sin `for`). Nunca las de otro tipo,
  // y a los identificadores (ticket, link, GUID…) no se les ofrecen genéricas.
  const transforms = clip
    ? transformsFor(clip.kind).filter((t) => (t.for ? t.for.includes(clip.kind) : !ID_KINDS.includes(clip.kind))).slice(0, 4)
    : []
  const actions = clip ? actionsFor(clip.kind, clip.text).slice(0, 3) : item.type === 'ticket' ? actionsFor('ticket', item.ticket).slice(0, 2) : []

  let body: React.ReactNode
  switch (item.type) {
    case 'clip':
      body = item.clip.sensitive
        ? <p className="text-[12px] text-on-surface-variant">Parece una contraseña o token: no se muestra. Se puede pegar igual.</p>
        : <pre className={`text-[12px] leading-[16px] text-on-surface whitespace-pre-wrap wrap-break-word max-h-[150px] overflow-auto ${MULTILINE_KINDS.includes(item.clip.kind) || item.clip.kind === 'path' ? 'font-mono' : 'font-sans'}`}>{item.clip.text}</pre>
      break
    case 'cap':
      body = <img src={thumbUrl(item.cap.file)} alt="" className="w-full max-h-[170px] object-contain rounded-[8px] bg-surface-container" />
      break
    case 'snippet':
      body = <pre className="text-[12px] leading-[16px] font-mono text-on-surface whitespace-pre-wrap wrap-break-word max-h-[150px] overflow-auto">{item.content}</pre>
      break
    case 'ticket':
      body = <p className="text-[12px] text-on-surface-variant">{item.caps ? `${item.caps} captura${item.caps === 1 ? '' : 's'} con este ticket.` : 'Sin capturas todavía.'}</p>
      break
  }

  const pasteLabel = item.type === 'ticket' ? 'Ver capturas' : item.type === 'snippet' && item.vars ? 'Completar' : 'Pegar'
  const runAction = (run: () => Promise<void> | void): void => { Promise.resolve().then(run).catch((e: unknown) => onError(cleanErr(e))) }
  const chip = 'inline-flex items-center gap-1 h-7 px-2.5 rounded-[8px] bg-on-surface/6 hover:bg-on-surface/10 text-[11px] text-on-surface transition-colors'

  return (
    <motion.div
      initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1, transition: { duration: 0.3, ease: EASE_OUT } }}
      exit={{ y: 16, opacity: 0, transition: { duration: 0.16, ease: EASE_IN } }}
      className="relative shrink-0 mx-2 mb-2 rounded-[14px] bg-surface hairline shadow-md p-3 flex flex-col gap-2">
      <button type="button" onClick={onClose} title="Cerrar vista previa" className="absolute top-1.5 right-1.5 p-1 rounded-[6px] text-on-surface-variant hover:bg-on-surface/6">
        <X size={12} />
      </button>
      <div className="pr-5">{body}</div>
      <div className="flex flex-wrap items-center gap-1">
        <button type="button" onClick={() => onPaste()} className="inline-flex items-center gap-1 h-7 px-3 rounded-[8px] bg-primary text-on-primary text-[11px] font-semibold hover:brightness-110">
          {item.type === 'ticket' ? <Images size={12} /> : <ClipboardText size={12} />} {pasteLabel}
        </button>
        {clip && transforms.map((t) => (
          <button key={t.id} type="button" title={`Pegar: ${t.label}`} onClick={() => onPaste(t.apply(clip.text))} className={chip}>
            <Wand2 size={11} className="text-primary" /> {t.label}
          </button>
        ))}
        {actions.map((a) => (
          <button key={a.id} type="button" title={a.label}
            onClick={() => runAction(() => a.run(clip?.text ?? (item.type === 'ticket' ? item.ticket : ''), onOpen))} className={chip}>
            <a.icon size={11} className="text-on-surface-variant" /> {a.label}
          </button>
        ))}
        {item.type === 'cap' && (
          <button type="button" onClick={() => onOpen({ pluginId: 'captures' })} className={chip}>
            <ExternalLink size={11} className="text-on-surface-variant" /> Abrir en Setto
          </button>
        )}
      </div>
    </motion.div>
  )
}

// ── Piezas chicas ────────────────────────────────────────────────────────────

function IndexBadge({ n, className = '' }: { n: number; className?: string }): JSX.Element {
  return (
    <span className={`grid place-items-center min-w-[18px] h-[18px] px-1 rounded-[5px] bg-on-surface/6 text-[10px] font-semibold tabular-nums text-on-surface-variant ${className}`}>{n}</span>
  )
}

function MiniBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }): JSX.Element {
  return (
    <button type="button" title={title} onClick={(e) => { e.stopPropagation(); onClick() }}
      className="grid place-items-center w-6 h-6 rounded-[6px] text-on-surface-variant hover:text-on-surface hover:bg-on-surface/8">
      {children}
    </button>
  )
}

function DoneOverlay({ show }: { show: boolean }): JSX.Element {
  return (
    <AnimatePresence>
      {show && (
        <motion.span className="absolute inset-0 grid place-items-center bg-primary/70 text-on-primary"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.span initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={POP}><Check size={18} /></motion.span>
        </motion.span>
      )}
    </AnimatePresence>
  )
}

function Kbd({ children }: { children: React.ReactNode }): JSX.Element {
  return <kbd className="font-sans text-[10px] font-medium px-1 py-px rounded-[4px] bg-on-surface/[0.07] text-on-surface-variant">{children}</kbd>
}

function Empty({ tab, searching }: { tab: TabId; searching: boolean }): JSX.Element {
  const text = searching ? 'Sin resultados' : {
    clips: 'Lo que copies aparece acá',
    caps: 'Las capturas (Win+Shift+S) aparecen acá',
    snippets: 'Todavía no hay snippets',
    tickets: 'Los tickets que copies o pongas en capturas aparecen acá',
    keys: 'Las claves que más usás aparecen acá',
  }[tab]
  return <p className="text-[12px] text-on-surface-variant px-3 py-8 text-center">{text}</p>
}

function IconBtn({ title, active, onClick, children }: { title: string; active?: boolean; onClick: () => void; children: React.ReactNode }): JSX.Element {
  return (
    <motion.button type="button" title={title} aria-label={title} onClick={onClick} whileTap={{ scale: 0.9 }} transition={POP}
      className={`grid place-items-center w-7 h-7 rounded-[8px] transition-colors ${active ? 'text-primary bg-primary/10' : 'text-on-surface-variant hover:text-on-surface hover:bg-on-surface/6'}`}>
      {children}
    </motion.button>
  )
}

function Quick({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }): JSX.Element {
  return (
    <motion.button type="button" onClick={onClick} title={label} aria-label={label}
      whileTap={{ scale: 0.9 }} transition={POP}
      className="flex-1 grid place-items-center h-9 rounded-[10px] text-on-surface-variant hover:text-primary hover:bg-primary/8 transition-colors">
      <Icon size={17} />
    </motion.button>
  )
}

/**
 * La pestaña plegada: logo en una pastilla pegada al borde. Arrastrar la mueve
 * por el borde (guía arriba/abajo, imán al medio); doble clic la vuelve al medio;
 * clic o mouse quieto encima la abre; con copias nuevas salta y muestra cuántas
 * hay sin ver (el globito toma el color del tipo de lo último copiado).
 */
function Handle({ side, shortcut, unseen, bumpKey, kind }: { side: Side; shortcut: string | null; unseen: number; bumpKey: number; kind: ClipKind | null }): JSX.Element {
  const logo = useAnimationControls()
  const [hover, setHover] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [guide, setGuide] = useState<{ ratio: number; snapped: boolean }>({ ratio: 0.5, snapped: false })
  const drag = useRef<{ sy: number; top: number; moved: boolean; raf: number } | null>(null)
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastClick = useRef(0)
  /** Después de un clic no se abre por quedarse quieto encima (puede venir el doble clic). */
  const hoverArmed = useRef(true)
  const stopOpen = (): void => { if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null } }
  const armOpen = (): void => {
    stopOpen()
    if (!drag.current && hoverArmed.current) openTimer.current = setTimeout(() => window.api.send('dock:expand'), HOVER_OPEN_MS)
  }
  const left = side === 'left'

  useEffect(() => () => { stopOpen(); if (clickTimer.current) clearTimeout(clickTimer.current) }, [])
  useEffect(() => window.api.on('dock:drag', (p) => setGuide(p as { ratio: number; snapped: boolean })), [])
  useEffect(() => {
    if (!bumpKey) return
    void logo.start({ scale: [1, 1.28, 0.9, 1.06, 1], rotate: [0, -12, 9, -4, 0], transition: { duration: 0.55 } })
  }, [bumpKey, logo])

  const onPointerDown = (e: React.PointerEvent): void => {
    if (e.button !== 0) return
    stopOpen()
    hoverArmed.current = false
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { sy: e.screenY, top: window.screenY, moved: false, raf: 0 }
  }
  const onPointerMove = (e: React.PointerEvent): void => {
    const d = drag.current
    if (!d) { armOpen(); return }   // abrir cuando el mouse queda quieto encima
    const dy = e.screenY - d.sy
    if (!d.moved && Math.abs(dy) < DRAG_THRESHOLD) return
    if (!d.moved) { d.moved = true; setDragging(true); if (clickTimer.current) clearTimeout(clickTimer.current) }
    cancelAnimationFrame(d.raf)
    d.raf = requestAnimationFrame(() => window.api.send('dock:move', d.top + dy))
  }
  const onPointerUp = (): void => {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (d.moved) { setDragging(false); window.api.send('dock:move-end'); return }
    const now = Date.now()
    if (now - lastClick.current < DOUBLE_CLICK_MS) {
      if (clickTimer.current) clearTimeout(clickTimer.current)
      lastClick.current = 0
      window.api.send('dock:move-reset')
      return
    }
    lastClick.current = now
    clickTimer.current = setTimeout(() => window.api.send('dock:expand'), DOUBLE_CLICK_MS - 60)
  }

  const badge = unseen && kind ? KIND_STYLE[kind].bar : 'bg-primary'
  const out = left ? 1 : -1
  const showGrip = hover || dragging

  return (
    <div className="h-screen w-screen relative select-none">
      {/* Guía al arrastrar: flechas arriba/abajo (se apagan en los topes) y marca del medio. */}
      <AnimatePresence>
        {dragging && (
          <motion.div key="guide" className="absolute inset-0 pointer-events-none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <span className={`absolute top-[8px] w-[46px] grid place-items-center ${left ? 'left-0' : 'right-0'} ${guide.ratio <= 0.001 ? 'opacity-25' : ''}`}>
              <ChevronUp size={14} className="text-on-surface-variant" />
            </span>
            <span className={`absolute bottom-[8px] w-[46px] grid place-items-center ${left ? 'left-0' : 'right-0'} ${guide.ratio >= 0.999 ? 'opacity-25' : ''}`}>
              <ChevronDown size={14} className="text-on-surface-variant" />
            </span>
            <span className={`absolute top-1/2 -mt-px h-[2px] w-[12px] rounded-full transition-colors ${left ? 'left-[58px]' : 'right-[58px]'} ${guide.snapped ? 'bg-primary' : 'bg-on-surface-variant/30'}`} />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        data-dock-handle
        role="button"
        aria-label="Abrir Setto"
        title={`Setto${shortcut ? ` · ${shortcut}` : ''}\nArrastrá para moverla · doble clic: al medio`}
        className={`absolute top-1/2 mt-[-28px] h-[56px] w-[62px] flex items-center ${TAB_SURFACE} ${TAB_SHADOW} ${
          left ? '-left-4 rounded-r-[18px] flex-row-reverse pr-[6px]' : '-right-4 rounded-l-[18px] pl-[6px]'} ${dragging ? 'cursor-grabbing' : 'cursor-pointer'}`}
        initial={{ x: 56 * -out, opacity: 0 }}
        animate={{ x: (dragging ? 6 : hover ? 4 : 0) * out, opacity: 1, scale: dragging ? 1.03 : 1 }}
        exit={{ x: 56 * -out, opacity: 0, transition: { duration: 0.14 } }}
        transition={{ type: 'spring', stiffness: 360, damping: 30 }}
        onPointerEnter={() => {
          setHover(true)
          hoverArmed.current = true
          void logo.start({ rotate: [0, -12, 9, -5, 0], transition: { duration: 0.5 } })
          armOpen()
        }}
        onPointerLeave={() => { setHover(false); stopOpen() }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* Filo de color del tema: la pestaña se ve sobre cualquier fondo (también blanco). */}
        <span className={`absolute top-[12px] bottom-[12px] w-[3px] rounded-full bg-primary/80 ${left ? '-right-px' : '-left-px'}`} aria-hidden />
        {/* Agarradera: aparece al pasar el mouse. */}
        <span className={`grid grid-cols-2 gap-[2px] w-[8px] shrink-0 transition-opacity duration-200 ${showGrip ? 'opacity-100' : 'opacity-0'}`} aria-hidden>
          {Array.from({ length: 6 }, (_, i) => <span key={i} className="w-[3px] h-[3px] rounded-full bg-on-surface-variant/50" />)}
        </span>
        <span className={`relative ${left ? 'mr-[4px]' : 'ml-[4px]'} ${unseen || hover || dragging ? '' : 'dock-idle'}`}>
          <motion.img src="setto-logo.png" alt="" draggable={false} animate={logo}
            className="block w-[28px] h-[28px] rounded-[8px] pointer-events-none" />
          {/* Onda al copiar algo. */}
          <AnimatePresence>
            {bumpKey > 0 && (
              <motion.span key={bumpKey} className="absolute inset-0 rounded-[9px] border-2 border-primary pointer-events-none"
                initial={{ scale: 0.95, opacity: 0.8 }} animate={{ scale: 1.6, opacity: 0 }} transition={{ duration: 0.7, ease: 'easeOut' }} />
            )}
          </AnimatePresence>
          <AnimatePresence>
            {unseen > 0 && (
              <motion.span key="badge"
                className={`absolute -top-2 ${left ? '-left-2' : '-right-2'} min-w-[16px] h-[16px] px-1 rounded-full ${badge} text-on-primary text-[10px] font-bold leading-none grid place-items-center ring-2 ring-surface`}
                initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={POP}>
                <motion.span key={unseen} initial={{ y: 5, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>{unseen}</motion.span>
              </motion.span>
            )}
          </AnimatePresence>
        </span>
      </motion.div>
    </div>
  )
}
