/**
 * Resumen mensual de Gastos para otros módulos (Inicio, dock, avisos). Sólo usa IPC: el main
 * hace una consulta liviana del mes (`gastos:summary`) o usa el caché compartido; nunca dispara
 * la carga completa de Gastos. No importa la UI de Gastos.
 */
import { currentMes, type GastosData } from './analytics'
import { readCacheState, readPendingWrites } from './local-store'
import { applyWrites } from './sync-queue'
import { GASTOS_CHANGED_EVENT } from './direct-write'
import type { GastosLoadResult, GastosMonthSummary, GastosPrefs, GastosSummaryResult } from './types'

export type { GastosMonthSummary, GastosSummaryResult } from './types'

/** Memo corto: Inicio y el dock piden lo mismo casi a la vez. */
const MEMO_MS = 15_000
let memo: { mes: string; at: number; value: Promise<GastosSummaryResult> } | null = null

/** Olvida el memo (después de guardar un gasto). */
export function invalidateGastosSummary(): void {
  memo = null
}

/** Estado + totales del mes (por defecto el actual). Nunca lanza. */
export function getMonthSummaryState(mes = currentMes(), opts?: { force?: boolean }): Promise<GastosSummaryResult> {
  if (!opts?.force && memo && memo.mes === mes && Date.now() - memo.at < MEMO_MS) return memo.value
  const value = window.api.invoke<GastosSummaryResult>('gastos:summary', mes).catch((e: unknown): GastosSummaryResult => ({
    status: 'error', summary: null, error: e instanceof Error ? e.message : String(e), pendingCount: 0, cachedAt: null,
  }))
  memo = { mes, at: Date.now(), value }
  return value
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener(GASTOS_CHANGED_EVENT, invalidateGastosSummary)
}

/** Sólo los totales (del remoto o del caché local); `null` si no hay nada. */
export async function getMonthSummary(mes?: string): Promise<GastosMonthSummary | null> {
  return (await getMonthSummaryState(mes)).summary
}

/** Edad máxima del caché antes de refrescarlo con una carga completa (avisos de vencimiento). */
const SNAPSHOT_MAX_AGE_MS = 6 * 60 * 60_000

/**
 * Datos de Gastos con los cambios sin subir aplicados, más las preferencias locales. Usa el caché
 * compartido; sólo si no hay o tiene más de 6 h hace una carga completa (y la guarda en el caché).
 * `null` si no hay nada.
 */
export async function loadGastosSnapshot(): Promise<{ data: GastosData; prefs: GastosPrefs } | null> {
  const [cache, pending] = await Promise.all([readCacheState(), readPendingWrites()])
  let data: GastosData | null = cache.data
  const age = cache.updatedAt ? Date.now() - Date.parse(cache.updatedAt) : Infinity
  if (!data || !(age < SNAPSHOT_MAX_AGE_MS)) {
    try {
      const res = await window.api.invoke<GastosLoadResult>('gastos:load')
      const missing = res.missingTables ?? []
      data = {
        servicios: missing.includes('servicios') ? cache.data?.servicios ?? [] : res.servicios ?? [],
        pagos: missing.includes('pagos') ? cache.data?.pagos ?? [] : res.pagos ?? [],
        gastos: missing.includes('gastos') || res.gastosTableReady === false ? cache.data?.gastos ?? [] : res.gastos ?? [],
      }
      await window.api.invoke('gastos:cache-set', { data }).catch(() => undefined)
    } catch {
      /* sin conexión: lo que haya en el caché */
    }
  }
  if (!data) return null
  return { data: applyWrites(data, pending), prefs: cache.prefs }
}
