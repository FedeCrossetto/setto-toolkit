import { describe, it, expect } from 'vitest'
import { parseAmount, parseQuickAdd } from './quick-add-parser'

const TODAY = new Date(2026, 9, 10) // 10/10/2026

describe('parseAmount', () => {
  it.each([
    ['1500', 1500],
    ['$1500', 1500],
    ['1.500', 1500],
    ['1.500,50', 1500.5],
    ['1,500.50', 1500.5],
    ['1500.5', 1500.5],
    ['1500,5', 1500.5],
    ['1,5', 1.5],
    ['1.500.000', 1500000],
    ['15k', 15000],
    ['2,5k', 2500],
  ])('%s → %d', (raw, expected) => {
    expect(parseAmount(raw)).toBe(expected)
  })

  it.each(['super', '0', '1.', 'abc123', ''])('rechaza %s', (raw) => {
    expect(parseAmount(raw)).toBeNull()
  })
})

describe('parseQuickAdd', () => {
  it('monto + descripción + método', () => {
    const r = parseQuickAdd('1500 super efectivo', TODAY)
    expect(r).toMatchObject({
      monto: 1500, descripcion: 'super', categoria: 'Supermercado', metodoPago: 'Efectivo',
      moneda: 'ARS', fecha: '2026-10-10', categoriaDetectada: true,
    })
  })

  it('palabras en cualquier orden', () => {
    const r = parseQuickAdd('nafta ypf mp $12.345,60', TODAY)
    expect(r.monto).toBe(12345.6)
    expect(r.metodoPago).toBe('MP')
    expect(r.categoria).toBe('Transporte')
    expect(r.descripcion).toBe('nafta ypf')
  })

  it('ayer y dd/mm', () => {
    expect(parseQuickAdd('ayer 800 cafe', TODAY).fecha).toBe('2026-10-09')
    expect(parseQuickAdd('3/10 800 cafe', TODAY).fecha).toBe('2026-10-03')
    expect(parseQuickAdd('800 cafe 05/09/25', TODAY).fecha).toBe('2025-09-05')
  })

  it('dd/mm en el futuro se interpreta como el año anterior', () => {
    expect(parseQuickAdd('28/12 5000 regalo', TODAY).fecha).toBe('2025-12-28')
  })

  it('sin método devuelve null (usa el último recordado)', () => {
    const r = parseQuickAdd('2300 farmacia', TODAY)
    expect(r.metodoPago).toBeNull()
    expect(r.categoria).toBe('Salud')
  })

  it('USD pegado o separado', () => {
    expect(parseQuickAdd('20usd netflix', TODAY)).toMatchObject({ monto: 20, moneda: 'USD' })
    expect(parseQuickAdd('usd 35 hotel', TODAY)).toMatchObject({ monto: 35, moneda: 'USD', categoria: 'Ocio' })
  })

  it('#categoria fuerza la categoría', () => {
    const r = parseQuickAdd('4000 coto #hogar', TODAY)
    expect(r.categoria).toBe('Hogar')
    expect(r.descripcion).toBe('coto')
  })

  it('sin palabras conocidas → Otro y sin monto si no hay número', () => {
    const r = parseQuickAdd('algo raro', TODAY)
    expect(r.monto).toBeNull()
    expect(r.categoria).toBe('Otro')
    expect(r.categoriaDetectada).toBe(false)
  })

  it('acentos y mayúsculas', () => {
    const r = parseQuickAdd('1500 Débito Farmacia', TODAY)
    expect(r.metodoPago).toBe('Débito')
    expect(r.categoria).toBe('Salud')
  })
})
