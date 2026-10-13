/**
 * Migración one-shot del caché viejo de localStorage al caché compartido del main.
 * Pura (sin IPC ni storage) para poder testearla.
 */
import { enqueue } from './sync-queue'
import type { GastosCacheData, GastosCachePatch, GastosCacheState, GastosPrefs, PendingWrite } from './types'

export interface LegacyLocalState {
  cache: GastosCacheData | null
  pending: PendingWrite[]
  lastSynced: string | null
  presupuesto: number | null
  lastMetodo: string | null
}

export interface MigrationPlan {
  /** Había algo en localStorage (hay que limpiarlo después de aplicar el plan) */
  hasLegacy: boolean
  /** Parche para `gastos:cache-set`, o null si no hay nada que escribir */
  cachePatch: GastosCachePatch | null
  /** Cola combinada para `gastos:pending-set`, o null si no cambia */
  pending: PendingWrite[] | null
}

export function planLegacyMigration(
  legacy: LegacyLocalState,
  main: { cache: GastosCacheState; pending: PendingWrite[] },
): MigrationPlan {
  const hasLegacy = Boolean(
    legacy.cache || legacy.pending.length || legacy.lastSynced || legacy.presupuesto || legacy.lastMetodo,
  )
  if (!hasLegacy) return { hasLegacy, cachePatch: null, pending: null }

  const patch: GastosCachePatch = {}
  // Datos: sólo si el main no tiene nada o lo de localStorage es de una sincronización más nueva.
  const mainEmpty = !main.cache.data
    || (!main.cache.data.servicios.length && !main.cache.data.pagos.length && !main.cache.data.gastos.length)
  const legacyNewer = Boolean(legacy.lastSynced && (!main.cache.lastSynced || legacy.lastSynced > main.cache.lastSynced))
  if (legacy.cache && (mainEmpty || legacyNewer)) {
    patch.data = legacy.cache
    if (legacy.lastSynced) patch.lastSynced = legacy.lastSynced
  }

  const prefs: GastosPrefs = {}
  if (legacy.presupuesto && main.cache.prefs.presupuesto == null) prefs.presupuesto = legacy.presupuesto
  if (legacy.lastMetodo && !main.cache.prefs.lastMetodo) prefs.lastMetodo = legacy.lastMetodo
  if (Object.keys(prefs).length) patch.prefs = prefs

  // Pendientes: nunca se pierden. Se suman a los del main, compactando la misma entidad.
  const pending = legacy.pending.length ? legacy.pending.reduce(enqueue, main.pending) : null

  return { hasLegacy, cachePatch: Object.keys(patch).length ? patch : null, pending }
}
