import { describe, expect, it } from 'vitest'
import { budgetAlerts, budgetEstado, budgetProgress, budgetsAtRisk, normalizeBudgets, sumBudgets } from './budgets'
import {
  describeRegla, dueInstances, instanceId, nextOccurrence, occurrencesBetween, parseRecurrence, reglaFromGasto, ruleIdOf,
} from './recurrence'
import type { GastosData } from './analytics'
import type { Gasto, ReglaRecurrente } from './types'

function gasto(p: Partial<Gasto>): Gasto {
  return {
    id: Math.random().toString(36).slice(2), fecha: '2026-10-05', monto: 100, descripcion: 'x', categoria: 'Otro',
    metodoPago: 'Efectivo', moneda: 'ARS', created_at: '', updated_at: '', ...p,
  }
}

const data: GastosData = {
  servicios: [{ id: 's1', nombre: 'Luz', emoji: 'bolt', categoria: 'Hogar', activo: true, orden: 0 }],
  pagos: [
    { id: 'p1', servicioId: 's1', mes: '2026-10', monto: 4000, pagado: true },
    { id: 'p2', servicioId: 's1', mes: '2026-10', monto: 9999, pagado: false },
  ],
  gastos: [
    gasto({ categoria: 'Supermercado', monto: 60000 }),
    gasto({ categoria: 'supermercado', monto: 52000 }),
    gasto({ categoria: 'Ocio', monto: 8500 }),
    gasto({ categoria: 'Ocio', monto: 999, moneda: 'USD' }),
    gasto({ categoria: 'Ocio', monto: 5000, fecha: '2026-09-30' }),
  ],
}

describe('presupuesto por categoría', () => {
  it('estado: < 80 ok, ≥ 80 warning, > 100 error', () => {
    expect(budgetEstado(79, 100)).toBe('ok')
    expect(budgetEstado(80, 100)).toBe('warning')
    expect(budgetEstado(100, 100)).toBe('warning')
    expect(budgetEstado(100.01, 100)).toBe('error')
    expect(budgetEstado(5, 0)).toBe('ok')
  })

  it('normaliza y suma', () => {
    expect(normalizeBudgets({ ' Ocio ': 10, Nada: 0, Mal: Number.NaN, Neg: -3 })).toEqual({ Ocio: 10 })
    expect(sumBudgets({ A: 10.5, B: 20 })).toBe(30.5)
  })

  it('progreso del mes ordenado por % (fijos pagados + variables ARS, sin distinguir mayúsculas)', () => {
    const rows = budgetProgress(data, '2026-10', { Supermercado: 100000, Ocio: 10000, Hogar: 10000, Salud: 5000 })
    expect(rows.map((r) => r.categoria)).toEqual(['Supermercado', 'Ocio', 'Hogar', 'Salud'])
    expect(rows[0]).toMatchObject({ gastado: 112000, estado: 'error', restante: -12000 })
    expect(rows[1]).toMatchObject({ gastado: 8500, estado: 'warning' })
    expect(rows[2]).toMatchObject({ gastado: 4000, estado: 'ok' })
    expect(rows[3]).toMatchObject({ gastado: 0, pct: 0 })
    expect(budgetsAtRisk(rows).map((r) => r.categoria)).toEqual(['Supermercado', 'Ocio'])
    const alerts = budgetAlerts(rows, (n) => `$ ${n}`)
    expect(alerts[0]).toEqual({ categoria: 'Supermercado', tone: 'error', text: 'Superaste Supermercado por $ 12000' })
    expect(alerts[1]!.tone).toBe('warning')
    expect(alerts).toHaveLength(2)
  })
})

function regla(p: Partial<ReglaRecurrente>): ReglaRecurrente {
  return {
    id: 'r1', descripcion: 'Netflix', monto: 5000, moneda: 'ARS', categoria: 'Ocio', metodoPago: 'Crédito',
    frecuencia: 'mensual', dia: 5, desde: '2026-01-01', created_at: '', ...p,
  }
}

describe('motor de recurrentes', () => {
  it('mensual ajusta al último día del mes', () => {
    expect(occurrencesBetween({ frecuencia: 'mensual', dia: 31 }, '2026-01-15', '2026-04-30'))
      .toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
  })

  it('semanal y anual', () => {
    // 2026-10-19 es lunes
    expect(occurrencesBetween({ frecuencia: 'semanal', dia: 1 }, '2026-10-01', '2026-10-19'))
      .toEqual(['2026-10-05', '2026-10-12', '2026-10-19'])
    expect(occurrencesBetween({ frecuencia: 'anual', dia: 29, mesAnual: 2 }, '2027-01-01', '2028-12-31'))
      .toEqual(['2027-02-28', '2028-02-29'])
  })

  it('genera lo vencido con ids estables, recupera hasta 3 meses y es idempotente', () => {
    const today = new Date(2026, 9, 19)
    const r1 = dueInstances([regla({ hasta: null })], new Set(), today, 'now')
    expect(r1.gastos.map((g) => g.fecha)).toEqual(['2026-07-05', '2026-08-05', '2026-09-05', '2026-10-05'].filter((f) => f >= '2026-07-19'))
    expect(r1.gastos[0]!.id).toBe(instanceId('r1', '2026-08-05'))
    expect(r1.changed).toBe(true)
    expect(r1.rules[0]!.hasta).toBe('2026-10-19')
    const r2 = dueInstances(r1.rules, new Set(), today)
    expect(r2.gastos).toEqual([])
    expect(r2.changed).toBe(false)
  })

  it('no repite ids existentes, saltea pausadas y respeta `hasta`', () => {
    const today = new Date(2026, 9, 19)
    const existing = new Set([instanceId('r1', '2026-10-05')])
    expect(dueInstances([regla({ hasta: '2026-09-30' })], existing, today).gastos).toEqual([])
    expect(dueInstances([regla({ hasta: '2026-09-01' })], new Set(), today).gastos.map((g) => g.fecha)).toEqual(['2026-09-05', '2026-10-05'])
    const paused = dueInstances([regla({ pausada: true })], new Set(), today)
    expect(paused.gastos).toEqual([])
    expect(paused.changed).toBe(false)
  })

  it('ruleIdOf, próxima fecha y descripción', () => {
    expect(ruleIdOf('rec-abc-1-2026-10-05')).toBe('abc-1')
    expect(ruleIdOf('xyz')).toBeNull()
    expect(nextOccurrence(regla({ hasta: '2026-10-19' }), new Date(2026, 9, 19))).toBe('2026-11-05')
    expect(describeRegla({ frecuencia: 'mensual', dia: 5 })).toBe('Todos los meses, el día 5')
    expect(describeRegla({ frecuencia: 'semanal', dia: 1 })).toBe('Todas las semanas, los lunes')
  })

  it('regla desde un gasto: la fecha del gasto ya cuenta como generada', () => {
    const r = reglaFromGasto(gasto({ fecha: '2026-10-19', descripcion: 'Gimnasio' }), 'semanal', 'g1', 'now')
    expect(r).toMatchObject({ frecuencia: 'semanal', dia: 1, desde: '2026-10-19', hasta: '2026-10-19' })
    expect(dueInstances([r], new Set(), new Date(2026, 9, 19)).gastos).toEqual([])
  })

  it('entiende "todos los meses" en el agregado rápido', () => {
    expect(parseRecurrence('netflix 5000 todos los meses')).toEqual({ frecuencia: 'mensual', dia: null, text: 'netflix 5000' })
    expect(parseRecurrence('alquiler 300k mensual el día 10')).toEqual({ frecuencia: 'mensual', dia: 10, text: 'alquiler 300k' })
    expect(parseRecurrence('gimnasio 15000 cada semana')?.frecuencia).toBe('semanal')
    expect(parseRecurrence('seguro 90000 todos los años')?.frecuencia).toBe('anual')
    expect(parseRecurrence('1500 super')).toBeNull()
    expect(parseRecurrence('mesada 1000')).toBeNull()
  })
})
