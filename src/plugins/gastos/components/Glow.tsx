import { useEffect, useId, useState, type ReactNode } from 'react'

/**
 * Piezas de tablero con brillo (estilo "dashboard oscuro"): la interfaz queda gris y
 * lo único que tiene color y luz son los datos. Colores siempre desde tokens.
 */

/** Tarjeta interna: visual arriba, etiqueta, valor grande y variación a la derecha. */
export function StatTile({ visual, label, value, delta, deltaTone = 'neutral', sub, onClick, title }: {
  visual: ReactNode
  label: string
  value: ReactNode
  delta?: string
  deltaTone?: 'success' | 'warning' | 'error' | 'neutral'
  sub?: string
  onClick?: () => void
  title?: string
}): JSX.Element {
  const tone = { success: 'text-success', warning: 'text-warning', error: 'text-error', neutral: 'text-on-surface-variant' }[deltaTone]
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} title={title}
      className={`spotlight group relative flex flex-col min-w-0 rounded-[14px] p-4 pt-3 text-left bg-on-surface/[0.025] dark:bg-black/35 ring-1 ring-on-surface/[0.06] overflow-hidden ${onClick ? 'hover:ring-on-surface/12 transition-shadow cursor-pointer' : ''}`}>
      <div className="h-[86px] flex items-center justify-center">{visual}</div>
      <span className="t-footnote text-on-surface-variant mt-2">{label}</span>
      <span className="flex items-baseline gap-2 min-w-0">
        <span className="flex-1 min-w-0 truncate text-[21px] leading-[28px] font-semibold tracking-[-0.01em] text-on-surface tabular-nums">{value}</span>
        {delta && <span className={`shrink-0 t-footnote font-semibold tabular-nums ${tone}`}>{delta}</span>}
      </span>
      {sub && <span className="t-caption text-on-surface-variant/80 truncate mt-0.5">{sub}</span>}
    </Tag>
  )
}

/** Mini barras con brillo; la barra activa (el mes elegido) se enciende. */
export function SparkBars({ values, active, color, labels }: {
  values: number[]
  active?: number
  /** Color CSS (p. ej. `rgb(var(--c-primary))`) */
  color: string
  labels?: string[]
}): JSX.Element {
  const id = useId().replace(/:/g, '')
  const W = 160, H = 78, n = Math.max(values.length, 1)
  const max = Math.max(...values, 1)
  const slot = W / n
  const bw = Math.min(7, slot * 0.5)
  const bars = values.map((v, i) => {
    const h = v > 0 ? Math.max(6, (v / max) * (H - 14)) : 3
    return { x: slot * (i + 0.5) - bw / 2, y: H - 6 - h, h, v, i }
  })
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} className="max-w-[200px] overflow-visible" role="img"
      aria-label={labels ? values.map((v, i) => `${labels[i]}: ${Math.round(v)}`).join(', ') : undefined}>
      <defs>
        <linearGradient id={`sb-${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="1" />
          <stop offset="1" stopColor={color} stopOpacity="0.35" />
        </linearGradient>
        <filter id={`sbg-${id}`} x="-200%" y="-50%" width="500%" height="200%"><feGaussianBlur stdDeviation="4" /></filter>
      </defs>
      {/* brillo debajo de todo */}
      <g filter={`url(#sbg-${id})`} opacity="0.55">
        {bars.map((b) => <rect key={b.i} className="grow-y" style={{ '--i': b.i } as React.CSSProperties} x={b.x} y={b.y} width={bw} height={b.h} rx={bw / 2} fill={color} opacity={b.i === active ? 1 : 0.35} />)}
      </g>
      {bars.map((b) => (
        <rect key={b.i} className="grow-y" style={{ '--i': b.i } as React.CSSProperties} x={b.x} y={b.y} width={bw} height={b.h} rx={bw / 2}
          fill={b.v > 0 ? `url(#sb-${id})` : 'rgb(var(--c-on-surface) / 0.12)'} opacity={active === undefined || b.i === active ? 1 : 0.45}>
          {labels && <title>{labels[b.i]}</title>}
        </rect>
      ))}
    </svg>
  )
}

/** Anillo de progreso con brillo y el porcentaje en el centro. */
export function GlowRing({ pct, color, center }: { pct: number | null; color: string; center?: ReactNode }): JSX.Element {
  const id = useId().replace(/:/g, '')
  const R = 30, SW = 6, C = 2 * Math.PI * R
  // Se dibuja desde cero al aparecer (la transición de stroke-dasharray hace el resto).
  const [shown, setShown] = useState(false)
  useEffect(() => { const r = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(r) }, [])
  const p = !shown || pct === null ? 0 : Math.max(0, Math.min(1, pct))
  const arc = (
    <circle cx={40} cy={40} r={R} fill="none" stroke={color} strokeWidth={SW} strokeLinecap="round"
      strokeDasharray={`${Math.max(p * C, p > 0 ? 0.01 : 0)} ${C}`} transform="rotate(-90 40 40)"
      style={{ transition: 'stroke-dasharray 900ms var(--ease-mac)' }} />
  )
  return (
    <div className="relative w-[80px] h-[80px]">
      <svg viewBox="0 0 80 80" width={80} height={80} className="overflow-visible" aria-hidden>
        <defs><filter id={`rg-${id}`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5" /></filter></defs>
        <circle cx={40} cy={40} r={R} fill="none" stroke="rgb(var(--c-on-surface) / 0.08)" strokeWidth={SW} />
        <g filter={`url(#rg-${id})`} opacity="0.7">{arc}</g>
        {arc}
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[15px] font-semibold tabular-nums text-on-surface">
        {center ?? (pct === null ? '—' : `${Math.round(pct * 100)}%`)}
      </span>
    </div>
  )
}
