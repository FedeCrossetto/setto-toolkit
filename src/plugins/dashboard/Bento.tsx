import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronRight, Settings2 } from 'lucide-react'
import { useApp } from '../../core/AppContext'
import { CountUp } from '../../core/components/CountUp'
import { Toggle } from '../../core/components/Form'
import { useToast } from '../../core/components/Toast'
import { useMotionPreference } from '../../core/motion-prefs'
import { fmtMoney, mesLong } from '../gastos/format'
import { useRecurrentesAuto } from '../gastos/recurrence-runner'
import type { GastosSummaryResult } from '../gastos/summary'
import type { SqlProfile } from '../connections/sql'
import type { QueryHistoryEntry } from '../sql-runner/types'
import type { PasswordAudit } from '../credentials/types'
import { dailyCounts, dayLabels } from './panorama-data'

/**
 * Inicio en "bento": tarjetas de distintos tamaños, fondo casi negro, estados con punto
 * de color y un botón de acción por tarjeta. Sólo datos que sirven en el día a día.
 */

type Tone = 'ok' | 'warn' | 'bad' | 'idle'
const TONE_TEXT: Record<Tone, string> = { ok: 'text-emerald-400', warn: 'text-amber-400', bad: 'text-red-400', idle: 'text-on-surface-variant/50' }
const RING = '#5ac8fa'
const AREA = '#a78bfa'

export function StatusDot({ tone }: { tone: Tone }): JSX.Element {
  return <span className={`status-dot shrink-0 ${TONE_TEXT[tone]}`} aria-hidden />
}

export function BentoCard({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }): JSX.Element {
  return <section onClick={onClick} className={`bento spotlight flex flex-col p-5 min-w-0 ${onClick ? 'cursor-pointer' : ''} ${className}`}>{children}</section>
}

export function Pill({ children, onClick, title }: { children: ReactNode; onClick: () => void; title?: string }): JSX.Element {
  return (
    <button type="button" title={title} onClick={(e) => { e.stopPropagation(); onClick() }} className="bento-pill self-start">
      {children} <ChevronRight size={13} />
    </button>
  )
}

function CardTitle({ title, sub, status, tone }: { title: string; sub?: string; status?: string; tone?: Tone }): JSX.Element {
  return (
    <div className="min-w-0">
      <h3 className="text-[17px] leading-[22px] font-semibold text-on-surface tracking-[-0.01em] truncate">{title}</h3>
      {sub && <p className="t-caption text-on-surface-variant/80 truncate">{sub}</p>}
      {status && <p className="mt-2 flex items-center gap-2 t-footnote font-semibold text-on-surface"><StatusDot tone={tone ?? 'idle'} />{status}</p>}
    </div>
  )
}

/** Anillo grueso con brillo y un valor en el centro (como los de temperatura). */
function BigRing({ pct, value, caption, color = RING }: { pct: number | null; value: ReactNode; caption: string; color?: string }): JSX.Element {
  const id = useId().replace(/:/g, '')
  const [shown, setShown] = useState(false)
  useEffect(() => { const r = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(r) }, [])
  const R = 34, SW = 7, C = 2 * Math.PI * R
  const p = !shown || pct === null ? 0 : Math.max(0, Math.min(1, pct))
  const arc = <circle cx={44} cy={44} r={R} fill="none" stroke={color} strokeWidth={SW} strokeLinecap="round" strokeDasharray={`${p * C} ${C}`} transform="rotate(-90 44 44)" style={{ transition: 'stroke-dasharray 1s var(--ease-mac)' }} />
  return (
    <div className="relative w-[88px] h-[88px] shrink-0">
      <svg viewBox="0 0 88 88" width={88} height={88} className="overflow-visible" aria-hidden>
        <defs><filter id={`br-${id}`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5" /></filter></defs>
        <circle cx={44} cy={44} r={R} fill="none" stroke="rgb(var(--c-on-surface) / 0.08)" strokeWidth={SW} />
        <g filter={`url(#br-${id})`} opacity="0.65">{arc}</g>
        {arc}
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-[19px] font-bold tabular-nums text-on-surface">{value}</span>
        <span className="mt-1 text-[10px] text-on-surface-variant">{caption}</span>
      </span>
    </div>
  )
}

/** Barra fina de progreso con etiqueta y valor (como "Utilization"). */
function Meter({ label, value, pct, tone = 'ok' }: { label: string; value: string; pct: number; tone?: Tone }): JSX.Element {
  const bar = tone === 'bad' ? 'bg-red-400' : tone === 'warn' ? 'bg-amber-400' : 'bg-on-surface/85'
  return (
    <div className="mt-auto pt-4">
      <div className="flex items-center justify-between t-caption text-on-surface-variant mb-1.5"><span>{label}</span><span className="font-semibold text-on-surface tabular-nums">{value}</span></div>
      <div className="h-[5px] rounded-full bg-on-surface/8 overflow-hidden"><div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.max(0, Math.min(1, pct)) * 100}%`, transition: 'width 900ms var(--ease-mac)' }} /></div>
    </div>
  )
}

/** Ola de puntitos en 3D (decorativa), dibujada una vez en un canvas. */
function DotWave({ className = '' }: { className?: string }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  const { state } = useApp()
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const draw = (): void => {
      const dpr = window.devicePixelRatio || 1
      const w = cv.clientWidth, h = cv.clientHeight
      if (!w || !h) return
      cv.width = w * dpr; cv.height = h * dpr
      const ctx = cv.getContext('2d')
      if (!ctx) return
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, w, h)
      const prim = getComputedStyle(document.documentElement).getPropertyValue('--c-primary').trim().split(/\s+/).map(Number)
      const [pr = 167, pg = 139, pb = 250] = prim.length === 3 && prim.every((n) => !Number.isNaN(n)) ? prim : []
      const cols = 64, rows = 30
      for (let j = 0; j < rows; j++) {
        const z = j / (rows - 1)
        for (let i = 0; i < cols; i++) {
          const x = i / (cols - 1)
          const y = Math.sin(x * 5.2 + z * 3.1) * 0.16 + Math.cos(z * 4.4 - x * 2) * 0.1
          const persp = 0.55 + z * 0.75
          const px = w * 0.68 + (x - 0.5) * w * 0.8 * persp
          const py = h * 0.12 + z * h * 0.5 + y * h * 0.5 * persp
          const t = x * 0.7 + z * 0.3
          const r = Math.round(pr * (1 - t) + 90 * t), g = Math.round(pg * (1 - t) + 200 * t), b = Math.round(pb * (1 - t) + 250 * t)
          ctx.fillStyle = `rgba(${r},${g},${b},${0.12 + z * 0.55})`
          ctx.beginPath(); ctx.arc(px, py, 0.5 + z * 1.1, 0, Math.PI * 2); ctx.fill()
        }
      }
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(cv)
    return () => ro.disconnect()
  }, [state.theme])
  // Se desvanece hacia la izquierda y abajo: nunca tapa el saludo ni la lista de estados.
  return <canvas ref={ref} aria-hidden style={{ maskImage: 'linear-gradient(to right, transparent 0%, rgb(0 0 0 / 0.35) 38%, black 70%), linear-gradient(to bottom, black 55%, transparent 95%)', maskComposite: 'intersect' }} className={`pointer-events-none absolute inset-0 w-full h-full ${className}`} />
}

/** Gráfico de área suave con brillo (actividad por día). */
function AreaChart({ values, labels, color = AREA }: { values: number[]; labels: string[]; color?: string }): JSX.Element {
  const id = useId().replace(/:/g, '')
  const W = 600, H = 120, pad = 6
  const max = Math.max(1, ...values)
  const pts = values.map((v, i) => [pad + (i / Math.max(1, values.length - 1)) * (W - pad * 2), H - 8 - (v / max) * (H - 24)] as const)
  const line = pts.map((p, i) => {
    if (i === 0) return `M ${p[0]} ${p[1]}`
    const p0 = pts[i - 2] ?? pts[i - 1]!, p1 = pts[i - 1]!, p3 = pts[i + 1] ?? p
    return `C ${p1[0] + (p[0] - p0[0]) / 6} ${p1[1] + (p[1] - p0[1]) / 6} ${p[0] - (p3[0] - p1[0]) / 6} ${p[1] - (p3[1] - p1[1]) / 6} ${p[0]} ${p[1]}`
  }).join(' ')
  const area = `${line} L ${pts[pts.length - 1]![0]} ${H} L ${pts[0]![0]} ${H} Z`
  return (
    <div className="mt-auto">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-[110px] overflow-visible" role="img" aria-label={values.map((v, i) => `${labels[i]}: ${v}`).join(', ')}>
        <defs>
          <linearGradient id={`ag-${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.45" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
          <filter id={`ab-${id}`} x="-10%" y="-50%" width="120%" height="200%"><feGaussianBlur stdDeviation="4" /></filter>
        </defs>
        <path d={area} fill={`url(#ag-${id})`} className="grow-y" />
        <path d={line} fill="none" stroke={color} strokeWidth={2.5} opacity={0.6} filter={`url(#ab-${id})`} vectorEffect="non-scaling-stroke" />
        <path d={line} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between t-caption text-on-surface-variant/70 mt-1">
        {labels.map((l, i) => <span key={i} className={i === labels.length - 1 ? 'text-on-surface font-semibold' : ''}>{i % 2 === labels.length % 2 || i === labels.length - 1 ? l : ''}</span>)}
      </div>
    </div>
  )
}

// ── Datos compartidos del bento ──────────────────────────────────────────────

export interface BentoData {
  gastos: GastosSummaryResult | null
  profiles: SqlProfile[] | null
  history: QueryHistoryEntry[]
  audit: PasswordAudit | null
  ticketsAt: number[]
}

export function useBentoData(stamp: number, show: { sql: boolean; credentials: boolean }): [Omit<BentoData, 'gastos' | 'ticketsAt'>, () => void] {
  const [profiles, setProfiles] = useState<SqlProfile[] | null>(null)
  const [history, setHistory] = useState<QueryHistoryEntry[]>([])
  const [audit, setAudit] = useState<PasswordAudit | null>(null)
  const [n, setN] = useState(0)
  useEffect(() => {
    if (show.sql) {
      void window.api.invoke<SqlProfile[]>('sql:list').then(setProfiles).catch(() => setProfiles([]))
      void window.api.invoke<QueryHistoryEntry[]>('sql:history-get').then(setHistory).catch(() => setHistory([]))
    }
    if (show.credentials) void window.api.invoke<PasswordAudit>('credentials:password-audit').then(setAudit).catch(() => setAudit(null))
  }, [stamp, n, show.sql, show.credentials])
  return [{ profiles, history, audit }, () => setN((x) => x + 1)]
}

const startOfToday = (): number => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() }

// ── Tarjetas ─────────────────────────────────────────────────────────────────

export function HeroCard({ name, now, data, show, className = '' }: {
  name: string | null
  now: Date
  data: BentoData
  show: { gastos: boolean; sql: boolean; credentials: boolean; tickets: boolean }
  className?: string
}): JSX.Element {
  const { dispatch } = useApp()
  const open = (pluginId: string): void => dispatch({ type: 'OPEN_TAB', pluginId })
  const rows: { key: string; label: string; detail: string; tone: Tone; to: string }[] = []

  if (show.sql && data.profiles) {
    const tested = data.profiles.filter((p) => p.lastTest)
    const bad = tested.filter((p) => !p.lastTest!.ok)
    rows.push({
      key: 'sql', label: 'Conexiones', to: 'sql-runner',
      ...(data.profiles.length === 0 ? { detail: 'Todavía no guardaste ninguna', tone: 'idle' as Tone }
        : bad.length ? { detail: `${bad.map((p) => p.name).slice(0, 2).join(', ')} no ${bad.length === 1 ? 'responde' : 'responden'}`, tone: 'warn' as Tone }
          : tested.length ? { detail: `${tested.length === data.profiles.length ? 'Todas responden' : `${tested.length} de ${data.profiles.length} responden`}`, tone: 'ok' as Tone }
            : { detail: 'Sin probar todavía', tone: 'idle' as Tone }),
    })
  }
  if (show.gastos) {
    const r = data.gastos
    const s = r && (r.status === 'ok' || r.status === 'offline') ? r.summary : null
    const over = s?.presupuesto ? s.total > s.presupuesto : false
    rows.push({
      key: 'gastos', label: 'Gastos', to: 'gastos',
      ...(!r ? { detail: 'Cargando…', tone: 'idle' as Tone }
        : !s ? { detail: r.status === 'not-configured' ? 'Sin conectar a Supabase' : 'No se pudo leer', tone: 'idle' as Tone }
          : over ? { detail: `Te pasaste del presupuesto por ${fmtMoney(s.total - s.presupuesto!)}`, tone: 'bad' as Tone }
            : s.pendientesCount ? { detail: `${s.pendientesCount} sin pagar · ${fmtMoney(s.pendientes)}`, tone: 'warn' as Tone }
              : { detail: 'Todo pagado este mes', tone: 'ok' as Tone }),
    })
  }
  if (show.credentials) {
    const a = data.audit
    const weak = a?.weak.length ?? 0
    const reused = a?.reused.reduce((n, g) => n + g.length, 0) ?? 0
    rows.push({
      key: 'keys', label: 'Claves', to: 'credentials',
      ...(!a ? { detail: 'Bloqueadas o sin datos', tone: 'idle' as Tone }
        : weak || reused ? { detail: [weak ? `${weak} débil${weak === 1 ? '' : 'es'}` : '', reused ? `${reused} repetida${reused === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · '), tone: 'warn' as Tone }
          : { detail: 'Contraseñas sanas', tone: 'ok' as Tone }),
    })
  }
  if (show.tickets) {
    const today = data.ticketsAt.filter((t) => t >= startOfToday()).length
    rows.push({ key: 'tickets', label: 'Tickets', to: 'tickets', detail: today ? `${today} con actividad hoy` : 'Sin actividad hoy', tone: today ? 'ok' : 'idle' })
  }
  if (show.sql) {
    const errs = data.history.filter((h) => !h.ok && h.at >= startOfToday()).length
    const today = data.history.filter((h) => h.at >= startOfToday()).length
    rows.push({ key: 'runs', label: 'Consultas', to: 'sql-runner', detail: errs ? `${errs} con error hoy` : today ? `${today} hoy, sin errores` : 'Ninguna hoy', tone: errs ? 'warn' : today ? 'ok' : 'idle' })
  }
  const attention = rows.filter((r) => r.tone === 'warn' || r.tone === 'bad').length

  return (
    <BentoCard className={`min-h-[340px] ${className}`}>
      <DotWave className="opacity-90" />
      <div className="relative">
        <p className="t-footnote text-on-surface-variant">{now.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, (c) => c.toUpperCase())}</p>
        <h1 className="text-[34px] leading-[40px] font-bold tracking-[-0.02em] text-on-surface">Hola{name ? `, ${name}` : ''}</h1>
        <p className="t-footnote text-on-surface-variant mt-0.5">{attention ? `${attention} ${attention === 1 ? 'cosa para mirar' : 'cosas para mirar'}` : 'Todo en orden por ahora'}</p>
      </div>
      <ul className="relative mt-auto pt-6 flex flex-col gap-2.5">
        {rows.map((r) => (
          <li key={r.key}>
            <button type="button" onClick={() => open(r.to)} className="group flex items-start gap-2.5 text-left">
              <span className="mt-[5px]"><StatusDot tone={r.tone} /></span>
              <span>
                <span className="block t-footnote font-semibold text-on-surface group-hover:underline underline-offset-2">{r.label}</span>
                <span className="block t-caption text-on-surface-variant">{r.detail}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </BentoCard>
  )
}

export function GastosCard({ result, className = '' }: { result: GastosSummaryResult | null; className?: string }): JSX.Element {
  const { dispatch } = useApp()
  useRecurrentesAuto(!!result) // gastos recurrentes vencidos se cargan solos al abrir Inicio
  const s = result && (result.status === 'ok' || result.status === 'offline') ? result.summary : null
  const open = (): void => dispatch({ type: 'OPEN_TAB', pluginId: 'gastos' })
  if (!s) {
    return (
      <BentoCard className={className}>
        <CardTitle title="Gastos" sub={result?.status === 'not-configured' ? 'Sin conectar' : 'Resumen del mes'} status={!result ? 'Cargando…' : 'Sin datos'} tone="idle" />
        <div className="mt-auto pt-4"><Pill onClick={() => dispatch({ type: 'OPEN_TAB', pluginId: result?.status === 'not-configured' ? 'connections' : 'gastos' })}>{result?.status === 'not-configured' ? 'Conectar' : 'Abrir'}</Pill></div>
      </BentoCard>
    )
  }
  const pct = s.presupuesto ? s.total / s.presupuesto : null
  const over = pct !== null && pct > 1
  const diff = s.previousTotal > 0 ? (s.total - s.previousTotal) / s.previousTotal : null
  return (
    <BentoCard className={className} onClick={open}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <CardTitle title={`Gastos de ${(mesLong(s.mes).split(' ')[0] ?? '').toLowerCase()}`}
            sub={diff === null ? `Fijos ${fmtMoney(s.fijos)} · Variables ${fmtMoney(s.variables)}` : `${diff > 0 ? '+' : ''}${Math.round(diff * 100)}% vs. el mes pasado`}
            status={s.pendientesCount ? `${s.pendientesCount} sin pagar` : 'Al día'} tone={s.pendientesCount ? 'warn' : 'ok'} />
          <p className="mt-3 text-[26px] leading-[30px] font-bold tabular-nums text-on-surface"><CountUp value={s.total} format={fmtMoney} duration={0.9} /></p>
        </div>
        <BigRing pct={pct} value={pct === null ? '—' : `${Math.round(pct * 100)}%`} caption={pct === null ? 'sin tope' : 'del tope'} color={over ? '#f87171' : RING} />
      </div>
      {s.presupuesto
        ? <Meter label="Presupuesto" value={`${fmtMoney(Math.max(0, s.presupuesto - s.total))} libres`} pct={pct ?? 0} tone={over ? 'bad' : pct! > 0.9 ? 'warn' : 'ok'} />
        : <div className="mt-auto pt-4"><Pill onClick={open}>Abrir Gastos</Pill></div>}
    </BentoCard>
  )
}

export function ConexionesCard({ profiles, onTested, className = '' }: { profiles: SqlProfile[] | null; onTested: () => void; className?: string }): JSX.Element {
  const toast = useToast()
  const [testing, setTesting] = useState(false)
  const list = profiles ?? []
  const tested = list.filter((p) => p.lastTest)
  const ok = tested.filter((p) => p.lastTest!.ok).length
  const bad = tested.length - ok
  const testAll = async (): Promise<void> => {
    if (!list.length || testing) return
    setTesting(true)
    let fails = 0
    for (const p of list) {
      try { const r = await window.api.invoke<{ ok: boolean }>('sql:test', p.id); if (!r.ok) fails++ } catch { fails++ }
    }
    setTesting(false)
    onTested()
    toast.show(fails ? `${fails} de ${list.length} no responden` : `Las ${list.length} conexiones responden`, fails ? 'info' : 'success')
  }
  return (
    <BentoCard className={className}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <CardTitle title="Conexiones" sub={`${list.length} guardada${list.length === 1 ? '' : 's'}`}
            status={!list.length ? 'Ninguna' : bad ? `${bad} no ${bad === 1 ? 'responde' : 'responden'}` : !tested.length ? 'Sin probar' : tested.length === list.length ? 'Todas responden' : `${list.length - tested.length} sin probar`}
            tone={!list.length || !tested.length ? 'idle' : bad ? 'warn' : 'ok'} />
        </div>
        <BigRing pct={list.length ? ok / list.length : null} value={`${ok}/${list.length}`} caption="responden" color={bad ? '#fbbf24' : RING} />
      </div>
      <div className="mt-auto pt-4 flex items-center gap-2">
        <Pill onClick={() => void testAll()} title="Prueba todas las conexiones guardadas">{testing ? 'Probando…' : 'Probar todas'}</Pill>
      </div>
    </BentoCard>
  )
}

export function ConsultasCard({ history, className = '' }: { history: QueryHistoryEntry[]; className?: string }): JSX.Element {
  const { dispatch } = useApp()
  const days = 14
  const runs = useMemo(() => dailyCounts(history.map((h) => h.at), days), [history])
  const labels = useMemo(() => dayLabels(days), [])
  const today = runs[days - 1] ?? 0
  const week = runs.slice(-7).reduce((a, b) => a + b, 0)
  const errs = history.filter((h) => !h.ok && h.at >= startOfToday()).length
  return (
    <BentoCard className={className}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <CardTitle title="Consultas" sub="Ejecutadas por día · últimas 2 semanas" status={errs ? `${errs} con error hoy` : today ? 'Sin errores hoy' : 'Ninguna hoy'} tone={errs ? 'warn' : today ? 'ok' : 'idle'} />
        </div>
        <div className="flex items-center gap-4 t-caption text-on-surface-variant">
          <span><b className="text-[15px] text-on-surface tabular-nums"><CountUp value={today} format={String} /></b> hoy</span>
          <span><b className="text-[15px] text-on-surface tabular-nums"><CountUp value={week} format={String} /></b> en 7 días</span>
        </div>
      </div>
      <AreaChart values={runs} labels={labels} />
      <div className="pt-3"><Pill onClick={() => dispatch({ type: 'OPEN_TAB', pluginId: 'sql-runner' })}>Abrir Consultas</Pill></div>
    </BentoCard>
  )
}

export function AjustesCard({ className = '' }: { className?: string }): JSX.Element {
  const { state, dispatch } = useApp()
  const [motionPref, , setMotion] = useMotionPreference()
  const row = (label: string, checked: boolean, onChange: (v: boolean) => void): JSX.Element => (
    <label className="flex items-center justify-between gap-3 py-1.5 cursor-pointer">
      <span className="t-footnote text-on-surface">{label}</span>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </label>
  )
  return (
    <BentoCard className={className}>
      <CardTitle title="Ajustes rápidos" />
      <p className="t-section uppercase tracking-[0.08em] mt-3 mb-1">Apariencia</p>
      {row('Modo oscuro', state.theme === 'dark', (v) => dispatch({ type: 'SET_THEME', theme: v ? 'dark' : 'light' }))}
      {row('Animaciones', motionPref !== 'off', (v) => setMotion(v ? 'full' : 'off'))}
      <p className="t-section uppercase tracking-[0.08em] mt-2 mb-1">Ventana</p>
      {row('Barra lateral compacta', state.sidebarCollapsed, () => dispatch({ type: 'TOGGLE_SIDEBAR' }))}
      <button type="button" onClick={() => dispatch({ type: 'OPEN_TAB', pluginId: 'settings' })}
        className="bento-pill mt-auto w-full justify-center"><Settings2 size={13} /> Todos los ajustes <ChevronRight size={13} /></button>
    </BentoCard>
  )
}

