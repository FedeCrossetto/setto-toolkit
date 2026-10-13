/**
 * Cola de escrituras pendientes (offline): cada escritura es `{ channel, args }`
 * de IPC. `applyWrite` reproduce su efecto sobre los datos locales, así la UI
 * refleja lo pendiente aunque Supabase no lo tenga todavía.
 */
import type { GastosData } from './analytics'
import type { Gasto, PagoMensual, Servicio } from './types'
import type { PendingWrite } from './types'

export const GASTOS_TABLE_MISSING = 'GASTOS_TABLE_MISSING'

export function isTableMissingError(e: unknown): boolean {
  return String(e).includes(GASTOS_TABLE_MISSING)
}

/** Tabla faltante informada por el main (`GASTOS_TABLE_MISSING(pagos): …`); por compatibilidad, 'gastos'. */
export function missingTableFromError(e: unknown): string | null {
  const s = String(e)
  if (!s.includes(GASTOS_TABLE_MISSING)) return null
  return /GASTOS_TABLE_MISSING\(([a-z_]+)\)/.exec(s)?.[1] ?? 'gastos'
}

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id)
  if (i === -1) return [...list, item]
  const next = list.slice()
  next[i] = item
  return next
}

export function applyWrite(data: GastosData, w: PendingWrite): GastosData {
  const a = w.args[0]
  switch (w.channel) {
    case 'gastos:save-servicio':
      return { ...data, servicios: upsert(data.servicios, a as Servicio).sort((x, y) => x.orden - y.orden) }
    case 'gastos:delete-servicio':
      return {
        ...data,
        servicios: data.servicios.filter((s) => s.id !== a),
        pagos: data.pagos.filter((p) => p.servicioId !== a),
      }
    case 'gastos:save-pago':
      return { ...data, pagos: upsert(data.pagos, a as PagoMensual) }
    case 'gastos:delete-pago':
      return { ...data, pagos: data.pagos.filter((p) => p.id !== a) }
    case 'gastos:save-pagos-bulk':
      return { ...data, pagos: (a as PagoMensual[]).reduce(upsert, data.pagos) }
    case 'gastos:save-gasto':
      return { ...data, gastos: upsert(data.gastos, a as Gasto) }
    case 'gastos:delete-gasto':
      return { ...data, gastos: data.gastos.filter((g) => g.id !== a) }
    default:
      return data
  }
}

export function applyWrites(data: GastosData, writes: PendingWrite[]): GastosData {
  return writes.reduce(applyWrite, data)
}

/**
 * Agrega una escritura a la cola, compactando la anterior sobre la misma entidad
 * (dos ediciones del mismo gasto offline → sólo la última).
 */
export function enqueue(queue: PendingWrite[], w: PendingWrite): PendingWrite[] {
  const key = writeKey(w)
  if (!key) return [...queue, w]
  if (w.channel.startsWith('gastos:delete-')) return [...queue.filter((q) => writeKey(q) !== key), w]
  // Reemplaza en su lugar (no al final) para no romper el orden servicio → pagos.
  const i = queue.findIndex((q) => writeKey(q) === key)
  if (i === -1) return [...queue, w]
  const next = queue.slice()
  next[i] = w
  return next
}

function writeKey(w: PendingWrite): string | null {
  const a = w.args[0] as { id?: string } | string | undefined
  const id = typeof a === 'string' ? a : a && typeof a === 'object' && !Array.isArray(a) ? a.id : undefined
  if (!id) return null
  const entity = w.channel.replace(/^gastos:(save|delete)-/, '')
  if (entity === 'pagos-bulk') return null
  return `${entity}:${id}`
}
