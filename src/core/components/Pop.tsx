import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, Copy } from 'lucide-react'
import { motionAllows } from '../motion-prefs'

/**
 * Rebote con chispitas cuando `active` pasa a true (p. ej. marcar una favorita).
 * Sólo CSS (transform/opacity); con animaciones sutiles o apagadas no hace nada.
 */
export function Pop({ active, children, sparks = true, className = '' }: {
  active: boolean
  children: ReactNode
  sparks?: boolean
  className?: string
}): JSX.Element {
  const [burst, setBurst] = useState(0)
  const prev = useRef(active)
  useEffect(() => {
    if (active && !prev.current && motionAllows('fun')) setBurst(Date.now())
    prev.current = active
  }, [active])
  return (
    <span className={`relative inline-grid place-items-center ${className}`}>
      <span key={burst} className={`inline-grid place-items-center ${burst ? 'fx-pop' : ''}`}>{children}</span>
      {burst > 0 && sparks && (
        <span key={`s${burst}`} aria-hidden className="pointer-events-none absolute inset-0">
          {[0, 1, 2, 3, 4, 5].map((i) => <span key={i} className="fx-spark" style={{ '--a': `${i * 60 + 30}deg` } as React.CSSProperties} />)}
        </span>
      )}
    </span>
  )
}

/** true durante `ms` después de llamar a `flash()` (íconos de "copiado"). */
export function useFlash(ms = 1100): [boolean, () => void] {
  const [on, setOn] = useState(false)
  const t = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (t.current) clearTimeout(t.current) }, [])
  const flash = useCallback(() => {
    setOn(true)
    if (t.current) clearTimeout(t.current)
    t.current = setTimeout(() => setOn(false), ms)
  }, [ms])
  return [on, flash]
}

/** Ícono de copiar que se vuelve ✓ un momento después de copiar. */
export function CopyGlyph({ copied, size = 12, className = '' }: { copied: boolean; size?: number; className?: string }): JSX.Element {
  return copied
    ? <Check size={size} className={`text-success fx-pop ${className}`} />
    : <Copy size={size} className={className} />
}
