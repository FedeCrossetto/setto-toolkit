import { describe, it, expect } from 'vitest'
import { recentSnippets, matchSnippets } from './search'
import type { Snippet } from './types'

function sn(p: Partial<Snippet>): Snippet {
  return {
    id: p.id ?? 'x', title: '', language: 'sql', content: '', tags: [], description: '',
    pinned: false, collectionId: null, createdAt: '', updatedAt: '', ...p,
  }
}

const all = [
  sn({ id: 'a', title: 'Cuentas activas', content: 'SELECT * FROM accounts', tags: ['cuentas'], lastUsedAt: 10 }),
  sn({ id: 'b', title: 'Reiniciar servicio', language: 'powershell', content: 'Restart-Service WCP', pinned: true }),
  sn({ id: 'c', title: 'Captura', content: '![](data:image/png;base64,QUJDRA==) nota', lastUsedAt: 30 }),
  sn({ id: 'd', title: 'Sin uso', content: 'nada' }),
]

describe('recentSnippets', () => {
  it('returns pinned first then most recently used, skipping never used', () => {
    expect(recentSnippets(all).map((s) => s.id)).toEqual(['b', 'c', 'a'])
  })
  it('caps the list', () => {
    expect(recentSnippets(all, 2)).toHaveLength(2)
  })
})

describe('matchSnippets', () => {
  it('matches title, tags and content, accent-insensitive', () => {
    expect(matchSnippets(all, 'cuentas').map((r) => r.snippet.id)).toEqual(['a'])
    expect(matchSnippets(all, 'restart wcp').map((r) => r.snippet.id)).toEqual(['b'])
    expect(matchSnippets(all, 'ACTÍVAS').map((r) => r.snippet.id)).toEqual(['a'])
  })
  it('does not index embedded data URLs', () => {
    expect(matchSnippets(all, 'base64')).toHaveLength(0)
    expect(matchSnippets(all, 'QUJDRA')).toHaveLength(0)
    expect(matchSnippets(all, 'nota').map((r) => r.snippet.id)).toEqual(['c'])
  })
  it('ranks title matches above content matches', () => {
    const list = [sn({ id: 'x', title: 'otra', content: 'servicio' }), sn({ id: 'y', title: 'servicio' })]
    expect(matchSnippets(list, 'servicio').map((r) => r.snippet.id)).toEqual(['y', 'x'])
  })
})
