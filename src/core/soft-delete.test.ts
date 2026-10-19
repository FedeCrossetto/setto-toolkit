import { describe, expect, it, vi } from 'vitest'
import { createSoftDeleteQueue } from './soft-delete'

function fakeTimers(): { set: (fn: () => void, ms: number) => unknown; clear: (t: unknown) => void; fire: () => void } {
  const timers = new Map<number, () => void>()
  let n = 0
  return {
    set: (fn) => { timers.set(++n, fn); return n },
    clear: (t) => { timers.delete(t as number) },
    fire: () => { const fns = [...timers.values()]; timers.clear(); fns.forEach((f) => f()) },
  }
}

describe('createSoftDeleteQueue', () => {
  it('hides and commits after the delay', async () => {
    const t = fakeTimers()
    const changes: string[][] = []
    const commit = vi.fn()
    const q = createSoftDeleteQueue({ delayMs: 10, setTimer: t.set, clearTimer: t.clear, onChange: (h) => changes.push(h) })
    q.hide('a', commit)
    expect(q.isHidden('a')).toBe(true)
    t.fire()
    await Promise.resolve()
    await Promise.resolve()
    expect(commit).toHaveBeenCalledTimes(1)
    expect(q.isHidden('a')).toBe(false)
    expect(changes[0]).toEqual(['a'])
    expect(changes.at(-1)).toEqual([])
  })

  it('restore cancels the commit', () => {
    const t = fakeTimers()
    const commit = vi.fn()
    const q = createSoftDeleteQueue({ delayMs: 10, setTimer: t.set, clearTimer: t.clear })
    q.hide('a', commit)
    expect(q.restore('a')).toBe(true)
    t.fire()
    expect(commit).not.toHaveBeenCalled()
    expect(q.restore('a')).toBe(false)
  })

  it('flush commits everything now; failures are reported', async () => {
    const t = fakeTimers()
    const onError = vi.fn()
    const ok = vi.fn()
    const q = createSoftDeleteQueue({ delayMs: 10, setTimer: t.set, clearTimer: t.clear, onError })
    q.hide('a', ok)
    q.hide('b', () => { throw new Error('x') })
    await q.flush()
    expect(ok).toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith('b', expect.any(Error))
    expect(q.hidden()).toEqual([])
  })
})
