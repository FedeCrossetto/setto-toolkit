/**
 * Offline write queue for credentials (pure). Lives in main, persisted encrypted.
 * Ops carry metadata only: the password is already in the local vault and is
 * read from there when the op is replayed.
 */
import type { CredentialMeta } from './types'

export type QueueOp =
  | { kind: 'upsert'; id: string; meta: CredentialMeta; at: number }
  | { kind: 'delete'; id: string; at: number }

/** Adds an op, replacing any earlier op for the same id (last write wins). */
export function enqueue(queue: QueueOp[], op: QueueOp): QueueOp[] {
  return [...queue.filter((q) => q.id !== op.id), op]
}

/** Removes the ops of an id (e.g. once it was saved online). */
export function dequeue(queue: QueueOp[], id: string): QueueOp[] {
  return queue.filter((q) => q.id !== id)
}

/** Overlays the pending ops on a list (upserts replace/add and are marked; deletes hide). */
export function applyQueue<T extends CredentialMeta>(items: T[], queue: QueueOp[]): (CredentialMeta & { pending?: boolean })[] {
  const out: (CredentialMeta & { pending?: boolean })[] = [...items]
  for (const op of queue) {
    const i = out.findIndex((c) => c.id === op.id)
    if (op.kind === 'delete') {
      if (i >= 0) out.splice(i, 1)
    } else {
      const merged = { ...(i >= 0 ? out[i] : {}), ...op.meta, pending: true }
      if (i >= 0) out[i] = merged
      else out.push(merged)
    }
  }
  return out
}

export interface FlushResult {
  remaining: QueueOp[]
  done: number
  error?: string
}

/**
 * Replays the ops in order. Stops at the first failure (when offline every op
 * would fail anyway) and keeps that op and the rest for the next attempt.
 */
export async function flushQueue(queue: QueueOp[], exec: (op: QueueOp) => Promise<void>): Promise<FlushResult> {
  let done = 0
  for (let i = 0; i < queue.length; i++) {
    const op = queue[i] as QueueOp
    try {
      await exec(op)
      done++
    } catch (err) {
      return { remaining: queue.slice(i), done, error: err instanceof Error ? err.message : String(err) }
    }
  }
  return { remaining: [], done }
}
