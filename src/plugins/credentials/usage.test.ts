import { describe, it, expect } from 'vitest'
import { sortByUsage, sortCredentialsBy, topByUsage, usageHint, usageScore } from './usage'

const NOW = Date.UTC(2026, 9, 14, 12)
const DAY = 86_400_000
const c = (id: string, useCount = 0, ageDays?: number, categoria?: string) => ({
  id, nombre: id, categoria, useCount, lastUsedAt: ageDays === undefined ? undefined : NOW - ageDays * DAY,
})

describe('usageScore', () => {
  it('is 0 for never used', () => {
    expect(usageScore(0, undefined, NOW)).toBe(0)
    expect(usageScore(undefined, undefined, NOW)).toBe(0)
  })
  it('grows with use count', () => {
    expect(usageScore(10, NOW - DAY * 3, NOW)).toBeGreaterThan(usageScore(2, NOW - DAY * 3, NOW))
  })
  it('decays with age', () => {
    expect(usageScore(5, NOW - DAY * 2, NOW)).toBeGreaterThan(usageScore(5, NOW - DAY * 60, NOW))
  })
  it('recent moderate use beats old heavy use', () => {
    expect(usageScore(6, NOW - DAY * 2, NOW)).toBeGreaterThan(usageScore(40, NOW - DAY * 200, NOW))
  })
  it('old heavy use never drops to zero', () => {
    expect(usageScore(40, NOW - DAY * 1000, NOW)).toBeGreaterThan(0)
  })
  it('counts a legacy lastUsedAt without count as one use', () => {
    expect(usageScore(0, NOW - DAY, NOW)).toBeGreaterThan(0)
  })
})

describe('sortByUsage', () => {
  it('orders by score, then recency, then name', () => {
    const list = [c('zeta'), c('alfa'), c('old', 40, 300), c('hot', 6, 1), c('mid', 3, 5)]
    expect(sortByUsage(list, NOW).map((x) => x.id)).toEqual(['hot', 'mid', 'old', 'alfa', 'zeta'])
  })
  it('does not mutate the input', () => {
    const list = [c('b'), c('a', 3, 1)]
    sortByUsage(list, NOW)
    expect(list.map((x) => x.id)).toEqual(['b', 'a'])
  })
})

describe('topByUsage', () => {
  it('puts favorites first and respects the limit', () => {
    const list = [c('a', 10, 1), c('b', 5, 1), c('fav', 0), c('d', 1, 1)]
    expect(topByUsage(list, ['fav'], 3, NOW).map((x) => x.id)).toEqual(['fav', 'a', 'b'])
  })
  it('handles limit 0', () => {
    expect(topByUsage([c('a', 1, 1)], [], 0, NOW)).toEqual([])
  })
})

describe('sortCredentialsBy', () => {
  const list = [c('beta', 1, 10, 'Trabajo'), c('alfa', 0, undefined), c('gamma', 2, 1, 'Personal')]
  it('recent', () => {
    expect(sortCredentialsBy(list, 'recent', NOW).map((x) => x.id)).toEqual(['gamma', 'beta', 'alfa'])
  })
  it('a–z', () => {
    expect(sortCredentialsBy(list, 'az', NOW).map((x) => x.id)).toEqual(['alfa', 'beta', 'gamma'])
  })
  it('category, uncategorised last', () => {
    expect(sortCredentialsBy(list, 'category', NOW).map((x) => x.id)).toEqual(['gamma', 'beta', 'alfa'])
  })
})

describe('usageHint', () => {
  it('formats counts', () => {
    expect(usageHint(12, 'hace 2 h')).toBe('Copiada 12 veces · hace 2 h')
    expect(usageHint(1, 'ayer')).toBe('Copiada 1 vez · ayer')
    expect(usageHint(0, '')).toBe('')
    expect(usageHint(0, 'ayer')).toBe('Usada ayer')
  })
})
