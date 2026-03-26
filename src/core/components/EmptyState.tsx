import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon
  title: string
  description: string
  action?: ReactNode
}): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-12 max-w-md mx-auto">
      <Icon size={44} className="text-on-surface-variant/50 mb-3" strokeWidth={1.25} aria-hidden />
      <p className="text-sm font-medium text-on-surface mb-1">{title}</p>
      <p className="text-xs text-on-surface-variant whitespace-pre-line leading-relaxed">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
