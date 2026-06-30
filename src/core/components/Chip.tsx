import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

type ChipTone = 'neutral' | 'primary' | 'accent' | 'success' | 'warning' | 'error'

const TONES: Record<ChipTone, string> = {
  neutral: 'bg-surface-container-high text-on-surface-variant border-outline-variant/25',
  primary: 'bg-primary/10 text-primary border-primary/20',
  accent:  'bg-accent/10 text-accent border-accent/20',
  success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  warning: 'bg-warning/10 text-warning border-warning/20',
  error:   'bg-error/10 text-error border-error/20',
}

/** Compact tag/label chip with optional leading icon (priority/tag style). */
export function Chip({
  icon: Icon,
  children,
  tone = 'neutral',
  className = '',
}: {
  icon?: LucideIcon
  children: ReactNode
  tone?: ChipTone
  className?: string
}): JSX.Element {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-medium leading-none ${TONES[tone]} ${className}`}>
      {Icon && <Icon size={10} className="flex-shrink-0" />}
      {children}
    </span>
  )
}
