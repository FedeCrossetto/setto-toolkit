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
 * - Cuotas de planes de pago con vencimiento ("DD/MM"): el día anterior, el mismo día y una vez vencida.
 */

export interface Reminder {
  /** Clave estable: se avisa una sola vez por clave. */
  key: string
  title: string
  body: string
}

const pad = (n: number): string => String(n).padStart(2, '0')
const DAY_MS = 24 * 60 * 60 * 1000
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
    // Las cuotas de un plan no son la factura del mes (ni sirven de monto de referencia).
    const pago = data.pagos.find((p) => p.servicioId === s.id && p.mes === mes && !p.cuota)
    if (pago?.pagado) continue
    // Sin pago cargado este mes: usar el último monto conocido como referencia.
    const monto = pago?.monto ?? data.pagos.filter((p) => p.servicioId === s.id && !p.cuota).sort((a, b) => b.mes.localeCompare(a.mes))[0]?.monto ?? null
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

  out.push(...cuotaReminders(data, today))

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

/**
 * Fecha de vencimiento de una cuota: `vence` es "DD/MM" y el año sale del mes de la cuota
 * (una cuota de diciembre que vence "04/01" vence en enero del año siguiente).
 */
export function venceDate(mes: string, vence: string): Date | null {
  const m = /^(\d{2})\/(\d{2})$/.exec(vence)
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  if (month < 1 || month > 12 || day < 1) return null
  const [y, mm] = mes.split('-').map(Number) as [number, number]
  const year = month < mm - 6 ? y + 1 : month > mm + 6 ? y - 1 : y
  return new Date(year, month - 1, clampDay(day, year, month - 1))
}

function cuotaReminders(data: GastosData, today: Date): Reminder[] {
  const hoy = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const out: Reminder[] = []
  for (const p of data.pagos) {
    if (p.pagado || !p.cuota?.vence) continue
    const due = venceDate(p.mes, p.cuota.vence)
    if (!due) continue
    const nombre = data.servicios.find((s) => s.id === p.servicioId)?.nombre ?? 'Plan de pago'
    const que = `cuota ${p.cuota.n} de ${p.cuota.de} de ${nombre}`
    const body = `Plan de pago · ${fmtMoney(p.monto)}`
    const diff = Math.round((due.getTime() - hoy) / DAY_MS)
    if (diff === 1) out.push({ key: `due:cuota:${p.id}:tomorrow`, title: `Mañana vence la ${que}`, body })
    else if (diff === 0) out.push({ key: `due:cuota:${p.id}:today`, title: `Hoy vence la ${que}`, body })
    else if (diff < 0) out.push({ key: `due:cuota:${p.id}:overdue`, title: `Venció la ${que}`, body: `Venció el ${pad(due.getDate())}/${pad(due.getMonth() + 1)} · ${fmtMoney(p.monto)}` })
  }
  return out
}
