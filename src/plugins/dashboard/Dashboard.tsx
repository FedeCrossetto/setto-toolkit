import { useRef, useState, useEffect } from 'react'
import { ArrowRight, Plus, Search, Sparkles, X } from 'lucide-react'
import { useApp } from '../../core/AppContext'
import { allPlugins } from '../../core/plugin-registry'
import { PluginIcon } from '../../core/pluginIcons'
import type { PluginManifest } from '../../core/types'

const ONBOARDING_DISMISSED_KEY = 'dashboard:onboarding-dismissed'
const SECURE_SET_SENTINEL = '__CONFIGURED__'

// ── Per-plugin config ─────────────────────────────────────────────────────────
interface PluginConfig {
  glow: string
  accent: string
  badge: string
  artwork: () => JSX.Element
  settoArtwork: () => JSX.Element
  artworkWidth?: string   // percentage width of the right artwork column (default '38%')
}

const PLUGIN_CONFIG: Record<string, PluginConfig> = {
  'smart-diff': {
    glow:         'rgba(136,124,253,0.3)',
    accent:       '#887CFD',
    badge:        'bg-[#887CFD]/15 text-[#887CFD] border-[#887CFD]/20',
    artwork:      ArtworkPandaCompare,
    settoArtwork: ArtworkSettoCompare,
    artworkWidth: '55%',
  },
  'repo-search': {
    glow:         'rgba(72,150,254,0.3)',
    accent:       '#4896FE',
    badge:        'bg-[#4896FE]/15 text-[#4896FE] border-[#4896FE]/20',
    artwork:      ArtworkPandaSearch,
    settoArtwork: ArtworkSettoSearch,
  },
  'api-tester': {
    glow:         'rgba(22,200,199,0.35)',
    accent:       '#16C8C7',
    badge:        'bg-[#16C8C7]/15 text-[#16C8C7] border-[#16C8C7]/20',
    artwork:      ArtworkPandaRequest,
    settoArtwork: ArtworkSettoRequest,
  },
  'file-editor': {
    glow:         'rgba(83,71,206,0.3)',
    accent:       '#7C6FFF',
    badge:        'bg-[#7C6FFF]/15 text-[#7C6FFF] border-[#7C6FFF]/20',
    artwork:      ArtworkPanda,
    settoArtwork: ArtworkSettoEditor,
  },
  'snippets': {
    glow:         'rgba(245,158,11,0.28)',
    accent:       '#F59E0B',
    badge:        'bg-[#F59E0B]/15 text-[#F59E0B] border-[#F59E0B]/20',
    artwork:      ArtworkPandaSnippet,
    settoArtwork: ArtworkSettoSnippet,
  },
  'settings': {
    glow:         'rgba(22,200,199,0.25)',
    accent:       '#16C8C7',
    badge:        'bg-[#16C8C7]/15 text-[#16C8C7] border-[#16C8C7]/20',
    artwork:      ArtworkPandaSettings,
    settoArtwork: ArtworkSettoSettings,
  },
  'ticket-resolver': {
    glow:         'rgba(15,173,119,0.30)',
    accent:       '#0FAD77',
    badge:        'bg-[#0FAD77]/15 text-[#0FAD77] border-[#0FAD77]/20',
    artwork:      ArtworkPandaTicket,
    settoArtwork: ArtworkSettoTicket,
  },
}

const DEFAULT_CONFIG: PluginConfig = {
  glow:         'rgba(83,71,206,0.2)',
  accent:       '#887CFD',
  badge:        'bg-[#887CFD]/15 text-[#887CFD] border-[#887CFD]/20',
  artwork:      ArtworkDefault,
  settoArtwork: ArtworkDefault,
}

// ── Mascot artwork components ─────────────────────────────────────────────────
// Each is a self-contained SVG scene. Swap with real illustrations later
// by replacing the function body — the container size is always 100% × 120px.

function ArtworkSmartDiff(): JSX.Element {
  return (
    <svg viewBox="0 0 200 110" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      {/* Left code panel */}
      <rect x="18" y="20" width="66" height="72" rx="8" fill="#1a1830" stroke="#5347CE" strokeWidth="1.2" strokeOpacity="0.5"/>
      <rect x="28" y="32" width="40" height="3" rx="1.5" fill="#887CFD" fillOpacity="0.7"/>
      <rect x="28" y="40" width="32" height="3" rx="1.5" fill="#5347CE" fillOpacity="0.5"/>
      <rect x="28" y="48" width="38" height="3" rx="1.5" fill="#4ade80" fillOpacity="0.5"/>
      <rect x="28" y="56" width="28" height="3" rx="1.5" fill="#5347CE" fillOpacity="0.4"/>
      <rect x="28" y="64" width="36" height="3" rx="1.5" fill="#887CFD" fillOpacity="0.4"/>
      <rect x="28" y="72" width="24" height="3" rx="1.5" fill="#f87171" fillOpacity="0.5"/>
      {/* Right code panel */}
      <rect x="116" y="20" width="66" height="72" rx="8" fill="#1a1830" stroke="#4896FE" strokeWidth="1.2" strokeOpacity="0.5"/>
      <rect x="126" y="32" width="40" height="3" rx="1.5" fill="#4896FE" fillOpacity="0.7"/>
      <rect x="126" y="40" width="32" height="3" rx="1.5" fill="#5347CE" fillOpacity="0.5"/>
      <rect x="126" y="48" width="44" height="3" rx="1.5" fill="#4ade80" fillOpacity="0.6"/>
      <rect x="126" y="56" width="28" height="3" rx="1.5" fill="#5347CE" fillOpacity="0.4"/>
      <rect x="126" y="64" width="36" height="3" rx="1.5" fill="#4896FE" fillOpacity="0.4"/>
      <rect x="126" y="72" width="34" height="3" rx="1.5" fill="#4ade80" fillOpacity="0.5"/>
      {/* Center diff arrows */}
      <path d="M90 52 L110 52" stroke="#887CFD" strokeWidth="1.5" strokeOpacity="0.6" strokeDasharray="3 2"/>
      <path d="M107 49 L110 52 L107 55" stroke="#887CFD" strokeWidth="1.5" strokeOpacity="0.8"/>
      <path d="M110 60 L90 60" stroke="#4ade80" strokeWidth="1.5" strokeOpacity="0.6" strokeDasharray="3 2"/>
      <path d="M93 57 L90 60 L93 63" stroke="#4ade80" strokeWidth="1.5" strokeOpacity="0.8"/>
      {/* Glow blobs */}
      <ellipse cx="51" cy="56" rx="30" ry="20" fill="#5347CE" fillOpacity="0.06"/>
      <ellipse cx="149" cy="56" rx="30" ry="20" fill="#4896FE" fillOpacity="0.06"/>
    </svg>
  )
}

function ArtworkBitbucket(): JSX.Element {
  return (
    <svg viewBox="0 0 200 110" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      {/* Magnifying glass */}
      <circle cx="88" cy="52" r="34" fill="#0d1a2e" stroke="#4896FE" strokeWidth="1.5" strokeOpacity="0.5"/>
      <circle cx="88" cy="52" r="26" fill="#0a1525" stroke="#4896FE" strokeWidth="1" strokeOpacity="0.3"/>
      {/* Code inside glass */}
      <rect x="70" y="40" width="30" height="3" rx="1.5" fill="#4896FE" fillOpacity="0.8"/>
      <rect x="70" y="47" width="22" height="3" rx="1.5" fill="#887CFD" fillOpacity="0.6"/>
      <rect x="70" y="54" width="28" height="3" rx="1.5" fill="#16C8C7" fillOpacity="0.5"/>
      <rect x="70" y="61" width="18" height="3" rx="1.5" fill="#4896FE" fillOpacity="0.5"/>
      {/* Handle */}
      <line x1="113" y1="77" x2="135" y2="98" stroke="#4896FE" strokeWidth="6" strokeLinecap="round" strokeOpacity="0.7"/>
      {/* Highlight ring */}
      <circle cx="88" cy="52" r="34" stroke="white" strokeWidth="0.5" strokeOpacity="0.08"/>
      {/* Glow */}
      <ellipse cx="88" cy="52" rx="40" ry="30" fill="#4896FE" fillOpacity="0.05"/>
    </svg>
  )
}

function ArtworkApiLab(): JSX.Element {
  return (
    <svg viewBox="0 0 200 110" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      {/* Central node */}
      <circle cx="100" cy="55" r="14" fill="#0d2020" stroke="#16C8C7" strokeWidth="1.5" strokeOpacity="0.8"/>
      <circle cx="100" cy="55" r="8" fill="#16C8C7" fillOpacity="0.2"/>
      <circle cx="100" cy="55" r="3" fill="#16C8C7" fillOpacity="0.9"/>
      {/* Satellite nodes */}
      <circle cx="40" cy="30" r="9" fill="#0d2020" stroke="#4896FE" strokeWidth="1.2" strokeOpacity="0.7"/>
      <circle cx="40" cy="30" r="4" fill="#4896FE" fillOpacity="0.5"/>
      <circle cx="160" cy="30" r="9" fill="#0d2020" stroke="#887CFD" strokeWidth="1.2" strokeOpacity="0.7"/>
      <circle cx="160" cy="30" r="4" fill="#887CFD" fillOpacity="0.5"/>
      <circle cx="40" cy="82" r="9" fill="#0d2020" stroke="#16C8C7" strokeWidth="1.2" strokeOpacity="0.6"/>
      <circle cx="40" cy="82" r="4" fill="#16C8C7" fillOpacity="0.4"/>
      <circle cx="160" cy="82" r="9" fill="#0d2020" stroke="#4ade80" strokeWidth="1.2" strokeOpacity="0.6"/>
      <circle cx="160" cy="82" r="4" fill="#4ade80" fillOpacity="0.4"/>
      {/* Connection lines */}
      <line x1="49" y1="35" x2="88" y2="50" stroke="#4896FE" strokeWidth="1" strokeOpacity="0.5" strokeDasharray="4 3"/>
      <line x1="151" y1="35" x2="112" y2="50" stroke="#887CFD" strokeWidth="1" strokeOpacity="0.5" strokeDasharray="4 3"/>
      <line x1="49" y1="77" x2="88" y2="60" stroke="#16C8C7" strokeWidth="1" strokeOpacity="0.5" strokeDasharray="4 3"/>
      <line x1="151" y1="77" x2="112" y2="60" stroke="#4ade80" strokeWidth="1" strokeOpacity="0.5" strokeDasharray="4 3"/>
      {/* Pulse ring */}
      <circle cx="100" cy="55" r="22" stroke="#16C8C7" strokeWidth="0.8" strokeOpacity="0.3"/>
      <circle cx="100" cy="55" r="30" stroke="#16C8C7" strokeWidth="0.5" strokeOpacity="0.15"/>
      {/* Glow */}
      <ellipse cx="100" cy="55" rx="45" ry="35" fill="#16C8C7" fillOpacity="0.04"/>
    </svg>
  )
}

function ArtworkFileEditor(): JSX.Element {
  return (
    <svg viewBox="0 0 200 110" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      {/* Back page */}
      <rect x="72" y="18" width="76" height="82" rx="7" fill="#1a1830" stroke="#5347CE" strokeWidth="1" strokeOpacity="0.3" transform="rotate(-5 72 18)"/>
      {/* Mid page */}
      <rect x="62" y="16" width="76" height="82" rx="7" fill="#16182a" stroke="#887CFD" strokeWidth="1" strokeOpacity="0.4"/>
      {/* Front page */}
      <rect x="52" y="12" width="96" height="86" rx="8" fill="#1a1c30" stroke="#887CFD" strokeWidth="1.2" strokeOpacity="0.6"/>
      {/* Code lines on front page */}
      <rect x="66" y="26" width="55" height="3" rx="1.5" fill="#887CFD" fillOpacity="0.8"/>
      <rect x="66" y="34" width="44" height="3" rx="1.5" fill="#4896FE" fillOpacity="0.6"/>
      <rect x="66" y="42" width="60" height="3" rx="1.5" fill="#5347CE" fillOpacity="0.5"/>
      <rect x="66" y="50" width="38" height="3" rx="1.5" fill="#16C8C7" fillOpacity="0.6"/>
      <rect x="66" y="58" width="50" height="3" rx="1.5" fill="#887CFD" fillOpacity="0.4"/>
      <rect x="66" y="66" width="32" height="3" rx="1.5" fill="#4896FE" fillOpacity="0.4"/>
      {/* Cursor */}
      <rect x="66" y="74" width="2" height="12" rx="1" fill="#887CFD" fillOpacity="0.9"/>
      {/* Glow */}
      <ellipse cx="100" cy="55" rx="50" ry="35" fill="#5347CE" fillOpacity="0.05"/>
    </svg>
  )
}

function ArtworkSettings(): JSX.Element {
  return (
    <svg viewBox="0 0 200 110" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      {/* Large gear */}
      <circle cx="90" cy="55" r="22" fill="#0e1e1e" stroke="#16C8C7" strokeWidth="1.5" strokeOpacity="0.6"/>
      <circle cx="90" cy="55" r="10" fill="#16C8C7" fillOpacity="0.12"/>
      <circle cx="90" cy="55" r="5" fill="#16C8C7" fillOpacity="0.4"/>
      {/* Gear teeth (large) */}
      {[0,45,90,135,180,225,270,315].map((deg, i) => (
        <rect key={i} x="87" y="29" width="6" height="8" rx="2" fill="#16C8C7" fillOpacity="0.5"
          transform={`rotate(${deg} 90 55)`}/>
      ))}
      {/* Small gear */}
      <circle cx="138" cy="38" r="14" fill="#0e1e1e" stroke="#887CFD" strokeWidth="1.2" strokeOpacity="0.6"/>
      <circle cx="138" cy="38" r="7" fill="#887CFD" fillOpacity="0.12"/>
      <circle cx="138" cy="38" r="3.5" fill="#887CFD" fillOpacity="0.4"/>
      {[0,60,120,180,240,300].map((deg, i) => (
        <rect key={i} x="136" y="20" width="4" height="6" rx="1.5" fill="#887CFD" fillOpacity="0.5"
          transform={`rotate(${deg} 138 38)`}/>
      ))}
      {/* Toggle sliders */}
      <rect x="118" y="68" width="50" height="14" rx="7" fill="#0d1a20" stroke="#16C8C7" strokeWidth="1" strokeOpacity="0.4"/>
      <circle cx="156" cy="75" r="5" fill="#16C8C7" fillOpacity="0.7"/>
      <rect x="118" y="88" width="50" height="14" rx="7" fill="#0d1a20" stroke="#5347CE" strokeWidth="1" strokeOpacity="0.4"/>
      <circle cx="128" cy="95" r="5" fill="#5347CE" fillOpacity="0.5"/>
      {/* Glow */}
      <ellipse cx="100" cy="60" rx="55" ry="35" fill="#16C8C7" fillOpacity="0.04"/>
    </svg>
  )
}

function ArtworkDefault(): JSX.Element {
  return (
    <svg viewBox="0 0 200 110" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <circle cx="100" cy="55" r="30" fill="#1a1830" stroke="#887CFD" strokeWidth="1.5" strokeOpacity="0.5"/>
      <circle cx="100" cy="55" r="18" fill="#887CFD" fillOpacity="0.1"/>
      <circle cx="100" cy="55" r="8" fill="#887CFD" fillOpacity="0.4"/>
    </svg>
  )
}

interface PandaImgProps { src: string; scale?: number; tx?: number; ty?: number; objPosition?: string }

function PandaImg({ src, scale = 1.12, tx = 0, ty = 6, objPosition = 'bottom' }: PandaImgProps): JSX.Element {
  return (
    <img
      src={src}
      alt=""
      className="absolute inset-0 w-full h-full object-contain"
      draggable={false}
      style={{
        filter: 'drop-shadow(0 8px 20px rgba(0,0,0,0.55))',
        transform: `scale(${scale}) translate(${tx}px, ${ty}px)`,
        transformOrigin: 'bottom center',
        objectPosition: objPosition,
      }}
    />
  )
}

// Each panda PNG has different internal whitespace — tune scale/tx/ty per image
// scale: zoom level  tx: horizontal offset (negative = left)  ty: vertical offset (positive = down)
function ArtworkPanda():         JSX.Element { return <PandaImg src="./panda-avatar/panda1.png"               scale={1.15} tx={-4}  ty={6} /> }
function ArtworkPandaSnippet():  JSX.Element { return <PandaImg src="./panda-avatar/panda-snippet.png"         scale={1.15} tx={-4}  ty={6} /> }
function ArtworkPandaCompare():  JSX.Element { return <PandaImg src="./panda-avatar/panda-compare-files.png"  scale={1.0} tx={0} ty={0} objPosition="center" /> }
function ArtworkPandaSearch():   JSX.Element { return <PandaImg src="./panda-avatar/panda-search.png"         scale={1.15} tx={-4}  ty={6} /> }
function ArtworkPandaSettings(): JSX.Element { return <PandaImg src="./panda-avatar/panda-settings.png"       scale={1.15} tx={-10} ty={6} /> }
function ArtworkPandaRequest():  JSX.Element { return <PandaImg src="./panda-avatar/panda-request.png"        scale={1.15} tx={-10} ty={6} /> }
function ArtworkPandaTicket():   JSX.Element { return <PandaImg src="./panda-avatar/panda-ticket.png"           scale={1.15} tx={-4}  ty={4} /> }

// ── Setto Avatar artwork ──────────────────────────────────────────────────────
// Place matching PNGs in public/setto-avatar/ — falls back to panda if file is missing
function SettoImg({ src, scale = 1.12, tx = 0, ty = 6, objPosition = 'bottom' }: { src: string; scale?: number; tx?: number; ty?: number; objPosition?: string }): JSX.Element {
  return (
    <img
      src={src}
      alt=""
      className="absolute inset-0 w-full h-full object-contain"
      draggable={false}
      style={{ filter: 'drop-shadow(0 8px 20px rgba(0,0,0,0.55))', transform: `scale(${scale}) translate(${tx}px, ${ty}px)`, transformOrigin: 'bottom center', objectPosition: objPosition }}
      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
    />
  )
}
function ArtworkSettoCompare():  JSX.Element { return <SettoImg src="./setto-avatar/setto-avatar-difference.png" scale={1.15} tx={0} ty={6} /> }
function ArtworkSettoSearch():   JSX.Element { return <SettoImg src="./setto-avatar/setto-avatar-search.png"     /> }
function ArtworkSettoRequest():  JSX.Element { return <SettoImg src="./setto-avatar/setto-avatar-api.png"        /> }
function ArtworkSettoEditor():   JSX.Element { return <SettoImg src="./setto-avatar/setto-avatar.png"            /> }
function ArtworkSettoSnippet():  JSX.Element { return <SettoImg src="./setto-avatar/setto-avatar-snippet.png"    /> }
function ArtworkSettoSettings(): JSX.Element { return <SettoImg src="./setto-avatar/setto-avatar-settings.png"   /> }
function ArtworkSettoTicket():   JSX.Element { return <SettoImg src="./setto-avatar/setto-avatar-ticket.png"     scale={1.1} tx={-4} ty={4} /> }

// ── ToolArtwork — swap real images here later ─────────────────────────────────
// To replace with a real illustration:
//   1. Drop a PNG/SVG into public/artwork/<plugin-id>.png
//   2. Uncomment the <img> branch and remove the artwork() JSX branch
function ToolArtwork({ pluginId, artwork }: { pluginId: string; artwork: () => JSX.Element }): JSX.Element {
  // Future: return <img src={`/artwork/${pluginId}.png`} className="w-full h-full object-contain" alt="" />
  void pluginId
  const Scene = artwork
  return <Scene />
}

// ── TiltCard — mismo lenguaje claro/oscuro: sombra suave + hover con acento ──
function TiltCard({ children, onClick, glow, isDark }: {
  children: React.ReactNode
  onClick: () => void
  glow: string
  isDark: boolean
}): JSX.Element {
  const ref = useRef<HTMLButtonElement>(null)
  const [tilt, setTilt] = useState({ x: 0, y: 0, hover: false })

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>): void => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width  - 0.5
    const y = (e.clientY - rect.top)  / rect.height - 0.5
    setTilt({ x: y * -8, y: x * 8, hover: true })
  }

  const handleMouseLeave = (): void => setTilt({ x: 0, y: 0, hover: false })

  const shadowIdle = isDark
    ? '0 2px 10px rgba(0,0,0,0.35)'
    : '0 2px 10px rgba(0,0,0,0.07), 0 1px 2px rgba(0,0,0,0.04)'
  const shadowHover = isDark
    ? `0 8px 24px rgba(0,0,0,0.45), 0 0 18px ${glow}`
    : `0 8px 24px rgba(0,0,0,0.1), 0 0 22px ${glow}`

  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        transform: tilt.hover
          ? `perspective(800px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) translateY(-4px) scale(1.02)`
          : 'perspective(800px) rotateX(0deg) rotateY(0deg) translateY(0px) scale(1)',
        transition: tilt.hover
          ? 'transform 0.12s ease-out'
          : 'transform 0.35s cubic-bezier(0.34,1.56,0.64,1)',
        boxShadow: tilt.hover ? shadowHover : shadowIdle,
      }}
      className={[
        'text-left w-full rounded-3xl overflow-hidden cursor-pointer flex flex-col relative',
        'bg-surface-container border border-outline-variant/20',
        isDark && 'border-outline-variant/10',
      ].filter(Boolean).join(' ')}
    >
      {children}
    </button>
  )
}

// ── ToolCard ──────────────────────────────────────────────────────────────────
function ToolCard({ plugin, onOpen, mascot }: { plugin: PluginManifest; onOpen: () => void; mascot: 'panda' | 'setto-avatar' }): JSX.Element {
  const { state } = useApp()
  const isDark = state.theme === 'dark'
  const cfg = PLUGIN_CONFIG[plugin.id] ?? DEFAULT_CONFIG
  const ArtworkComponent = mascot === 'setto-avatar' ? cfg.settoArtwork : cfg.artwork

  return (
    <TiltCard onClick={onOpen} glow={cfg.glow} isDark={isDark}>
      <div className="relative flex flex-1 min-h-[168px] overflow-hidden bg-surface-container-high">
        <div
          aria-hidden
          className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-3xl"
          style={{ background: `linear-gradient(180deg, ${cfg.accent}cc, ${cfg.accent}66)` }}
        />

        {/* ── Left: text content ─────────────────────────────────── */}
        <div className="flex flex-col justify-between flex-1 min-w-0 p-5 pr-3">
          <div>
            <div className="flex items-center gap-2.5 mb-2.5">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: cfg.accent + '28', border: `1px solid ${cfg.accent}44` }}
              >
                <PluginIcon icon={plugin.icon} size={16} style={{ color: cfg.accent }} />
              </div>
              <h3 className="text-[14px] font-semibold text-on-surface tracking-tight leading-tight">
                {plugin.name}
              </h3>
            </div>

            <p className="text-[12px] text-on-surface-variant/70 leading-relaxed line-clamp-3">
              {plugin.description}
            </p>
          </div>

          <div className="flex items-center gap-1 mt-4 text-[11px] font-bold" style={{ color: cfg.accent }}>
            <span>Open</span>
            <ArrowRight size={13} />
          </div>
        </div>

        {/* ── Right: mascot ──────────────────────────────────────── */}
        <div className="flex-shrink-0 relative self-stretch" style={{ width: cfg.artworkWidth ?? '38%' }}>
          <ToolArtwork pluginId={plugin.id} artwork={ArtworkComponent} />
        </div>

      </div>
    </TiltCard>
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
        <p className="text-sm font-semibold text-on-surface">Unlock AI features</p>
        <p className="text-xs text-on-surface-variant mt-0.5 leading-relaxed">
          Add your OpenAI API key in Settings to enable Smart Diff semantic analysis and other AI-powered tools.
        </p>
        <button
          onClick={onGoToSettings}
          className="mt-2.5 text-xs font-semibold text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
        >
          <span>Go to Settings</span>
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

// ── Dashboard ─────────────────────────────────────────────────────────────────
export function Dashboard(): JSX.Element {
  const { dispatch, state } = useApp()
  const isDark = state.theme === 'dark'
  const tools = allPlugins.filter((p) => p.id !== 'dashboard' && p.id !== 'about' && !state.disabledPlugins.includes(p.id))
  const openTool = (id: string): void => dispatch({ type: 'OPEN_TAB', pluginId: id })

  const [showOnboarding, setShowOnboarding] = useState(false)
  const [mascot, setMascot] = useState<'panda' | 'setto-avatar'>('setto-avatar')

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

  return (
    <div className="p-8 max-w-5xl mx-auto w-full space-y-10">
      {/* Welcome header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight text-on-surface">
          <span className="brand-gradient-text">Setto</span>{' '}Toolkit
        </h1>
        <p className="text-on-surface-variant text-sm">Your modular workspace for developer utilities.</p>
      </div>

      {/* Search — mismo patrón que las cards: superficie + borde token (claro y oscuro) */}
      <button
        type="button"
        onClick={() => dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })}
        className="w-full max-w-2xl flex items-center gap-3 text-left rounded-2xl px-[18px] py-3 transition-all duration-200"
        style={{
          background: 'rgb(var(--c-surface-container-high) / 0.92)',
          border: '1px solid rgb(var(--c-outline-variant) / 0.35)',
          boxShadow: isDark ? '0 2px 14px rgba(0,0,0,0.35)' : '0 2px 12px rgba(0,0,0,0.06)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = isDark ? '0 4px 18px rgba(0,0,0,0.45)' : '0 4px 16px rgba(0,0,0,0.1)'
          e.currentTarget.style.borderColor = 'rgb(var(--c-outline-variant) / 0.5)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = isDark ? '0 2px 14px rgba(0,0,0,0.35)' : '0 2px 12px rgba(0,0,0,0.06)'
          e.currentTarget.style.borderColor = 'rgb(var(--c-outline-variant) / 0.35)'
        }}
      >
        <Search size={18} className="text-primary/60" />
        <span className="flex-1 text-sm text-on-surface-variant/50">Search tools or run a command…</span>
        <div className="flex gap-1">
          {['Ctrl', 'K'].map((k) => (
            <kbd
              key={k}
              className="px-1.5 py-0.5 rounded-md text-[10px] font-mono text-on-surface-variant/50 border border-outline-variant/30 bg-surface-container"
            >
              {k}
            </kbd>
          ))}
        </div>
      </button>

      {/* Onboarding banner */}
      {showOnboarding && (
        <OnboardingBanner
          onDismiss={dismissOnboarding}
          onGoToSettings={() => { dismissOnboarding(); openTool('settings') }}
        />
      )}

      {/* Tool cards grid */}
      <div>
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 mb-5">
          Available Tools
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {tools.map((plugin, i) => (
            <div key={plugin.id}
              style={{
                animation: `fadeSlideUp 0.35s ease both`,
                animationDelay: `${i * 60}ms`,
              }}>
              <ToolCard plugin={plugin} onOpen={() => openTool(plugin.id)} mascot={mascot} />
            </div>
          ))}

          {/* Add plugin placeholder */}
          <div className="rounded-3xl border border-dashed border-outline-variant/25 bg-surface-container-high/50
            flex flex-col items-center justify-center gap-3 p-8 min-h-[220px] text-center">
            <div className="w-10 h-10 rounded-2xl bg-surface-container flex items-center justify-center border border-outline-variant/20">
              <Plus size={20} className="text-on-surface-variant/40" />
            </div>
            <div>
              <p className="text-sm font-semibold text-on-surface-variant/50">Add Plugin</p>
              <p className="text-xs text-on-surface-variant/35 mt-1 leading-relaxed">
                Drop a folder in{' '}
                <code className="bg-surface-container px-1 py-0.5 rounded text-primary/70 text-[10px]">src/plugins/</code>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
