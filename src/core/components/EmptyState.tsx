import type { ReactNode } from 'react'
import type { IconComponent } from '../types'

/**
 * Ilustración lineal de un solo tono: dos tarjetas de fondo (trazo fino, apenas
 * giradas) detrás del ícono del módulo. La misma escena en toda la app; cambia el ícono.
 */
function EmptyScene({ icon: Icon }: { icon: IconComponent }): JSX.Element {
  return (
    <div className="relative w-[132px] h-[92px] mb-3 text-on-surface-variant" aria-hidden>
      <svg viewBox="0 0 132 92" className="absolute inset-0 w-full h-full" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
        <g opacity="0.22" transform="rotate(-8 44 50)">
          <rect x="14" y="22" width="60" height="52" rx="9" />
          <path d="M24 38h28M24 46h38M24 54h20" />
        </g>
        <g opacity="0.3" transform="rotate(7 92 46)">
          <rect x="62" y="16" width="56" height="50" rx="9" />
          <path d="M72 31h26M72 39h34M72 47h18" />
        </g>
        <circle cx="20" cy="12" r="1.6" opacity="0.35" />
        <circle cx="116" cy="80" r="1.6" opacity="0.35" />
        <path d="M110 12l2 2m0-2l-2 2" opacity="0.35" />
      </svg>
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-11 h-11 rounded-[13px] bg-surface hairline shadow-sm grid place-items-center text-on-surface">
        <Icon size={20} />
      </div>
    </div>
  )
}

/** Estado vacío tranquilo: ilustración lineal (o ícono en tile si es compacto), título, descripción y acción opcional. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon: IconComponent
  title: string
  description?: string
  action?: ReactNode
  /** @deprecated Ignored — the app no longer shows mascots. Kept for API compatibility. */
  mascot?: boolean
  /** Less vertical padding (for cards/widgets). */
  compact?: boolean
}): JSX.Element {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center px-6 max-w-sm mx-auto ${compact ? 'py-6' : 'py-12'}`}
      style={{ animation: 'fadeIn 0.2s ease both' }}
    >
      {compact ? (
        <div className="icon-tile w-8 h-8 mb-2.5">
          <Icon size={16} aria-hidden />
        </div>
      ) : (
        <EmptyScene icon={Icon} />
      )}
      <p className="t-callout font-semibold text-on-surface">{title}</p>
      {description && (
        <p className="t-body text-on-surface-variant whitespace-pre-line mt-1 max-w-[300px]">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
