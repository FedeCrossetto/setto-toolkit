import { describe, expect, it } from 'vitest'
import { dayLabel, formatBytes, groupItems } from './logic'
import type { CaptureLite } from './types'

const c = (p: Partial<CaptureLite>): CaptureLite => ({
  id: 'a', file: 'x.png', createdAt: 0, width: 1, height: 1, bytes: 1, title: '', ticket: '', tags: [],
  pinned: false, hasNote: false, ocrState: 'done', ...p,
})

describe('captures gallery logic', () => {
  const now = new Date(2026, 9, 12, 18)
  it('groups by day keeping the given order', () => {
    const items = [c({ id: '1', createdAt: new Date(2026, 9, 12, 10).getTime() }), c({ id: '2', createdAt: new Date(2026, 9, 12, 9).getTime() }), c({ id: '3', createdAt: new Date(2026, 9, 11, 9).getTime() })]
    expect(groupItems(items, 'new', now).map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([['Hoy', ['1', '2']], ['Ayer', ['3']]])
  })
  it('groups by ticket and app, unknown last label', () => {
    const items = [c({ id: '1', ticket: 'A-1' }), c({ id: '2', ticket: 'A-1' }), c({ id: '3' })]
    expect(groupItems(items, 'ticket', now).map((g) => g.label)).toEqual(['A-1', 'Sin ticket'])
    expect(groupItems([c({ app: 'SSMS' }), c({})], 'app', now).map((g) => g.label)).toEqual(['SSMS', 'App desconocida'])
  })
  it('labels and sizes', () => {
    expect(dayLabel('2026-10-11', now)).toBe('Ayer')
    expect(formatBytes(1536)).toBe('2 KB')
    expect(formatBytes(5 * 1024 ** 2)).toBe('5.0 MB')
    expect(formatBytes(3 * 1024 ** 3)).toBe('3.0 GB')
  })
})
