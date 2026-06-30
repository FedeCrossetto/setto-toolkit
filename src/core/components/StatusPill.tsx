import type { LucideIcon } from 'lucide-react'

export type StatusTone = 'success' | 'warning' | 'error' | 'info' | 'neutral'

const TONES: Record<StatusTone, { text: string; bg: string; dot: string }> = {
  success: { text: 'text-emerald-400', bg: 'bg-emerald-500/12 border-emerald-500/25', dot: 'bg-emerald-400' },
  warning: { text: 'text-warning',     bg: 'bg-warning/12 border-warning/25',         dot: 'bg-warning' },
  error:   { text: 'text-error',       bg: 'bg-error/12 border-error/25',             dot: 'bg-error' },
  info:    { text: 'text-secondary',   bg: 'bg-secondary/12 border-secondary/25',     dot: 'bg-secondary' },
  neutral: { text: 'text-on-surface-variant', bg: 'bg-surface-container-high border-outline-variant/25', dot: 'bg-on-surface-variant/50' },
}

/**
 * Colored status pill (project-board style: a dot or icon + label, optional count).
 * `pulse` animates the dot — useful for "loading / live" states.
 */
export function StatusPill({
  tone,
  label,
  count,
  icon: Icon,
  pulse = false,
  className = '',
}: {
  tone: StatusTone
  label: string
  count?: number
  icon?: LucideIcon
  pulse?: boolean
  className?: string
}): JSX.Element {
  const t = TONES[tone]
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${t.bg} ${t.text} ${className}`}>
      {Icon
        ? <Icon size={11} className="flex-shrink-0" />
        : <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${t.dot} ${pulse ? 'animate-pulse' : ''}`} />}
      {label}
      {count !== undefined && <span className="opacity-60 tabular-nums">· {count}</span>}
    </span>
  )
}
