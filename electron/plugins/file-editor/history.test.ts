import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { addSnapshot, listSnapshots, readSnapshot, pruneTotal, lineDelta, MAX_PER_FILE, AUTOSAVE_COALESCE_MS } from './history'

let base: string
const FILE = path.resolve('/proj/Module1.vb')

beforeEach(() => { base = fs.mkdtempSync(path.join(os.tmpdir(), 'fe-history-')) })
afterEach(() => { fs.rmSync(base, { recursive: true, force: true }) })

describe('history', () => {
  it('stores, lists (newest first) and reads raw bytes', () => {
    addSnapshot(base, FILE, Buffer.from('v1'), { now: 1000 })
    addSnapshot(base, FILE, Buffer.from('v2'), { now: 2000 })
    const list = listSnapshots(base, FILE)
    expect(list.map((e) => e.id)).toEqual(['2000', '1000'])
    expect(readSnapshot(base, FILE, '1000').toString()).toBe('v1')
  })

  it('skips a snapshot identical to the last one', () => {
    expect(addSnapshot(base, FILE, Buffer.from('same'), { now: 1 })).not.toBeNull()
    expect(addSnapshot(base, FILE, Buffer.from('same'), { now: 999_999 })).toBeNull()
  })

  it('coalesces autosaves within the window, but not manual saves', () => {
    addSnapshot(base, FILE, Buffer.from('a'), { now: 0 })
    expect(addSnapshot(base, FILE, Buffer.from('b'), { now: AUTOSAVE_COALESCE_MS - 1, autosave: true })).toBeNull()
    expect(addSnapshot(base, FILE, Buffer.from('b'), { now: 10 })).not.toBeNull()
    expect(addSnapshot(base, FILE, Buffer.from('c'), { now: AUTOSAVE_COALESCE_MS + 20, autosave: true })).not.toBeNull()
  })

  it('keeps only the last MAX_PER_FILE versions', () => {
    for (let i = 0; i < MAX_PER_FILE + 5; i++) addSnapshot(base, FILE, Buffer.from(`v${i}`), { now: i + 1 })
    const list = listSnapshots(base, FILE)
    expect(list).toHaveLength(MAX_PER_FILE)
    expect(list[list.length - 1]!.id).toBe('6')
  })

  it('prunes the oldest versions across files above the total cap', () => {
    const other = path.resolve('/proj/Other.vb')
    addSnapshot(base, FILE, Buffer.alloc(100, 1), { now: 1 })
    addSnapshot(base, other, Buffer.alloc(100, 2), { now: 2 })
    addSnapshot(base, FILE, Buffer.alloc(100, 3), { now: 3 })
    pruneTotal(base, 250)
    expect(listSnapshots(base, FILE).map((e) => e.id)).toEqual(['3'])
    expect(listSnapshots(base, other)).toHaveLength(1)
  })

  it('rejects ids that are not ours', () => {
    addSnapshot(base, FILE, Buffer.from('x'), { now: 5 })
    expect(() => readSnapshot(base, FILE, '../../etc/passwd')).toThrow()
    expect(() => readSnapshot(base, FILE, '6')).toThrow('ya no existe')
  })

  it('lineDelta counts added/removed lines', () => {
    expect(lineDelta('a\nb\nc', 'a\nc\nd\ne')).toEqual({ added: 2, removed: 1 })
    expect(lineDelta('x', 'x')).toEqual({ added: 0, removed: 0 })
  })
})
