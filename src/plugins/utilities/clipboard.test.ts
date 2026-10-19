import { describe, expect, it } from 'vitest'
import type { ClipView } from '../../core/clip-utils'
import { findClips, MAX_RESULTS } from './clipboard'

const clip = (id: string, text: string, extra: Partial<ClipView> = {}): ClipView => ({
  id, text, at: 0, kind: 'text', sensitive: false, pinned: false, ...extra,
})

describe('findClips', () => {
  it('searches from 2 characters', () => {
    const list = [clip('a', 'select * from x'), clip('b', 'otro')]
    expect(findClips(list, 's')).toEqual([])
    expect(findClips(list, 'se').map((c) => c.id)).toEqual(['a'])
  })

  it('returns at most 6 and never sensitive entries', () => {
    const list = [clip('s', '', { sensitive: true, masked: 'ab••' }), ...Array.from({ length: 10 }, (_, i) => clip(`c${i}`, `ticket ${i}`))]
    const found = findClips(list, 'ti')
    expect(found).toHaveLength(MAX_RESULTS)
    expect(found.some((c) => c.sensitive)).toBe(false)
  })

  it('matches the source app too', () => {
    expect(findClips([clip('a', 'hola', { app: 'Teams' })], 'teams').map((c) => c.id)).toEqual(['a'])
  })
})
