import { describe, it, expect } from 'vitest'
import {
  buildMovimientos, buildPendientes, categoryBreakdown, computeMonthSummary, movimientosToCsv, pctChange,
  prevMes, yearSeries, type GastosData,
} from './analytics'
import { applyWrite, applyWrites, enqueue } from './sync-queue'
import type { Gasto, PagoMensual, Servicio } from './types'

const svc = (id: string, categoria: string, activo = true): Servicio => ({ id, nombre: id.toUpperCase(), emoji: 'zap', categoria, activo, orden: 0 })
const pago = (servicioId: string, mes: string, monto: number, pagado = true, fecha?: string): PagoMensual => ({
  id: `${servicioId}-${mes}`, servicioId, mes, monto, pagado, fecha,
})
const gasto = (id: string, fecha: string, monto: number, categoria = 'Supermercado', moneda: 'ARS' | 'USD' = 'ARS'): Gasto => ({
  id, fecha, monto, descripcion: id, categoria, metodoPago: 'Efectivo', moneda, created_at: '', updated_at: '',
})

const data: GastosData = {
  servicios: [svc('luz', 'Casa'), svc('gas', 'Casa'), svc('netflix', 'Streaming'), svc('viejo', 'Casa', false)],
  pagos: [
    pago('luz', '2026-10', 1000, true, '05/10'),
    pago('gas', '2026-10', 500, false),
    pago('netflix', '2026-10', 300, true),
    pago('luz', '2026-09', 900),
    pago('gas', '2026-09', 450),
    pago('luz', '2025-10', 600),
  ],
  gastos: [
    gasto('super', '2026-10-03', 2000),
    gasto('cafe', '2026-10-04', 200, 'Comida afuera'),
    gasto('hotel', '2026-10-05', 50, 'Ocio', 'USD'),
    gasto('super-sep', '2026-09-20', 1000),
  ],
}

describe('analytics', () => {
  it('prevMes cruza el año', () => {
    expect(prevMes('2026-01')).toBe('2025-12')
    expect(prevMes('2026-12', -1)).toBe('2027-01')
  })

  it('computeMonthSummary: fijos pagados + variables ARS, pendientes de activos', () => {
    const s = computeMonthSummary(data, '2026-10', 5000)
    expect(s).toEqual({
      mes: '2026-10', fijos: 1300, variables: 2200, total: 3500,
      pendientes: 500, pendientesCount: 1, presupuesto: 5000,
      previousTotal: 900 + 450 + 1000,
    })
  })

  it('presupuesto 0 o null → null', () => {
    expect(computeMonthSummary(data, '2026-10', 0).presupuesto).toBeNull()
    expect(computeMonthSummary(data, '2026-10', null).presupuesto).toBeNull()
  })

  it('pctChange', () => {
    expect(pctChange(150, 100)).toBe(50)
    expect(pctChange(100, 0)).toBeNull()
  })

  it('yearSeries suma por mes', () => {
    const y = yearSeries(data, 2026)
    expect(y.months).toHaveLength(12)
    expect(y.totals[9]).toBe(3500)
    expect(y.totals[8]).toBe(2350)
    expect(yearSeries(data, 2025).totals[9]).toBe(600)
  })

  it('categoryBreakdown agrupa fijos por categoría del servicio y variables por la suya', () => {
    expect(categoryBreakdown(data, '2026-10')).toEqual([
      { key: 'Supermercado', label: 'Supermercado', value: 2000 },
      { key: 'Casa', label: 'Casa', value: 1000 },
      { key: 'Streaming', label: 'Streaming', value: 300 },
      { key: 'Comida afuera', label: 'Comida afuera', value: 200 },
    ])
  })

  it('buildMovimientos mezcla variables y fijos pagados, ordenado por fecha desc', () => {
    const movs = buildMovimientos(data, { mes: '2026-10' })
    expect(movs.map((m) => m.id)).toEqual(['p:luz-2026-10', 'g:hotel', 'g:cafe', 'g:super', 'p:netflix-2026-10'])
    expect(movs.find((m) => m.id === 'p:luz-2026-10')?.fecha).toBe('2026-10-05')
    expect(buildMovimientos(data, { year: 2026 })).toHaveLength(8)
  })

  it('movimientosToCsv usa ; y coma decimal, escapa comillas', () => {
    const csv = movimientosToCsv(buildMovimientos({ ...data, gastos: [gasto('a "b"; c', '2026-10-01', 1234.5)], pagos: [] }, {}))
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe('Fecha;Tipo;Descripción;Categoría;Método;Moneda;Monto')
    expect(lines[1]).toBe('2026-10-01;Variable;"a ""b""; c";Supermercado;Efectivo;ARS;1234,50')
  })

  it('buildPendientes: activos sin pago, último monto conocido, id estable, sin duplicar', () => {
    const nuevos = buildPendientes(data, '2026-11')
    expect(nuevos).toEqual([
      { id: 'luz-2026-11', servicioId: 'luz', mes: '2026-11', monto: 1000, pagado: false },
      { id: 'gas-2026-11', servicioId: 'gas', mes: '2026-11', monto: 500, pagado: false },
      { id: 'netflix-2026-11', servicioId: 'netflix', mes: '2026-11', monto: 300, pagado: false },
    ])
    const after = applyWrite(data, { channel: 'gastos:save-pagos-bulk', args: [nuevos] })
    expect(buildPendientes(after, '2026-11')).toEqual([])
    expect(buildPendientes(data, '2026-10')).toEqual([]) // todos tienen pago (pagado o no)
  })
})

describe('sync-queue', () => {
  it('applyWrite reproduce las escrituras', () => {
    let d = applyWrite(data, { channel: 'gastos:save-gasto', args: [gasto('nuevo', '2026-10-09', 10)] })
    expect(d.gastos).toHaveLength(5)
    d = applyWrite(d, { channel: 'gastos:delete-gasto', args: ['nuevo'] })
    expect(d.gastos).toHaveLength(4)
    d = applyWrite(d, { channel: 'gastos:delete-servicio', args: ['luz'] })
    expect(d.pagos.some((p) => p.servicioId === 'luz')).toBe(false)
    d = applyWrite(d, { channel: 'gastos:save-pago', args: [{ ...pago('gas', '2026-10', 500), pagado: true }] })
    expect(d.pagos.find((p) => p.id === 'gas-2026-10')?.pagado).toBe(true)
  })

  it('applyWrites es idempotente para upserts y deletes', () => {
    const w = [
      { channel: 'gastos:save-gasto', args: [gasto('x', '2026-10-09', 10)] },
      { channel: 'gastos:delete-pago', args: ['gas-2026-10'] },
    ]
    expect(applyWrites(applyWrites(data, w), w)).toEqual(applyWrites(data, w))
  })

  it('enqueue compacta ediciones de la misma entidad en su lugar y mueve los deletes al final', () => {
    const a1 = { channel: 'gastos:save-servicio', args: [svc('a', 'Casa')] }
    const p1 = { channel: 'gastos:save-pago', args: [pago('a', '2026-10', 1)] }
    const a2 = { channel: 'gastos:save-servicio', args: [{ ...svc('a', 'Casa'), nombre: 'A2' }] }
    let q = enqueue(enqueue([], a1), p1)
    q = enqueue(q, a2)
    expect(q).toEqual([a2, p1])
    const del = { channel: 'gastos:delete-servicio', args: ['a'] }
    expect(enqueue(q, del)).toEqual([p1, del])
  })
})
