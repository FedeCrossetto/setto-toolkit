import { describe, expect, it } from 'vitest'
import {
  buildGroups, cycleGroup, flattenGroups, moveSelection, resolveSelection, scoreMatch, type ProviderResult,
} from './palette-logic'
import type { SearchItem } from './search'

const item = (id: string, score?: number): SearchItem => ({ id, title: id, score, run: () => {} })

describe('scoreMatch', () => {
  it('returns 0 for an empty query and -1 when a word is missing', () => {
    expect(scoreMatch('', 'Notas')).toBe(0)
    expect(scoreMatch('gasto', 'Notas', 'markdown')).toBe(-1)
  })

  it('ranks exact > prefix > word prefix > substring > extra fields', () => {
    const exact = scoreMatch('notas', 'Notas')
    const prefix = scoreMatch('not', 'Notas recientes')
    const word = scoreMatch('rec', 'Notas recientes')
    const sub = scoreMatch('ota', 'Notas')
    const extra = scoreMatch('markdown', 'Notas', 'bloc markdown')
    expect(exact).toBeGreaterThan(prefix)
    expect(prefix).toBeGreaterThan(word)
    expect(word).toBeGreaterThan(sub)
    expect(sub).toBeGreaterThan(extra)
    expect(extra).toBeGreaterThan(0)
  })

  it('is case and accent insensitive', () => {
    expect(scoreMatch('modulos', 'Módulos')).toBe(100)
    expect(scoreMatch('CAPTURA RAPIDA', 'Captura rápida')).toBe(100)
  })
})

describe('buildGroups', () => {
  const results: ProviderResult[] = [
    { id: 'b', group: 'B', order: 1, items: [item('b1', 1), item('b2', 9)] },
    { id: 'a', group: 'A', order: 0, items: [item('a1'), item('a2'), item('a3')] },
    { id: 'empty', group: 'Vacío', order: 2, items: [] },
  ]

  it('orders groups by `order`, drops empty groups and sorts items by score', () => {
    const groups = buildGroups(results)
    expect(groups.map((g) => g.label)).toEqual(['A', 'B'])
    expect(groups[1]!.items.map((i) => i.id)).toEqual(['b2', 'b1'])
  })

  it('keeps the provider order for equal scores (stable)', () => {
    expect(buildGroups(results)[0]!.items.map((i) => i.id)).toEqual(['a1', 'a2', 'a3'])
  })

  it('caps each group, honouring a per-group limit', () => {
    const many = Array.from({ length: 9 }, (_, i) => item(`x${i}`))
    expect(buildGroups([{ id: 'x', group: 'X', order: 0, items: many }])[0]!.items).toHaveLength(5)
    expect(buildGroups([{ id: 'x', group: 'X', order: 0, items: many, limit: 2 }])[0]!.items).toHaveLength(2)
  })

  it('deduplicates item ids across groups (first group wins)', () => {
    const groups = buildGroups([
      { id: 'a', group: 'A', order: 0, items: [item('dup')] },
      { id: 'b', group: 'B', order: 1, items: [item('dup'), item('other')] },
    ])
    expect(flattenGroups(groups).map((i) => i.id)).toEqual(['dup', 'other'])
  })
})

describe('navigation', () => {
  const groups = buildGroups([
    { id: 'a', group: 'A', order: 0, items: [item('a1'), item('a2')] },
    { id: 'b', group: 'B', order: 1, items: [item('b1')] },
    { id: 'c', group: 'C', order: 2, items: [item('c1'), item('c2')] },
  ])

  it('keeps the selected item when results stream in, else falls back to the first', () => {
    expect(resolveSelection(groups, 'b1')).toBe('b1')
    expect(resolveSelection(groups, 'gone')).toBe('a1')
    expect(resolveSelection([], 'a1')).toBeNull()
  })

  it('moves with wrap-around', () => {
    expect(moveSelection(groups, 'a2', 1)).toBe('b1')
    expect(moveSelection(groups, 'c2', 1)).toBe('a1')
    expect(moveSelection(groups, 'a1', -1)).toBe('c2')
    expect(moveSelection(groups, null, -1)).toBe('c2')
  })

  it('cycles groups with Tab / Shift+Tab', () => {
    expect(cycleGroup(groups, 'a2', 1)).toBe('b1')
    expect(cycleGroup(groups, 'c1', 1)).toBe('a1')
    expect(cycleGroup(groups, 'a1', -1)).toBe('c1')
  })
})
