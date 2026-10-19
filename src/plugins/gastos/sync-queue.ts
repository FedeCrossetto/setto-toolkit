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

/** `entidad:id` de una escritura (`gasto:abc`); null para las masivas. */
export function writeKey(w: PendingWrite): string | null {
  const a = w.args[0] as { id?: string } | string | undefined
  const id = typeof a === 'string' ? a : a && typeof a === 'object' && !Array.isArray(a) ? a.id : undefined
  if (!id) return null
  const entity = w.channel.replace(/^gastos:(save|delete)-/, '')
  if (entity === 'pagos-bulk') return null
  return `${entity}:${id}`
}

/** Claves de entidad que pisa una escritura (la masiva de pagos pisa cada `pago:id`). */
function keysOf(w: PendingWrite): string[] {
  if (w.channel === 'gastos:save-pagos-bulk') {
    const list = Array.isArray(w.args[0]) ? (w.args[0] as Array<{ id?: unknown }>) : []
    return list.flatMap((p) => (p && typeof p.id === 'string' ? [`pago:${p.id}`] : []))
  }
  const k = writeKey(w)
  return k ? [k] : []
}

/**
 * Una escritura directa llegó bien a Supabase: lo que estaba en cola para esa misma entidad
 * quedó viejo (si se subiera después pisaría lo nuevo), así que se descarta.
 */
export function dropSuperseded(queue: PendingWrite[], done: PendingWrite): PendingWrite[] {
  const keys = new Set(keysOf(done))
  if (!keys.size) return queue
  const next = queue.filter((q) => { const k = writeKey(q); return !k || !keys.has(k) })
  return next.length === queue.length ? queue : next
}

export type WriteErrorKind = 'missing-table' | 'offline' | 'rejected'

/** Rechazos que no se arreglan reintentando: validación del main o restricciones de Postgres. */
const REJECTED_RE = /Payload inválido|inválid[oa]|es requerid[oa]|demasiado larg|Demasiadas|violates|invalid input|duplicate key|out of range|value too long|null value in column|\b2[23][0-9A-Z]{3}\b|PGRST1\d\d/i

/** Tabla faltante → queda en cola sin bloquear; rechazo → se descarta; lo demás (red, config) → reintentar. */
export function classifyWriteError(e: unknown): WriteErrorKind {
  const s = e instanceof Error ? e.message : String(e)
  if (s.includes(GASTOS_TABLE_MISSING)) return 'missing-table'
  if (/SUPABASE_NOT_CONFIGURED|fetch failed|timeout|abort|network|ENOTFOUND|ECONN|ETIMEDOUT/i.test(s)) return 'offline'
  if (REJECTED_RE.test(s)) return 'rejected'
  return 'offline'
}

export interface FlushResult {
  /** Escrituras que Supabase aceptó (por identidad) */
  sent: Set<PendingWrite>
  /** Rechazadas por validación: se descartan y se avisa */
  rejected: Array<{ write: PendingWrite; error: string }>
  /** Tablas faltantes detectadas (esas escrituras quedan en cola) */
  missing: string[]
  /** Error de red que cortó el envío (el resto queda en cola) */
  error: unknown
}

/**
 * Envía la cola en orden. No modifica `queue`: el llamador saca de su cola ACTUAL lo enviado y
 * lo rechazado (`settleQueue`), así no se pierde nada encolado mientras esto corría.
 */
export async function flushQueue(queue: PendingWrite[], send: (w: PendingWrite) => Promise<unknown>): Promise<FlushResult> {
  const res: FlushResult = { sent: new Set(), rejected: [], missing: [], error: null }
  for (const w of queue) {
    try {
      await send(w)
      res.sent.add(w)
    } catch (e) {
      const kind = classifyWriteError(e)
      if (kind === 'missing-table') {
        const t = missingTableFromError(e)
        if (t && !res.missing.includes(t)) res.missing.push(t)
        continue
      }
      if (kind === 'rejected') {
        res.rejected.push({ write: w, error: e instanceof Error ? e.message : String(e) })
        continue
      }
      res.error = e
      break
    }
  }
  return res
}

/** Cola actual menos lo enviado y lo rechazado (lo nuevo o reemplazado mientras tanto se conserva). */
export function settleQueue(current: PendingWrite[], r: Pick<FlushResult, 'sent' | 'rejected'>): PendingWrite[] {
  const rejected = new Set(r.rejected.map((x) => x.write))
  return current.filter((w) => !r.sent.has(w) && !rejected.has(w))
}
