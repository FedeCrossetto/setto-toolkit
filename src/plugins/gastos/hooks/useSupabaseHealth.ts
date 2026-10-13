/**
 * Salud de Supabase para la UI de Gastos: se consulta al montar, al volver el foco (con
 * throttle) y cuando Conexiones avisa que cambió la configuración (`setto:supabase-config-changed`).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { SupabaseHealth, SupabaseTableName } from '../types'

export const SUPABASE_CONFIG_CHANGED_EVENT = 'setto:supabase-config-changed'
const FOCUS_MIN_INTERVAL_MS = 30_000

export type HealthStatus = 'checking' | 'ok' | 'unconfigured' | 'incomplete' | 'auth' | 'unreachable'

export function healthStatus(h: SupabaseHealth | null): HealthStatus {
  if (!h) return 'checking'
  if (!h.configured) return 'unconfigured'
  if (!h.reachable) return 'unreachable'
  if (!h.authOk) return 'auth'
  if (h.missingSql) return 'incomplete'
  return 'ok'
}

export const GASTOS_TABLES: SupabaseTableName[] = ['servicios', 'pagos', 'gastos']

/** `https://abcd.supabase.co` → `abcd` (para el link al SQL Editor). */
export function projectRef(url: string): string | null {
  try {
    const host = new URL(url).hostname
    return host.endsWith('.supabase.co') ? host.split('.')[0] ?? null : null
  } catch {
    return null
  }
}

export function useSupabaseHealth(onConfigChanged?: () => void): {
  health: SupabaseHealth | null
  status: HealthStatus
  checking: boolean
  check: () => Promise<SupabaseHealth | null>
} {
  const [health, setHealth] = useState<SupabaseHealth | null>(null)
  const [checking, setChecking] = useState(false)
  const lastRef = useRef(0)
  const inFlight = useRef<Promise<SupabaseHealth | null> | null>(null)
  const onChangedRef = useRef(onConfigChanged)
  onChangedRef.current = onConfigChanged

  const check = useCallback(async (): Promise<SupabaseHealth | null> => {
    if (inFlight.current) return inFlight.current
    setChecking(true)
    lastRef.current = Date.now()
    inFlight.current = window.api.invoke<SupabaseHealth>('gastos:supabase-health')
      .then((h) => { setHealth(h); return h })
      .catch(() => null)
      .finally(() => { setChecking(false); inFlight.current = null })
    return inFlight.current
  }, [])

  useEffect(() => { void check() }, [check])

  useEffect(() => {
    const onFocus = (): void => {
      if (Date.now() - lastRef.current < FOCUS_MIN_INTERVAL_MS) return
      void check()
    }
    const onChanged = (): void => {
      void check().then(() => onChangedRef.current?.())
    }
    window.addEventListener('focus', onFocus)
    window.addEventListener(SUPABASE_CONFIG_CHANGED_EVENT, onChanged)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener(SUPABASE_CONFIG_CHANGED_EVENT, onChanged)
    }
  }, [check])

  return { health, status: healthStatus(health), checking, check }
}
