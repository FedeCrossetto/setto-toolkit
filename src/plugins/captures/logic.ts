import type { CaptureLite, CaptureSort } from './types'

/** Lógica pura de la galería de Capturas (testeada en logic.test.ts). */

const dayKey = (t: number): string => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function dayLabel(day: string, now = new Date()): string {
  if (day === dayKey(now.getTime())) return 'Hoy'
  if (day === dayKey(now.getTime() - 86_400_000)) return 'Ayer'
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const s = new Date(y, m - 1, d).toLocaleDateString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long', ...(y !== now.getFullYear() ? { year: 'numeric' } : {}),
  })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export interface CaptureGroup { key: string; label: string; items: CaptureLite[] }

/**
 * Agrupa la página ya ordenada por main, sin reordenar: por día (más nuevas / más
 * viejas), por ticket o por app. Por tamaño va todo junto.
 */
export function groupItems(items: CaptureLite[], sort: CaptureSort, now = new Date()): CaptureGroup[] {
  const keyOf = (c: CaptureLite): [string, string] => {
    if (sort === 'ticket') return c.ticket ? [c.ticket, c.ticket] : ['~', 'Sin ticket']
    if (sort === 'app') return c.app ? [c.app, c.app] : ['~', 'App desconocida']
    if (sort === 'size') return ['all', 'De más pesada a más liviana']
    const k = dayKey(c.createdAt)
    return [k, dayLabel(k, now)]
  }
  const out: CaptureGroup[] = []
  for (const c of items) {
    const [key, label] = keyOf(c)
    const last = out[out.length - 1]
    if (last && last.key === key) last.items.push(c)
    else out.push({ key, label, items: [c] })
  }
  return out
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${Math.round(n / 1024)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(n < 10 * 1024 ** 2 ? 1 : 0)} MB`
  return `${(n / 1024 ** 3).toFixed(1)} GB`
}
