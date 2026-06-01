/**
 * Supabase client for Electron main / Node 20.
 * Node < 22 has no native WebSocket — @supabase/realtime-js requires `ws`.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import ws from 'ws'

export function createSupabaseClient(url: string, serviceKey: string): SupabaseClient {
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      transport: ws as any,
    },
  })
}
