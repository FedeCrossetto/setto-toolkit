import { useEffect, useRef, useState } from 'react'

/**
 * Soft delete for the "Deshacer" pattern (pure, timers injectable).
 * `hide` hides an item right away and schedules the real delete (`commit`)
 * after `delayMs` (a bit longer than the undo toast). `restore` cancels it.
 * `flush` commits everything pending now (unmount / window close).
 */
export interface SoftDeleteOptions {
  delayMs: number
  /** Called whenever the hidden set changes. */
  onChange?: (hidden: string[]) => void
  /** Called when a commit fails (the item is shown again). */
  onError?: (key: string, err: unknown) => void
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (t: unknown) => void
}

export interface SoftDeleteQueue {
  hide: (key: string, commit: () => Promise<void> | void) => void
  /** `false` if it was already committed (or never hidden). */
  restore: (key: string) => boolean
  isHidden: (key: string) => boolean
  hidden: () => string[]
  flush: () => Promise<void>
}

export function createSoftDeleteQueue(opts: SoftDeleteOptions): SoftDeleteQueue {
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = opts.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>))
  const pending = new Map<string, { timer: unknown; commit: () => Promise<void> | void }>()
  const notify = (): void => opts.onChange?.([...pending.keys()])

  const run = async (key: string): Promise<void> => {
    const p = pending.get(key)
    if (!p) return
    clearTimer(p.timer)
    pending.delete(key)
    try {
      await p.commit()
    } catch (err) {
      opts.onError?.(key, err)
    } finally {
      notify()
    }
  }

  return {
    hide(key, commit) {
      const prev = pending.get(key)
      if (prev) clearTimer(prev.timer)
      pending.set(key, { commit, timer: setTimer(() => { void run(key) }, opts.delayMs) })
      notify()
    },
    restore(key) {
      const p = pending.get(key)
      if (!p) return false
      clearTimer(p.timer)
      pending.delete(key)
      notify()
      return true
    },
    isHidden: (key) => pending.has(key),
    hidden: () => [...pending.keys()],
    async flush() {
      await Promise.all([...pending.keys()].map(run))
    },
  }
}

/** Undo toast (6 s, paused on hover) + margin before the delete is committed. */
export const SOFT_DELETE_MS = 10_000

/**
 * React wrapper: `hidden` re-renders the list; pending deletes are committed on
 * unmount and before the window closes. `onError` gets failed commits.
 */
export function useSoftDelete(onError?: (key: string, err: unknown) => void, delayMs = SOFT_DELETE_MS): {
  hidden: ReadonlySet<string>
  hide: SoftDeleteQueue['hide']
  restore: SoftDeleteQueue['restore']
  flush: SoftDeleteQueue['flush']
} {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set())
  const errRef = useRef(onError)
  errRef.current = onError
  const qRef = useRef<SoftDeleteQueue | null>(null)
  if (!qRef.current) {
    qRef.current = createSoftDeleteQueue({
      delayMs,
      onChange: (h) => setHidden(new Set(h)),
      onError: (k, e) => errRef.current?.(k, e),
    })
  }
  const q = qRef.current
  useEffect(() => {
    const onUnload = (): void => { void q.flush() }
    window.addEventListener('beforeunload', onUnload)
    return () => { window.removeEventListener('beforeunload', onUnload); void q.flush() }
  }, [q])
  return { hidden, hide: q.hide, restore: q.restore, flush: q.flush }
}
