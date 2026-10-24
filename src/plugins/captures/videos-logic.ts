import type { VideoItem } from './types'

/** Más de esto es "pesado" (una grabación larga de pantalla pasa los cientos de MB enseguida). */
export const HEAVY_BYTES = 200 * 1024 * 1024
/** Sin abrir ni grabar en este tiempo es "sin uso". */
export const UNUSED_DAYS = 30

export interface VideoFlags { heavy: boolean; unused: boolean }

export function videoFlags(v: Pick<VideoItem, 'size' | 'modifiedAt' | 'openedAt'>, now = Date.now()): VideoFlags {
  const last = Math.max(v.modifiedAt, v.openedAt ?? 0)
  return { heavy: v.size >= HEAVY_BYTES, unused: now - last > UNUSED_DAYS * 86_400_000 }
}

/** Total y cuánto ocupan los pesados o sin uso (lo que conviene revisar para liberar espacio). */
export function videoSummary(items: VideoItem[], now = Date.now()): { count: number; total: number; reclaimable: number; candidates: number } {
  let total = 0, reclaimable = 0, candidates = 0
  for (const v of items) {
    total += v.size
    const f = videoFlags(v, now)
    if (f.heavy || f.unused) { reclaimable += v.size; candidates++ }
  }
  return { count: items.length, total, reclaimable, candidates }
}

export function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toLocaleString('es-AR', { maximumFractionDigits: 1 })} GB`
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2).toLocaleString('es-AR')} MB`
  return `${Math.max(1, Math.round(n / 1024))} KB`
}

/** Segundos → "1:05" o "1:02:05". */
export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`
}

/** URL para reproducir un video con el protocolo de la app. */
export const videoUrl = (p: string): string => `setto-video://f/${encodeURIComponent(p)}`
