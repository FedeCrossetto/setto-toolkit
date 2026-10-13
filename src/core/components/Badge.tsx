import type { ReactNode } from 'react'

type BadgeTone = 'neutral' | 'primary' | 'accent' | 'success' | 'warning' | 'error' | 'info'

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-on-surface/[0.06] text-on-surface-variant',
  primary: 'bg-primary/10 text-primary',
  accent:  'bg-accent/[0.12] text-accent',
  success: 'bg-success/[0.12] text-success',
  warning: 'bg-warning/[0.14] text-warning',
  error:   'bg-error/[0.12] text-error',
  info:    'bg-secondary/[0.12] text-secondary',
}

/** Pill chica de conteo / estado (tinte suave, 11px). */
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
      className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-[11px] font-medium tabular-nums leading-none ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  )
}
