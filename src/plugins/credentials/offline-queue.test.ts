import { describe, it, expect, vi } from 'vitest'
import { applyQueue, dequeue, enqueue, flushQueue, type QueueOp } from './offline-queue'
import type { CredentialMeta } from './types'

const meta = (id: string, nombre = id): CredentialMeta => ({ id, nombre, usuario: '', orden: 0 })
const up = (id: string, nombre = id): QueueOp => ({ kind: 'upsert', id, meta: meta(id, nombre), at: 1 })
const del = (id: string): QueueOp => ({ kind: 'delete', id, at: 2 })

describe('enqueue / dequeue', () => {
  it('keeps only the last op per id, in order', () => {
    let q: QueueOp[] = []
    q = enqueue(q, up('a', 'A1'))
    q = enqueue(q, up('b'))
    q = enqueue(q, up('a', 'A2'))
    expect(q.map((o) => o.id)).toEqual(['b', 'a'])
    expect(q[1]).toMatchObject({ kind: 'upsert', meta: { nombre: 'A2' } })
    q = enqueue(q, del('a'))
    expect(q).toEqual([up('b'), del('a')])
    expect(dequeue(q, 'b')).toEqual([del('a')])
  })
})

describe('applyQueue', () => {
  it('overlays pending upserts (marked) and hides pending deletes', () => {
    const items = [meta('a', 'A'), meta('b', 'B')]
    const out = applyQueue(items, [up('a', 'A edit'), up('c', 'C'), del('b')])
    expect(out).toEqual([
      { ...meta('a', 'A edit'), pending: true },
      { ...meta('c', 'C'), pending: true },
    ])
    expect(items).toHaveLength(2) // input untouched
  })
})

describe('flushQueue', () => {
  it('replays everything when online', async () => {
    const exec = vi.fn().mockResolvedValue(undefined)
    const r = await flushQueue([up('a'), del('b')], exec)
    expect(r).toEqual({ remaining: [], done: 2 })
    expect(exec).toHaveBeenCalledTimes(2)
  })
  it('stops at the first failure and keeps the rest', async () => {
    const exec = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('fetch failed'))
    const q = [up('a'), up('b'), del('c')]
    const r = await flushQueue(q, exec)
    expect(r.done).toBe(1)
    expect(r.remaining).toEqual([up('b'), del('c')])
    expect(r.error).toBe('fetch failed')
    expect(exec).toHaveBeenCalledTimes(2)
  })
})
