export const MESES_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
export const MESES_LONG = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export function randomId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

/** 1234.5 → "1.234,50" */
export function fmt(n: number): string {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Montos grandes sin decimales para KPIs y ejes: "$ 1.234" */
export function fmtMoney(n: number, moneda: 'ARS' | 'USD' = 'ARS'): string {
  const prefix = moneda === 'USD' ? 'US$ ' : '$ '
  return prefix + n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

/** Abreviado para ejes de gráficos: 1.2M, 350k */
export function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(Math.round(n))
}

export function mesShort(mes: string): string {
  return MESES_SHORT[parseInt(mes.split('-')[1]!, 10) - 1] ?? mes
}

export function mesLabel(mes: string): string {
  const [y, m] = mes.split('-') as [string, string]
  return `${MESES_SHORT[parseInt(m, 10) - 1]} ${y}`
}

export function mesLong(mes: string): string {
  const [y, m] = mes.split('-') as [string, string]
  return `${MESES_LONG[parseInt(m, 10) - 1]} ${y}`
}

/** "2026-10-03" → "3 Oct" */
export function fechaCorta(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${parseInt(d ?? '1', 10)} ${MESES_SHORT[parseInt(m ?? '1', 10) - 1] ?? ''}`
}

/** "YYYY-MM-DD" de hoy → "DD/MM" (formato de PagoMensual.fecha) */
export function hoyDDMM(now = new Date()): string {
  return `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}`
}

/** Turns a raw thrown error (IPC wrapper / Supabase fetch failure) into a short Spanish message. */
export function friendlyGastosError(raw: string): string {
  if (/SUPABASE_NOT_CONFIGURED/.test(raw)) {
    return 'Gastos no está conectado: configurá la URL y la Service Role Key de Supabase en Conexiones.'
  }
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(raw)) {
    return 'No se pudo conectar con Supabase. Revisá tu conexión.'
  }
  if (/<!DOCTYPE|<html|cloudflare|web server is down|52[0-9] :|error code 5\d\d/i.test(raw)) {
    return 'Supabase no está respondiendo (puede estar pausado). Probá de nuevo en un minuto.'
  }
  const cleaned = raw.replace(/^Error: Error invoking remote method '[^']+':\s*/i, '').replace(/^Error:\s*/i, '')
  return cleaned.length > 200 ? `${cleaned.slice(0, 200)}…` : cleaned
}
