import { Badge } from './Badge'

export interface SegmentOption<T extends string> {
  value: T
  label: string
  count?: number
}

/**
 * Pill-style segmented control (CloudDock "Recently Opened / Shared …" tabs).
 * The active segment is an elevated surface; inactive ones are quiet.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = '',
}: {
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
}): JSX.Element {
  return (
    <div className={`inline-flex items-center gap-1 p-1 rounded-xl bg-surface-container-high/60 border border-outline-variant/20 ${className}`}>
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 ${
              active
                ? 'bg-surface text-on-surface shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {opt.label}
            {opt.count !== undefined && (
              <Badge tone={active ? 'primary' : 'neutral'}>{opt.count}</Badge>
            )}
          </button>
        )
      })}
    </div>
  )
}
