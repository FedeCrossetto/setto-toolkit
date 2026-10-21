import type { ReactNode } from 'react'
import type { IconComponent } from '../types'

/**
 * Ilustración en el color de acento: un halo suave, dos tarjetas de fondo (trazo fino,
 * apenas giradas) y el ícono del módulo sobre un degradé del acento. La misma escena en
 * toda la app; cambia el ícono. Flota apenas (se apaga con Animaciones: ninguna).
 */
function EmptyScene({ icon: Icon }: { icon: IconComponent }): JSX.Element {
  return (
    <div className="empty-float relative w-[140px] h-[100px] mb-4 text-primary" aria-hidden>
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full bg-primary/15 blur-2xl" />
      <svg viewBox="0 0 132 92" className="absolute inset-0 w-full h-full" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
        <g opacity="0.3" transform="rotate(-8 44 50)">
          <rect x="14" y="22" width="60" height="52" rx="9" fill="rgb(var(--c-surface))" />
          <path d="M24 38h28M24 46h38M24 54h20" />
        </g>
        <g opacity="0.42" transform="rotate(7 92 46)">
          <rect x="62" y="16" width="56" height="50" rx="9" fill="rgb(var(--c-surface))" />
          <path d="M72 31h26M72 39h34M72 47h18" />
        </g>
        <circle cx="20" cy="12" r="1.8" fill="currentColor" stroke="none" opacity="0.4" />
        <circle cx="116" cy="80" r="1.8" fill="currentColor" stroke="none" opacity="0.4" />
        <path d="M110 10v6m-3-3h6" opacity="0.5" />
      </svg>
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-[14px] grid place-items-center text-on-primary shadow-[0_8px_20px_-6px_rgb(var(--c-primary)/0.55)]"
        style={{ background: 'linear-gradient(135deg, rgb(var(--c-primary-light)), rgb(var(--c-primary)))' }}>
        <Icon size={22} weight="fill" />
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
