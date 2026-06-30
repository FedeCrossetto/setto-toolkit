import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  mascot = false,
}: {
  icon: LucideIcon
  title: string
  description: string
  action?: ReactNode
  /** Show the Setto mascot above the icon for a friendlier, branded empty state. */
  mascot?: boolean
}): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-12 max-w-md mx-auto">
      {mascot && (
        <img
          src="./setto-avatar/setto-avatar.png"
          alt=""
          className="h-28 w-auto mb-4 select-none"
          draggable={false}
          style={{ filter: 'drop-shadow(0 10px 24px rgba(0,0,0,0.35))' }}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
        />
      )}

      {/* Icon in a soft branded halo */}
      <div className="relative mb-4">
        <div
          aria-hidden
          className="absolute inset-0 rounded-full blur-xl"
          style={{ background: 'rgb(var(--c-primary) / 0.18)' }}
        />
        <div className="relative w-16 h-16 rounded-2xl flex items-center justify-center bg-surface-container-high border border-outline-variant/25">
          <Icon size={30} className="text-primary/80" strokeWidth={1.5} aria-hidden />
        </div>
      </div>

      <p className="text-sm font-semibold text-on-surface mb-1.5">{title}</p>
      <p className="text-xs text-on-surface-variant whitespace-pre-line leading-relaxed">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
