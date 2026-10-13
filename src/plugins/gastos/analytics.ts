/**
 * Cálculos puros sobre los datos de Gastos (sin React ni IPC) — usados por las
 * vistas, por `summary.ts` (Dashboard) y por los tests.
 *
 * Convenciones:
 * - "fijos" = pagos de servicios marcados como pagados en el mes.
 * - "variables" = gastos ad-hoc del mes en ARS (los USD se muestran aparte, no se suman).
 * - "pendientes" = pagos sin pagar del mes de servicios activos.
 */
import type { Gasto, PagoMensual, Servicio } from './types'

export interface GastosData {
  servicios: Servicio[]
  pagos: PagoMensual[]
  gastos: Gasto[]
}

export function mesOf(fecha: string): string {
  return fecha.slice(0, 7)
}

export function prevMes(mes: string, delta = 1): string {
  const [y, m] = mes.split('-').map(Number) as [number, number]
  const d = new Date(y, m - 1 - delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function currentMes(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function monthsOfYear(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function fijosDelMes(data: GastosData, mes: string): number {
  return round2(data.pagos.filter((p) => p.mes === mes && p.pagado).reduce((s, p) => s + p.monto, 0))
}

export function variablesDelMes(data: GastosData, mes: string): number {
  return round2(
    data.gastos.filter((g) => mesOf(g.fecha) === mes && g.moneda !== 'USD').reduce((s, g) => s + g.monto, 0),
  )
}

export function variablesUsdDelMes(data: GastosData, mes: string): number {
  return round2(
    data.gastos.filter((g) => mesOf(g.fecha) === mes && g.moneda === 'USD').reduce((s, g) => s + g.monto, 0),
  )
}

export function pendientesDelMes(data: GastosData, mes: string): PagoMensual[] {
  const activos = new Set(data.servicios.filter((s) => s.activo).map((s) => s.id))
  return data.pagos.filter((p) => p.mes === mes && !p.pagado && activos.has(p.servicioId))
}

export function totalDelMes(data: GastosData, mes: string): number {
  return round2(fijosDelMes(data, mes) + variablesDelMes(data, mes))
}

export interface MonthSummary {
  mes: string
  total: number
  fijos: number
  variables: number
  pendientes: number
  pendientesCount: number
  presupuesto: number | null
  previousTotal: number
}

export function computeMonthSummary(data: GastosData, mes: string, presupuesto: number | null): MonthSummary {
  const fijos = fijosDelMes(data, mes)
  const variables = variablesDelMes(data, mes)
  const pend = pendientesDelMes(data, mes)
  return {
    mes,
    total: round2(fijos + variables),
    fijos,
    variables,
    pendientes: round2(pend.reduce((s, p) => s + p.monto, 0)),
    pendientesCount: pend.length,
    presupuesto: presupuesto && presupuesto > 0 ? presupuesto : null,
    previousTotal: totalDelMes(data, prevMes(mes)),
  }
}

/** Variación porcentual vs. anterior; null si no hay base para comparar. */
export function pctChange(current: number, previous: number): number | null {
  if (!previous) return null
  return ((current - previous) / previous) * 100
}

export interface YearSeries {
  months: string[]
  fijos: number[]
  variables: number[]
  totals: number[]
}

export function yearSeries(data: GastosData, year: number): YearSeries {
  const months = monthsOfYear(year)
  const fijos = months.map((m) => fijosDelMes(data, m))
  const variables = months.map((m) => variablesDelMes(data, m))
  return { months, fijos, variables, totals: months.map((_, i) => round2(fijos[i]! + variables[i]!)) }
}

export interface CategorySlice {
  key: string
  label: string
  value: number
}

/** Gastos del mes por categoría: fijos por categoría del servicio + variables por su categoría. */
export function categoryBreakdown(data: GastosData, mes: string): CategorySlice[] {
  const svc = new Map(data.servicios.map((s) => [s.id, s]))
  const acc = new Map<string, number>()
  const add = (cat: string, v: number): void => {
    const k = cat.trim() || 'Otro'
    acc.set(k, (acc.get(k) ?? 0) + v)
  }
  for (const p of data.pagos) {
    if (p.mes === mes && p.pagado) add(svc.get(p.servicioId)?.categoria ?? 'Otro', p.monto)
  }
  for (const g of data.gastos) {
    if (mesOf(g.fecha) === mes && g.moneda !== 'USD') add(g.categoria, g.monto)
  }
  return [...acc.entries()]
    .map(([label, value]) => ({ key: label, label, value: round2(value) }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value)
}

// ── Movimientos (lista unificada) ────────────────────────────────────────────

export interface Movimiento {
  id: string
  kind: 'variable' | 'fijo'
  fecha: string        // YYYY-MM-DD (fijos: derivado de DD/MM o día 1)
  descripcion: string
  categoria: string
  metodoPago: string
  moneda: 'ARS' | 'USD'
  monto: number
  ref: Gasto | PagoMensual
}

/** Convierte "DD/MM" + "YYYY-MM" a "YYYY-MM-DD"; si no hay fecha válida usa el día 1. */
export function pagoFechaISO(p: PagoMensual): string {
  const [y, m] = p.mes.split('-')
  const match = /^(\d{1,2})\/(\d{1,2})$/.exec(p.fecha ?? '')
  if (match) {
    const dd = match[1]!.padStart(2, '0')
    const mm = match[2]!.padStart(2, '0')
    // Pagos registrados a principios del mes siguiente quedan en su "mes" contable.
    if (mm === m) return `${y}-${mm}-${dd}`
  }
  return `${y}-${m}-01`
}

export function buildMovimientos(data: GastosData, filter: { mes?: string; year?: number }): Movimiento[] {
  const inRange = (mes: string): boolean =>
    filter.mes ? mes === filter.mes : filter.year ? mes.startsWith(`${filter.year}-`) : true
  const svc = new Map(data.servicios.map((s) => [s.id, s]))
  const out: Movimiento[] = []
  for (const g of data.gastos) {
    if (!inRange(mesOf(g.fecha))) continue
    out.push({
      id: `g:${g.id}`, kind: 'variable', fecha: g.fecha, descripcion: g.descripcion, categoria: g.categoria,
      metodoPago: g.metodoPago, moneda: g.moneda, monto: g.monto, ref: g,
    })
  }
  for (const p of data.pagos) {
    if (!p.pagado || !inRange(p.mes)) continue
    const s = svc.get(p.servicioId)
    out.push({
      id: `p:${p.id}`, kind: 'fijo', fecha: pagoFechaISO(p), descripcion: s?.nombre ?? p.servicioId,
      categoria: s?.categoria || 'Otro', metodoPago: p.metodoPago ?? '', moneda: 'ARS', monto: p.monto, ref: p,
    })
  }
  return out.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.monto - a.monto)
}

function csvCell(v: string | number): string {
  const s = String(v)
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV con `;` (Excel en es-AR) y montos con coma decimal. */
export function movimientosToCsv(movs: Movimiento[]): string {
  const header = ['Fecha', 'Tipo', 'Descripción', 'Categoría', 'Método', 'Moneda', 'Monto']
  const rows = movs.map((m) => [
    m.fecha, m.kind === 'fijo' ? 'Fijo' : 'Variable', m.descripcion, m.categoria, m.metodoPago, m.moneda,
    m.monto.toFixed(2).replace('.', ','),
  ])
  return [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n')
}

// ── Pendientes del mes ───────────────────────────────────────────────────────

/** Id estable de un pago: un único pago por servicio y mes. */
export function pagoId(servicioId: string, mes: string): string {
  return `${servicioId}-${mes}`
}

/** Último monto conocido de un servicio antes (o en) `mes`. */
export function lastKnownMonto(pagos: PagoMensual[], servicioId: string, mes: string): number {
  let best: PagoMensual | null = null
  for (const p of pagos) {
    if (p.servicioId !== servicioId || p.mes > mes || p.monto <= 0) continue
    if (!best || p.mes > best.mes) best = p
  }
  return best?.monto ?? 0
}

/** Pagos pendientes a crear para cada servicio activo sin pago en `mes`. Nunca duplica. */
export function buildPendientes(data: Pick<GastosData, 'servicios' | 'pagos'>, mes: string): PagoMensual[] {
  const conPago = new Set(data.pagos.filter((p) => p.mes === mes).map((p) => p.servicioId))
  const existingIds = new Set(data.pagos.map((p) => p.id))
  return data.servicios
    .filter((s) => s.activo && !conPago.has(s.id) && !existingIds.has(pagoId(s.id, mes)))
    .map((s) => ({
      id: pagoId(s.id, mes),
      servicioId: s.id,
      mes,
      monto: lastKnownMonto(data.pagos, s.id, mes),
      pagado: false,
    }))
}
