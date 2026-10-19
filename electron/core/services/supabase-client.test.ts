import { describe, expect, it, vi } from 'vitest'
import { fetchWithTimeout } from './supabase-client'

/** fetch falso que nunca responde salvo que lo aborten. */
const hanging: typeof fetch = (_input, init) => new Promise((_resolve, reject) => {
  init?.signal?.addEventListener('abort', () => reject(init.signal?.reason ?? new Error('aborted')))
})

describe('fetchWithTimeout', () => {
  it('aborts a request that never answers', async () => {
    vi.useFakeTimers()
    try {
      const p = fetchWithTimeout(12_000, hanging)('https://x.supabase.co/rest/v1/gastos')
      const check = expect(p).rejects.toThrow(/timeout/)
      await vi.advanceTimersByTimeAsync(12_000)
      await check
    } finally {
      vi.useRealTimers()
    }
  })

  it('passes the response through and honours the caller signal', async () => {
    const ok = vi.fn(async () => new Response('[]', { status: 200 })) as unknown as typeof fetch
    const res = await fetchWithTimeout(1000, ok)('https://x')
    expect(res.status).toBe(200)

    const ctrl = new AbortController()
    const p = fetchWithTimeout(60_000, hanging)('https://x', { signal: ctrl.signal })
    ctrl.abort(new Error('cancelado'))
    await expect(p).rejects.toThrow('cancelado')
  })
})
