import { describe, expect, it } from 'vitest'
import { dueReminders } from './reminders'
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
