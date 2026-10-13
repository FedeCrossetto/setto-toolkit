import { describe, it, expect } from 'vitest'
import { migrateQueries, snippetIdForQuery } from './migrate-queries'
import type { Snippet, SnippetCollection } from '../../../src/plugins/snippets/types'

const now = new Date('2026-01-01T00:00:00Z')
const queries = [
  { id: 'a', motor: 'SQL Server', descripcion: 'Cuentas activas', query: 'SELECT 1', tags: ['cuentas'], orden: 2 },
  { id: 'b', motor: '', descripcion: '', query: 'SELECT 2', orden: 1 },
]

describe('migrateQueries', () => {
  it('imports every query as sql snippet in a new "Queries" collection', () => {
    const r = migrateQueries([], [], queries, now)
    expect(r.added).toBe(2)
    expect(r.collections).toHaveLength(1)
    expect(r.collections[0]!.name).toBe('Queries')
    expect(r.snippets.map((s) => s.id)).toEqual([snippetIdForQuery('b'), snippetIdForQuery('a')])
    const a = r.snippets.find((s) => s.id === 'query-a')!
    expect(a).toMatchObject({ language: 'sql', title: 'Cuentas activas', content: 'SELECT 1', collectionId: r.collections[0]!.id })
    expect(a.tags).toEqual(['cuentas', 'SQL Server'])
    expect(r.snippets.find((s) => s.id === 'query-b')!.title).toBe('Query sin título')
  })

  it('is idempotent', () => {
    const first = migrateQueries([], [], queries, now)
    const second = migrateQueries(first.snippets, first.collections, queries, now)
    expect(second.added).toBe(0)
    expect(second.snippets).toBe(first.snippets)
    expect(second.collections).toBe(first.collections)
  })

  it('reuses an existing "Queries" collection and keeps existing snippets', () => {
    const cols: SnippetCollection[] = [{ id: 'c1', name: 'queries', createdAt: '' }]
    const existing = [{ id: 'x', title: 'x' } as Snippet]
    const r = migrateQueries(existing, cols, [queries[0]!], now)
    expect(r.collections).toBe(cols)
    expect(r.snippets).toHaveLength(2)
    expect(r.snippets[1]!.collectionId).toBe('c1')
  })

  it('only adds queries not yet imported', () => {
    const first = migrateQueries([], [], [queries[0]!], now)
    const r = migrateQueries(first.snippets, first.collections, queries, now)
    expect(r.added).toBe(1)
    expect(r.collections).toHaveLength(1)
  })
})
