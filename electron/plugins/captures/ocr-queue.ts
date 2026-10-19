/**
 * Orden del OCR de capturas (puro; lo maneja handlers.ts).
 *
 * - Las capturas nuevas van primero, después de una pausa corta (que el recorte termine).
 * - Las viejas sin OCR (relleno) van de a poco: a lo sumo `BACKFILL_PER_MIN_ACTIVE`
 *   por minuto mientras usás la compu y `BACKFILL_PER_MIN_IDLE` si está quieta,
 *   y recién un rato después de abrir la app. Cuando no queda nada, el worker de
 *   PowerShell se cierra solo por inactividad (win-helper).
 */
export const FRESH_DELAY_MS = 1500
export const BACKFILL_START_MS = 45_000
export const BACKFILL_PER_MIN_ACTIVE = 2
export const BACKFILL_PER_MIN_IDLE = 6
/** Segundos sin teclado/mouse para considerar la compu "quieta". */
export const IDLE_SECONDS = 30

export type OcrStep = { id: string; kind: 'fresh' | 'backfill' } | { waitMs: number } | null

export class OcrQueue {
  private fresh: { id: string; at: number }[] = []
  private backfill: string[] = []
  private lastBackfill = 0
  private notBefore = 0

  constructor(now = 0) { this.notBefore = now + BACKFILL_START_MS }

  get size(): number { return this.fresh.length + this.backfill.length }

  pushFresh(id: string, now: number): void {
    this.backfill = this.backfill.filter((x) => x !== id)
    if (!this.fresh.some((x) => x.id === id)) this.fresh.push({ id, at: now })
  }

  /** Relleno: en el orden dado (conviene lo más nuevo primero). */
  pushBackfill(ids: string[]): void {
    const known = new Set([...this.backfill, ...this.fresh.map((x) => x.id)])
    for (const id of ids) if (!known.has(id)) { this.backfill.push(id); known.add(id) }
  }

  remove(id: string): void {
    this.fresh = this.fresh.filter((x) => x.id !== id)
    this.backfill = this.backfill.filter((x) => x !== id)
  }

  /** Qué hacer ahora: procesar `id`, esperar `waitMs`, o nada (cola vacía). */
  next(now: number, idleSeconds: number): OcrStep {
    const f = this.fresh[0]
    if (f) {
      const wait = f.at + FRESH_DELAY_MS - now
      if (wait > 0) return { waitMs: wait }
      this.fresh.shift()
      return { id: f.id, kind: 'fresh' }
    }
    if (!this.backfill.length) return null
    const perMin = idleSeconds >= IDLE_SECONDS ? BACKFILL_PER_MIN_IDLE : BACKFILL_PER_MIN_ACTIVE
    const at = Math.max(this.notBefore, this.lastBackfill + 60_000 / perMin)
    if (now < at) return { waitMs: Math.min(at - now, 60_000) }
    this.lastBackfill = now
    return { id: this.backfill.shift()!, kind: 'backfill' }
  }
}
