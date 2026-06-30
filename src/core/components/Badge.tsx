import type { ReactNode } from 'react'

type BadgeTone = 'neutral' | 'primary' | 'accent' | 'success' | 'warning' | 'error' | 'info'

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-container-high text-on-surface-variant',
  primary: 'bg-primary/15 text-primary',
  accent:  'bg-accent/15 text-accent',
  success: 'bg-emerald-500/15 text-emerald-400',
  warning: 'bg-warning/15 text-warning',
  error:   'bg-error/15 text-error',
  info:    'bg-secondary/15 text-secondary',
}

/** Small count / status pill (CloudDock-style "242" badges). */
export function Badge({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode
  tone?: BadgeTone
  className?: string
}): JSX.Element {
  return (
    <span
      className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-semibold tabular-nums leading-none ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  )
}
