import type { ReactNode } from 'react'
import type { IconComponent } from '../types'

/** Labeled form row: label on top, control, optional hint. */
export function Field({
  label,
  hint,
  children,
  className = '',
}: {
  label: ReactNode
  hint?: ReactNode
  children: ReactNode
  className?: string
}): JSX.Element {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="t-footnote font-medium text-on-surface-variant">{label}</span>
      {children}
      {hint && <span className="t-caption text-on-surface-variant/80">{hint}</span>}
    </label>
  )
}

/** macOS-style switch. */
export function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
  label?: string
}): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-40 ${
        checked ? 'bg-primary' : 'bg-on-surface/15'
      }`}
    >
      <span
        className="inline-block h-[18px] w-[18px] rounded-full bg-white transition-transform duration-200"
        style={{
          transform: `translateX(${checked ? 18 : 2}px)`,
          boxShadow: '0 1px 2px rgb(0 0 0 / 0.25), 0 0 0 0.5px rgb(0 0 0 / 0.06)',
          transitionTimingFunction: 'var(--ease-spring)',
        }}
      />
    </button>
  )
}

/** Grouped settings card (SaaS-style "inset grouped" list). `id` lets pages scroll-spy to it. */
export function SettingsGroup({
  title,
  children,
  footer,
  description,
  id,
  className = '',
}: {
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
  description?: ReactNode
  id?: string
  className?: string
}): JSX.Element {
  return (
    <section id={id} data-settings-group className={`flex flex-col gap-2 scroll-mt-6 ${className}`}>
      {(title || description) && (
        <header className="px-1">
          {title && <h3 className="t-callout font-semibold text-on-surface">{title}</h3>}
          {description && <p className="t-footnote text-on-surface-variant mt-0.5">{description}</p>}
        </header>
      )}
      <div className="ui-card overflow-hidden divide-y divide-(--hairline)">{children}</div>
      {footer && <p className="t-caption text-on-surface-variant px-1">{footer}</p>}
    </section>
  )
}

export function SettingsRow({
  icon: Icon,
  iconColor,
  title,
  description,
  children,
}: {
  icon?: IconComponent
  /** CSS background for a solid icon tile, e.g. 'rgb(var(--c-primary))'. Omit for the neutral hairline tile. */
  iconColor?: string
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
}): JSX.Element {
  return (
    <div data-settings-row className="flex items-center gap-3 px-5 py-3 min-h-[56px]">
      {Icon && (
        <span
          className={`w-7 h-7 shrink-0 ${iconColor ? 'rounded-lg flex items-center justify-center text-white' : 'icon-tile'}`}
          style={iconColor ? { background: iconColor } : undefined}
        >
          <Icon size={15} />
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div className="t-body font-medium text-on-surface">{title}</div>
        {description && <div className="t-footnote text-on-surface-variant mt-0.5">{description}</div>}
      </div>
      {children && <div className="flex items-center justify-end gap-2 shrink-0">{children}</div>}
    </div>
  )
}

type KpiTone = 'primary' | 'success' | 'warning' | 'error' | 'neutral'

/** Small rounded pill for deltas / statuses ("+12%", "Conectado"). */
export function DeltaPill({ tone = 'neutral', children }: { tone?: KpiTone; children: ReactNode }): JSX.Element {
  const cls = {
    primary: 'bg-primary/12 text-primary',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/15 text-warning',
    error: 'bg-error/12 text-error',
    neutral: 'bg-on-surface/6 text-on-surface-variant',
  }[tone]
  return (
    <span className={`inline-flex items-center gap-1 rounded-[6px] px-2 py-px t-caption font-medium tabular-nums whitespace-nowrap ${cls}`}>
      {children}
    </span>
  )
}

/** Metric tile (dashboards). `tone` tints the icon tile only — keep it calm. */
export function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'primary',
  delta,
  deltaTone = 'neutral',
  onClick,
}: {
  label: ReactNode
  value: ReactNode
  sub?: ReactNode
  icon?: IconComponent
  tone?: KpiTone
  /** Optional pill next to the sub text (e.g. "+8%"). */
  delta?: ReactNode
  deltaTone?: KpiTone
  onClick?: () => void
}): JSX.Element {
  const tile = {
    // Líneas finas: el tile es neutro (blanco con borde fino); sólo alerta/error tiñen el ícono.
    primary: 'icon-tile',
    success: 'icon-tile',
    warning: 'icon-tile text-warning',
    error: 'icon-tile text-error',
    neutral: 'icon-tile',
  }[tone]
  return (
    <div
      onClick={onClick}
      className={`ui-card px-5 pt-4 pb-4 flex flex-col gap-2 min-w-0 ${onClick ? 'ui-card-interactive' : ''}`}
    >
      <div className="flex items-center gap-2">
        <span className="t-footnote font-medium text-on-surface-variant flex-1 min-w-0 truncate">{label}</span>
        {Icon && (
          <span className={`w-7 h-7 ${tile}`}>
            <Icon size={14} />
          </span>
        )}
      </div>
      <div className="t-title2 text-on-surface tabular-nums truncate">{value}</div>
      {(delta || sub) && (
        <div className="flex items-center gap-1.5 min-w-0">
          {delta && <DeltaPill tone={deltaTone}>{delta}</DeltaPill>}
          {sub && <div className="t-caption text-on-surface-variant truncate">{sub}</div>}
        </div>
      )}
    </div>
  )
}

/** Page header used at the top of each module: title + subtitle + right actions. */
export function PageHeader({
  title,
  subtitle,
  actions,
  className = '',
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  className?: string
}): JSX.Element {
  return (
    // El nombre del módulo ya está en la barra superior: acá queda sólo para lectores de
    // pantalla y la fila muestra el subtítulo (contexto) y las acciones.
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-3 min-h-8 ${className}`}>
      <div className="flex-1 min-w-[200px]">
        <h1 className="sr-only">{title}</h1>
        {subtitle && <p className="t-callout text-on-surface-variant">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  )
}
