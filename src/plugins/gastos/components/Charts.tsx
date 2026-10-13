import { useState } from 'react'
import { fmtCompact, fmtMoney, mesShort } from '../format'
import type { CategorySlice } from '../analytics'

// Colores de datos: siempre desde tokens (cambian con la paleta y el tema).
const C = {
  fijos: 'rgb(var(--c-primary))',
  variables: 'rgb(var(--c-chart-2) / 0.75)',
  prev: 'rgb(var(--c-on-surface-variant) / 0.7)',
  grid: 'rgb(var(--c-on-surface) / 0.07)',
  band: 'rgb(var(--c-on-surface) / 0.04)',
}

// Tonos distintos por categoría (--c-chart-N, generados desde la paleta activa);
// el último es "Otras", siempre neutro.
export const CATEGORY_COLORS = [
  'rgb(var(--c-chart-1))',
  'rgb(var(--c-chart-2))',
  'rgb(var(--c-chart-3))',
  'rgb(var(--c-chart-4))',
  'rgb(var(--c-chart-5))',
  'rgb(var(--c-chart-6))',
  'rgb(var(--c-on-surface-variant) / 0.45)',
]

function niceMax(v: number): number {
  if (v <= 0) return 1
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / p
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10
  return step * p
}

/**
 * Barras apiladas por mes (fijos + variables) y línea punteada con el total del
 * año anterior (comparación interanual). Clic en un mes lo selecciona.
 */
export function YearChart({ months, fijos, variables, previous, selectedMes, onSelectMes, prevLabel }: {
  months: string[]
  fijos: number[]
  variables: number[]
  previous: number[]
  selectedMes: string
  onSelectMes: (mes: string) => void
  prevLabel: string
}): JSX.Element {
  const [hover, setHover] = useState<number | null>(null)
  const W = 720, H = 200, top = 8
  const totals = months.map((_, i) => fijos[i]! + variables[i]!)
  const max = niceMax(Math.max(...totals, ...previous, 1))
  const slot = W / months.length
  const barW = Math.min(30, slot * 0.5)
  const y = (v: number): number => top + (H - top) * (1 - v / max)
  const hasPrev = previous.some((v) => v > 0)
  const prevPath = previous.map((v, i) => `${i === 0 ? 'M' : 'L'} ${slot * (i + 0.5)} ${y(v)}`).join(' ')
  const active = hover ?? months.indexOf(selectedMes)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-4 t-caption text-on-surface-variant">
        <Legend color={C.fijos} label="Fijos" />
        <Legend color={C.variables} label="Variables" />
        {hasPrev && <Legend color={C.prev} label={prevLabel} dashed />}
      </div>
      <div className="relative h-[200px]">
        {/* eje Y */}
        <div className="absolute inset-y-0 left-0 w-10 flex flex-col justify-between t-caption text-on-surface-variant/70 tabular-nums pointer-events-none" style={{ paddingTop: top - 6 }}>
          <span>{fmtCompact(max)}</span><span>{fmtCompact(max / 2)}</span><span>0</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-y-0 left-10 right-0 h-full" style={{ width: 'calc(100% - 2.5rem)' }}
          role="img" aria-label="Gastos por mes">
          <defs>
            <linearGradient id="gastos-bar-fijos" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="rgb(var(--c-accent))" />
              <stop offset="100%" stopColor="rgb(var(--c-secondary))" />
            </linearGradient>
          </defs>
          {[0, 0.5, 1].map((t) => (
            <line key={t} x1={0} x2={W} y1={y(max * t)} y2={y(max * t)} stroke={C.grid} vectorEffect="non-scaling-stroke" />
          ))}
          {active >= 0 && <rect x={slot * active} y={0} width={slot} height={H} fill={C.band} rx={6} />}
          {months.map((m, i) => {
            const x = slot * (i + 0.5) - barW / 2
            const f = fijos[i]!, v = variables[i]!
            return (
              <g key={m}>
                {f > 0 && <rect x={x} y={y(f)} width={barW} height={H - y(f)} fill="url(#gastos-bar-fijos)" rx={3} />}
                {v > 0 && <rect x={x} y={y(f + v)} width={barW} height={y(f) - y(f + v)} fill={C.variables} rx={3} />}
                <rect x={slot * i} y={0} width={slot} height={H} fill="transparent" style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => onSelectMes(m)} />
              </g>
            )
          })}
          {hasPrev && (
            <path d={prevPath} fill="none" stroke={C.prev} strokeWidth={1.5} strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke" pointerEvents="none" />
          )}
        </svg>
        {hover !== null && (
          <div className="mac-popover hairline absolute z-10 px-2.5 py-1.5 t-caption pointer-events-none whitespace-nowrap -translate-x-1/2"
            style={{ left: `calc(2.5rem + (100% - 2.5rem) * ${(hover + 0.5) / months.length})`, top: 0 }}>
            <div className="font-semibold text-on-surface">{mesShort(months[hover]!)} · {fmtMoney(totals[hover]!)}</div>
            <div className="text-on-surface-variant tabular-nums">Fijos {fmtMoney(fijos[hover]!)} · Variables {fmtMoney(variables[hover]!)}</div>
            {hasPrev && <div className="text-on-surface-variant tabular-nums">{prevLabel}: {fmtMoney(previous[hover]!)}</div>}
          </div>
        )}
      </div>
      <div className="flex pl-10">
        {months.map((m, i) => (
          <button key={m} type="button" onClick={() => onSelectMes(m)}
            className={`flex-1 text-center t-caption py-0.5 rounded ${i === months.indexOf(selectedMes) ? 'text-on-surface font-semibold' : 'text-on-surface-variant hover:text-on-surface'}`}>
            {mesShort(m)}
          </button>
        ))}
      </div>
    </div>
  )
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1.5">
      {dashed
        ? <span className="w-3 border-t-[1.5px] border-dashed" style={{ borderColor: color }} />
        : <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: color }} />}
      {label}
    </span>
  )
}

/** Dona por categoría. Las categorías más allá de la 6ª se agrupan en "Otras". */
export function Donut({ slices, total }: { slices: CategorySlice[]; total: number }): JSX.Element {
  const top = slices.slice(0, 6)
  const rest = slices.slice(6).reduce((s, x) => s + x.value, 0)
  const data = rest > 0 ? [...top, { key: '__rest', label: 'Otras', value: rest }] : top
  const [hover, setHover] = useState<string | null>(null)
  const R = 52, SW = 14, CIRC = 2 * Math.PI * R
  let offset = 0
  const hovered = data.find((d) => d.key === hover)

  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: 132, height: 132 }}>
        <svg viewBox="0 0 132 132" width={132} height={132} role="img" aria-label="Gastos por categoría">
          <circle cx={66} cy={66} r={R} fill="none" stroke="rgb(var(--c-on-surface) / 0.06)" strokeWidth={SW} />
          {total > 0 && data.map((d, i) => {
            const len = (d.value / total) * CIRC
            const el = (
              <circle key={d.key} cx={66} cy={66} r={R} fill="none"
                stroke={CATEGORY_COLORS[d.key === '__rest' ? 6 : i]} strokeWidth={hover === d.key ? SW + 3 : SW}
                strokeDasharray={`${Math.max(len - 1.5, 0.5)} ${CIRC}`} strokeDashoffset={-offset}
                transform="rotate(-90 66 66)" style={{ transition: 'stroke-width 0.15s' }}
                onMouseEnter={() => setHover(d.key)} onMouseLeave={() => setHover(null)} />
            )
            offset += len
            return el
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-4">
          <span className="t-caption text-on-surface-variant truncate max-w-full">{hovered ? hovered.label : 'Total'}</span>
          <span className="t-footnote font-semibold text-on-surface tabular-nums">{fmtMoney(hovered ? hovered.value : total)}</span>
        </div>
      </div>
      <ul className="flex-1 min-w-0 flex flex-col gap-1.5">
        {data.map((d, i) => (
          <li key={d.key} className="flex items-center gap-2 t-footnote" onMouseEnter={() => setHover(d.key)} onMouseLeave={() => setHover(null)}>
            <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: CATEGORY_COLORS[d.key === '__rest' ? 6 : i] }} />
            <span className="flex-1 truncate text-on-surface">{d.label}</span>
            <span className="tabular-nums text-on-surface-variant">{total > 0 ? Math.round((d.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
