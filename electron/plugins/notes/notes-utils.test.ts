import { describe, it, expect } from 'vitest'
import {
  isValidNoteId, assertNoteId, extractTitle, extractPreview, slugifyTitle,
  uniqueNoteFilename, sortNotes, dateStamp, defaultNoteBase, extractLinks, extractTags,
} from './notes-utils'

describe('isValidNoteId', () => {
  it('accepts plain .md filenames', () => {
    expect(isValidNoteId('Ideas.md')).toBe(true)
    expect(isValidNoteId('Nota 2026-10-10 0930.md')).toBe(true)
    expect(isValidNoteId('a_b-c.d.md')).toBe(true)
  })
  it('rejects traversal, separators and other extensions', () => {
    for (const bad of ['../x.md', '..\\x.md', 'a/b.md', 'a\\b.md', 'x.txt', '.md', '.hidden.md', 'a..b.md',
      'x.md\0', ' x.md', 'C:x.md', '', 'ñandú.md', 42, null, undefined]) {
      expect(isValidNoteId(bad)).toBe(false)
    }
  })
  it('assertNoteId throws on invalid ids', () => {
    expect(() => assertNoteId('../etc/passwd')).toThrow()
    expect(assertNoteId('ok.md')).toBe('ok.md')
  })
})

describe('extractTitle / extractPreview', () => {
  it('uses the first non-empty line without # marks', () => {
    expect(extractTitle('\n\n## Reunión con Ana  \nresto')).toBe('Reunión con Ana')
    expect(extractTitle('   ')).toBe('Sin título')
    expect(extractTitle('', '')).toBe('')
  })
  it('builds a one-line preview from the rest', () => {
    expect(extractPreview('# Título\n\n- [ ] tarea uno\n> cita\n  texto   largo')).toBe('tarea uno cita texto largo')
    expect(extractPreview('solo título')).toBe('')
    expect(extractPreview('t\n' + 'x'.repeat(500), 20)).toHaveLength(20)
  })
})

describe('slugifyTitle', () => {
  it('strips accents and unsafe characters', () => {
    expect(slugifyTitle('Café: ideas / pendientes?')).toBe('Cafe ideas pendientes')
    expect(slugifyTitle('...secreto..')).toBe('secreto')
    expect(slugifyTitle('***')).toBe('')
  })
})

describe('uniqueNoteFilename', () => {
  const now = new Date(2026, 9, 10, 9, 5)
  it('uses the title slug', () => {
    expect(uniqueNoteFilename('# Lista de compras\nleche', [], now)).toBe('Lista de compras.md')
  })
  it('falls back to a dated name when there is no usable title', () => {
    expect(uniqueNoteFilename('', [], now)).toBe('Nota 2026-10-10 0905.md')
    expect(uniqueNoteFilename('!!!', [], now)).toBe('Nota 2026-10-10 0905.md')
  })
  it('appends a counter on (case-insensitive) collisions', () => {
    expect(uniqueNoteFilename('Ideas', ['ideas.md', 'Ideas 2.md'], now)).toBe('Ideas 3.md')
  })
  it('always returns a valid id', () => {
    expect(isValidNoteId(uniqueNoteFilename('a/../b', [], now))).toBe(true)
  })
})

describe('misc', () => {
  it('formats dates', () => {
    const d = new Date(2026, 0, 3, 7, 8)
    expect(dateStamp(d)).toBe('2026-01-03')
    expect(defaultNoteBase(d)).toBe('Nota 2026-01-03 0708')
  })
  it('sorts pinned first then newest', () => {
    const r = sortNotes([
      { id: 'a', pinned: false, updatedAt: 3 },
      { id: 'b', pinned: true, updatedAt: 1 },
      { id: 'c', pinned: false, updatedAt: 5 },
      { id: 'd', pinned: true, updatedAt: 2 },
    ])
    expect(r.map((n) => n.id)).toEqual(['d', 'b', 'c', 'a'])
  })
})

describe('extractLinks / extractTags', () => {
  it('finds [[links]] with alias, once, ignoring code', () => {
    const md = 'Ver [[Proyecto X]] y [[proyecto x|el proyecto]], también [[ Ideas ]].\n```\n[[NoEs]]\n```\n`[[Tampoco]]`'
    expect(extractLinks(md)).toEqual(['Proyecto X', 'Ideas'])
  })
  it('finds #tags but not headings, hex colors, numbers or url anchors', () => {
    const md = '# Título\n## Sub\nTrabajo #wigos y #Ideas/2026, color #fff y #a1b2c3, issue #123, https://x.com/#ancla (#reunión)'
    expect(extractTags(md)).toEqual(['wigos', 'ideas/2026', 'reunión'])
  })
})
