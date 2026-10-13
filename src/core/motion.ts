import type { MotionProps, Transition } from 'framer-motion'

/**
 * Presets de animación compartidos (framer-motion). Todo lo que se mueve en la
 * app sale de acá, así las curvas y duraciones son las mismas en cada módulo.
 *
 * Reglas (ver docs/DESIGN.md → Movimiento):
 * - Cortas: 120–200 ms. Nunca bloquean la interacción.
 * - Sólo `transform` y `opacity` (GPU); nada de width/height/top.
 * - Nada en CodeMirror, xterm ni listas largas (ver MAX_ANIMATED_ITEMS).
 * - "Reducir movimiento" del sistema se respeta vía <MotionConfig reducedMotion="user"> en App.tsx.
 */

/** Misma curva que `--ease-mac` en globals.css. */
export const EASE_MAC = [0.25, 0.1, 0.25, 1] as const

export const DURATION = { fast: 0.12, base: 0.18, slow: 0.26 } as const

export const SPRING = {
  /** Indicadores de selección que se deslizan (tabs, sidebar, segmentados). */
  snappy: { type: 'spring', stiffness: 500, damping: 38, mass: 0.8 },
  /** Reacomodo de filas en listas. */
  layout: { type: 'spring', stiffness: 420, damping: 36 },
} as const satisfies Record<string, Transition>

/**
 * Por encima de esta cantidad de ítems una lista no se anima: medir el layout de
 * cientos de filas en cada cambio cuesta más de lo que aporta.
 */
export const MAX_ANIMATED_ITEMS = 80

export function shouldAnimateList(count: number): boolean {
  return count <= MAX_ANIMATED_ITEMS
}

/**
 * Props para una fila de lista dentro de `<AnimatePresence initial={false} mode="popLayout">`:
 * entra con un fundido corto, sale deslizando a la izquierda y las demás se
 * reacomodan. Con `enabled = false` la fila se comporta como un elemento normal.
 */
export function listItemMotion(enabled: boolean): MotionProps {
  if (!enabled) return { initial: false, layout: false }
  return {
    layout: 'position',
    initial: { opacity: 0, y: -4 },
    animate: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE_MAC } },
    exit: { opacity: 0, x: -12, transition: { duration: DURATION.fast, ease: EASE_MAC } },
    transition: SPRING.layout,
  }
}

/** Fila de tabla: sólo fundido de entrada (las tablas no admiten animación de layout). */
export function tableRowMotion(enabled: boolean): MotionProps {
  if (!enabled) return { initial: false }
  return {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: DURATION.slow, ease: EASE_MAC } },
  }
}

// ─── Superposiciones (Modal, Sheet, Toast) ───────────────────────────────────
// Entran y salen con la misma curva; la salida es más corta para no demorar.

/** Fondo oscurecido detrás de un modal o sheet. */
export const backdropMotion: MotionProps = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: DURATION.fast } },
  exit: { opacity: 0, transition: { duration: DURATION.fast } },
}

/** Diálogo centrado: crece apenas desde abajo. */
export const dialogMotion: MotionProps = {
  initial: { opacity: 0, scale: 0.97, y: 6 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 520, damping: 34 } },
  exit: { opacity: 0, scale: 0.98, y: 4, transition: { duration: DURATION.fast, ease: EASE_MAC } },
}

/** Panel lateral desde la derecha. */
export const sheetMotion: MotionProps = {
  initial: { opacity: 0, x: 28 },
  animate: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 420, damping: 38 } },
  exit: { opacity: 0, x: 28, transition: { duration: DURATION.fast, ease: EASE_MAC } },
}

/** Toast: entra desde la derecha; los demás se reacomodan con `layout`. */
export const toastMotion: MotionProps = {
  layout: 'position',
  initial: { opacity: 0, x: 24, scale: 0.98 },
  animate: { opacity: 1, x: 0, scale: 1, transition: { type: 'spring', stiffness: 480, damping: 34 } },
  exit: { opacity: 0, x: 24, transition: { duration: DURATION.fast, ease: EASE_MAC } },
  transition: SPRING.layout,
}
