import { describe, expect, it } from 'vitest'
import { conflictCopyId, markConflictContent, planSync, type LocalItem, type RemoteItem } from './sync-plan'
import { isValidNoteId } from '../../plugins/notes/notes-utils'

const L = (hash: string): LocalItem => ({ hash, updatedAt: 1 })
const R = (hash: string, deleted = false): RemoteItem => ({ hash, updatedAt: 1, deleted })
const plan = (
  local: Record<string, LocalItem>, remote: Record<string, RemoteItem>, base: Record<string, string>,
): Record<string, string> =>
  Object.fromEntries(planSync(new Map(Object.entries(local)), new Map(Object.entries(remote)), base).map((o) => [o.id, o.type]))

describe('planSync', () => {
  it('uploads new local items and downloads new remote ones', () => {
    expect(plan({ a: L('1') }, {}, {})).toEqual({ a: 'push' })
    expect(plan({}, { b: R('1') }, {})).toEqual({ b: 'pull' })
  })
  it('detects who changed using the base', () => {
    expect(plan({ a: L('2') }, { a: R('1') }, { a: '1' })).toEqual({ a: 'push' })
    expect(plan({ a: L('1') }, { a: R('2') }, { a: '1' })).toEqual({ a: 'pull' })
    expect(plan({ a: L('1') }, { a: R('1') }, { a: '0' })).toEqual({ a: 'in-sync' })
  })
  it('flags conflicts when both sides changed (or there is no base)', () => {
    expect(plan({ a: L('2') }, { a: R('3') }, { a: '1' })).toEqual({ a: 'conflict' })
    expect(plan({ a: L('2') }, { a: R('3') }, {})).toEqual({ a: 'conflict' })
  })
  it('propagates deletions both ways', () => {
    expect(plan({}, { a: R('1') }, { a: '1' })).toEqual({ a: 'push-delete' })
    expect(plan({ a: L('1') }, { a: R('1', true) }, { a: '1' })).toEqual({ a: 'delete-local' })
  })
  it('never loses local edits to a remote deletion, nor remote edits to a local one', () => {
    expect(plan({ a: L('2') }, { a: R('1', true) }, { a: '1' })).toEqual({ a: 'push' })
    expect(plan({}, { a: R('2') }, { a: '1' })).toEqual({ a: 'pull' })
  })
  it('forgets items gone everywhere', () => {
    expect(plan({}, { a: R('1', true) }, { a: '1' })).toEqual({ a: 'forget' })
    expect(plan({}, {}, { a: '1' })).toEqual({ a: 'forget' })
    expect(plan({}, { a: R('1', true) }, {})).toEqual({})
  })
})

describe('conflictCopyId', () => {
  it('builds a unique name', () => {
    const d = new Date(2026, 9, 12)
    expect(conflictCopyId('Ideas.md', new Set(), d)).toBe('Ideas - conflicto 2026-10-12.md')
    expect(conflictCopyId('Ideas.md', new Set(['Ideas - conflicto 2026-10-12.md']), d)).toBe('Ideas - conflicto 2026-10-12 2.md')
    expect(isValidNoteId(conflictCopyId('Mi nota_1.md', new Set(), d))).toBe(true)
  })
})

describe('markConflictContent', () => {
  it('marks the title line', () => {
    const d = new Date(2026, 9, 12)
    expect(markConflictContent('\n# Ideas\ncuerpo', d)).toBe(`\n# Ideas (conflicto ${d.toLocaleDateString('es-AR')})\ncuerpo`)
  })
})
