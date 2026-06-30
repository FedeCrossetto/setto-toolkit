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
    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden bg-on-surface/[0.06] border border-outline-variant/20">
      {imgError ? (
        <PluginIcon icon={icon} size={15} className="text-on-surface-variant/70" />
      ) : (
        <img
          key={src}
          src={src}
          alt=""
          draggable={false}
          className="w-full h-full object-contain"
          style={{ transform: 'scale(1.5) translateY(15%)', transformOrigin: 'bottom center' }}
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
      className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left rounded-xl backdrop-blur-sm transition-all duration-150 group
        bg-surface-container/55 border border-outline-variant/10 shadow-[0_1px_2px_rgba(0,0,0,0.06)]
        hover:-translate-y-[1px] hover:bg-surface-container-high/70 hover:shadow-[0_6px_16px_rgba(0,0,0,0.16)]"
    >
      <MascotAvatar pluginId={plugin.id} icon={plugin.icon} mascot={mascot} />
      <div className="min-w-0 flex-1 flex items-baseline gap-2.5">
        <p className="text-[13px] font-medium text-on-surface flex-shrink-0">{plugin.name}</p>
        <p className="text-[11.5px] text-on-surface-variant/50 truncate">{plugin.description}</p>
      </div>
      <ArrowRight
        size={14}
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
            <div className="flex flex-col gap-[5px]">
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
      className={`relative overflow-hidden rounded-2xl backdrop-blur-sm ${noPad ? '' : 'p-4'} ${className}`}
      style={{ background: 'rgb(var(--c-surface-container) / 0.65)', border: '1px solid rgb(var(--c-outline-variant) / 0.2)' }}
    >
      {children}
    </div>
  )
}

// ── DonutCard — replaces the old Resumen + Command Palette cards with a single
// modern donut chart (section breakdown) + compact KPI rows below it.
function DonutCard({ tools, openTabCount, recentCount }: { tools: PluginManifest[]; openTabCount: number; recentCount: number }): JSX.Element {
  const sections = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of tools) {
      const key = t.section ?? 'Desarrollo'
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return Array.from(map.entries()).map(([label, count]) => ({
      label, count, pct: tools.length ? (count / tools.length) * 100 : 0,
    }))
  }, [tools])

  const r = 40, strokeW = 9, circumference = 2 * Math.PI * r

  return (
    <Card className="flex flex-col gap-4">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant/60">Resumen</span>

      {/* Single closed gradient ring (theme brand gradient) with a soft glow behind it —
          no segment seams, no awkward gaps, just a clean modern progress-ring look. */}
      <div className="relative w-[124px] h-[124px] mx-auto">
        <div aria-hidden className="absolute inset-3 rounded-full blur-xl opacity-25" style={{ background: 'var(--gradient-brand)' }} />
        <svg viewBox="0 0 100 100" className="relative w-full h-full -rotate-90">
          <defs>
            <linearGradient id="dashboard-donut-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgb(var(--c-primary))" />
              <stop offset="100%" stopColor="rgb(var(--c-primary-light))" />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r={r} fill="none" stroke="rgb(var(--c-on-surface) / 0.05)" strokeWidth={strokeW} />
          <circle cx="50" cy="50" r={r} fill="none" strokeWidth={strokeW} stroke="url(#dashboard-donut-gradient)" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[26px] font-bold text-on-surface tabular-nums leading-none">{tools.length}</span>
          <span className="text-[8.5px] text-on-surface-variant/45 uppercase tracking-[0.12em] mt-1.5">herramientas</span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {sections.map((s) => (
          <div key={s.label} className="flex items-center justify-between text-[11px]">
            <span className="text-on-surface-variant/65">{s.label}</span>
            <span className="text-on-surface-variant/45 tabular-nums">{Math.round(s.pct)}%</span>
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
            <span className="flex items-center gap-1 text-[10px] text-on-surface-variant/50" title="Lenguaje más abierto recientemente">
              <Icon size={11} className="opacity-70" /> {topLanguage}
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
          <ActivityCard recents={recents} onOpen={openFile} />
        </div>
      </div>
    </div>
  )
}
