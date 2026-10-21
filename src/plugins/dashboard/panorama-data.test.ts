import { describe, expect, it } from 'vitest'
import { dailyCounts, dayLabels } from './panorama-data'

describe('dailyCounts', () => {
  it('agrupa por día y el último es hoy', () => {
    const now = new Date(2026, 9, 20, 15, 0)
    const at = (d: number, h = 10): number => new Date(2026, 9, d, h).getTime()
    expect(dailyCounts([at(20), at(20, 1), at(19), at(14), at(10)], 7, now)).toEqual([1, 0, 0, 0, 0, 1, 2])
  })
  it('etiquetas con "hoy" al final', () => {
    const l = dayLabels(7, new Date(2026, 9, 20))
    expect(l).toHaveLength(7)
    expect(l[6]).toBe('hoy')
  })
})
