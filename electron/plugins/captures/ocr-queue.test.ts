import { describe, expect, it } from 'vitest'
import { BACKFILL_START_MS, FRESH_DELAY_MS, OcrQueue } from './ocr-queue'

describe('OcrQueue', () => {
  it('vacía → null', () => {
    expect(new OcrQueue(0).next(0, 0)).toBeNull()
  })

  it('las nuevas esperan la pausa corta y van antes que el relleno', () => {
    const q = new OcrQueue(0)
    q.pushBackfill(['old1'])
    q.pushFresh('new', 100_000)
    expect(q.next(100_000, 0)).toEqual({ waitMs: FRESH_DELAY_MS })
    expect(q.next(100_000 + FRESH_DELAY_MS, 0)).toEqual({ id: 'new', kind: 'fresh' })
    expect(q.next(100_000 + FRESH_DELAY_MS, 0)).toEqual({ id: 'old1', kind: 'backfill' })
  })

  it('el relleno no arranca enseguida y respeta el tope por minuto', () => {
    const q = new OcrQueue(0)
    q.pushBackfill(['a', 'b', 'c'])
    expect(q.next(1000, 0)).toEqual({ waitMs: BACKFILL_START_MS - 1000 })
    const t = BACKFILL_START_MS
    expect(q.next(t, 0)).toEqual({ id: 'a', kind: 'backfill' })
    // Usando la compu: 2 por minuto → cada 30 s.
    expect(q.next(t + 1000, 0)).toEqual({ waitMs: 29_000 })
    expect(q.next(t + 30_000, 0)).toEqual({ id: 'b', kind: 'backfill' })
    // Compu quieta: 6 por minuto → cada 10 s.
    expect(q.next(t + 40_000, 120)).toEqual({ id: 'c', kind: 'backfill' })
    expect(q.next(t + 50_000, 120)).toBeNull()
  })

  it('una captura en el relleno que se vuelve "nueva" no se procesa dos veces', () => {
    const q = new OcrQueue(0)
    q.pushBackfill(['x', 'y'])
    q.pushFresh('x', 0)
    q.pushBackfill(['x'])
    expect(q.size).toBe(2)
    q.remove('y')
    expect(q.size).toBe(1)
  })
})
