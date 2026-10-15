import type { IconComponent } from '../types'

export type StatusTone = 'success' | 'warning' | 'error' | 'info' | 'neutral'

const TONES: Record<StatusTone, { text: string; bg: string; dot: string }> = {
  success: { text: 'text-success',            bg: 'bg-success/12',   dot: 'bg-success' },
  warning: { text: 'text-warning',            bg: 'bg-warning/[0.14]',   dot: 'bg-warning' },
  error:   { text: 'text-error',              bg: 'bg-error/12',     dot: 'bg-error' },
  info:    { text: 'text-secondary',          bg: 'bg-secondary/12', dot: 'bg-secondary' },
  neutral: { text: 'text-on-surface-variant', bg: 'bg-on-surface/6', dot: 'bg-on-surface-variant/50' },
}

/**
 * Status pill: a dot or icon + label, optional count.
 * `pulse` softly animates the dot — useful for "loading / live" states.
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
  icon?: IconComponent
  pulse?: boolean
  className?: string
}): JSX.Element {
  const t = TONES[tone]
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full t-caption font-medium ${t.bg} ${t.text} ${className}`}>
      {Icon
        ? <Icon size={11} className="shrink-0" />
        : <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.dot} ${pulse ? 'animate-pulse' : ''}`} />}
      {label}
      {count !== undefined && <span className="opacity-60 tabular-nums">· {count}</span>}
    </span>
  )
}
