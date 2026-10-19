import { describe, expect, it } from 'vitest'
import { BLOC_ID, blocStats, formatStats, recentNotes } from './bloc-utils'
import type { NoteMeta } from '../plugins/notes/types'

const note = (id: string, updatedAt: number): NoteMeta => ({ id, title: id, preview: '', updatedAt, pinned: false, links: [], tags: [] })

describe('blocStats', () => {
  it('vacío', () => expect(blocStats('')).toEqual({ chars: 0, lines: 0, words: 0 }))
  it('cuenta caracteres, líneas y palabras', () => {
    expect(blocStats('hola mundo\nchau')).toEqual({ chars: 15, lines: 2, words: 3 })
    expect(blocStats('a\r\nb\rc')).toMatchObject({ lines: 3 })
  })
  it('cuenta emojis como un carácter', () => expect(blocStats('👍').chars).toBe(1))
})

describe('formatStats', () => {
  it('singular y plural', () => {
    expect(formatStats(blocStats(''))).toBe('Vacío')
    expect(formatStats(blocStats('a'))).toBe('1 carácter · 1 línea')
    expect(formatStats(blocStats('ab\ncd'))).toBe('5 caracteres · 2 líneas')
  })
})

describe('recentNotes', () => {
  it('excluye el Bloc y ordena por fecha', () => {
    const r = recentNotes([note('a.md', 1), note(BLOC_ID, 9), note('b.md', 5), note('c.md', 3), note('d.md', 2)])
    expect(r.map((x) => x.id)).toEqual(['b.md', 'c.md', 'd.md'])
  })
})
