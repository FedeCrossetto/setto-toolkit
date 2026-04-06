import { useState, useEffect, useCallback, useId, useRef } from 'react'
import {
  Plus, Pencil, Trash2, Check, X, ChevronLeft, ChevronRight, Copy,
  ToggleLeft, ToggleRight, TrendingUp, TrendingDown, Minus,
  Flame, Zap, Droplets, Wifi, Landmark, Receipt, Tv, Radio,
  Smartphone, Globe, Building2, Car, ShieldCheck, Dumbbell,
  BookOpen, CreditCard, Wrench, Utensils, Music,
  Eye, EyeOff, Search, KeyRound, History, BarChart3, Wallet,
  RefreshCw, Loader2, Braces, FileCode2, Server, DatabaseZap, Table2, Cylinder, Package, Leaf,
  Layers, CodeXml, Sparkles,
  type LucideIcon,
} from 'lucide-react'
import type { Servicio, PagoMensual, Credencial, QueryItem } from './types'
import { buildHistoricoPagos, mergeHistoricoFaltante, mergePagosImport } from './historico-import'
import { useToast } from '../../core/components/Toast'
import { EmptyState } from '../../core/components/EmptyState'

// ── Icon registry ─────────────────────────────────────────────────────────────

const SERVICE_ICON_MAP: Record<string, LucideIcon> = {
  flame: Flame, zap: Zap, droplets: Droplets, wifi: Wifi,
  landmark: Landmark, receipt: Receipt, tv: Tv, radio: Radio,
  smartphone: Smartphone, globe: Globe, building2: Building2,
  car: Car, shield: ShieldCheck, dumbbell: Dumbbell, book: BookOpen,
  card: CreditCard, wrench: Wrench, food: Utensils, music: Music,
}
const ICON_OPTIONS = Object.keys(SERVICE_ICON_MAP)

function ServiceIcon({ icon, size = 15, className }: { icon: string; size?: number; className?: string }) {
  const Icon = SERVICE_ICON_MAP[icon]
  if (Icon) return <Icon size={size} className={className} />
  return <span style={{ fontSize: size, lineHeight: 1 }}>{icon}</span>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function randomId() { return Math.random().toString(36).slice(2, 10) }
function fmt(n: number) {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const MESES_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const MESES_LONG  = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function mesShort(mes: string) { return MESES_SHORT[parseInt(mes.split('-')[1]) - 1] }
function mesLabel(mes: string) {
  const [y, m] = mes.split('-')
  return `${MESES_SHORT[parseInt(m) - 1]} ${y}`
}
function monthsOfYear(year: number) {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
}
function availableYears(pagos: PagoMensual[]) {
  const cur = new Date().getFullYear()
  const years = new Set(pagos.map((p) => parseInt(p.mes.split('-')[0])))
  years.add(cur); years.add(cur - 1)
  return Array.from(years).sort((a, b) => b - a)
}
function prevMesStr(mes: string) {
  const d = new Date(parseInt(mes.split('-')[0]), parseInt(mes.split('-')[1]) - 1 - 1, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ── Currency ──────────────────────────────────────────────────────────────────

const CURRENCY_FLAGS: Record<string, string> = {
  ARS: '🇦🇷', USD: '🇺🇸', EUR: '🇪🇺', BRL: '🇧🇷', GBP: '🇬🇧',
}

function CurrencyFlag({ code = 'ARS' }: { code?: string }) {
  return (
    <span className="text-[11px] leading-none select-none" title={code}>
      {CURRENCY_FLAGS[code] ?? code}
    </span>
  )
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputCls = [
  'w-full bg-surface-container border border-outline-variant/30 rounded-lg',
  'px-3 py-1.5 text-sm text-on-surface placeholder:text-on-surface-variant/40',
  'outline-none focus:ring-1 focus:ring-primary/50 transition',
].join(' ')

const selectCls = inputCls

const btnPrimary = [
  'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium',
  'bg-primary text-on-primary rounded-lg hover:opacity-90 transition-all',
].join(' ')

const btnGhost = [
  'flex items-center gap-1.5 px-3 py-1.5 text-sm',
  'text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-lg transition-colors',
].join(' ')

const btnIcon = 'p-1.5 rounded-lg text-on-surface-variant/50 hover:text-on-surface hover:bg-surface-container transition-colors'

// ── SlidePanel ────────────────────────────────────────────────────────────────

function SlidePanel({ title, open, onClose, children }: {
  title: string; open: boolean; onClose: () => void; children: React.ReactNode
}) {
  return (
    <div className={[
      'absolute right-0 top-0 bottom-0 z-50 w-80 bg-surface border-l border-outline-variant/20',
      'flex flex-col shadow-2xl transition-transform duration-200',
      open ? 'translate-x-0' : 'translate-x-full',
    ].join(' ')}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/20 shrink-0">
        <span className="font-medium text-sm">{title}</span>
        <button onClick={onClose} className={btnIcon}><X size={15} /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">{children}</div>
    </div>
  )
}

// ── ServicioForm ──────────────────────────────────────────────────────────────

function ServicioForm({ initial, categorias, onSave, onCancel }: {
  initial?: Partial<Servicio>; categorias: string[]
  onSave: (s: Servicio) => void; onCancel: () => void
}) {
  const [nombre,    setNombre]    = useState(initial?.nombre ?? '')
  const [icon,      setIcon]      = useState(initial?.emoji ?? ICON_OPTIONS[0])
  const [cuenta,    setCuenta]    = useState(initial?.numeroCuenta ?? '')
  const [categoria, setCategoria] = useState(initial?.categoria ?? '')
  const [catCustom, setCatCustom] = useState('')
  const [activo,    setActivo]    = useState(initial?.activo ?? true)

  const allCats = Array.from(new Set([...categorias, 'Casa', 'Depto', 'Streaming', 'Impuesto', 'Otro']))

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) return
    const cat = categoria === '__new__' ? catCustom.trim() : categoria
    onSave({ id: initial?.id ?? randomId(), nombre: nombre.trim(), emoji: icon,
      numeroCuenta: cuenta.trim() || undefined, categoria: cat || 'Otro', activo, orden: initial?.orden ?? 999 })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-on-surface-variant">Nombre *</label>
        <input className={inputCls} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Edesur" autoFocus required />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-on-surface-variant">Icono</label>
        <div className="grid grid-cols-5 gap-1.5 p-2 bg-surface-container rounded-lg border border-outline-variant/20">
          {ICON_OPTIONS.map((key) => (
            <button key={key} type="button" onClick={() => setIcon(key)} title={key}
              className={['flex items-center justify-center p-2 rounded-lg transition-colors',
                icon === key ? 'bg-primary/15 text-primary ring-1 ring-primary/40'
                             : 'text-on-surface-variant/60 hover:bg-surface-container-high hover:text-on-surface',
              ].join(' ')}>
              <ServiceIcon icon={key} size={16} />
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-on-surface-variant">Nro. de cuenta / referencia</label>
        <input className={inputCls} value={cuenta} onChange={(e) => setCuenta(e.target.value)} placeholder="0001625984" />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-on-surface-variant">Categoría</label>
        <select className={selectCls} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="">— Seleccionar —</option>
          {allCats.map((c) => <option key={c} value={c}>{c}</option>)}
          <option value="__new__">+ Nueva…</option>
        </select>
        {categoria === '__new__' && (
          <input className={`${inputCls} mt-1`} value={catCustom}
            onChange={(e) => setCatCustom(e.target.value)} placeholder="Nueva categoría" autoFocus />
        )}
      </div>

      <button type="button" onClick={() => setActivo((v) => !v)}
        className="flex items-center gap-2 text-sm text-on-surface-variant hover:text-on-surface transition-colors">
        {activo ? <ToggleRight size={20} className="text-accent" /> : <ToggleLeft size={20} />}
        {activo ? 'Activo' : 'Inactivo'}
      </button>

      <div className="flex gap-2 pt-2 border-t border-outline-variant/20">
        <button type="submit" className={btnPrimary}><Check size={13} /> Guardar</button>
        <button type="button" onClick={onCancel} className={btnGhost}>Cancelar</button>
      </div>
    </form>
  )
}

// ── ServiceSelect ─────────────────────────────────────────────────────────────

function ServiceSelect({ servicios, value, onChange }: {
  servicios: Servicio[]; value: string; onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = servicios.find((s) => s.id === value)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`${selectCls} flex items-center gap-2 text-left cursor-pointer`}
      >
        {selected ? (
          <>
            <ServiceIcon icon={selected.emoji} size={14} className="text-on-surface-variant shrink-0" />
            <span className="flex-1 truncate">{selected.nombre} ({selected.categoria})</span>
          </>
        ) : (
          <span className="flex-1 text-on-surface-variant/40">— Seleccionar —</span>
        )}
        <ChevronRight size={13} className={`shrink-0 text-on-surface-variant/40 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-surface border border-outline-variant/30 rounded-lg shadow-xl max-h-56 overflow-y-auto">
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false) }}
            className="flex w-full items-center px-3 py-2 text-sm text-on-surface-variant/50 hover:bg-surface-container transition-colors"
          >
            — Seleccionar —
          </button>
          {servicios.filter((s) => s.activo).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => { onChange(s.id); setOpen(false) }}
              className={[
                'flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors',
                s.id === value ? 'bg-primary/10 text-primary' : 'text-on-surface hover:bg-surface-container',
              ].join(' ')}
            >
              <ServiceIcon icon={s.emoji} size={14} className="shrink-0" />
              <span className="flex-1 text-left">{s.nombre}</span>
              <span className="text-[10px] text-on-surface-variant/40">{s.categoria}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── PagoForm ──────────────────────────────────────────────────────────────────

function PagoForm({ servicios, initial, onSave, onCancel }: {
  servicios: Servicio[]; initial?: Partial<PagoMensual>
  onSave: (p: PagoMensual) => void; onCancel: () => void
}) {
  const now = new Date()
  const defMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [servicioId, setServicioId] = useState(initial?.servicioId ?? servicios.find((s) => s.activo)?.id ?? '')
  const [mes,   setMes]   = useState(initial?.mes ?? defMes)
  const [monto, setMonto] = useState(String(initial?.monto ?? ''))
  const [fecha, setFecha] = useState(initial?.fecha ?? '')

  function handleFechaChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 4)
    setFecha(digits.length <= 2 ? digits : `${digits.slice(0, 2)}/${digits.slice(2)}`)
  }
  const [metodo,setMetodo]= useState(initial?.metodoPago ?? 'MP')
  const [pagado,setPagado]= useState(initial?.pagado ?? true)
  const [notas, setNotas] = useState(initial?.notas ?? '')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const montoNum = parseFloat(monto.replace(',', '.'))
    if (!servicioId || isNaN(montoNum) || montoNum <= 0) return
    onSave({ id: initial?.id ?? randomId(), servicioId, mes, monto: montoNum,
      fecha: fecha || undefined, metodoPago: metodo || undefined, pagado, notas: notas || undefined })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-on-surface-variant">Servicio *</label>
        <ServiceSelect servicios={servicios} value={servicioId} onChange={setServicioId} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-on-surface-variant">Mes *</label>
          <input type="month" className={inputCls} value={mes} onChange={(e) => setMes(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-on-surface-variant">Monto $</label>
          <input className={inputCls} value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="28321.17" required />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-on-surface-variant">Fecha pago</label>
          <input className={inputCls} value={fecha} onChange={handleFechaChange} placeholder="DD/MM" maxLength={5} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-on-surface-variant">Método</label>
          <select className={selectCls} value={metodo} onChange={(e) => setMetodo(e.target.value)}>
            {['MP','HB','Deb. aut','Suc. virtual','Efectivo','Otro'].map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-on-surface-variant">Notas</label>
        <input className={inputCls} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Observaciones opcionales" />
      </div>
      <button type="button" onClick={() => setPagado((v) => !v)}
        className="flex items-center gap-2 text-sm text-on-surface-variant hover:text-on-surface transition-colors">
        {pagado ? <ToggleRight size={20} className="text-green-400" /> : <ToggleLeft size={20} />}
        {pagado ? 'Pagado' : 'Pendiente'}
      </button>
      <div className="flex gap-2 pt-2 border-t border-outline-variant/20">
        <button type="submit" className={btnPrimary}><Check size={13} /> Guardar</button>
        <button type="button" onClick={onCancel} className={btnGhost}>Cancelar</button>
      </div>
    </form>
  )
}

// ── Dashboard components ──────────────────────────────────────────────────────

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return null
  const pos = delta >= 0
  const Icon = Math.abs(delta) < 0.1 ? Minus : pos ? TrendingUp : TrendingDown
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${
      pos ? 'text-emerald-400' : 'text-rose-400'
    }`}>
      <Icon size={9} strokeWidth={2.5} />
      {pos ? '+' : ''}{delta.toFixed(1)}%
    </span>
  )
}

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null
  const W = 68, H = 26, pad = 2
  const max = Math.max(...data, 1)
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (W - pad * 2)
    const y = H - pad - (v / max) * (H - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0 opacity-60">
      <polyline points={pts} fill="none" stroke="rgb(var(--c-primary))" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function KpiCard({ label, value, sub, delta, sparkData }: {
  label: string; value: string; sub?: string; delta?: number | null; sparkData?: number[]
}) {
  return (
    <div className="rounded-xl border border-outline-variant/15 bg-surface-container px-4 pt-3.5 pb-3 flex flex-col gap-0">
      <div className="mb-2 flex min-h-[26px] items-center justify-between gap-2">
        <span className="text-[11px] text-on-surface-variant/55 font-medium leading-none">{label}</span>
        {sparkData && sparkData.length >= 2 ? (
          <Sparkline data={sparkData} />
        ) : (
          <span className="h-[26px] w-[68px] shrink-0" aria-hidden />
        )}
      </div>
      <span className="text-[26px] font-bold text-on-surface tabular-nums tracking-tight leading-none">{value}</span>
      <div className="flex items-center gap-2 mt-2 min-h-[14px]">
        {delta !== undefined && delta !== null && <DeltaBadge delta={delta} />}
        {sub && <span className="text-[10px] text-on-surface-variant/40 truncate">{sub}</span>}
      </div>
    </div>
  )
}

/** Hex fills for SVG donut / legend (categorías) */
const CAT_HEX: Record<string, string> = {
  Casa: '#38bdf8', Depto: '#a78bfa', Streaming: '#fb7185',
  Impuesto: '#fbbf24', Otro: '#94a3b8',
}
const DONUT_FALLBACK = ['#0ea5e9', '#2563eb', '#06b6d4', '#6366f1', '#3b82f6']

function donutSegmentPath(
  cx: number, cy: number, rOuter: number, rInner: number, a0: number, a1: number,
) {
  const large = a1 - a0 > Math.PI ? 1 : 0
  const x0o = cx + rOuter * Math.cos(a0)
  const y0o = cy + rOuter * Math.sin(a0)
  const x1o = cx + rOuter * Math.cos(a1)
  const y1o = cy + rOuter * Math.sin(a1)
  const x0i = cx + rInner * Math.cos(a1)
  const y0i = cy + rInner * Math.sin(a1)
  const x1i = cx + rInner * Math.cos(a0)
  const y1i = cy + rInner * Math.sin(a0)
  return [
    `M ${x0o} ${y0o}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${x1o} ${y1o}`,
    `L ${x0i} ${y0i}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${x1i} ${y1i}`,
    'Z',
  ].join(' ')
}

function CategoryDonutCard({ servicios, pagos, year }: {
  servicios: Servicio[]; pagos: PagoMensual[]; year: number
}) {
  const activoIds = new Set(servicios.filter((s) => s.activo).map((s) => s.id))
  const pagosAnio = pagos.filter((p) => activoIds.has(p.servicioId) && p.mes.startsWith(`${year}-`))
  const cats = Array.from(new Set(servicios.filter((s) => s.activo).map((s) => s.categoria)))

  const rows = cats.map((cat) => {
    const svcIds = new Set(servicios.filter((s) => s.activo && s.categoria === cat).map((s) => s.id))
    const total = pagosAnio.filter((p) => svcIds.has(p.servicioId)).reduce((sum, p) => sum + p.monto, 0)
    return { cat, total }
  }).filter((c) => c.total > 0).sort((a, b) => b.total - a.total)

  const sum = rows.reduce((s, r) => s + r.total, 0)
  const top = rows[0]
  const topPct = sum > 0 && top ? Math.round((top.total / sum) * 100) : 0

  const cx = 100, cy = 100, rO = 78, rI = 48
  let angle = -Math.PI / 2
  const paths: { d: string; fill: string; key: string }[] = []
  rows.forEach((r, i) => {
    const sweep = (r.total / sum) * Math.PI * 2
    const a0 = angle
    const a1 = angle + sweep
    const fill = CAT_HEX[r.cat] ?? DONUT_FALLBACK[i % DONUT_FALLBACK.length]
    paths.push({ d: donutSegmentPath(cx, cy, rO, rI, a0, a1), fill, key: r.cat })
    angle = a1
  })

  return (
    <div className="flex min-h-[260px] flex-col overflow-hidden rounded-xl border border-outline-variant/15 bg-surface-container shadow-sm">
      <div className="flex shrink-0 items-center justify-between border-b border-outline-variant/10 px-4 py-3">
        <span className="text-sm font-semibold text-on-surface">Por categoría</span>
        <span className="rounded-full border border-outline-variant/15 px-2 py-0.5 text-[10px] font-medium tabular-nums text-on-surface-variant/40">
          {year}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4 py-4">
        {rows.length === 0 || sum <= 0 ? (
          <span className="text-xs text-on-surface-variant/40">Sin datos</span>
        ) : (
          <>
            <div className="relative h-[168px] w-[168px] shrink-0">
              <svg viewBox="0 0 200 200" className="h-full w-full drop-shadow-sm">
                <g className="origin-center transition-transform hover:scale-[1.02]">
                  {paths.map((p) => (
                    <path key={p.key} d={p.d} fill={p.fill} className="stroke-surface-container" strokeWidth={2} strokeLinejoin="round" />
                  ))}
                </g>
              </svg>
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-1">
                <div className="flex max-w-[min(112px,90%)] flex-col items-center justify-center text-center leading-none">
                  <span className="text-[20px] font-bold tabular-nums tracking-tight text-on-surface">
                    {topPct}%
                  </span>
                  <span className="mt-1 max-w-full truncate text-[10px] font-medium leading-tight text-on-surface-variant/55" title={top?.cat}>
                    {top?.cat ?? '—'}
                  </span>
                  <span className="mt-0.5 text-[9px] leading-tight text-on-surface-variant/38">mayor rubro</span>
                </div>
              </div>
            </div>
            <div className="flex w-full flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-outline-variant/10 pt-3">
              {rows.map((r, i) => (
                <div key={r.cat} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: CAT_HEX[r.cat] ?? DONUT_FALLBACK[i % DONUT_FALLBACK.length] }} />
                  <span className="text-[11px] text-on-surface-variant/70">{r.cat}</span>
                  <span className="text-[10px] font-mono tabular-nums text-on-surface-variant/45">
                    {sum > 0 ? `${Math.round((r.total / sum) * 100)}%` : '0%'}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const TRAFFIC_BAR_TONES = [
  'from-sky-500/90 to-sky-400/50',
  'from-blue-600/85 to-blue-500/45',
  'from-cyan-500/80 to-cyan-400/45',
  'from-indigo-500/85 to-indigo-400/50',
  'from-primary/80 to-primary/40',
  'from-sky-600/75 to-violet-400/40',
]

function TopServicesTrafficCard({ servicios, pagos, year }: {
  servicios: Servicio[]; pagos: PagoMensual[]; year: number
}) {
  const activoIds = new Set(servicios.filter((s) => s.activo).map((s) => s.id))
  const top = servicios
    .filter((s) => s.activo)
    .map((s) => ({
      svc: s,
      total: pagos.filter((p) => activoIds.has(p.servicioId) && p.mes.startsWith(`${year}-`) && p.servicioId === s.id)
        .reduce((sum, p) => sum + p.monto, 0),
    }))
    .filter((s) => s.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 6)

  const max = Math.max(...top.map((s) => s.total), 1)

  return (
    <div className="flex min-h-[260px] flex-1 flex-col overflow-hidden rounded-xl border border-outline-variant/15 bg-surface-container shadow-sm">
      <div className="flex shrink-0 items-center justify-between border-b border-outline-variant/10 px-4 py-3">
        <span className="text-sm font-semibold text-on-surface">Top gastos por servicio</span>
        <span className="rounded-full border border-outline-variant/15 px-2 py-0.5 text-[10px] tabular-nums text-on-surface-variant/40">
          {year}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-3.5 overflow-y-auto px-4 py-4">
        {top.length === 0 ? (
          <span className="text-center text-xs text-on-surface-variant/40">Sin datos</span>
        ) : (
          top.map(({ svc, total }, i) => (
            <div key={svc.id} className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surface shadow-sm">
                <ServiceIcon icon={svc.emoji} size={14} className="text-on-surface-variant/65" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <span className="truncate text-[12px] font-medium text-on-surface/90">{svc.nombre}</span>
                  <span className="shrink-0 font-mono text-[11px] tabular-nums font-semibold text-on-surface-variant/70">
                    ${fmt(total)}
                  </span>
                </div>
                <div className="h-[5px] overflow-hidden rounded-full bg-surface">
                  <div
                    className={['h-full rounded-full bg-gradient-to-r transition-all duration-500', TRAFFIC_BAR_TONES[i % TRAFFIC_BAR_TONES.length]].join(' ')}
                    style={{ width: `${(total / max) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function PendingBadge({ pagos, servicios }: { pagos: PagoMensual[]; servicios: Servicio[] }) {
  const activoIds = new Set(servicios.filter((s) => s.activo).map((s) => s.id))
  const pending = pagos.filter((p) => activoIds.has(p.servicioId) && !p.pagado).length
  if (pending === 0) return null
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20">
      {pending} pendiente{pending > 1 ? 's' : ''}
    </span>
  )
}

function MonthlyAreaChart({ months, totals, highlightMes, selectedMes, onSelectMes }: {
  months: string[]
  totals: Record<string, number>
  highlightMes: string | null
  selectedMes: string | null
  onSelectMes: (mes: string) => void
}) {
  const gid  = useId().replace(/:/g, '')
  const [hovered, setHovered] = useState<string | null>(null)

  const values = months.map((m) => totals[m] ?? 0)
  const maxVal = Math.max(...values, 1)

  // SVG coordinate space — preserveAspectRatio="none" fills container exactly
  const W = 1000, H = 100, padTop = 10, padBot = 2
  const chartH = H - padTop - padBot

  const pts = months.map((m, i) => ({
    m,
    x: (i / (months.length - 1)) * W,
    y: padTop + chartH - ((totals[m] ?? 0) / maxVal) * chartH,
  }))

  // Smooth cubic bezier through points
  function linePath(pts: { x: number; y: number }[]) {
    if (pts.length < 2) return ''
    let d = `M ${pts[0].x} ${pts[0].y}`
    for (let i = 1; i < pts.length; i++) {
      const cp = (pts[i - 1].x + pts[i].x) / 2
      d += ` C ${cp} ${pts[i - 1].y} ${cp} ${pts[i].y} ${pts[i].x} ${pts[i].y}`
    }
    return d
  }

  const line  = linePath(pts)
  const area  = `${line} L ${pts[pts.length - 1].x} ${H} L ${pts[0].x} ${H} Z`
  const active = hovered ?? selectedMes
  const activePt = pts.find((p) => p.m === active)

  return (
    <div className="flex h-full w-full flex-col">
      {/* SVG fills remaining height — no aspect-ratio constraint */}
      <div className="relative min-h-0 flex-1">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full">
          <defs>
            <linearGradient id={`ag-${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="rgb(var(--c-primary))" stopOpacity={0.22} />
              <stop offset="100%" stopColor="rgb(var(--c-primary))" stopOpacity={0.02} />
            </linearGradient>
          </defs>

          {/* Vertical highlight for active month */}
          {activePt && (
            <rect x={activePt.x - W / months.length / 2} y={0}
              width={W / months.length} height={H}
              fill="rgb(var(--c-primary))" fillOpacity={0.06} />
          )}

          {/* Area fill */}
          <path d={area} fill={`url(#ag-${gid})`} />

          {/* Line */}
          <path d={line} fill="none" stroke="rgb(var(--c-primary))"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

          {/* Dots — only active/highlight or all non-zero */}
          {pts.map((pt) => {
            const isActive = pt.m === active || pt.m === highlightMes
            if (!isActive && (totals[pt.m] ?? 0) === 0) return null
            return (
              <circle key={pt.m} cx={pt.x} cy={pt.y} r={isActive ? 6 : 3.5}
                fill={isActive ? 'rgb(var(--c-primary))' : 'rgb(var(--c-surface-container))'}
                stroke="rgb(var(--c-primary))" strokeWidth="2.2" />
            )
          })}

          {/* Click zones (transparent slots per month) */}
          {months.map((m, i) => {
            const slotW = W / months.length
            return (
              <rect key={m} x={i * slotW} y={0} width={slotW} height={H}
                fill="transparent" style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHovered(m)}
                onMouseLeave={() => setHovered(null)}
                onClick={(e) => { e.stopPropagation(); onSelectMes(m) }} />
            )
          })}
        </svg>

        {/* Tooltip — HTML positioned by percentage to avoid SVG text distortion */}
        {activePt && (totals[active!] ?? 0) > 0 && (
          <div className="pointer-events-none absolute top-1.5 z-10 -translate-x-1/2
            rounded-lg bg-surface-container-highest px-2 py-1 text-[11px] font-semibold
            text-on-surface shadow-sm whitespace-nowrap"
            style={{ left: `${(pts.indexOf(activePt) / (months.length - 1)) * 100}%` }}>
            ${fmt(totals[active!] ?? 0)}
          </div>
        )}
      </div>

      {/* Month labels — HTML row, no SVG text distortion */}
      <div className="flex shrink-0 pt-1">
        {months.map((m) => {
          const isActive = m === active || m === highlightMes
          return (
            <span key={m}
              className={[
                'cursor-pointer select-none text-center text-[10px] transition-colors',
                isActive ? 'font-semibold text-primary' : 'text-on-surface-variant/45',
              ].join(' ')}
              style={{ width: `${100 / months.length}%` }}
              onMouseEnter={() => setHovered(m)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onSelectMes(m)}>
              {mesShort(m)}
            </span>
          )
        })}
      </div>
    </div>
  )
}

function RecentPayments({ servicios, pagos, onEdit, mesDetalle }: {
  servicios: Servicio[]
  pagos: PagoMensual[]
  onEdit: (p: PagoMensual) => void
  /** Si se indica, lista todos los pagos de ese mes (YYYY-MM) en lugar de los últimos globales. */
  mesDetalle: string | null
}) {
  const svcMap = new Map(servicios.map((s) => [s.id, s]))
  const activo = new Set(servicios.filter((s) => s.activo).map((s) => s.id))

  const filtrados = [...pagos].filter((p) => activo.has(p.servicioId))

  const list = mesDetalle
    ? filtrados
        .filter((p) => p.mes === mesDetalle)
        .sort((a, b) => b.monto - a.monto)
    : filtrados
        .sort((a, b) => b.mes.localeCompare(a.mes))
        .slice(0, 8)

  const totalDetalle = mesDetalle ? list.reduce((s, p) => s + p.monto, 0) : 0

  if (list.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-xs text-on-surface-variant/40">
        <Receipt size={24} />
        <span>{mesDetalle ? 'Sin pagos este mes' : 'Sin registros'}</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <div className="divide-y divide-outline-variant/10">
        {list.map((p) => {
          const svc = svcMap.get(p.servicioId)
          return (
            <div key={p.id}
              className="flex cursor-default items-center gap-3 px-4 py-2.5 transition-colors group hover:bg-surface-container/50"
              onDoubleClick={() => onEdit(p)}>
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-container-high text-on-surface-variant/70">
                <ServiceIcon icon={svc?.emoji ?? 'receipt'} size={13} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-on-surface">{svc?.nombre ?? p.servicioId}</div>
                {!mesDetalle && (
                  <div className="text-[10px] text-on-surface-variant/50">{mesLabel(p.mes)}</div>
                )}
                {mesDetalle && svc?.categoria && (
                  <div className="text-[10px] text-on-surface-variant/45">{svc.categoria}</div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <CurrencyFlag />
                <span className={`font-mono text-xs tabular-nums font-semibold ${p.pagado ? 'text-on-surface' : 'text-yellow-400'}`}>
                  ${fmt(p.monto)}
                </span>
              </div>
            </div>
          )
        })}
      </div>
      {mesDetalle && list.length > 0 && (
        <div className="mt-auto border-t border-outline-variant/15 px-4 py-2.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-on-surface-variant">Total del mes</span>
            <span className="font-mono font-semibold tabular-nums text-accent">${fmt(totalDetalle)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Dashboard View ────────────────────────────────────────────────────────────

function DashboardView({ servicios, pagos, year, onEditPago, onDeletePago }: {
  servicios: Servicio[]; pagos: PagoMensual[]; year: number
  onEditPago: (p: PagoMensual) => void; onDeletePago: (id: string) => void
}) {
  const activoIds = new Set(servicios.filter((s) => s.activo).map((s) => s.id))
  const pagosReales = pagos.filter((p) => activoIds.has(p.servicioId))

  const months = monthsOfYear(year)
  const totalesMes = Object.fromEntries(
    months.map((mes) => [mes, pagosReales.filter((p) => p.mes === mes).reduce((s, p) => s + p.monto, 0)]),
  )
  const totalAnual = Object.values(totalesMes).reduce((a, b) => a + b, 0)
  const sparkAnual = months.map((m) => totalesMes[m] ?? 0)

  const now = new Date()
  const curMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const prev = prevMesStr(curMes)
  const curTotal  = pagosReales.filter((p) => p.mes === curMes).reduce((s, p) => s + p.monto, 0)
  const prevTotal = pagosReales.filter((p) => p.mes === prev).reduce((s, p) => s + p.monto, 0)
  const delta = prevTotal > 0 ? ((curTotal - prevTotal) / prevTotal) * 100 : null

  // Spark for current month: last 6 months
  const last6 = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1)
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    return pagosReales.filter((p) => p.mes === m).reduce((s, p) => s + p.monto, 0)
  })

  const svcTotals = servicios
    .filter((s) => s.activo)
    .map((s) => ({
      svc: s,
      total: pagosReales.filter((p) => p.mes.startsWith(`${year}-`) && p.servicioId === s.id).reduce((sum, p) => sum + p.monto, 0),
      monthly: months.map((m) => pagosReales.filter((p) => p.mes === m && p.servicioId === s.id).reduce((sum, p) => sum + p.monto, 0)),
    }))
    .sort((a, b) => b.total - a.total)
  const topSvc = svcTotals[0]

  const mismoAnioQueCalendario = year === now.getFullYear()
  const highlightMes = mismoAnioQueCalendario ? curMes : null

  const [mesDetalle, setMesDetalle] = useState<string | null>(null)
  useEffect(() => { setMesDetalle(null) }, [year])
  const handleSelectMes = useCallback((mes: string) => {
    setMesDetalle((prev) => (prev === mes ? null : mes))
  }, [])

  if (servicios.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          icon={Receipt}
          title="No tenés servicios cargados"
          description="Agregá tu primer servicio desde la pestaña Servicios para empezar a registrar gastos."
        />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden p-4">

      {/* KPI row — 5 cards */}
      {(() => {
        const mesesConDatos = months.filter((m) => (totalesMes[m] ?? 0) > 0).length
        const promedio = mesesConDatos > 0 ? totalAnual / mesesConDatos : 0
        const pendientes = pagosReales.filter((p) => !p.pagado && p.mes.startsWith(`${year}-`))
        const totalPendiente = pendientes.reduce((s, p) => s + p.monto, 0)
        return (
          <div className="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <KpiCard
              label="Total anual"
              value={`$${fmt(totalAnual)}`}
              sub={`${year} · activos`}
              sparkData={sparkAnual}
            />
            <KpiCard
              label="Mes actual"
              value={`$${fmt(curTotal)}`}
              sub="vs mes anterior"
              delta={delta}
              sparkData={last6}
            />
            <KpiCard
              label="Promedio mensual"
              value={`$${fmt(promedio)}`}
              sub={`${mesesConDatos} meses con datos`}
            />
            <KpiCard
              label="Servicio top"
              value={topSvc && topSvc.total > 0 ? `$${fmt(topSvc.total)}` : '—'}
              sub={topSvc?.svc.nombre ?? 'Sin datos'}
              sparkData={topSvc?.monthly}
            />
            <KpiCard
              label="Pendientes"
              value={pendientes.length > 0 ? `$${fmt(totalPendiente)}` : '—'}
              sub={pendientes.length > 0 ? `${pendientes.length} pago${pendientes.length > 1 ? 's' : ''}` : 'Todo pagado'}
            />
          </div>
        )
      })()}

      {/* Donut por categoría | Top servicios (mismo ancho que fila KPI) */}
      <div className="grid shrink-0 grid-cols-1 gap-3 lg:grid-cols-2">
        <CategoryDonutCard servicios={servicios} pagos={pagos} year={year} />
        <TopServicesTrafficCard servicios={servicios} pagos={pagos} year={year} />
      </div>

      {/* Resumen mensual (izq.) | Historial (der.) */}
      <div className="flex min-h-[13rem] flex-col gap-3 lg:flex-row lg:items-stretch">

        {/* Chart card — direct flex child so items-stretch aligns it with history panel */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-outline-variant/15 bg-surface-container">
          <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 border-b border-outline-variant/10">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-on-surface">Resumen mensual</span>
              <PendingBadge pagos={pagos} servicios={servicios} />
            </div>
            <span className="text-[10px] font-medium tabular-nums text-on-surface-variant/40 border border-outline-variant/15 rounded-full px-2 py-0.5">
              {year}
            </span>
          </div>
          <div className="relative flex min-h-0 flex-1 flex-col px-3 pb-3 pt-2">
            <MonthlyAreaChart
              months={months} totals={totalesMes}
              highlightMes={highlightMes} selectedMes={mesDetalle}
              onSelectMes={handleSelectMes}
            />
          </div>
        </div>

        {/* Panel historial — lista scrolleable */}
        <div className="flex min-h-[13rem] min-w-0 flex-col overflow-hidden rounded-xl border border-outline-variant/15 bg-surface-container lg:h-auto lg:max-h-none lg:w-[260px] lg:shrink-0 lg:flex-none">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-outline-variant/10 px-4 py-3">
            <span className="text-sm font-semibold text-on-surface">
              {mesDetalle ? mesLabel(mesDetalle) : 'Últimos pagos'}
            </span>
            {mesDetalle && (
              <button type="button" onClick={() => setMesDetalle(null)}
                className="text-[10px] text-on-surface-variant/50 hover:text-on-surface transition-colors">
                ← Recientes
              </button>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <RecentPayments servicios={servicios} pagos={pagos} onEdit={onEditPago} mesDetalle={mesDetalle} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Servicios View ────────────────────────────────────────────────────────────

function ServiciosView({ servicios, onEdit, onDelete, onToggle }: {
  servicios: Servicio[]
  onEdit: (s: Servicio) => void
  onDelete: (id: string) => void
  onToggle: (s: Servicio) => void
}) {
  const cats = Array.from(new Set(servicios.map((s) => s.categoria)))

  return (
    <div className="p-4 overflow-auto h-full">
      {cats.map((cat) => (
        <div key={cat} className="mb-6">
          <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 mb-3 px-1">
            {cat}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {servicios.filter((s) => s.categoria === cat).map((svc) => (
              <div key={svc.id} className={`group relative bg-surface-container rounded-xl p-3.5 border transition-all ${
                svc.activo
                  ? 'border-outline-variant/15 hover:border-primary/25'
                  : 'border-outline-variant/10 opacity-50'
              }`}>
                {/* Icon */}
                <div className="w-9 h-9 rounded-xl bg-surface-container-high flex items-center justify-center mb-2.5 text-on-surface-variant/70">
                  <ServiceIcon icon={svc.emoji} size={18} />
                </div>
                {/* Name */}
                <div className="text-sm font-semibold text-on-surface leading-tight">{svc.nombre}</div>
                {/* Account */}
                {svc.numeroCuenta && (
                  <div className="text-[10px] text-on-surface-variant/50 mt-0.5 truncate">{svc.numeroCuenta}</div>
                )}
                {/* Active badge */}
                <div className={`mt-2 inline-flex text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${
                  svc.activo ? 'bg-green-400/10 text-green-400' : 'bg-surface-container-high text-on-surface-variant/40'
                }`}>
                  {svc.activo ? 'Activo' : 'Inactivo'}
                </div>
                {/* Actions — hover */}
                <div className="absolute top-2 right-2 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => onToggle(svc)} title={svc.activo ? 'Desactivar' : 'Activar'}
                    className="p-1 rounded-md hover:bg-surface-container-high text-on-surface-variant/50 hover:text-accent transition-colors">
                    {svc.activo ? <ToggleRight size={12} /> : <ToggleLeft size={12} />}
                  </button>
                  <button onClick={() => onEdit(svc)}
                    className="p-1 rounded-md hover:bg-surface-container-high text-on-surface-variant/50 hover:text-on-surface transition-colors">
                    <Pencil size={12} />
                  </button>
                  <button onClick={() => onDelete(svc.id)}
                    className="p-1 rounded-md hover:bg-error/10 text-on-surface-variant/50 hover:text-error transition-colors">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Tabla View ────────────────────────────────────────────────────────────────

function TablaGastos({ servicios, pagos, year, onEditPago, onDeletePago }: {
  servicios: Servicio[]; pagos: PagoMensual[]; year: number
  onEditPago: (p: PagoMensual) => void; onDeletePago: (id: string) => void
}) {
  const months  = monthsOfYear(year)
  const activos = servicios.filter((s) => s.activo).sort((a, b) => a.orden - b.orden)
  const cats    = Array.from(new Set(activos.map((s) => s.categoria)))

  const idx = new Map<string, PagoMensual>()
  for (const p of pagos) idx.set(`${p.servicioId}::${p.mes}`, p)

  const totalesMes = Object.fromEntries(
    months.map((mes) => [mes, activos.reduce((sum, s) => sum + (idx.get(`${s.id}::${mes}`)?.monto ?? 0), 0)])
  )
  const totalAnual = Object.values(totalesMes).reduce((a, b) => a + b, 0)

  const [hover, setHover]   = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function buildMd() {
    const h = `| Servicio | ${months.map(mesShort).join(' | ')} | TOTAL |`
    const sep = `| --- | ${months.map(() => '---').join(' | ')} | --- |`
    const rows: string[] = []
    for (const cat of cats) {
      rows.push(`| **${cat}** | ${months.map(() => '').join(' | ')} | |`)
      for (const s of activos.filter((sv) => sv.categoria === cat)) {
        let tot = 0
        const cells = months.map((m) => { const p = idx.get(`${s.id}::${m}`); if (p) tot += p.monto; return p ? `$${fmt(p.monto)}` : '-' })
        rows.push(`| ${s.nombre} | ${cells.join(' | ')} | $${fmt(tot)} |`)
      }
    }
    const tc = months.map((m) => totalesMes[m] > 0 ? `**$${fmt(totalesMes[m])}**` : '-')
    rows.push(`| **TOTAL** | ${tc.join(' | ')} | **$${fmt(totalAnual)}** |`)
    return `## Gastos ${year}\n\n${h}\n${sep}\n${rows.join('\n')}`
  }

  function copyMd() {
    navigator.clipboard.writeText(buildMd())
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-3">
      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-outline-variant/20">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-surface-container/60">
              <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide sticky left-0 bg-surface-container/60 min-w-[168px] whitespace-nowrap">
                Servicio
              </th>
              {months.map((m) => (
                <th key={m} className="text-right px-2.5 py-2.5 text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide whitespace-nowrap min-w-[84px]">
                  {mesShort(m)}
                </th>
              ))}
              <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide whitespace-nowrap min-w-[100px]">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {cats.map((cat) => (
              <>
                <tr key={`hdr-${cat}`}>
                  <td colSpan={months.length + 2}
                    className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 bg-surface-container/30 sticky left-0">
                    {cat}
                  </td>
                </tr>
                {activos.filter((s) => s.categoria === cat).map((svc) => {
                  let totalSvc = 0
                  return (
                    <tr key={svc.id} className="border-t border-outline-variant/10 hover:bg-surface-container/30 transition-colors">
                      <td className="px-3 py-2 sticky left-0 bg-surface whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="flex items-center justify-center text-on-surface-variant/70">
                            <ServiceIcon icon={svc.emoji} size={14} />
                          </span>
                          <div>
                            <div className="text-xs font-medium text-on-surface">{svc.nombre}</div>
                            {svc.numeroCuenta && (
                              <div className="text-[10px] text-on-surface-variant/50">{svc.numeroCuenta}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      {months.map((mes) => {
                        const p = idx.get(`${svc.id}::${mes}`)
                        if (p) totalSvc += p.monto
                        const k = `${svc.id}::${mes}`
                        return (
                          <td key={mes} className="px-2 py-2 text-right"
                            onMouseEnter={() => setHover(k)} onMouseLeave={() => setHover(null)}>
                            {p ? (
                              <div className="flex items-center justify-end gap-1">
                                {hover === k && (
                                  <div className="flex gap-0.5">
                                    <button onClick={() => onEditPago(p)} className="p-0.5 rounded hover:bg-surface-container text-on-surface-variant/40 hover:text-on-surface transition-colors">
                                      <Pencil size={10} />
                                    </button>
                                    <button onClick={() => onDeletePago(p.id)} className="p-0.5 rounded hover:bg-error/10 text-on-surface-variant/40 hover:text-error transition-colors">
                                      <X size={10} />
                                    </button>
                                  </div>
                                )}
                                <span className={`text-xs font-mono tabular-nums ${p.pagado ? 'text-on-surface' : 'text-yellow-400'}`}
                                  title={[p.fecha, p.metodoPago, p.notas].filter(Boolean).join(' · ')}>
                                  ${fmt(p.monto)}
                                </span>
                              </div>
                            ) : (
                              <span className="text-on-surface-variant/20 text-xs">—</span>
                            )}
                          </td>
                        )
                      })}
                      <td className="px-3 py-2 text-right">
                        <span className="text-xs font-semibold font-mono text-accent tabular-nums">
                          {totalSvc > 0 ? `$${fmt(totalSvc)}` : '—'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </>
            ))}
            <tr className="border-t-2 border-outline-variant/30">
              <td className="px-3 py-2.5 text-xs font-bold text-on-surface uppercase tracking-wide sticky left-0 bg-surface">Total</td>
              {months.map((mes) => (
                <td key={mes} className="px-2 py-2.5 text-right">
                  {totalesMes[mes] > 0
                    ? <span className="text-xs font-semibold font-mono tabular-nums text-on-surface">${fmt(totalesMes[mes])}</span>
                    : <span className="text-on-surface-variant/20 text-xs">—</span>}
                </td>
              ))}
              <td className="px-3 py-2.5 text-right">
                <span className="text-sm font-bold font-mono text-accent tabular-nums">${fmt(totalAnual)}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <button onClick={copyMd}
          className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-colors ${
            copied ? 'text-green-400 bg-green-400/10' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
          }`}>
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copiado' : 'Copiar como Markdown'}
        </button>
      </div>
    </div>
  )
}

// ── CredencialForm ────────────────────────────────────────────────────────────

function CredencialForm({ initial, onSave, onCancel }: {
  initial?: Partial<Credencial>; onSave: (c: Credencial) => void; onCancel: () => void
}) {
  const [nombre,    setNombre]    = useState(initial?.nombre    ?? '')
  const [usuario,   setUsuario]   = useState(initial?.usuario   ?? '')
  const [password,  setPassword]  = useState(initial?.password  ?? '')
  const [url,       setUrl]       = useState(initial?.url       ?? '')
  const [notas,     setNotas]     = useState(initial?.notas     ?? '')
  const [categoria, setCategoria] = useState(initial?.categoria ?? 'Trabajo')
  const [showPass,  setShowPass]  = useState(false)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) return
    onSave({ id: initial?.id ?? randomId(), nombre: nombre.trim(), usuario: usuario.trim(),
      password, url: url.trim() || undefined, notas: notas.trim() || undefined,
      categoria: categoria.trim() || undefined, orden: initial?.orden ?? 999 })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-on-surface-variant">Nombre *</label>
        <input className={inputCls} value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus required />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-on-surface-variant">Usuario / Email</label>
        <input className={inputCls} value={usuario} onChange={(e) => setUsuario(e.target.value)} placeholder="usuario@dominio.com" />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-on-surface-variant">Contraseña</label>
        <div className="relative">
          <input className={`${inputCls} pr-8`} type={showPass ? 'text' : 'password'}
            value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="button" onClick={() => setShowPass((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant/50 hover:text-on-surface transition-colors">
            {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-on-surface-variant">URL</label>
        <input className={inputCls} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-on-surface-variant">Categoría</label>
        <input className={inputCls} value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Trabajo, Personal…" />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-on-surface-variant">Notas</label>
        <textarea className={`${inputCls} resize-none`} rows={3} value={notas}
          onChange={(e) => setNotas(e.target.value)} placeholder="Información adicional, account IDs…" />
      </div>
      <div className="flex gap-2 pt-2 border-t border-outline-variant/20">
        <button type="submit" className={btnPrimary}><Check size={13} /> Guardar</button>
        <button type="button" onClick={onCancel} className={btnGhost}>Cancelar</button>
      </div>
    </form>
  )
}

// ── CredencialesView ──────────────────────────────────────────────────────────

/** Fila compacta a lo ancho: celdas en una sola línea (altura mínima). */
function CredencialRow({ c, isRevealed, copied, onReveal, onCopy, onEdit, onDelete }: {
  c: Credencial
  isRevealed: boolean
  copied: string | null
  onReveal: (id: string) => void
  onCopy: (text: string, key: string) => void
  onEdit: (c: Credencial) => void
  onDelete: (id: string) => void
}) {
  return (
    <tr className="group border-b border-outline-variant/10 transition-colors hover:bg-surface-container-high/35">
      <td className="max-w-0 py-1.5 pl-3 pr-2 align-middle">
        <div className="truncate text-[12px] font-semibold text-on-surface" title={c.nombre}>{c.nombre}</div>
      </td>
      <td className="max-w-0 py-1.5 px-2 align-middle">
        <div className="flex min-w-0 items-center gap-1">
          <span className="truncate font-mono text-[11px] text-on-surface-variant" title={c.usuario || undefined}>
            {c.usuario || '—'}
          </span>
          {!!c.usuario && (
            <button type="button" onClick={() => onCopy(c.usuario, `u-${c.id}`)}
              className="shrink-0 rounded p-0.5 text-on-surface-variant/35 opacity-0 transition-opacity hover:bg-surface-container hover:text-on-surface group-hover:opacity-100">
              {copied === `u-${c.id}` ? <Check size={10} className="text-green-400" /> : <Copy size={10} />}
            </button>
          )}
        </div>
      </td>
      <td className="max-w-0 py-1.5 px-2 align-middle">
        <div className="flex min-w-0 items-center gap-1">
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-on-surface-variant select-none" title={isRevealed ? c.password : undefined}>
            {isRevealed ? c.password : '••••••••'}
          </span>
          <div className="flex shrink-0 items-center gap-0 opacity-0 transition-opacity group-hover:opacity-100">
            <button type="button" onClick={() => onReveal(c.id)}
              className="rounded p-0.5 text-on-surface-variant/50 hover:bg-surface-container hover:text-on-surface">
              {isRevealed ? <EyeOff size={11} /> : <Eye size={11} />}
            </button>
            {!!c.password && (
              <button type="button" onClick={() => onCopy(c.password, `p-${c.id}`)}
                className="rounded p-0.5 text-on-surface-variant/50 hover:bg-surface-container hover:text-on-surface">
                {copied === `p-${c.id}` ? <Check size={10} className="text-green-400" /> : <Copy size={10} />}
              </button>
            )}
          </div>
        </div>
      </td>
      <td className="max-w-0 py-1.5 px-2 align-middle">
        {c.url ? (
          <a href={c.url} target="_blank" rel="noreferrer" className="block truncate text-[11px] text-primary hover:underline" title={c.url}>
            {c.url}
          </a>
        ) : (
          <span className="text-[11px] text-on-surface-variant/25">—</span>
        )}
      </td>
      <td className="max-w-0 py-1.5 px-2 align-middle">
        <span className="block truncate text-[10px] text-on-surface-variant/45" title={c.notas}>{c.notas || '—'}</span>
      </td>
      <td className="w-px whitespace-nowrap py-1.5 pl-1 pr-2 align-middle text-right">
        <div className="inline-flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button type="button" onClick={() => onEdit(c)}
            className="rounded-md p-1 text-on-surface-variant/45 hover:bg-surface-container hover:text-on-surface" title="Editar">
            <Pencil size={12} />
          </button>
          <button type="button" onClick={() => onDelete(c.id)}
            className="rounded-md p-1 text-on-surface-variant/45 hover:bg-error/10 hover:text-error" title="Eliminar">
            <Trash2 size={12} />
          </button>
        </div>
      </td>
    </tr>
  )
}

function CredencialesView({ credenciales, onEdit, onDelete, onAdd }: {
  credenciales: Credencial[]
  onEdit: (c: Credencial) => void
  onDelete: (id: string) => void
  onAdd: () => void
}) {
  const [search,   setSearch]   = useState('')
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [copied,   setCopied]   = useState<string | null>(null)

  function toggleReveal(id: string) {
    setRevealed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 1500)
  }

  const q = search.toLowerCase()
  const filtered = credenciales.filter((c) =>
    c.nombre.toLowerCase().includes(q) || c.usuario.toLowerCase().includes(q)
  )
  const cats = Array.from(new Set(filtered.map((c) => c.categoria ?? 'Sin categoría')))

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Search bar — ancho casi completo */}
      <div className="shrink-0 border-b border-outline-variant/20 px-3 py-2 sm:px-4">
        <div className="relative mx-auto w-full max-w-[1600px]">
          <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/40" />
          <input className={`${inputCls} pl-8`} placeholder="Buscar por nombre o usuario…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Tabla ancha: filas bajas, celdas a lo largo */}
      <div className="min-h-0 flex-1 overflow-auto px-2 py-2 sm:px-4">
        {filtered.length === 0 ? (
          credenciales.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <EmptyState
                icon={KeyRound}
                title="Sin credenciales guardadas"
                description={'Guardá tus contraseñas y datos de acceso\nde forma segura y accesible desde la app.'}
                action={
                  <button onClick={onAdd} className={btnPrimary}>
                    <Plus size={14} /> Nueva credencial
                  </button>
                }
              />
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-xs text-on-surface-variant/40">
              <Search size={22} />
              <span>Sin resultados para la búsqueda</span>
            </div>
          )
        ) : (
          <div className="mx-auto w-full max-w-[1600px] space-y-5 pb-4">
            {cats.map((cat) => {
              const items = filtered.filter((c) => (c.categoria ?? 'Sin categoría') === cat)
              return (
                <div key={cat}>
                  <div className="mb-1.5 flex items-center gap-2 px-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50">{cat}</span>
                    <span className="text-[10px] text-on-surface-variant/30">{items.length}</span>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-outline-variant/15 bg-surface-container/30">
                    <table className="w-full min-w-[880px] table-fixed border-collapse text-left">
                      <colgroup>
                        <col className="w-[15%]" />
                        <col className="w-[19%]" />
                        <col className="w-[17%]" />
                        <col className="w-[22%]" />
                        <col className="w-[19%]" />
                        <col className="w-[8%]" />
                      </colgroup>
                      <thead>
                        <tr className="border-b border-outline-variant/15 bg-surface-container-high/80">
                          <th className="py-1.5 pl-3 pr-1 text-[9px] font-semibold uppercase tracking-wide text-on-surface-variant/50">Nombre</th>
                          <th className="px-1 py-1.5 text-[9px] font-semibold uppercase tracking-wide text-on-surface-variant/50">Usuario</th>
                          <th className="px-1 py-1.5 text-[9px] font-semibold uppercase tracking-wide text-on-surface-variant/50">Clave</th>
                          <th className="px-1 py-1.5 text-[9px] font-semibold uppercase tracking-wide text-on-surface-variant/50">URL</th>
                          <th className="px-1 py-1.5 text-[9px] font-semibold uppercase tracking-wide text-on-surface-variant/50">Notas</th>
                          <th className="py-1.5 pl-1 pr-2 text-right text-[9px] font-semibold uppercase tracking-wide text-on-surface-variant/50">
                            <span className="sr-only sm:not-sr-only">Acciones</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((c) => (
                          <CredencialRow
                            key={c.id}
                            c={c}
                            isRevealed={revealed.has(c.id)}
                            copied={copied}
                            onReveal={toggleReveal}
                            onCopy={copyText}
                            onEdit={onEdit}
                            onDelete={onDelete}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Queries ───────────────────────────────────────────────────────────────────

const MOTORS = ['SQL Server', 'PostgreSQL', 'MySQL', 'Oracle', 'SQLite', 'MongoDB', 'Redis', 'JSON', 'XML', 'Otro']

const MOTOR_STYLE: Record<string, string> = {
  'SQL Server': 'bg-blue-500/15 text-blue-400 border-blue-500/25',
  'PostgreSQL': 'bg-violet-500/15 text-violet-400 border-violet-500/25',
  'MySQL':      'bg-orange-500/15 text-orange-400 border-orange-500/25',
  'Oracle':     'bg-red-500/15 text-red-400 border-red-500/25',
  'SQLite':     'bg-slate-500/15 text-slate-400 border-slate-500/25',
  'MongoDB':    'bg-green-500/15 text-green-400 border-green-500/25',
  'Redis':      'bg-rose-500/15 text-rose-400 border-rose-500/25',
  'JSON':       'bg-amber-500/15 text-amber-400 border-amber-500/25',
  'XML':        'bg-cyan-500/15 text-cyan-400 border-cyan-500/25',
  'Otro':       'bg-gray-500/15 text-gray-400 border-gray-500/25',
}

/**
 * “Tema editor” por motor: panel oscuro tipo IDE + icono distintivo.
 * No es resaltado sintáctico real (eso sería otra dependencia); solo cromática inspirada en temas comunes.
 */
type MotorEditorTheme = {
  Icon: LucideIcon
  shell: string
  titleBar: string
  iconBox: string
  editorBg: string
  gutter: string
  lineNum: string
  codeText: string
  tagBar: string
}

const MOTOR_EDITOR: Record<string, MotorEditorTheme> = {
  'SQL Server': {
    Icon: Server,
    shell: 'border-sky-500/35 ring-1 ring-sky-500/10',
    titleBar: 'border-b border-sky-500/20 bg-gradient-to-r from-sky-950/90 via-[#0a1628] to-[#0c1220]',
    iconBox: 'bg-sky-500/20 text-sky-300 shadow-inner ring-1 ring-sky-400/25',
    editorBg: 'bg-[#0d1117]',
    gutter: 'border-white/[0.06] bg-[#161b22]',
    lineNum: 'text-sky-700/85',
    codeText: 'text-[#e6edf3]',
    tagBar: 'border-t border-white/[0.06] bg-[#0d1117]',
  },
  'PostgreSQL': {
    Icon: DatabaseZap,
    shell: 'border-violet-500/35 ring-1 ring-violet-500/10',
    titleBar: 'border-b border-violet-500/20 bg-gradient-to-r from-violet-950/90 via-[#1a1025] to-[#0f0a14]',
    iconBox: 'bg-violet-500/20 text-violet-300 shadow-inner ring-1 ring-violet-400/25',
    editorBg: 'bg-[#0f0a16]',
    gutter: 'border-white/[0.06] bg-[#1a1224]',
    lineNum: 'text-violet-700/80',
    codeText: 'text-violet-50/95',
    tagBar: 'border-t border-white/[0.06] bg-[#0f0a16]',
  },
  'MySQL': {
    Icon: Table2,
    shell: 'border-orange-500/35 ring-1 ring-orange-500/10',
    titleBar: 'border-b border-orange-500/20 bg-gradient-to-r from-orange-950/90 via-[#1c1208] to-[#140d06]',
    iconBox: 'bg-orange-500/20 text-orange-300 shadow-inner ring-1 ring-orange-400/25',
    editorBg: 'bg-[#14100c]',
    gutter: 'border-white/[0.06] bg-[#1f1810]',
    lineNum: 'text-orange-700/75',
    codeText: 'text-orange-50/95',
    tagBar: 'border-t border-white/[0.06] bg-[#14100c]',
  },
  'Oracle': {
    Icon: Cylinder,
    shell: 'border-red-500/35 ring-1 ring-red-500/10',
    titleBar: 'border-b border-red-500/20 bg-gradient-to-r from-red-950/90 via-[#1a0a0a] to-[#120808]',
    iconBox: 'bg-red-500/20 text-red-300 shadow-inner ring-1 ring-red-400/25',
    editorBg: 'bg-[#120a0a]',
    gutter: 'border-white/[0.06] bg-[#1f1212]',
    lineNum: 'text-red-800/70',
    codeText: 'text-red-50/95',
    tagBar: 'border-t border-white/[0.06] bg-[#120a0a]',
  },
  'SQLite': {
    Icon: Package,
    shell: 'border-slate-500/35 ring-1 ring-slate-500/10',
    titleBar: 'border-b border-slate-500/20 bg-gradient-to-r from-slate-950/90 via-[#0c0e12] to-[#0a0c10]',
    iconBox: 'bg-slate-500/20 text-slate-300 shadow-inner ring-1 ring-slate-400/25',
    editorBg: 'bg-[#0c0e11]',
    gutter: 'border-white/[0.06] bg-[#14181f]',
    lineNum: 'text-slate-600',
    codeText: 'text-slate-100/95',
    tagBar: 'border-t border-white/[0.06] bg-[#0c0e11]',
  },
  'MongoDB': {
    Icon: Leaf,
    shell: 'border-emerald-500/35 ring-1 ring-emerald-500/10',
    titleBar: 'border-b border-emerald-500/20 bg-gradient-to-r from-emerald-950/90 via-[#06140f] to-[#051210]',
    iconBox: 'bg-emerald-500/20 text-emerald-300 shadow-inner ring-1 ring-emerald-400/25',
    editorBg: 'bg-[#05140f]',
    gutter: 'border-white/[0.06] bg-[#0a1f18]',
    lineNum: 'text-emerald-800/70',
    codeText: 'text-emerald-50/95',
    tagBar: 'border-t border-white/[0.06] bg-[#05140f]',
  },
  'Redis': {
    Icon: Layers,
    shell: 'border-rose-500/35 ring-1 ring-rose-500/10',
    titleBar: 'border-b border-rose-500/20 bg-gradient-to-r from-rose-950/90 via-[#180a10] to-[#12060c]',
    iconBox: 'bg-rose-500/20 text-rose-300 shadow-inner ring-1 ring-rose-400/25',
    editorBg: 'bg-[#140a0e]',
    gutter: 'border-white/[0.06] bg-[#1f1418]',
    lineNum: 'text-rose-800/70',
    codeText: 'text-rose-50/95',
    tagBar: 'border-t border-white/[0.06] bg-[#140a0e]',
  },
  'JSON': {
    Icon: Braces,
    shell: 'border-amber-500/35 ring-1 ring-amber-500/10',
    titleBar: 'border-b border-amber-500/20 bg-gradient-to-r from-amber-950/90 via-[#141008] to-[#100c06]',
    iconBox: 'bg-amber-500/20 text-amber-300 shadow-inner ring-1 ring-amber-400/25',
    editorBg: 'bg-[#1a1508]',
    gutter: 'border-white/[0.06] bg-[#242016]',
    lineNum: 'text-amber-800/65',
    codeText: 'text-amber-50/95',
    tagBar: 'border-t border-white/[0.06] bg-[#1a1508]',
  },
  'XML': {
    Icon: CodeXml,
    shell: 'border-cyan-500/35 ring-1 ring-cyan-500/10',
    titleBar: 'border-b border-cyan-500/20 bg-gradient-to-r from-cyan-950/90 via-[#061416] to-[#040e10]',
    iconBox: 'bg-cyan-500/20 text-cyan-300 shadow-inner ring-1 ring-cyan-400/25',
    editorBg: 'bg-[#061012]',
    gutter: 'border-white/[0.06] bg-[#0c1a1c]',
    lineNum: 'text-cyan-800/65',
    codeText: 'text-cyan-50/95',
    tagBar: 'border-t border-white/[0.06] bg-[#061012]',
  },
  'Otro': {
    Icon: Sparkles,
    shell: 'border-zinc-500/35 ring-1 ring-zinc-500/10',
    titleBar: 'border-b border-zinc-500/20 bg-gradient-to-r from-zinc-950/90 via-zinc-900/80 to-zinc-950/90',
    iconBox: 'bg-zinc-600/35 text-zinc-200 shadow-inner ring-1 ring-zinc-500/25',
    editorBg: 'bg-[#0d1117]',
    gutter: 'border-white/[0.06] bg-[#161b22]',
    lineNum: 'text-zinc-600',
    codeText: 'text-zinc-100/95',
    tagBar: 'border-t border-white/[0.06] bg-[#0d1117]',
  },
}

function getMotorEditor(motor: string): MotorEditorTheme {
  return MOTOR_EDITOR[motor] ?? MOTOR_EDITOR['Otro']
}

function motorCls(motor: string) {
  return MOTOR_STYLE[motor] ?? 'bg-gray-500/15 text-gray-400 border-gray-500/25'
}

function QueryForm({ initial, onSave, onCancel }: {
  initial?: Partial<QueryItem>; onSave: (q: QueryItem) => void; onCancel: () => void
}) {
  const [motor,       setMotor]       = useState(initial?.motor ?? MOTORS[0])
  const [descripcion, setDescripcion] = useState(initial?.descripcion ?? '')
  const [query,       setQuery]       = useState(initial?.query ?? '')
  const [tagsRaw,     setTagsRaw]     = useState((initial?.tags ?? []).join(' '))

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!descripcion.trim() || !query.trim()) return
    const tags = tagsRaw.split(/[,\s]+/).map((t) => t.trim()).filter(Boolean)
    onSave({
      id: initial?.id ?? randomId(), motor,
      descripcion: descripcion.trim(), query: query.trim(),
      tags: tags.length ? tags : undefined, orden: initial?.orden ?? 999,
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-on-surface-variant">Motor</label>
        <select className={selectCls} value={motor} onChange={(e) => setMotor(e.target.value)}>
          {MOTORS.map((m) => <option key={m}>{m}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-on-surface-variant">Descripción *</label>
        <input className={inputCls} value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Obtener usuarios activos con sus roles" autoFocus required />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-on-surface-variant">Contenido *</label>
        <textarea className={[inputCls, 'font-mono text-xs resize-none leading-relaxed'].join(' ')}
          rows={14} value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder={'SQL, JSON o XML según el tipo elegido arriba.\n\n-- SQL\nSELECT 1 AS ok;\n\n// JSON\n{"ok": true}\n\n<!-- XML -->\n<root ok="true"/>'}
          required spellCheck={false} />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-on-surface-variant">Tags <span className="text-on-surface-variant/40">(espacio o coma entre cada una)</span></label>
        <input className={inputCls} value={tagsRaw} onChange={(e) => setTagsRaw(e.target.value)} placeholder="usuarios roles activos" />
      </div>
      <div className="flex gap-2 pt-2 border-t border-outline-variant/20">
        <button type="submit" className={btnPrimary}><Check size={13} /> Guardar</button>
        <button type="button" onClick={onCancel} className={btnGhost}>Cancelar</button>
      </div>
    </form>
  )
}

/** Snippet compacto: tema tipo editor por motor + icono distintivo. */
function QuerySnippet({ item, copied, onCopy, onEdit, onDelete }: {
  item: QueryItem; copied: string | null
  onCopy: (id: string, text: string) => void; onEdit: () => void; onDelete: () => void
}) {
  const isCopied = copied === item.id
  const rawLines   = item.query.split('\n')
  const T          = getMotorEditor(item.motor)
  const MotorIcon  = T.Icon

  return (
    <div className={[
      'group flex min-h-0 flex-col overflow-hidden rounded-xl border bg-surface-container/20',
      'transition-shadow hover:shadow-lg hover:shadow-black/20',
      T.shell,
    ].join(' ')}>
      {/* Barra tipo pestaña de IDE */}
      <div className={`flex items-center gap-2 px-2.5 py-1.5 ${T.titleBar}`}>
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${T.iconBox}`}>
          <MotorIcon size={14} strokeWidth={2} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={['shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide', motorCls(item.motor)].join(' ')}>
              {item.motor}
            </span>
            <span className="line-clamp-1 min-w-0 text-[12px] font-medium leading-tight text-zinc-100/95">{item.descripcion}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-1 text-[9px] text-zinc-500">
            <FileCode2 size={9} className="shrink-0 opacity-70" />
            <span className="font-mono">{rawLines.length} línea{rawLines.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => onCopy(item.id, item.query)}
            title={isCopied ? 'Copiado' : 'Copiar'}
            className={[
              'flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[9px] font-medium transition-colors',
              isCopied ? 'bg-green-500/20 text-green-400' : 'text-zinc-400 hover:bg-white/10 hover:text-zinc-100',
            ].join(' ')}
          >
            {isCopied ? <Check size={11} /> : <Copy size={11} />}
            {isCopied ? 'Ok' : ''}
          </button>
          <button type="button" onClick={onEdit} className="rounded-md p-1 text-zinc-500 hover:bg-white/10 hover:text-zinc-100" title="Editar">
            <Pencil size={12} />
          </button>
          <button type="button" onClick={onDelete} className="rounded-md p-1 text-zinc-500 hover:bg-red-500/15 hover:text-red-400" title="Eliminar">
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Panel código — alto acotado para cards compactas en grilla */}
      <div className={`min-h-0 max-h-[min(45vh,420px)] overflow-auto ${T.editorBg}`}>
        <div className="flex min-w-0 font-mono text-[10px] leading-[1.5]">
          <div
            aria-hidden
            className={`select-none border-r py-1.5 pl-2 pr-1.5 text-right ${T.gutter} ${T.lineNum}`}
          >
            {rawLines.map((_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
          <pre className={`min-w-0 flex-1 overflow-x-auto whitespace-pre px-2 py-1.5 ${T.codeText}`}>
            {item.query}
          </pre>
        </div>
      </div>

      {item.tags && item.tags.length > 0 && (
        <div className={`flex flex-wrap gap-1.5 px-2.5 py-1.5 ${T.tagBar}`}>
          {item.tags.map((tag) => (
            <span key={tag} className="font-mono text-[9px] text-zinc-500">
              <span className="text-zinc-600">#</span>
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function QueriesView({ queries, onEdit, onDelete }: {
  queries: QueryItem[]; onEdit: (q: QueryItem) => void; onDelete: (id: string) => void
}) {
  const [search,      setSearch]      = useState('')
  const [motorFilter, setMotorFilter] = useState('Todos')
  const [copied,      setCopied]      = useState<string | null>(null)

  function copyQuery(id: string, text: string) {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 1500)
  }

  const usedMotors = Array.from(new Set(queries.map((q) => q.motor)))
  const filtered = queries.filter((q) => {
    const matchMotor  = motorFilter === 'Todos' || q.motor === motorFilter
    const s           = search.toLowerCase()
    const matchSearch = !s || q.descripcion.toLowerCase().includes(s) || q.query.toLowerCase().includes(s) || (q.tags ?? []).some((t) => t.toLowerCase().includes(s))
    return matchMotor && matchSearch
  })

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Barra superior — ancho completo (mismo ancho que la grilla) */}
      <div className="shrink-0 border-b border-outline-variant/10 px-3 py-2.5 sm:px-4">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-2.5">
          <div className="flex items-start gap-2">
            <div className="mt-0.5 rounded-lg bg-primary/12 p-1.5 text-primary ring-1 ring-primary/20">
              <Braces size={15} strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-on-surface">Snippets de consulta</h2>
              <p className="text-[11px] leading-snug text-on-surface-variant/55">
                Lista vertical: cards alargadas a todo el ancho, una debajo de la otra. Cada motor tiene icono y tema tipo editor.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <div className="relative min-w-0 flex-1">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant/40" />
              <input className={`${inputCls} pl-8`} value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar en descripción, código o #tag…" />
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {['Todos', ...usedMotors].map((m) => {
                const Fi = m === 'Todos' ? Braces : getMotorEditor(m).Icon
                return (
                  <button key={m} type="button" onClick={() => setMotorFilter(m)}
                    className={[
                      'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors',
                      motorFilter === m
                        ? m === 'Todos' ? 'border-primary/40 bg-primary/15 text-primary' : motorCls(m) + ' border-current'
                        : 'border-outline-variant/20 text-on-surface-variant/65 hover:border-outline-variant/40 hover:text-on-surface',
                    ].join(' ')}>
                    <Fi size={12} className="shrink-0 opacity-90" aria-hidden />
                    {m}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3 sm:px-4">
        {filtered.length === 0 ? (
          <div className="mx-auto flex max-w-[1600px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-outline-variant/25 bg-surface-container/25 py-16 text-center">
            <div className="rounded-xl bg-surface-container-high p-4 text-on-surface-variant/35">
              <FileCode2 size={32} strokeWidth={1.25} />
            </div>
            <p className="text-xs text-on-surface-variant/50">
              {search || motorFilter !== 'Todos' ? 'Sin resultados' : 'Todavía no hay snippets. Creá uno con “Nueva query”.'}
            </p>
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3">
            {filtered.map((q) => (
              <QuerySnippet key={q.id} item={q} copied={copied}
                onCopy={copyQuery} onEdit={() => onEdit(q)} onDelete={() => onDelete(q.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

type PanelMode =
  | { type: 'closed' }
  | { type: 'add-servicio' }
  | { type: 'edit-servicio'; servicio: Servicio }
  | { type: 'add-pago'; prefillServicioId?: string }
  | { type: 'edit-pago'; pago: PagoMensual }
  | { type: 'add-credencial' }
  | { type: 'edit-credencial'; credencial: Credencial }
  | { type: 'add-query' }
  | { type: 'edit-query'; query: QueryItem }

type BoardView = 'dashboard' | 'tabla' | 'servicios'

const BOARDS = [
  { id: 'gastos'       as const, label: 'Gastos' },
  { id: 'credenciales' as const, label: 'Credenciales' },
  { id: 'queries'      as const, label: 'Queries' },
]
type ActiveBoard = typeof BOARDS[number]['id']

export function GastosPlugin() {
  const toast = useToast()
  const [servicios,    setServicios]    = useState<Servicio[]>([])
  const [pagos,        setPagos]        = useState<PagoMensual[]>([])
  const [credenciales, setCredenciales] = useState<Credencial[]>([])
  const [queries,      setQueries]      = useState<QueryItem[]>([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [year,         setYear]         = useState(new Date().getFullYear())
  const [panel,        setPanel]        = useState<PanelMode>({ type: 'closed' })
  const [boardView,    setBoardView]    = useState<BoardView>('dashboard')
  const [activeBoard,  setActiveBoard]  = useState<ActiveBoard>('gastos')
  const [syncing,      setSyncing]      = useState(false)
  const [lastSync,     setLastSync]     = useState<{ at: string; created: number; updated: number; pulled: number } | null>(null)
  const [syncingCred,    setSyncingCred]    = useState(false)
  const [lastSyncCred,   setLastSyncCred]   = useState<{ at: string; created: number; updated: number; pulled: number } | null>(null)
  const [syncingQueries, setSyncingQueries] = useState(false)
  const [lastSyncQueries,setLastSyncQueries]= useState<{ at: string; created: number; updated: number; pulled: number } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await window.api.invoke<{ servicios: Servicio[]; pagos: PagoMensual[]; credenciales: Credencial[] }>('gastos:load')
      const serviciosSorted = data.servicios.sort((a, b) => a.orden - b.orden)
      const existentes = data.pagos ?? []
      const relleno = mergeHistoricoFaltante(existentes, buildHistoricoPagos())
      if (relleno.length !== existentes.length) {
        await window.api.invoke('gastos:save-pagos-bulk', relleno)
        setPagos(relleno)
      } else {
        setPagos(existentes)
      }
      setServicios(serviciosSorted)
      setCredenciales((data.credenciales ?? []).sort((a, b) => a.orden - b.orden))
      const qs = await window.api.invoke<QueryItem[]>('queries:load')
      setQueries((qs ?? []).sort((a, b) => a.orden - b.orden))
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function saveServicio(s: Servicio) {
    try {
      await window.api.invoke('gastos:save-servicio', s)
      await load(); setPanel({ type: 'closed' })
    } catch (e) { toast.show(`Error al guardar servicio: ${e}`, 'error') }
  }

  async function deleteServicio(id: string) {
    if (!confirm('¿Eliminar servicio y todos sus pagos?')) return
    try {
      await window.api.invoke('gastos:delete-servicio', id); await load()
    } catch (e) { toast.show(`Error al eliminar: ${e}`, 'error') }
  }

  async function toggleActivo(svc: Servicio) {
    try {
      await window.api.invoke('gastos:save-servicio', { ...svc, activo: !svc.activo }); await load()
    } catch (e) { toast.show(`Error: ${e}`, 'error') }
  }

  async function savePago(p: PagoMensual) {
    try {
      await window.api.invoke('gastos:save-pago', p)
      await load(); setPanel({ type: 'closed' })
    } catch (e) { toast.show(`Error al guardar pago: ${e}`, 'error') }
  }

  async function deletePago(id: string) {
    try {
      await window.api.invoke('gastos:delete-pago', id); await load()
    } catch (e) { toast.show(`Error al eliminar pago: ${e}`, 'error') }
  }

  async function saveCredencial(c: Credencial) {
    try {
      await window.api.invoke('gastos:credencial-save', c)
      await load(); setPanel({ type: 'closed' })
    } catch (e) { toast.show(`Error al guardar credencial: ${e}`, 'error') }
  }

  async function deleteCredencial(id: string) {
    if (!confirm('¿Eliminar esta credencial?')) return
    try {
      await window.api.invoke('gastos:credencial-delete', id); await load()
    } catch (e) { toast.show(`Error al eliminar credencial: ${e}`, 'error') }
  }

  async function importarHistoricoListado() {
    if (!confirm(
      'Se van a importar los pagos históricos (Casa, Depto y Edesur depto) desde el listado embebido en la app. '
      + 'Si ya había un monto para el mismo servicio y mes, se reemplaza. ¿Continuar?',
    )) return
    try {
      const incoming = buildHistoricoPagos()
      const merged = mergePagosImport(pagos, incoming)
      await window.api.invoke('gastos:save-pagos-bulk', merged)
      await load()
    } catch (e) {
      toast.show(`Error al importar histórico: ${e}`, 'error')
    }
  }

  async function syncWithNotion() {
    setSyncing(true); setError(null)
    try {
      const result = await window.api.invoke<{ ok: boolean; created: number; updated: number; pulled: number }>('gastos:notion-sync')
      await load()
      setLastSync({ at: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }), ...result })
      toast.show(`Sync completado — ${result.created} creados, ${result.updated} actualizados, ${result.pulled} importados`, 'success', 5000)
    } catch (e) { toast.show(`Error al sincronizar con Notion: ${e}`, 'error', 7000) }
    finally { setSyncing(false) }
  }

  async function saveQuery(q: QueryItem) {
    try {
      await window.api.invoke('queries:save', q)
      await load(); setPanel({ type: 'closed' })
    } catch (e) { toast.show(`Error al guardar query: ${e}`, 'error') }
  }

  async function deleteQuery(id: string) {
    if (!confirm('¿Eliminar esta query?')) return
    try { await window.api.invoke('queries:delete', id); await load() }
    catch (e) { toast.show(`Error al eliminar query: ${e}`, 'error') }
  }

  async function syncQueriesWithNotion() {
    setSyncingQueries(true); setError(null)
    try {
      const result = await window.api.invoke<{ ok: boolean; created: number; updated: number; pulled: number }>('queries:notion-sync')
      await load()
      setLastSyncQueries({ at: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }), ...result })
      toast.show(`Queries sync — ${result.created} creadas, ${result.updated} actualizadas, ${result.pulled} importadas`, 'success', 5000)
    } catch (e) { toast.show(`Error al sincronizar queries con Notion: ${e}`, 'error', 7000) }
    finally { setSyncingQueries(false) }
  }

  async function syncCredencialesWithNotion() {
    setSyncingCred(true); setError(null)
    try {
      const result = await window.api.invoke<{ ok: boolean; created: number; updated: number; pulled: number }>('gastos:notion-sync-credenciales')
      await load()
      setLastSyncCred({ at: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }), ...result })
      toast.show(`Credenciales sync — ${result.created} creadas, ${result.updated} actualizadas, ${result.pulled} importadas`, 'success', 5000)
    } catch (e) { toast.show(`Error al sincronizar credenciales con Notion: ${e}`, 'error', 7000) }
    finally { setSyncingCred(false) }
  }

  const years      = availableYears(pagos)
  const categorias = Array.from(new Set(servicios.map((s) => s.categoria)))
  const panelOpen  = panel.type !== 'closed'
  const panelTitle =
    panel.type === 'add-servicio'    ? 'Nuevo servicio'    :
    panel.type === 'edit-servicio'   ? 'Editar servicio'   :
    panel.type === 'add-pago'        ? 'Cargar pago'       :
    panel.type === 'edit-pago'       ? 'Editar pago'       :
    panel.type === 'add-credencial'  ? 'Nueva credencial'  :
    panel.type === 'edit-credencial' ? 'Editar credencial' :
    panel.type === 'add-query'       ? 'Nueva query'       :
    panel.type === 'edit-query'      ? 'Editar query'      : ''

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-on-surface-variant text-sm">
        Cargando…
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-surface text-on-surface relative overflow-hidden">

      {/* Error banner */}
      {error && (
        <div className="absolute top-0 left-0 right-0 z-50 flex items-center gap-2 px-4 py-2 bg-error/10 border-b border-error/30 text-error text-xs">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="hover:opacity-70"><X size={13} /></button>
        </div>
      )}

      {/* ── Board tabs ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-0 px-4 pt-2 border-b border-outline-variant/20 shrink-0">
        {BOARDS.map((b) => (
          <button key={b.id} onClick={() => { setActiveBoard(b.id); setPanel({ type: 'closed' }) }}
            className={[
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              activeBoard === b.id
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface',
            ].join(' ')}>
            {b.label}
          </button>
        ))}
      </div>

      {/* ── Board header: view switcher + year + action ──────────────── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-outline-variant/20 shrink-0">
        {activeBoard === 'gastos' ? (
          /* Gastos: pill switcher */
          <div className="flex items-center gap-0.5 bg-surface-container rounded-lg p-0.5">
            {(['dashboard', 'tabla', 'servicios'] as BoardView[]).map((v) => (
              <button key={v} onClick={() => setBoardView(v)}
                className={[
                  'px-3 py-1 text-xs rounded-md transition-colors',
                  boardView === v
                    ? 'bg-surface text-on-surface font-semibold shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface',
                ].join(' ')}>
                {v === 'dashboard' ? 'Dashboard' : v === 'tabla' ? 'Tabla' : 'Servicios'}
              </button>
            ))}
          </div>
        ) : (
          /* Credenciales: empty left side */
          <div />
        )}

        <div className="flex items-center gap-2">
          {/* Year nav — gastos board only, hide on servicios */}
          {activeBoard === 'gastos' && boardView !== 'servicios' && (
            <div className="flex items-center gap-0.5">
              <button onClick={() => setYear((y) => y - 1)}
                className="p-1 rounded hover:bg-surface-container text-on-surface-variant transition-colors">
                <ChevronLeft size={14} />
              </button>
              <select value={year} onChange={(e) => setYear(Number(e.target.value))}
                className="bg-transparent text-sm font-medium text-on-surface outline-none cursor-pointer hover:text-primary transition-colors px-1">
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <button onClick={() => setYear((y) => y + 1)}
                className="p-1 rounded hover:bg-surface-container text-on-surface-variant transition-colors">
                <ChevronRight size={14} />
              </button>
            </div>
          )}
          {/* Action button */}
          {activeBoard === 'queries' && (
            <div className="flex items-center gap-2">
              {lastSyncQueries && (
                <span className="text-[10px] text-on-surface-variant/50 hidden sm:block">
                  Sync {lastSyncQueries.at}
                  {(lastSyncQueries.created + lastSyncQueries.pulled) > 0 && (
                    <span className="ml-1 text-accent">+{lastSyncQueries.created + lastSyncQueries.pulled}</span>
                  )}
                </span>
              )}
              <button onClick={syncQueriesWithNotion} disabled={syncingQueries}
                className={[btnGhost, syncingQueries ? 'opacity-50 cursor-not-allowed' : ''].join(' ')}
                title="Sincronizar queries con Notion">
                {syncingQueries ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                {syncingQueries ? 'Sincronizando…' : 'Sync Notion'}
              </button>
              <button onClick={() => setPanel({ type: 'add-query' })} className={btnPrimary}>
                <Plus size={14} /> Nueva query
              </button>
            </div>
          )}
          {activeBoard === 'credenciales' && (
            <div className="flex items-center gap-2">
              {lastSyncCred && (
                <span className="text-[10px] text-on-surface-variant/50 hidden sm:block">
                  Sync {lastSyncCred.at}
                  {(lastSyncCred.created + lastSyncCred.pulled) > 0 && (
                    <span className="ml-1 text-accent">+{lastSyncCred.created + lastSyncCred.pulled}</span>
                  )}
                </span>
              )}
              <button onClick={syncCredencialesWithNotion} disabled={syncingCred}
                className={[btnGhost, syncingCred ? 'opacity-50 cursor-not-allowed' : ''].join(' ')}
                title="Sincronizar credenciales con Notion">
                {syncingCred ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                {syncingCred ? 'Sincronizando…' : 'Sync Notion'}
              </button>
              <button onClick={() => setPanel({ type: 'add-credencial' })} className={btnPrimary}>
                <Plus size={14} /> Nueva credencial
              </button>
            </div>
          )}
          {activeBoard === 'gastos' && boardView === 'servicios' && (
            <button onClick={() => setPanel({ type: 'add-servicio' })} className={btnPrimary}>
              <Plus size={14} /> Nuevo servicio
            </button>
          )}
          {activeBoard === 'gastos' && boardView === 'tabla' && (
            <div className="flex items-center gap-2">
              {lastSync && (
                <span className="text-[10px] text-on-surface-variant/50 hidden sm:block">
                  Sync {lastSync.at}
                  {(lastSync.created + lastSync.pulled) > 0 && (
                    <span className="ml-1 text-accent">
                      +{lastSync.created + lastSync.pulled}
                    </span>
                  )}
                </span>
              )}
              <button
                onClick={syncWithNotion}
                disabled={syncing}
                className={[btnGhost, syncing ? 'opacity-50 cursor-not-allowed' : ''].join(' ')}
                title="Sincronizar con Notion (bidireccional)"
              >
                {syncing
                  ? <Loader2 size={14} className="animate-spin" />
                  : <RefreshCw size={14} />}
                {syncing ? 'Sincronizando…' : 'Sync Notion'}
              </button>
            </div>
          )}
          {activeBoard === 'gastos' && boardView !== 'servicios' && (
            <>
              <button type="button" onClick={importarHistoricoListado} className={btnGhost} title="Importar meses históricos desde el listado incorporado">
                <History size={14} /> Importar histórico
              </button>
              <button onClick={() => setPanel({ type: 'add-pago' })} className={btnPrimary}>
                <Plus size={14} /> Cargar pago
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        {activeBoard === 'gastos' && boardView === 'dashboard' && (
          <DashboardView
            servicios={servicios} pagos={pagos} year={year}
            onEditPago={(p) => setPanel({ type: 'edit-pago', pago: p })}
            onDeletePago={deletePago}
          />
        )}
        {activeBoard === 'gastos' && boardView === 'tabla' && (
          <div className="flex h-full min-h-0 flex-col overflow-hidden p-4">
            <TablaGastos
              servicios={servicios} pagos={pagos} year={year}
              onEditPago={(p) => setPanel({ type: 'edit-pago', pago: p })}
              onDeletePago={deletePago}
            />
          </div>
        )}
        {activeBoard === 'gastos' && boardView === 'servicios' && (
          <ServiciosView
            servicios={servicios}
            onEdit={(s) => setPanel({ type: 'edit-servicio', servicio: s })}
            onDelete={deleteServicio}
            onToggle={toggleActivo}
          />
        )}
        {activeBoard === 'queries' && (
          <QueriesView
            queries={queries}
            onEdit={(q) => setPanel({ type: 'edit-query', query: q })}
            onDelete={deleteQuery}
          />
        )}
        {activeBoard === 'credenciales' && (
          <CredencialesView
            credenciales={credenciales}
            onEdit={(c) => setPanel({ type: 'edit-credencial', credencial: c })}
            onDelete={deleteCredencial}
            onAdd={() => setPanel({ type: 'add-credencial' })}
          />
        )}
      </div>

      {/* ── Slide panel ────────────────────────────────────────────────── */}
      <SlidePanel title={panelTitle} open={panelOpen} onClose={() => setPanel({ type: 'closed' })}>
        {panel.type === 'add-servicio' && (
          <ServicioForm categorias={categorias} onSave={saveServicio} onCancel={() => setPanel({ type: 'closed' })} />
        )}
        {panel.type === 'edit-servicio' && (
          <ServicioForm initial={panel.servicio} categorias={categorias} onSave={saveServicio} onCancel={() => setPanel({ type: 'closed' })} />
        )}
        {panel.type === 'add-pago' && (
          <PagoForm servicios={servicios}
            initial={panel.prefillServicioId ? { servicioId: panel.prefillServicioId } : undefined}
            onSave={savePago} onCancel={() => setPanel({ type: 'closed' })} />
        )}
        {panel.type === 'edit-pago' && (
          <PagoForm servicios={servicios} initial={panel.pago} onSave={savePago} onCancel={() => setPanel({ type: 'closed' })} />
        )}
        {panel.type === 'add-query' && (
          <QueryForm onSave={saveQuery} onCancel={() => setPanel({ type: 'closed' })} />
        )}
        {panel.type === 'edit-query' && (
          <QueryForm initial={panel.query} onSave={saveQuery} onCancel={() => setPanel({ type: 'closed' })} />
        )}
        {panel.type === 'add-credencial' && (
          <CredencialForm onSave={saveCredencial} onCancel={() => setPanel({ type: 'closed' })} />
        )}
        {panel.type === 'edit-credencial' && (
          <CredencialForm initial={panel.credencial} onSave={saveCredencial} onCancel={() => setPanel({ type: 'closed' })} />
        )}
      </SlidePanel>
    </div>
  )
}
