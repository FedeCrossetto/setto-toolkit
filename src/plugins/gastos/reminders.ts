import type { GastosData } from './analytics'
import { fmtMoney } from './format'

/**
 * Avisos de vencimiento de servicios (notificaciones del sistema). Puro: recibe
 * los datos y la fecha; `useGastosReminders` decide cuándo correrlo y recuerda
 * qué ya se avisó para no repetir.
 *
 * - Con día de vencimiento cargado (Ajustes del servicio): avisa el día anterior,
 *   el mismo día y una vez si quedó vencido.
 * - Sin día cargado: desde el 25 del mes, un resumen diario de lo que falta pagar.
 */

export interface Reminder {
  /** Clave estable: se avisa una sola vez por clave. */
  key: string
  title: string
  body: string
}

const pad = (n: number): string => String(n).padStart(2, '0')
export const mesOfDate = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`

/** Día de vencimiento efectivo en el mes (el 31 en febrero cae el último día). */
function clampDay(day: number, year: number, month0: number): number {
  const last = new Date(year, month0 + 1, 0).getDate()
  return Math.min(Math.max(1, Math.round(day)), last)
}

export const SUMMARY_FROM_DAY = 25

export function dueReminders(data: GastosData, dueDays: Record<string, number>, today: Date): Reminder[] {
  const mes = mesOfDate(today)
  const day = today.getDate()
  const out: Reminder[] = []
  const sinDia: { nombre: string; monto: number | null }[] = []

  for (const s of data.servicios) {
    if (!s.activo) continue
    const pago = data.pagos.find((p) => p.servicioId === s.id && p.mes === mes)
    if (pago?.pagado) continue
    // Sin pago cargado este mes: usar el último monto conocido como referencia.
    const monto = pago?.monto ?? data.pagos.filter((p) => p.servicioId === s.id).sort((a, b) => b.mes.localeCompare(a.mes))[0]?.monto ?? null
    const montoTxt = monto ? ` · ${fmtMoney(monto)}` : ''
    const due = dueDays[s.id]
    if (typeof due !== 'number' || !Number.isFinite(due)) {
      sinDia.push({ nombre: s.nombre, monto })
      continue
    }
    const dueDay = clampDay(due, today.getFullYear(), today.getMonth())
    if (dueDay - day === 1) {
      out.push({ key: `due:${s.id}:${mes}:tomorrow`, title: `Mañana vence ${s.nombre}`, body: `Todavía no está pagado${montoTxt}` })
    } else if (dueDay === day) {
      out.push({ key: `due:${s.id}:${mes}:today`, title: `Hoy vence ${s.nombre}`, body: `Todavía no está pagado${montoTxt}` })
    } else if (day > dueDay) {
      out.push({ key: `due:${s.id}:${mes}:overdue`, title: `${s.nombre} está vencido`, body: `Venció el ${dueDay}/${pad(today.getMonth() + 1)}${montoTxt}` })
    }
  }

  if (day >= SUMMARY_FROM_DAY && sinDia.length > 0) {
    const total = sinDia.reduce((t, x) => t + (x.monto ?? 0), 0)
    const names = sinDia.slice(0, 3).map((x) => x.nombre).join(', ') + (sinDia.length > 3 ? ` y ${sinDia.length - 3} más` : '')
    out.push({
      key: `due:summary:${mes}-${pad(day)}`,
      title: sinDia.length === 1 ? `Falta pagar ${sinDia[0]!.nombre}` : `Faltan pagar ${sinDia.length} servicios`,
      body: `${names}${total > 0 ? ` · ${fmtMoney(total)}` : ''}`,
    })
  }
  return out
}
