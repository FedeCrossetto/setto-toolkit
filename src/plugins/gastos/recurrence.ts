/**
 * Motor de gastos recurrentes (puro). Cada regla genera instancias con id estable
 * `rec-<ruleId>-<yyyy-mm-dd>`, así que correrlo varias veces (Gastos, Inicio, dos ventanas) nunca
 * duplica. `hasta` marca hasta qué fecha ya se generó: lo que el usuario borra (o deshace) no
 * vuelve. Recupera períodos perdidos hasta 3 meses atrás.
 */
import { isoDate } from './quick-add-parser'
import type { Frecuencia, Gasto, ReglaRecurrente } from './types'

export const CATCH_UP_MONTHS = 3

export function instanceId(ruleId: string, fecha: string): string {
  return `rec-${ruleId}-${fecha}`
}

/** Regla de la que salió un gasto (por su id), o null. */
export function ruleIdOf(gastoId: string): string | null {
  const m = /^rec-(.+)-\d{4}-\d{2}-\d{2}$/.exec(gastoId)
  return m ? m[1]! : null
}

function parseIso(s: string): Date {
  const [y, m, d] = s.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d)
}

function addDays(s: string, n: number): string {
  const d = parseIso(s)
  d.setDate(d.getDate() + n)
  return isoDate(d)
}

function lastDay(y: number, m0: number): number {
  return new Date(y, m0 + 1, 0).getDate()
}

function maxIso(...xs: Array<string | null | undefined>): string {
  return xs.filter((x): x is string => Boolean(x)).reduce((a, b) => (b > a ? b : a), '')
}

/** Fechas (YYYY-MM-DD) en que cae la regla dentro de [from, to], en orden. */
export function occurrencesBetween(rule: Pick<ReglaRecurrente, 'frecuencia' | 'dia' | 'mesAnual'>, from: string, to: string): string[] {
  if (!from || !to || from > to) return []
  const out: string[] = []
  const a = parseIso(from)
  const b = parseIso(to)
  if (rule.frecuencia === 'semanal') {
    const dow = ((Math.trunc(rule.dia) % 7) + 7) % 7
    const first = new Date(a)
    first.setDate(first.getDate() + ((dow - first.getDay() + 7) % 7))
    for (const d = first; d <= b; d.setDate(d.getDate() + 7)) out.push(isoDate(d))
    return out
  }
  const dia = Math.min(31, Math.max(1, Math.trunc(rule.dia) || 1))
  if (rule.frecuencia === 'anual') {
    const m0 = Math.min(12, Math.max(1, Math.trunc(rule.mesAnual ?? 1))) - 1
    for (let y = a.getFullYear(); y <= b.getFullYear(); y++) {
      const s = isoDate(new Date(y, m0, Math.min(dia, lastDay(y, m0))))
      if (s >= from && s <= to) out.push(s)
    }
    return out
  }
  for (let y = a.getFullYear(), m0 = a.getMonth(); y < b.getFullYear() || (y === b.getFullYear() && m0 <= b.getMonth());) {
    const s = isoDate(new Date(y, m0, Math.min(dia, lastDay(y, m0))))
    if (s >= from && s <= to) out.push(s)
    m0++
    if (m0 > 11) { m0 = 0; y++ }
  }
  return out
}

export function gastoFromRule(rule: ReglaRecurrente, fecha: string, nowIso = new Date().toISOString()): Gasto {
  return {
    id: instanceId(rule.id, fecha), fecha, monto: rule.monto, moneda: rule.moneda,
    descripcion: rule.descripcion, categoria: rule.categoria, metodoPago: rule.metodoPago,
    notas: 'Recurrente', created_at: nowIso, updated_at: nowIso,
  }
}

export interface DueResult {
  /** Gastos a crear (nunca uno cuyo id ya exista) */
  gastos: Gasto[]
  /** Reglas con `hasta` actualizado */
  rules: ReglaRecurrente[]
  /** Alguna regla cambió (hay que guardar) */
  changed: boolean
}

/**
 * Instancias vencidas hasta hoy inclusive. Idempotente: con el `rules` devuelto, una segunda
 * llamada el mismo día no genera nada; con `existingIds` tampoco repite lo que ya existe.
 */
export function dueInstances(rules: ReglaRecurrente[], existingIds: ReadonlySet<string>, today = new Date(), nowIso?: string): DueResult {
  const hoy = isoDate(today)
  const floor = isoDate(new Date(today.getFullYear(), today.getMonth() - CATCH_UP_MONTHS, today.getDate()))
  const gastos: Gasto[] = []
  let changed = false
  const next = rules.map((r) => {
    if (r.pausada || !(r.monto > 0)) return r
    const from = maxIso(r.desde, floor, r.hasta ? addDays(r.hasta, 1) : null)
    for (const f of occurrencesBetween(r, from, hoy)) {
      const id = instanceId(r.id, f)
      if (!existingIds.has(id) && !gastos.some((g) => g.id === id)) gastos.push(gastoFromRule(r, f, nowIso))
    }
    if (r.hasta && r.hasta >= hoy) return r
    changed = true
    return { ...r, hasta: hoy }
  })
  return { gastos: gastos.sort((a, b) => a.fecha.localeCompare(b.fecha)), rules: next, changed }
}

/** Próxima fecha en que se carga (después de lo ya generado y desde hoy). */
export function nextOccurrence(rule: ReglaRecurrente, today = new Date()): string | null {
  const hoy = isoDate(today)
  const from = maxIso(rule.desde, rule.hasta ? addDays(rule.hasta, 1) : null, hoy)
  return occurrencesBetween(rule, from, addDays(from, 400))[0] ?? null
}

const DIAS = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export function describeRegla(r: Pick<ReglaRecurrente, 'frecuencia' | 'dia' | 'mesAnual'>): string {
  if (r.frecuencia === 'semanal') return `Todas las semanas, los ${DIAS[((r.dia % 7) + 7) % 7]}`
  if (r.frecuencia === 'anual') return `Todos los años, el ${r.dia} de ${MESES[(r.mesAnual ?? 1) - 1] ?? 'enero'}`
  return `Todos los meses, el día ${r.dia}`
}

/** Regla a partir de un gasto: misma fecha como primera instancia (ya existe, `hasta` = su fecha). */
export function reglaFromGasto(g: Pick<Gasto, 'fecha' | 'monto' | 'moneda' | 'descripcion' | 'categoria' | 'metodoPago'>,
  frecuencia: Frecuencia, id: string, nowIso = new Date().toISOString()): ReglaRecurrente {
  const d = parseIso(g.fecha)
  return {
    id, descripcion: g.descripcion, monto: g.monto, moneda: g.moneda, categoria: g.categoria, metodoPago: g.metodoPago,
    frecuencia,
    dia: frecuencia === 'semanal' ? d.getDay() : d.getDate(),
    mesAnual: frecuencia === 'anual' ? d.getMonth() + 1 : undefined,
    desde: g.fecha, hasta: g.fecha, created_at: nowIso,
  }
}

// ── Texto: "netflix 5000 todos los meses" ────────────────────────────────────

const RECURRENCE_PATTERNS: Array<[RegExp, Frecuencia]> = [
  [/(?:^|\s)(?:todos\s+los\s+meses|cada\s+mes|por\s+mes|x\s+mes|mensual(?:mente)?)(?=\s|$)/i, 'mensual'],
  [/(?:^|\s)(?:todas\s+las\s+semanas|cada\s+semana|por\s+semana|semanal(?:mente)?)(?=\s|$)/i, 'semanal'],
  [/(?:^|\s)(?:todos\s+los\s+a[nñ]os|cada\s+a[nñ]o|por\s+a[nñ]o|anual(?:mente)?)(?=\s|$)/i, 'anual'],
]

export interface RecurrenceHint {
  frecuencia: Frecuencia
  /** "el día 5" / "el 5" (sólo mensual) */
  dia: number | null
  /** El texto sin la frase de recurrencia (para el parser normal) */
  text: string
}

/** Detecta "todos los meses", "cada semana", "anual"… Devuelve null si no hay. */
export function parseRecurrence(text: string): RecurrenceHint | null {
  for (const [re, frecuencia] of RECURRENCE_PATTERNS) {
    const m = re.exec(text)
    if (!m) continue
    let rest = (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length))
    let dia: number | null = null
    if (frecuencia === 'mensual') {
      const d = /(?:^|\s)el\s+(?:d[ií]a\s+)?(\d{1,2})(?=\s|$)/i.exec(rest)
      if (d && Number(d[1]) >= 1 && Number(d[1]) <= 31) {
        dia = Number(d[1])
        rest = rest.slice(0, d.index) + ' ' + rest.slice(d.index + d[0].length)
      }
    }
    return { frecuencia, dia, text: rest.replace(/\s+/g, ' ').trim() }
  }
  return null
}
