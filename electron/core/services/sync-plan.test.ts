import { describe, expect, it } from 'vitest'
import { conflictCopyId, markConflictContent, planSync, syncGuard, type LocalItem, type RemoteItem, type SyncOp } from './sync-plan'
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

describe('syncGuard', () => {
  const remote = (n: number): Map<string, RemoteItem> => new Map(Array.from({ length: n }, (_, i) => [`n${i}`, R(String(i))]))
  const dels = (n: number): SyncOp[] => Array.from({ length: n }, (_, i) => ({ type: 'push-delete', id: `n${i}` }))

  it('aborts when local is empty and the plan would wipe the remote', () => {
    expect(syncGuard('notas', 0, remote(3), dels(3))).toMatch(/no hay notas/)
    expect(syncGuard('notas', 0, remote(1), dels(1))).toBeNull()   // borrar la única nota es legítimo
  })
  it('lets a fresh machine (only pulls) through', () => {
    expect(syncGuard('notas', 0, remote(30), [{ type: 'pull', id: 'n0' }])).toBeNull()
  })
  it('aborts mass remote deletes (> 5 and > 30 %)', () => {
    expect(syncGuard('notas', 10, remote(20), dels(7))).toMatch(/7 de 20/)
  })
  it('allows a few deletes or a small ratio', () => {
    expect(syncGuard('notas', 10, remote(20), dels(5))).toBeNull()
    expect(syncGuard('notas', 90, remote(100), dels(20))).toBeNull()
  })
  it('the full plan of an emptied folder is caught', () => {
    const base = Object.fromEntries([...remote(8).entries()].map(([id, r]) => [id, r.hash]))
    const ops = planSync(new Map(), remote(8), base)
    expect(syncGuard('notas', 0, remote(8), ops)).not.toBeNull()
  })
})
