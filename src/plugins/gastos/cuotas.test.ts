import { describe, it, expect } from 'vitest'
import { buildPendientes, lastKnownMonto, planDeCuotas } from './analytics'
import type { PagoMensual, Servicio } from './types'

const svc: Servicio = { id: 'gas', nombre: 'Gas', emoji: 'flame', categoria: 'Casa', activo: true, orden: 0 }

describe('planDeCuotas', () => {
  it('reparte el total en meses seguidos y la última cuota absorbe el redondeo', () => {
    const ps = planDeCuotas({ plan: 'p1', servicioId: 'gas', desde: '2026-11', total: 100, cuotas: 3, primera: { pagado: true, fecha: '05/11' } })
    expect(ps.map((p) => p.mes)).toEqual(['2026-11', '2026-12', '2027-01'])
    expect(ps.map((p) => p.monto)).toEqual([33.33, 33.33, 33.34])
    expect(ps.reduce((t, p) => t + p.monto, 0)).toBeCloseTo(100, 2)
    expect(ps.map((p) => p.cuota)).toEqual([1, 2, 3].map((n) => ({ plan: 'p1', n, de: 3 })))
    expect(ps.map((p) => p.pagado)).toEqual([true, false, false])
    expect(ps[0]!.fecha).toBe('05/11')
    expect(ps[1]!.fecha).toBeUndefined()
  })

  it('la primera cuota reusa el id del pago que se convierte en plan', () => {
    const ps = planDeCuotas({ plan: 'p2', servicioId: 'gas', desde: '2026-10', total: 50, cuotas: 2, primera: { id: 'gas-2026-10', pagado: false } })
    expect(ps.map((p) => p.id)).toEqual(['gas-2026-10', 'p2-2'])
    expect(ps.map((p) => p.monto)).toEqual([25, 25])
  })
})

describe('cuotas vs. factura del mes', () => {
  const cuota: PagoMensual = { id: 'p1-2', servicioId: 'gas', mes: '2026-11', monto: 9999, pagado: false, cuota: { plan: 'p1', n: 2, de: 3 } }
  const factura: PagoMensual = { id: 'gas-2026-10', servicioId: 'gas', mes: '2026-10', monto: 1200, pagado: true }

  it('una cuota no ocupa el mes: igual se genera el pendiente de la factura', () => {
    const pend = buildPendientes({ servicios: [svc], pagos: [factura, cuota] }, '2026-11')
    expect(pend).toEqual([{ id: 'gas-2026-11', servicioId: 'gas', mes: '2026-11', monto: 1200, pagado: false }])
  })

  it('el monto de referencia ignora las cuotas', () => {
    expect(lastKnownMonto([factura, cuota], 'gas', '2026-11')).toBe(1200)
  })
})
