import { afterEach, describe, expect, it, vi } from 'vitest'
import { fileEditorSearchProvider, isMissing, recentCandidates } from './search'
import { publishOpenFiles } from './openFilesStore'
import type { RecentFile } from './types'

const rf = (path: string): RecentFile => ({ path, name: path.split('/').pop()!, openedAt: '2026-01-01' })

describe('recentCandidates', () => {
  it('skips open files; empty query keeps them all (up to max)', () => {
    const recents = [rf('/a/x.ts'), rf('/a/y.ts'), rf('/a/z.ts')]
    expect(recentCandidates(recents, new Set(['/a/x.ts']), '', 5).map((r) => r.path)).toEqual(['/a/y.ts', '/a/z.ts'])
    expect(recentCandidates(recents, new Set(), 'z', 5).map((r) => r.path)).toEqual(['/a/z.ts'])
    expect(recentCandidates(recents, new Set(), '', 1)).toHaveLength(1)
  })
})

describe('fileEditorSearchProvider', () => {
  afterEach(() => { vi.unstubAllGlobals(); publishOpenFiles(null) })

  it('empty query lists open tabs first, then recents, and marks missing ones', async () => {
    publishOpenFiles([{ id: '1', name: 'open.ts', path: '/a/open.ts', isDirty: false }])
    const invoke = vi.fn(async (ch: string, arg?: string[]) => {
      if (ch === 'editor:recent-get') return [rf('/a/open.ts'), rf('/a/gone.ts'), rf('/a/here.ts')]
      if (ch === 'editor:exists') return Object.fromEntries((arg ?? []).map((p) => [p, p !== '/a/gone.ts']))
      throw new Error('unknown')
    })
    vi.stubGlobal('window', { api: { invoke } })
    const items = await fileEditorSearchProvider.search('')
    expect(items.map((i) => i.title)).toEqual(['open.ts', 'gone.ts', 'here.ts'])
    expect(isMissing('/a/gone.ts')).toBe(true)
    expect(items.find((i) => i.title === 'gone.ts')?.hint).toBe('Ya no existe')
    expect(items.find((i) => i.title === 'here.ts')?.hint).toBe('Reciente')
  })
})
