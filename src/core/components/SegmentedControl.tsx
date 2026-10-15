import { useId } from 'react'
import { motion } from 'framer-motion'
import { Badge } from './Badge'
import { SPRING } from '../motion'

export interface SegmentOption<T extends string> {
  value: T
  label: string
  count?: number
}

/**
 * Control segmentado: pista gris rellena; el segmento activo es blanco con
 * sombra suave, los inactivos quedan en silencio.
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
  // layoutId único por instancia: dos controles en pantalla no se roban la pastilla.
  const pillId = `segmented-${useId()}`
  return (
    <div className={`inline-flex items-center gap-0.5 p-[3px] rounded-lg bg-surface-container dark:bg-white/6 ${className}`}>
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={`relative flex items-center gap-1.5 h-[26px] px-3 rounded-md text-[12px] font-medium transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/45 ${
              active ? 'text-on-surface' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {active && (
              <motion.span layoutId={pillId} className="absolute inset-0 z-0 rounded-md bg-surface dark:bg-white/[0.14] shadow-sm" transition={SPRING.snappy} />
            )}
            <span className="relative z-10">{opt.label}</span>
            {opt.count !== undefined && (
              <span className="relative z-10"><Badge tone={active ? 'primary' : 'neutral'}>{opt.count}</Badge></span>
            )}
          </button>
        )
      })}
    </div>
  )
}
