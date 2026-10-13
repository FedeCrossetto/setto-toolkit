import { useEffect, useRef } from 'react'
import { animate, useReducedMotion } from 'framer-motion'
import { EASE_MAC } from '../motion'

/**
 * Número que cuenta hasta su valor (KPIs). Anima desde el valor anterior, así al
 * cambiar de mes se ve la diferencia. Escribe directo en el DOM: no re-renderiza
 * por cuadro. Con "reducir movimiento" muestra el valor final de una.
 */
export function CountUp({ value, format, duration = 0.6 }: {
  value: number
  format: (n: number) => string
  duration?: number
}): JSX.Element {
  const ref = useRef<HTMLSpanElement>(null)
  const from = useRef(0)
  const reduce = useReducedMotion()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (reduce || from.current === value) {
      el.textContent = format(value)
      from.current = value
      return
    }
    const controls = animate(from.current, value, {
      duration,
      ease: EASE_MAC,
      onUpdate: (v) => { el.textContent = format(Math.round(v)) },
    })
    from.current = value
    return () => controls.stop()
  }, [value, format, duration, reduce])

  return <span ref={ref}>{format(reduce ? value : from.current)}</span>
}
