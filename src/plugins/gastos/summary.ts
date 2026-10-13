/**
 * Resumen mensual de Gastos para otros módulos (Dashboard). Sólo usa IPC (Supabase o el
 * caché compartido del main); no importa la UI de Gastos.
 */
import { computeMonthSummary, currentMes, type GastosData } from './analytics'
import { readCacheState, readPendingWrites } from './local-store'
import { applyWrites } from './sync-queue'
import type { GastosLoadResult, GastosPrefs } from './types'

export interface GastosMonthSummary {
  mes: string /* YYYY-MM */
  total: number
  fijos: number
  variables: number
  pendientes: number
  pendientesCount: number
  presupuesto: number | null
  previousTotal: number
}

/**
 * Devuelve el resumen de `mes` (por defecto el actual). Si Supabase no responde (o le falta
 * una tabla) usa el caché compartido de la última carga, con los cambios sin subir aplicados;
 * `null` si Gastos no está configurado y no hay caché.
 */
export async function getMonthSummary(mes?: string): Promise<GastosMonthSummary | null> {
  const snap = await loadGastosSnapshot()
  if (!snap) return null
  const presu = snap.prefs.presupuesto
  return computeMonthSummary(snap.data, mes ?? currentMes(), typeof presu === 'number' && presu > 0 ? presu : null)
}

/**
 * Datos actuales de Gastos (Supabase o, si falla, el caché compartido) con los cambios
 * sin subir ya aplicados, más las preferencias locales. `null` si no hay nada.
 */
export async function loadGastosSnapshot(): Promise<{ data: GastosData; prefs: GastosPrefs } | null> {
  const [cache, pending] = await Promise.all([readCacheState(), readPendingWrites()])
  let data: GastosData | null = null
  try {
    const res = await window.api.invoke<GastosLoadResult>('gastos:load')
    const missing = res.missingTables ?? []
    data = {
      servicios: missing.includes('servicios') ? cache.data?.servicios ?? [] : res.servicios ?? [],
      pagos: missing.includes('pagos') ? cache.data?.pagos ?? [] : res.pagos ?? [],
      gastos: missing.includes('gastos') || res.gastosTableReady === false ? cache.data?.gastos ?? [] : res.gastos ?? [],
    }
  } catch {
    data = cache.data
  }
  if (!data) return null
  return { data: applyWrites(data, pending), prefs: cache.prefs }
}
