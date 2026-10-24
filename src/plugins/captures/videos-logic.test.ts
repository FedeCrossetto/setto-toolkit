import { describe, expect, it } from 'vitest'
import { formatBytes, formatTime, HEAVY_BYTES, videoFlags, videoSummary, videoUrl } from './videos-logic'

const DAY = 86_400_000
const now = Date.UTC(2026, 9, 23)
const v = (size: number, ageDays: number, openedDaysAgo?: number) => ({
  path: `C:\\v${size}.mp4`, name: 'v.mp4', folder: 'Grabaciones de pantalla', size,
  modifiedAt: now - ageDays * DAY, openedAt: openedDaysAgo === undefined ? undefined : now - openedDaysAgo * DAY,
})

describe('videos', () => {
  it('pesado por tamaño y sin uso por antigüedad (abrirlo lo renueva)', () => {
    expect(videoFlags(v(HEAVY_BYTES, 1), now)).toEqual({ heavy: true, unused: false })
    expect(videoFlags(v(10, 40), now)).toEqual({ heavy: false, unused: true })
    expect(videoFlags(v(10, 40, 2), now)).toEqual({ heavy: false, unused: false })
  })
  it('resumen: total y lo que se puede liberar', () => {
    const s = videoSummary([v(HEAVY_BYTES, 1), v(100, 40), v(50, 2)], now)
    expect(s).toEqual({ count: 3, total: HEAVY_BYTES + 150, reclaimable: HEAVY_BYTES + 100, candidates: 2 })
  })
  it('formatos', () => {
    expect(formatBytes(409_109_166)).toBe('390 MB')
    expect(formatBytes(2.6 * 1024 ** 3)).toBe('2,6 GB')
    expect(formatTime(65)).toBe('1:05')
    expect(formatTime(3725)).toBe('1:02:05')
    expect(videoUrl('C:\\Videos\\a b.mp4')).toBe('setto-video://f/C%3A%5CVideos%5Ca%20b.mp4')
  })
})
