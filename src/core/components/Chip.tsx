import type { ReactNode } from 'react'
import type { IconComponent } from '../types'

type ChipTone = 'neutral' | 'primary' | 'accent' | 'success' | 'warning' | 'error'

const TONES: Record<ChipTone, string> = {
  neutral: 'bg-on-surface/6 text-on-surface-variant',
  primary: 'bg-primary/10 text-primary',
  accent:  'bg-accent/12 text-accent',
  success: 'bg-success/12 text-success',
  warning: 'bg-warning/[0.14] text-warning',
  error:   'bg-error/12 text-error',
}

/** Compact tag/label chip with optional leading icon. */
export function Chip({
  icon: Icon,
  children,
  tone = 'neutral',
  className = '',
}: {
  icon?: IconComponent
  children: ReactNode
  tone?: ChipTone
  className?: string
}): JSX.Element {
  return (
    <span className={`inline-flex items-center gap-1 h-[20px] px-2 rounded-full text-[11px] font-medium leading-none whitespace-nowrap ${TONES[tone]} ${className}`}>
      {Icon && <Icon size={11} className="shrink-0" />}
      {children}
    </span>
  )
}
