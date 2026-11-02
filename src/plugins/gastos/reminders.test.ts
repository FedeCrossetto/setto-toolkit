import { describe, expect, it } from 'vitest'
import { dueReminders, venceDate } from './reminders'
import type { GastosData } from './analytics'

const svc = (id: string, nombre: string, activo = true) => ({ id, nombre, emoji: '', categoria: 'Casa', activo, orden: 1 })
const data: GastosData = {
  servicios: [svc('luz', 'Edenor'), svc('gas', 'Metrogas'), svc('net', 'Fibertel'), svc('old', 'Viejo', false)],
  pagos: [
    { id: '1', servicioId: 'luz', mes: '2026-10', monto: 30000, pagado: false },
    { id: '2', servicioId: 'gas', mes: '2026-10', monto: 12000, pagado: true },
    { id: '3', servicioId: 'net', mes: '2026-09', monto: 25000, pagado: true },
  ],
  gastos: [],
}

describe('dueReminders: cuotas de planes de pago', () => {
  const plan: GastosData = {
    servicios: [svc('gas', 'Metrogas')],
    pagos: [
      { id: 'c2', servicioId: 'gas', mes: '2026-12', monto: 21390.07, pagado: false, cuota: { plan: 'p', n: 2, de: 2, vence: '04/12' } },
      { id: 'c1', servicioId: 'gas', mes: '2026-11', monto: 22181.48, pagado: true, cuota: { plan: 'p', n: 1, de: 2, vence: '04/11' } },
    ],
    gastos: [],
  }
  const cuotas = (d: Date): string[] => dueReminders(plan, {}, d).filter((r) => r.key.startsWith('due:cuota:')).map((r) => r.key)

  it('avisa el día anterior, el mismo día y una vez vencida; nunca las pagadas', () => {
    expect(cuotas(new Date(2026, 11, 2))).toEqual([])
    expect(cuotas(new Date(2026, 11, 3))).toEqual(['due:cuota:c2:tomorrow'])
    expect(cuotas(new Date(2026, 11, 4))).toEqual(['due:cuota:c2:today'])
    expect(cuotas(new Date(2026, 11, 9))).toEqual(['due:cuota:c2:overdue'])
    expect(dueReminders(plan, {}, new Date(2026, 11, 4))[0]!.title).toBe('Hoy vence la cuota 2 de 2 de Metrogas')
  })

  it('el vencimiento de enero de una cuota de diciembre cae en el año siguiente', () => {
    expect(venceDate('2026-12', '04/01')).toEqual(new Date(2027, 0, 4))
    expect(venceDate('2026-01', '28/12')).toEqual(new Date(2025, 11, 28))
    expect(venceDate('2026-11', '4/11')).toBeNull()
  })
})

describe('dueReminders', () => {
  it('warns the day before, the same day and once overdue', () => {
    const due = { luz: 15 }
    expect(dueReminders(data, due, new Date(2026, 9, 14)).map((r) => r.title)).toEqual(['Mañana vence Edenor'])
    expect(dueReminders(data, due, new Date(2026, 9, 15)).map((r) => r.title)).toEqual(['Hoy vence Edenor'])
    const late = dueReminders(data, due, new Date(2026, 9, 20))
    expect(late.map((r) => r.key)).toEqual(['due:luz:2026-10:overdue'])
    expect(late[0]!.body).toContain('Venció el 15/10')
    expect(dueReminders(data, due, new Date(2026, 9, 10))).toEqual([])
  })
  it('skips paid and inactive services', () => {
    const r = dueReminders(data, { gas: 10, old: 10 }, new Date(2026, 9, 10))
    expect(r).toEqual([])
  })
  it('summarizes services without due day from the 25th, using the last known amount', () => {
    expect(dueReminders(data, {}, new Date(2026, 9, 24))).toEqual([])
    const r = dueReminders(data, {}, new Date(2026, 9, 26))
    expect(r).toHaveLength(1)
    expect(r[0]!.title).toBe('Faltan pagar 2 servicios')
    expect(r[0]!.body).toContain('Edenor, Fibertel')
    expect(r[0]!.key).toBe('due:summary:2026-10-26')
  })
  it('clamps day 31 to the end of February', () => {
    const feb: GastosData = { ...data, pagos: [{ id: 'x', servicioId: 'luz', mes: '2026-02', monto: 1, pagado: false }] }
    expect(dueReminders(feb, { luz: 31 }, new Date(2026, 1, 28)).map((r) => r.title)).toContain('Hoy vence Edenor')
  })
})
