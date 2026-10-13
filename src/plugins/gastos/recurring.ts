/**
 * Pendientes automáticos de servicios (puro). La primera vez que se ve el mes actual con
 * datos frescos de Supabase se crean los pagos pendientes (ids estables `servicio-mes`, así
 * que repetirlo nunca duplica). Se recuerda el mes en las prefs para no regenerar lo que el
 * usuario deshizo.
 */
import { buildPendientes, currentMes, lastKnownMonto, type GastosData } from './analytics'
import type { GastosPrefs, PagoMensual } from './types'

export interface AutoPendientesInput {
  mes: string
  now?: Date
  prefs: GastosPrefs
  /** Los datos vienen de una carga remota exitosa (no sólo del caché) */
  fresh: boolean
  /** La tabla `pagos` existe en Supabase */
  pagosReady: boolean
}

export function shouldAutoGenerate(input: AutoPendientesInput): boolean {
  const { mes, prefs, fresh, pagosReady } = input
  if (!fresh || !pagosReady) return false
  if (mes !== currentMes(input.now)) return false
  return prefs.autoPendientesMes !== mes
}

/** Pagos a crear (vacío si no corresponde). Idempotente: nunca devuelve uno que ya exista. */
export function autoPendientes(data: Pick<GastosData, 'servicios' | 'pagos'>, input: AutoPendientesInput): PagoMensual[] {
  return shouldAutoGenerate(input) ? buildPendientes(data, input.mes) : []
}

/** Monto sugerido para marcar pagado: el del pendiente o el último conocido del servicio. */
export function montoSugerido(pagos: PagoMensual[], p: PagoMensual): number {
  return p.monto > 0 ? p.monto : lastKnownMonto(pagos, p.servicioId, p.mes)
}
