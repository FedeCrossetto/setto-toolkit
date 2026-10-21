import { useSyncExternalStore } from 'react'

/**
 * Nivel de animaciones de la app (Ajustes → Apariencia):
 * - full: todo, incluidos los efectos "divertidos" (festejos, destellos, brillo que sigue al mouse).
 * - subtle: sólo transiciones cortas y útiles (cambio de módulo, listas, números).
 * - off: nada se mueve.
 * Si Windows tiene las animaciones apagadas (prefers-reduced-motion), cuenta como 'off'.
 * Se refleja como clase en <html> (motion-subtle / motion-off) para que el CSS lo respete.
 */
export type MotionLevel = 'full' | 'subtle' | 'off'

const KEY = 'app:motion'
const listeners = new Set<() => void>()
const osReduced = (): boolean => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false } }

function read(): MotionLevel {
  try { const v = localStorage.getItem(KEY); return v === 'subtle' || v === 'off' ? v : 'full' } catch { return 'full' }
}

let current: MotionLevel = typeof window === 'undefined' ? 'full' : read()

/** El nivel elegido por el usuario (sin mirar el sistema). */
export function getMotionPreference(): MotionLevel { return current }

/** El nivel que realmente aplica (el sistema puede apagarlas). */
export function motionLevel(): MotionLevel { return osReduced() ? 'off' : current }

/** ¿Se puede mostrar este tipo de efecto? 'fun' = festejos, destellos, spotlight; 'basic' = transiciones. */
export function motionAllows(kind: 'basic' | 'fun'): boolean {
  const l = motionLevel()
  return l === 'full' || (l === 'subtle' && kind === 'basic')
}

export function applyMotionClass(): void {
  if (typeof document === 'undefined') return
  const l = motionLevel()
  const html = document.documentElement
  html.classList.toggle('motion-subtle', l === 'subtle')
  html.classList.toggle('motion-off', l === 'off')
}

export function setMotionPreference(level: MotionLevel): void {
  current = level
  try { localStorage.setItem(KEY, level) } catch { /* nada */ }
  applyMotionClass()
  for (const l of listeners) l()
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  let mq: MediaQueryList | null = null
  const onOs = (): void => { applyMotionClass(); cb() }
  try { mq = window.matchMedia('(prefers-reduced-motion: reduce)'); mq.addEventListener('change', onOs) } catch { /* nada */ }
  return () => { listeners.delete(cb); mq?.removeEventListener('change', onOs) }
}

/** [preferencia elegida, nivel efectivo, cambiar] */
export function useMotionPreference(): [MotionLevel, MotionLevel, (l: MotionLevel) => void] {
  const pref = useSyncExternalStore(subscribe, getMotionPreference, () => 'full' as MotionLevel)
  const eff = useSyncExternalStore(subscribe, motionLevel, () => 'full' as MotionLevel)
  return [pref, eff, setMotionPreference]
}

if (typeof document !== 'undefined') applyMotionClass()
