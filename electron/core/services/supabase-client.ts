/**
 * Supabase client for Electron main / Node 20.
 * Node < 22 has no native WebSocket — @supabase/realtime-js requires `ws`.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import ws from 'ws'

export interface SupabaseClientOptions {
  /** Corta cada request HTTP pasado este tiempo (ms), así una llamada nunca queda colgada. */
  timeoutMs?: number
}

/** `fetch` que aborta a los `timeoutMs` (respetando también la señal del llamador). */
export function fetchWithTimeout(timeoutMs: number, baseFetch: typeof fetch = fetch): typeof fetch {
  return (input, init) => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(new Error(`timeout: Supabase no respondió en ${Math.round(timeoutMs / 1000)} s`)), timeoutMs)
    const outer = init?.signal
    if (outer) {
      if (outer.aborted) ctrl.abort(outer.reason)
      else outer.addEventListener('abort', () => ctrl.abort(outer.reason), { once: true })
    }
    return baseFetch(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer))
  }
}

export function createSupabaseClient(url: string, serviceKey: string, opts: SupabaseClientOptions = {}): SupabaseClient {
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(opts.timeoutMs ? { global: { fetch: fetchWithTimeout(opts.timeoutMs) } } : {}),
    realtime: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      transport: ws as any,
    },
  })
}
