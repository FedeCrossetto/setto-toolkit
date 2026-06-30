import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Plus, Search, Sparkles, SquareStack, X } from 'lucide-react'
import { useApp } from '../../core/AppContext'
import { allPlugins } from '../../core/plugin-registry'
import { PluginIcon } from '../../core/pluginIcons'
import { Badge } from '../../core/components/Badge'
import { detectLanguage, languageIcon } from '../file-editor/hooks/useEditorTabs'
import type { PluginManifest } from '../../core/types'

const ONBOARDING_DISMISSED_KEY = 'dashboard:onboarding-dismissed'
const SECURE_SET_SENTINEL = '__CONFIGURED__'

// ── Mascot thumbnails — small avatar per plugin, two mascot sets to choose from ─
const MASCOT_IMAGES: Record<string, { panda: string; setto: string }> = {
  'smart-diff':      { panda: './panda-avatar/panda-compare-files.png', setto: './setto-avatar/setto-avatar-difference.png' },
  'repo-search':     { panda: './panda-avatar/panda-search.png',        setto: './setto-avatar/setto-avatar-search.png' },
  'api-tester':      { panda: './panda-avatar/panda-request.png',       setto: './setto-avatar/setto-avatar-api.png' },
  'file-editor':     { panda: './panda-avatar/panda1.png',              setto: './setto-avatar/setto-avatar.png' },
  'snippets':        { panda: './panda-avatar/panda-snippet.png',       setto: './setto-avatar/setto-avatar-snippet.png' },
  'settings':        { panda: './panda-avatar/panda-settings.png',      setto: './setto-avatar/setto-avatar-settings.png' },
  'ticket-resolver': { panda: './panda-avatar/panda-ticket.png',        setto: './setto-avatar/setto-avatar-ticket.png' },
  'terminal':        { panda: './panda-avatar/panda-console.png',       setto: './setto-avatar/setto-avatar-console.png' },
  'gastos':          { panda: './panda-avatar/panda-snippet.png',       setto: './setto-avatar/setto-avatar-snippet.png' },
}
const DEFAULT_MASCOT = { panda: './panda-avatar/panda1.png', setto: './setto-avatar/setto-avatar.png' }

// ── MascotAvatar — mascot thumbnail with a graceful fallback to the plain icon ─
function MascotAvatar({ pluginId, icon, mascot }: {
  pluginId: string; icon: string; mascot: 'panda' | 'setto-avatar'
}): JSX.Element {
  const [imgError, setImgError] = useState(false)
  const src = (MASCOT_IMAGES[pluginId] ?? DEFAULT_MASCOT)[mascot === 'panda' ? 'panda' : 'setto']

  return (
    <div className="relative w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden bg-on-surface/[0.05] border border-outline-variant/20">
      {imgError ? (
        <PluginIcon icon={icon} size={20} className="text-on-surface-variant/70" />
      ) : (
        <img
          key={src}
          src={src}
          alt=""
          draggable={false}
          className="w-full h-full object-contain scale-110"
          onError={() => setImgError(true)}
        />
      )}
    </div>
  )
}

// ── ToolRow ───────────────────────────────────────────────────────────────────
// Compact table-style row: mascot thumbnail + name + description on one line.
// Replaces the old big illustrated tile — far less vertical space per tool.
function ToolRow({ plugin, onOpen, mascot }: { plugin: PluginManifest; onOpen: () => void; mascot: 'panda' | 'setto-avatar' }): JSX.Element {
  return (
    <button
      onClick={onOpen}
      className="relative w-full flex items-center gap-3.5 pl-4 pr-3.5 py-3 text-left rounded-2xl backdrop-blur-sm transition-all duration-150 group overflow-hidden
        bg-surface dark:bg-surface-container border border-outline-variant/25 dark:border-outline-variant/30
        shadow-[0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_6px_rgba(0,0,0,0.18)]
        hover:-translate-y-[1px] hover:bg-surface-container-high hover:shadow-[0_8px_16px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_10px_22px_rgba(0,0,0,0.3)] hover:border-primary/25"
    >
      <span aria-hidden className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary/0 group-hover:bg-primary/50 transition-colors" />
      <MascotAvatar pluginId={plugin.id} icon={plugin.icon} mascot={mascot} />
      <div className="min-w-0 flex-1 flex flex-col gap-0.5">
        <p className="text-[14px] font-semibold text-on-surface leading-tight">{plugin.name}</p>
        <p className="text-[11.5px] text-on-surface-variant/50 truncate">{plugin.description}</p>
      </div>
      <ArrowRight
        size={16}
        className="text-on-surface-variant/25 group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0"
      />
    </button>
  )
}

// ── Onboarding banner ─────────────────────────────────────────────────────────
function OnboardingBanner({ onDismiss, onGoToSettings }: {
  onDismiss: () => void
  onGoToSettings: () => void
}): JSX.Element {
  return (
    <div className="relative flex items-start gap-4 px-5 py-4 rounded-2xl border border-primary/20 bg-primary/5">
      <Sparkles size={22} className="text-primary flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-on-surface">Activá las funciones de IA</p>
        <p className="text-xs text-on-surface-variant mt-0.5 leading-relaxed">
          Agregá tu API key de OpenAI en Ajustes para habilitar el análisis semántico de Smart Diff y otras herramientas con IA.
        </p>
        <button
          onClick={onGoToSettings}
          className="mt-2.5 text-xs font-semibold text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
        >
          <span>Ir a Ajustes</span>
          <ArrowRight size={12} />
        </button>
      </div>
      <button
        onClick={onDismiss}
        title="Dismiss"
        className="flex-shrink-0 text-on-surface-variant/40 hover:text-on-surface transition-colors"
      >
        <X size={16} />
      </button>
    </div>
  )
}

// ── Section labels ────────────────────────────────────────────────────────────
const SECTION_LABELS: Record<string, string> = {
  __default__: 'Herramientas de desarrollo',
  personal:    'Personal',
}

// ── ToolGrid — groups plugins by section ─────────────────────────────────────
function ToolGrid({ tools, openTool, mascot }: {
  tools: PluginManifest[]
  openTool: (id: string) => void
  mascot: 'panda' | 'setto-avatar'
}): JSX.Element {
  // Group by section key, preserving registry order within each group
  const groups = new Map<string, PluginManifest[]>()
  for (const p of tools) {
    const key = p.section ?? '__default__'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(p)
  }

  // Render __default__ first, then named sections in insertion order
  const orderedKeys = [
    '__default__',
    ...Array.from(groups.keys()).filter((k) => k !== '__default__'),
  ].filter((k) => groups.has(k))

  return (
    <div className="space-y-6">
      {orderedKeys.map((sectionKey) => {
        const label   = SECTION_LABELS[sectionKey] ?? sectionKey
        const plugins = groups.get(sectionKey)!
        const isPersonal = sectionKey !== '__default__'
        const isLastSection = sectionKey === orderedKeys[orderedKeys.length - 1]

        return (
          <div key={sectionKey}>
            <div className="flex items-center gap-2.5 mb-2.5">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50">
                {label}
              </h2>
              <Badge>{plugins.length}</Badge>
              {isPersonal && (
                <div className="flex-1 h-px bg-outline-variant/20" />
              )}
            </div>

            {/* Compact rows — each its own subtly-floating mini card, not a glued table */}
            <div className="flex flex-col gap-2">
              {plugins.map((plugin) => (
                <ToolRow key={plugin.id} plugin={plugin} onOpen={() => openTool(plugin.id)} mascot={mascot} />
              ))}

              {/* Add plugin row — only in the last section */}
              {isLastSection && (
                <div
                  className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-on-surface-variant/40"
                  style={{ background: 'rgb(var(--c-surface-container) / 0.4)', border: '1px dashed rgb(var(--c-outline-variant) / 0.25)' }}
                >
                  <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center border border-outline-variant/20 flex-shrink-0">
                    <Plus size={14} />
                  </div>
                  <p className="text-[12px] flex-1">
                    Agregar plugin — soltá una carpeta en{' '}
                    <code className="bg-surface-container px-1 py-0.5 rounded text-primary/70 text-[10px]">src/plugins/</code>
                  </p>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Card shell — shared glass surface used across every bento card ────────────
function Card({ children, className = '', noPad = false }: { children: React.ReactNode; className?: string; noPad?: boolean }): JSX.Element {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl backdrop-blur-sm transition-all duration-200
        dark:shadow-[0_2px_8px_rgba(0,0,0,0.25)] shadow-[0_1px_3px_rgba(0,0,0,0.06)]
        hover:-translate-y-[2px] dark:hover:shadow-[0_14px_30px_rgba(0,0,0,0.35)] hover:shadow-[0_8px_20px_rgba(0,0,0,0.1)]
        ${noPad ? '' : 'p-4'} ${className}`}
      style={{ background: 'rgb(var(--c-surface))', border: '1px solid rgb(var(--c-outline-variant) / 0.35)' }}
    >
      {children}
    </div>
  )
}

// ── DonutCard — replaces the old Resumen + Command Palette cards with a single
// modern donut chart (section breakdown) + compact KPI rows below it.
// Same arc-path technique as the "Por categoría" donut in Gastos — real pie slices
// (not a stroke-dasharray ring), one color per section, gap stroke between slices.
function donutSegmentPath(cx: number, cy: number, rOuter: number, rInner: number, a0: number, a1: number): string {
  const large = a1 - a0 > Math.PI ? 1 : 0
  const x0o = cx + rOuter * Math.cos(a0), y0o = cy + rOuter * Math.sin(a0)
  const x1o = cx + rOuter * Math.cos(a1), y1o = cy + rOuter * Math.sin(a1)
  const x0i = cx + rInner * Math.cos(a1), y0i = cy + rInner * Math.sin(a1)
  const x1i = cx + rInner * Math.cos(a0), y1i = cy + rInner * Math.sin(a0)
  return [
    `M ${x0o} ${y0o}`, `A ${rOuter} ${rOuter} 0 ${large} 1 ${x1o} ${y1o}`,
    `L ${x0i} ${y0i}`, `A ${rInner} ${rInner} 0 ${large} 0 ${x1i} ${y1i}`, 'Z',
  ].join(' ')
}

const DONUT_COLORS = ['rgb(var(--c-primary))', 'rgb(var(--c-accent))', 'rgb(var(--c-secondary))', 'rgb(var(--c-primary-light))']

function DonutCard({ tools, openTabCount, recentCount }: { tools: PluginManifest[]; openTabCount: number; recentCount: number }): JSX.Element {
  const sections = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of tools) {
      const key = t.section ?? 'Desarrollo'
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return Array.from(map.entries()).map(([label, count], i) => ({
      label, count,
      pct: tools.length ? (count / tools.length) * 100 : 0,
      color: DONUT_COLORS[i % DONUT_COLORS.length],
    }))
  }, [tools])

  const cx = 100, cy = 100, rOuter = 92, rInner = 56
  let angle = -Math.PI / 2
  const slices = sections.map((s) => {
    const sweep = (s.pct / 100) * Math.PI * 2
    const d = donutSegmentPath(cx, cy, rOuter, rInner, angle, angle + sweep)
    angle += sweep
    return { ...s, d }
  })

  return (
    <Card className="flex flex-col gap-4">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant/60">Resumen</span>

      <div className="relative w-[164px] h-[164px] mx-auto">
        <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-sm">
          {slices.map((s) => (
            <path key={s.label} d={s.d} fill={s.color} className="stroke-surface-container" strokeWidth={2} strokeLinejoin="round" />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center">
            <span className="text-[26px] font-bold text-on-surface tabular-nums leading-none">{tools.length}</span>
            <span className="text-[8.5px] text-on-surface-variant/45 uppercase tracking-[0.12em] mt-1.5">herramientas</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1.5 border-t border-outline-variant/10 pt-3">
        {sections.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
            <span className="text-[11px] text-on-surface-variant/70">{s.label}</span>
            <span className="text-[10px] font-mono tabular-nums text-on-surface-variant/45">{Math.round(s.pct)}%</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 pt-3 border-t border-outline-variant/10">
        {[
          { icon: SquareStack, value: openTabCount, label: 'Pestañas abiertas' },
          { icon: Search,      value: recentCount,  label: 'Archivos recientes' },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-2.5">
            <s.icon size={13} className="text-on-surface-variant/50 flex-shrink-0" />
            <span className="text-[11.5px] text-on-surface-variant/70 flex-1">{s.label}</span>
            <span className="text-[13px] font-semibold text-on-surface tabular-nums">{s.value}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

interface RecentEntry { path: string; name: string; openedAt: string }

// ── ConnectionsCard — real status of every integration the Connections plugin
// manages (same settings keys + auth checks it uses), not a placeholder list.
type ConnStatus = 'connected' | 'partial' | 'disconnected'
interface ConnEntry { label: string; status: ConnStatus }

async function checkOAuthProvider(provider: 'github' | 'gitlab' | 'bitbucket', clientIdKey?: string): Promise<ConnStatus> {
  const [me, cid] = await Promise.all([
    window.api.invoke<{ authenticated: boolean } | null>('repo-search:me', { provider }),
    clientIdKey ? window.api.invoke<string | null>('settings:get', clientIdKey) : Promise.resolve(null),
  ])
  if (me?.authenticated) return 'connected'
  return cid ? 'partial' : 'disconnected'
}

function useConnectionsStatus(): ConnEntry[] | null {
  const [entries, setEntries] = useState<ConnEntry[] | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      window.api.invoke<string | null>('settings:get', 'ai.openai_key').then((v): ConnStatus => v === SECURE_SET_SENTINEL ? 'connected' : 'disconnected'),
      window.api.invoke<string | null>('settings:get', 'ai.anthropic_key').then((v): ConnStatus => v === SECURE_SET_SENTINEL ? 'connected' : 'disconnected'),
      window.api.invoke<string | null>('settings:get', 'ai.ollama_url').then((v): ConnStatus => v ? 'connected' : 'disconnected'),
      checkOAuthProvider('github', 'repo-search.github.client_id'),
      checkOAuthProvider('gitlab', 'repo-search.gitlab.client_id'),
      checkOAuthProvider('bitbucket'),
      Promise.all([
        window.api.invoke<string | null>('settings:get', 'ticket-resolver.jira_url'),
        window.api.invoke<string | null>('settings:get', 'ticket-resolver.jira_user'),
        window.api.invoke<string | null>('settings:get', 'ticket-resolver.jira_token'),
      ]).then(([url, user, tok]): ConnStatus => {
        const tokOk = tok === SECURE_SET_SENTINEL
        if (url && user && tokOk) return 'connected'
        return (url || user) ? 'partial' : 'disconnected'
      }),
    ]).then(([openai, anthropic, ollama, github, gitlab, bitbucket, jira]) => {
      if (cancelled) return
      setEntries([
        { label: 'OpenAI',    status: openai },
        { label: 'Anthropic', status: anthropic },
        { label: 'Ollama',    status: ollama },
        { label: 'GitHub',    status: github },
        { label: 'GitLab',    status: gitlab },
        { label: 'Bitbucket', status: bitbucket },
        { label: 'Jira',      status: jira },
      ])
    }).catch(() => { if (!cancelled) setEntries([]) })
    return () => { cancelled = true }
  }, [])

  return entries
}

const CONN_STATUS_DOT: Record<ConnStatus, string> = {
  connected: 'bg-emerald-400',
  partial: 'bg-warning',
  disconnected: 'bg-on-surface-variant/25',
}

function ConnectionsCard({ onOpen }: { onOpen: () => void }): JSX.Element {
  const entries = useConnectionsStatus()
  const connectedCount = entries?.filter((e) => e.status === 'connected').length ?? 0

  return (
    <Card noPad className="flex flex-col">
      {/* Bold brand-gradient header — the one deliberately "loud" card on the dashboard,
          using the active theme's own gradient so it never clashes with a custom palette. */}
      <button onClick={onOpen} className="relative flex items-center justify-between gap-3 px-4 py-3.5 overflow-hidden text-left group" style={{ background: 'var(--gradient-brand)' }}>
        <div aria-hidden className="absolute -top-8 -left-6 w-32 h-32 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <span className="relative text-[11px] font-semibold uppercase tracking-wide text-white/85">Conexiones</span>
        <span className="relative text-[11px] font-bold text-white flex items-center gap-1">
          {entries ? `${connectedCount}/${entries.length}` : '…'}
          <ArrowRight size={12} className="opacity-80 group-hover:translate-x-0.5 transition-transform" />
        </span>
      </button>

      <div className="p-4">
        {!entries ? (
          <p className="text-[11px] text-on-surface-variant/35 py-2">Verificando…</p>
        ) : (
          <div className="flex flex-col gap-2">
            {entries.map((e) => (
              <div key={e.label} className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${CONN_STATUS_DOT[e.status]}`} />
                <span className="text-[11.5px] text-on-surface-variant/75 flex-1">{e.label}</span>
                <span className="text-[10px] text-on-surface-variant/40">
                  {e.status === 'connected' ? 'Conectado' : e.status === 'partial' ? 'Parcial' : 'Sin configurar'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}

// ── ActivityCard — recent files + 7-day mini activity bars + top language ─────
// Folds what used to be three separate cards (list / heatmap / kpi) into one,
// so the dashboard reads as a few important cards instead of many small ones.
function ActivityCard({ recents, onOpen }: { recents: RecentEntry[]; onOpen: (path: string) => void }): JSX.Element {
  const relTime = (iso: string): string => {
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
    if (mins < 1) return 'ahora'
    if (mins < 60) return `hace ${mins}m`
    const hrs = Math.round(mins / 60)
    if (hrs < 24) return `hace ${hrs}h`
    return `hace ${Math.round(hrs / 24)}d`
  }

  // Most common language among recent files — a different kind of metric (mode, not a count)
  const topLanguage = useMemo(() => {
    if (recents.length === 0) return null
    const counts = new Map<string, number>()
    for (const r of recents) {
      const lang = detectLanguage(r.name)
      counts.set(lang, (counts.get(lang) ?? 0) + 1)
    }
    const [lang] = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]
    return lang
  }, [recents])

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant/60">Actividad reciente</span>
        {topLanguage && (() => {
          const Icon = languageIcon(topLanguage)
          return (
            <span
              className="flex items-center gap-1.5 text-[10px] text-on-surface-variant/60 px-2 py-1 rounded-full bg-on-surface/[0.05]"
              title="Lenguaje más abierto recientemente"
            >
              <Icon size={12} /> {topLanguage}
            </span>
          )
        })()}
      </div>

      {recents.length === 0 ? (
        <p className="text-[11.5px] text-on-surface-variant/40 py-6 text-center">Sin actividad todavía</p>
      ) : (
        <div className="flex flex-col">
          {recents.slice(0, 4).map((r) => (
            <button
              key={r.path}
              onClick={() => onOpen(r.path)}
              className="flex items-center gap-2 py-1.5 text-left hover:bg-surface-container-high/60 rounded-lg px-1.5 -mx-1.5 transition-colors group"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-primary/60 flex-shrink-0 group-hover:bg-primary transition-colors" />
              <span className="text-[12px] text-on-surface-variant truncate flex-1 group-hover:text-on-surface">{r.name}</span>
              <span className="text-[10px] text-on-surface-variant/40 flex-shrink-0 tabular-nums">{relTime(r.openedAt)}</span>
            </button>
          ))}
        </div>
      )}
    </Card>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export function Dashboard(): JSX.Element {
  const { dispatch, state } = useApp()
  const tools = allPlugins.filter((p) => p.id !== 'dashboard' && p.id !== 'about' && !state.disabledPlugins.includes(p.id))
  const openTool = (id: string): void => dispatch({ type: 'OPEN_TAB', pluginId: id })

  const [showOnboarding, setShowOnboarding] = useState(false)
  const [recents, setRecents] = useState<RecentEntry[]>([])
  const [userName, setUserName] = useState<string | null>(null)
  const [mascot, setMascot] = useState<'panda' | 'setto-avatar'>('setto-avatar')

  // Real recent-file activity (file-editor's recents) — powers the activity list + heatmap
  useEffect(() => {
    window.api.invoke<RecentEntry[]>('editor:recent-get').then(setRecents).catch(() => { /* ignore */ })
  }, [])

  // Load mascot preference on mount + listen for live changes from Settings tab
  useEffect(() => {
    window.api.invoke<string | null>('settings:get', 'dashboard.mascot').then((v) => {
      if (v !== null) setMascot(v === 'panda' ? 'panda' : 'setto-avatar')
    }).catch(() => { /* ignore */ })

    const handler = (e: Event): void => {
      const val = (e as CustomEvent<string>).detail
      setMascot(val === 'panda' ? 'panda' : 'setto-avatar')
    }
    window.addEventListener('mascot-change', handler)
    return () => window.removeEventListener('mascot-change', handler)
  }, [])

  // Optional personalization — only if the user actually signed in with Google somewhere in the app
  useEffect(() => {
    window.api.invoke<{ name: string } | null>('auth:google-user').then((u) => {
      if (u?.name) setUserName(u.name.split(' ')[0])
    }).catch(() => { /* ignore */ })
  }, [])

  useEffect(() => {
    const dismissed = localStorage.getItem(ONBOARDING_DISMISSED_KEY) === 'true'
    if (dismissed) return
    // Check if any AI provider is configured
    Promise.all([
      window.api.invoke<string | null>('settings:get', 'ai.provider'),
      window.api.invoke<string | null>('settings:get', 'ai.openai_key'),
      window.api.invoke<string | null>('settings:get', 'ai.anthropic_key'),
      window.api.invoke<string | null>('settings:get', 'ai.ollama_url'),
    ]).then(([providerVal, openaiVal, anthropicVal, ollamaVal]) => {
      const provider = providerVal ?? 'openai'
      const configured =
        (provider === 'openai'    && openaiVal    === SECURE_SET_SENTINEL) ||
        (provider === 'anthropic' && anthropicVal === SECURE_SET_SENTINEL) ||
        (provider === 'ollama'    && !!ollamaVal)
      setShowOnboarding(!configured)
    }).catch(() => { /* ignore */ })
  }, [])

  const dismissOnboarding = (): void => {
    localStorage.setItem(ONBOARDING_DISMISSED_KEY, 'true')
    setShowOnboarding(false)
  }

  const openFile = (path: string): void => dispatch({ type: 'OPEN_IN_EDITOR', path })

  return (
    <div className="p-8 max-w-7xl mx-auto w-full space-y-5">
      {/* Header — title + slim search pill (replaces the old big promo card) */}
      <div className="flex items-center justify-between gap-4">
        <div>
          {userName && <p className="text-xs font-semibold text-primary/80 mb-1">Hola, {userName}</p>}
          <h1 className="text-[26px] font-bold tracking-tight text-on-surface">
            <span className="brand-gradient-text">Setto</span> Toolkit
          </h1>
        </div>
        <motion.button
          type="button"
          onClick={() => dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })}
          className="flex items-center gap-2.5 rounded-xl px-4 py-2.5 bg-surface-container/70 border border-outline-variant/20 flex-shrink-0"
          whileHover={{ borderColor: 'rgb(var(--c-primary) / 0.4)' }}
          transition={{ duration: 0.15 }}
        >
          <Search size={15} className="text-on-surface-variant/60" />
          <span className="text-[12.5px] text-on-surface-variant/50 hidden sm:inline">Buscar…</span>
          <kbd className="px-1.5 py-0.5 rounded-md text-[10px] font-mono text-on-surface-variant/50 border border-outline-variant/30 bg-surface-container/60">Ctrl K</kbd>
        </motion.button>
      </div>

      {/* Onboarding banner */}
      {showOnboarding && (
        <OnboardingBanner
          onDismiss={dismissOnboarding}
          onGoToSettings={() => { dismissOnboarding(); openTool('settings') }}
        />
      )}

      {/* Two columns: tool list (main) · metrics sidebar — tools no longer span the full width */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 items-start">
        <ToolGrid tools={tools} openTool={openTool} mascot={mascot} />
        <div className="flex flex-col gap-5">
          <DonutCard tools={tools} openTabCount={state.openTabs.length} recentCount={recents.length} />
          <ConnectionsCard onOpen={() => openTool('connections')} />
          <ActivityCard recents={recents} onOpen={openFile} />
        </div>
      </div>
    </div>
  )
}
