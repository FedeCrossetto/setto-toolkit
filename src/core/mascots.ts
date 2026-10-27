import { useSyncExternalStore } from 'react'

/**
 * Mascotas tejidas (Ajustes → Apariencia → Mascotas). Prendidas por defecto; apagadas, cada
 * lugar vuelve a su ícono de siempre. Se guarda en localStorage como el nivel de animaciones.
 */
const KEY = 'app:mascots'
const listeners = new Set<() => void>()

function read(): boolean {
  try { return localStorage.getItem(KEY) !== '0' } catch { return true }
}

let current = typeof window === 'undefined' ? true : read()

export function mascotsEnabled(): boolean { return current }

export function setMascotsEnabled(on: boolean): void {
  current = on
  try { localStorage.setItem(KEY, on ? '1' : '0') } catch { /* nada */ }
  for (const l of listeners) l()
}

const subscribe = (cb: () => void): (() => void) => { listeners.add(cb); return () => { listeners.delete(cb) } }

export function useMascotsEnabled(): boolean {
  return useSyncExternalStore(subscribe, mascotsEnabled, mascotsEnabled)
}

/** Animadas: un gesto por estado. Quietas: la mascota neutra en cuatro poses. */
export type AnimatedPose = 'buscando' | 'listo' | 'actualizando' | 'atencion'
export type StillPose = 'neutra' | 'saludo' | 'curiosa' | 'descanso'
export type MascotPose = AnimatedPose | StillPose

const ANIMATED = new Set<MascotPose>(['buscando', 'listo', 'actualizando', 'atencion'])
export const isAnimatedPose = (p: MascotPose): p is AnimatedPose => ANIMATED.has(p)

/**
 * Pose de Inicio según el momento: algo para mirar → curiosa; de noche o fin de semana →
 * descanso; a la mañana → saludo; si no, neutra.
 */
export function homePose(now: Date, attention: number): StillPose {
  if (attention > 0) return 'curiosa'
  const h = now.getHours(), d = now.getDay()
  if (d === 0 || d === 6 || h >= 21 || h < 6) return 'descanso'
  if (h < 12) return 'saludo'
  return 'neutra'
}
